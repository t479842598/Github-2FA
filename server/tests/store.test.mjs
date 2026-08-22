import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Vault } from '../store.js'
import { encrypt, decrypt, hashPassword, verifyPassword } from '../crypto.js'

function makeVault() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ghvault-'))
  const vault = new Vault(path.join(dir, 'vault.json'))
  return { vault, dir }
}

test('密码哈希与校验', () => {
  const { salt, hash } = hashPassword('hello123')
  assert.ok(verifyPassword('hello123', salt, hash))
  assert.ok(!verifyPassword('wrong', salt, hash))
})

test('AES-256-GCM 往返 + 错误密钥解密失败', () => {
  const key = Buffer.from('a'.repeat(32))
  const enc = encrypt(key, 'sensitive-data')
  assert.equal(decrypt(key, enc), 'sensitive-data')
  const badKey = Buffer.from('b'.repeat(32))
  assert.throws(() => decrypt(badKey, enc))
})

test('首次 load 自动初始化默认密码 sk-admin + 强制改密', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  assert.equal(vault.isSetup, true) // 自动初始化
  assert.equal(vault.mustChangePassword, true) // 必须改密
  assert.ok(vault.verifyPassword('sk-admin'))
  vault.setDataKey('sk-admin')
  rmSync(dir, { recursive: true, force: true })
})

test('改密后 mustChangePassword 清除', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  vault.setDataKey('sk-admin')
  const ok = await vault.changePassword('sk-admin', 'new-pass-9')
  assert.equal(ok, true)
  assert.equal(vault.mustChangePassword, false)
  assert.ok(vault.verifyPassword('new-pass-9'))
  rmSync(dir, { recursive: true, force: true })
})

test('账号 CRUD + 字段加密存储', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('pw123456')
  vault.setDataKey('pw123456')

  const rec = vault.createAccount({
    username: 'tqH8iLZ7VEV9',
    email: 'a@b.com',
    password: 'pVBYB9Fh4Mu8ayNEF8',
    setupKey: 'KDI5GIHR6P3HECLE',
    otpauth: 'otpauth://totp/GitHub:x?secret=KDI5GIHR6P3HECLE&issuer=GitHub',
    recoveryCodes: ['3e54b-8f3af', 'd5288-b2cba'],
    pat: 'ghp_abc123',
  })
  await vault.save()

  // 磁盘上的密文不含明文
  const raw = JSON.parse(await import('node:fs').then(fs => fs.readFileSync(vault.filePath, 'utf8')))
  const stored = raw.accounts[0]
  assert.ok(typeof stored.password === 'object' && stored.password.ct)
  assert.ok(!JSON.stringify(raw).includes('pVBYB9Fh4Mu8ayNEF8'))

  // 列表不暴露明文
  const list = vault.listAccounts()
  assert.equal(list[0].hasSecret, true)
  assert.equal(list[0].hasPat, true)
  assert.ok(!('password' in list[0]))

  // 全量视图解密正确
  const full = vault.getFullAccount(rec.id)
  assert.equal(full.password, 'pVBYB9Fh4Mu8ayNEF8')
  assert.deepEqual(full.recoveryCodes, ['3e54b-8f3af', 'd5288-b2cba'])
  assert.equal(full.pat, 'ghp_abc123')

  // secret 解密（otpauth 优先）
  assert.equal(vault.getSecret(rec.id), 'KDI5GIHR6P3HECLE')

  // 更新 PAT
  vault.updateAccount(rec.id, { pat: 'ghp_new456' })
  assert.equal(vault.getFullAccount(rec.id).pat, 'ghp_new456')

  // 删除
  assert.equal(vault.deleteAccount(rec.id), true)
  assert.equal(vault.deleteAccount(rec.id), false)
  rmSync(dir, { recursive: true, force: true })
})

test('导入去重索引与实时扫描语义一致（含导入批次内去重）', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('pw123456')
  vault.setDataKey('pw123456')

  vault.createAccount({
    username: 'alice',
    password: 'pass-a',
    setupKey: 'AAAA1111',
    otpauth: 'otpauth://totp/GitHub:alice?secret=AAAA1111&issuer=GitHub',
  })
  const idx = vault.buildDupIndex()

  // 索引与实时扫描判定一致
  assert.equal(vault.findImportDuplicate({ username: 'ALICE', password: 'x' }, idx).reason, '账号已存在')
  assert.equal(vault.findImportDuplicate({ username: 'carol' }, idx), null)

  // 模拟导入循环：新建账号后追加进索引，后续同批次重复项能被识别
  const rec = vault.createAccount({ username: 'dave', password: 'pass-d', setupKey: 'DDDD2222' })
  idx.push({
    account: rec,
    username: 'dave',
    password: 'pass-d',
    setupKey: 'DDDD2222',
    otpauth: '',
  })
  const dup = vault.findImportDuplicate({ username: 'dave2', password: 'pass-d', setupKey: 'DDDD2222' }, idx)
  assert.ok(dup && dup.reason === '内容与已有账号重复')
  assert.equal(dup.account.id, rec.id)
  rmSync(dir, { recursive: true, force: true })
})

test('save 后数据文件权限为 0600，且串行落盘不互相覆盖', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('pw123456')
  vault.setDataKey('pw123456')
  vault.createAccount({ username: 'perm-check', password: 'p1' })

  // 并发多次 save（模拟多请求同时落盘）
  await Promise.all([vault.save(), vault.save(), vault.save()])
  const stat = await import('node:fs').then((fs) => fs.statSync(vault.filePath))
  assert.equal(stat.mode & 0o777, 0o600)
  // 数据完整可读
  const v2 = new Vault(vault.filePath)
  await v2.load()
  v2.setDataKey('pw123456')
  assert.equal(v2.listAccounts().length, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('save 串行化：一次写失败后，后续排队写仍执行', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('pw123456')
  vault.setDataKey('pw123456')

  // 第一次：把写目标变成目录，模拟写失败
  const evilDir = path.join(dir, 'evil.json')
  await import('node:fs').then((fs) => fs.mkdirSync(evilDir))
  const v = new Vault(evilDir)
  v.data = vault.data
  v.dataKey = vault.dataKey
  await assert.rejects(() => v.save())
  // 排队的第二次写：目标仍是目录 → 也失败，但链不卡死
  await assert.rejects(() => v.save())

  // 移除阻碍后，后续 save 恢复正常（链被 catch 吞掉，可继续排队）
  await import('node:fs').then((fs) => fs.rmSync(evilDir, { recursive: true }))
  await v.save()
  const stat = await import('node:fs').then((fs) => fs.statSync(evilDir))
  assert.equal(stat.isFile(), true)
  rmSync(dir, { recursive: true, force: true })
})

test('备份导出含审计日志；导入后审计日志保留', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('backup-pass')
  vault.setDataKey('backup-pass')
  vault.createAccount({ username: 'u1', password: 'p1' })
  vault.log('login_ok', 'u1', '1.2.3.4')
  await vault.save()
  const backup = vault.exportBackup()
  assert.ok(Array.isArray(backup.auditLog) && backup.auditLog.length >= 1)

  const { vault: v2, dir: dir2 } = makeVault()
  await v2.load()
  await v2.importBackup(backup, 'backup-pass')
  assert.ok(v2.getAuditLog().some((l) => l.action === 'login_ok'))
  rmSync(dir, { recursive: true, force: true })
  rmSync(dir2, { recursive: true, force: true })
})

test('备份无 password/email 字段（仅 setupKey）时错误密码仍被拒绝', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('backup-pass')
  vault.setDataKey('backup-pass')
  vault.createAccount({ username: 'u1', setupKey: 'ABCDEFGH' })
  await vault.save()
  const backup = vault.exportBackup()

  const { vault: v2, dir: dir2 } = makeVault()
  await v2.load()
  await assert.rejects(() => v2.importBackup(backup, 'wrong-pass'), /密码错误/)
  // 正确密码可导入
  const count = await v2.importBackup(backup, 'backup-pass')
  assert.equal(count, 1)
  rmSync(dir, { recursive: true, force: true })
  rmSync(dir2, { recursive: true, force: true })
})

test('updateAccount 补 otpauth 后 hasSecret 由 false→true（无 secret → 补 2FA）', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('pw123456')
  vault.setDataKey('pw123456')

  // 无 secret 账号
  const rec = vault.createAccount({ username: 'nof2a', password: 'p1' })
  assert.equal(vault.listAccounts().find((a) => a.id === rec.id).hasSecret, false)

  // 编辑补 otpauth（新 EditModal 保存路径）→ hasSecret 应变 true，getSecret 可解
  vault.updateAccount(rec.id, {
    otpauth: 'otpauth://totp/GitHub:nof2a?secret=KDI5GIHR6P3HECLE&issuer=GitHub',
  })
  assert.equal(vault.listAccounts().find((a) => a.id === rec.id).hasSecret, true)
  assert.equal(vault.getSecret(rec.id), 'KDI5GIHR6P3HECLE')

  // 清空 otpauth + setupKey → hasSecret 回 false
  vault.updateAccount(rec.id, { otpauth: '', setupKey: '' })
  assert.equal(vault.listAccounts().find((a) => a.id === rec.id).hasSecret, false)

  // 裸 secret 字段归一为 setupKey
  vault.updateAccount(rec.id, { secret: 'BBBB2222' })
  assert.equal(vault.listAccounts().find((a) => a.id === rec.id).hasSecret, true)
  assert.equal(vault.getSecret(rec.id), 'BBBB2222')
  rmSync(dir, { recursive: true, force: true })
})

test('导入去重：账号已存在 / 内容重复', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('pw123456')
  vault.setDataKey('pw123456')

  vault.createAccount({
    username: 'alice',
    email: 'alice@x.com',
    password: 'pass-a',
    setupKey: 'AAAA1111',
    otpauth: 'otpauth://totp/GitHub:alice?secret=AAAA1111&issuer=GitHub',
  })
  vault.createAccount({ username: 'bob', password: 'shared-pass' })

  // ① 用户名已存在（大小写不敏感，内容不同也算）→ 账号已存在
  assert.equal(vault.findImportDuplicate({ username: 'ALICE', password: 'changed-pass' }).reason, '账号已存在')
  // ② 内容全等（密码 + setup key + otpauth）→ 内容重复（用户名不同也算）
  const d = vault.findImportDuplicate({
    username: 'newuser',
    password: 'pass-a',
    setupKey: 'AAAA1111',
    otpauth: 'otpauth://totp/GitHub:alice?secret=AAAA1111&issuer=GitHub',
  })
  assert.ok(d && d.reason === '内容与已有账号重复')
  // ③ 内容部分不同 → 不重复
  assert.equal(vault.findImportDuplicate({
    username: 'newuser',
    password: 'pass-b',
    setupKey: 'AAAA1111',
    otpauth: 'otpauth://totp/GitHub:alice?secret=AAAA1111&issuer=GitHub',
  }), null)
  // ④ 无凭据的新用户名 → 不重复（避免空凭据误判）
  assert.equal(vault.findImportDuplicate({ username: 'carol' }), null)
  // ⑤ 无任何字段 / 空对象 → 不重复
  assert.equal(vault.findImportDuplicate({}), null)
  // ⑥ 邮箱不参与身份去重（与旧 findByUsername 行为一致）
  assert.equal(vault.findImportDuplicate({ username: 'alice@x.com' }), null)
  // ⑦ 同名但内容不一致的账号在导入循环中仍按身份跳过（不会产生重复用户名）
  assert.equal(vault.findImportDuplicate({ username: 'bob', password: 'other-pass' }).reason, '账号已存在')
  rmSync(dir, { recursive: true, force: true })
})

test('被标记账号：createAccount 保留 flagged，exportText 过滤，批量删除', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('pw123456')
  vault.setDataKey('pw123456')

  const flaggedRec = vault.createAccount({ username: 'flag1', password: 'p1', setupKey: 'AAAABBBB', flagged: true })
  vault.createAccount({ username: 'flag2', password: 'p2', setupKey: 'CCCCDDDD', flagged: true })
  vault.createAccount({ username: 'normal1', password: 'p3' })
  await vault.save()

  // 列表暴露 flagged
  const list = vault.listAccounts()
  assert.equal(list.find((a) => a.username === 'flag1').flagged, true)
  assert.equal(list.find((a) => a.username === 'normal1').flagged, false)
  // 旧数据无 flagged 字段 → false
  const raw = JSON.parse(readFileSync(vault.filePath, 'utf8'))
  raw.accounts[0].flagged = undefined
  writeFileSync(vault.filePath, JSON.stringify(raw))
  const v2 = new Vault(vault.filePath)
  await v2.load()
  v2.setDataKey('pw123456')
  assert.equal(v2.listAccounts()[0].flagged, false)

  // 导出过滤：flaggedOnly 只含标记账号
  const all = vault.exportText()
  const flaggedOnly = vault.exportText({ flaggedOnly: true })
  assert.ok(all.includes('账号: flag1') && all.includes('账号: normal1'))
  assert.ok(flaggedOnly.includes('账号: flag1') && flaggedOnly.includes('账号: flag2'))
  assert.ok(!flaggedOnly.includes('normal1'))

  // 批量删除被标记账号
  const count = vault.deleteFlaggedAccounts()
  assert.equal(count, 2)
  const remain = vault.listAccounts()
  assert.equal(remain.length, 1)
  assert.equal(remain[0].username, 'normal1')
  assert.equal(vault.deleteFlaggedAccounts(), 0)
  rmSync(dir, { recursive: true, force: true })
})

test('setFlagged：设置/清除被标记标识，旧数据兼容', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('pw123456')
  vault.setDataKey('pw123456')
  const rec = vault.createAccount({ username: 'flag-update' })
  assert.equal(vault.listAccounts()[0].flagged, false)
  assert.equal(vault.setFlagged(rec.id, true), true)
  assert.equal(vault.listAccounts()[0].flagged, true)
  assert.equal(vault.setFlagged(rec.id, false), true)
  assert.equal(vault.listAccounts()[0].flagged, false)
  assert.equal(vault.setFlagged('nonexistent', true), false)
  rmSync(dir, { recursive: true, force: true })
})

test('exportKeys：按类型导出「账号-密钥」格式（含日期标注记录）', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('pw123456')
  vault.setDataKey('pw123456')

  vault.createAccount({
    username: 'alice',
    kvRecords: [
      { title: 'opencode', content: 'sk-AAA111' },
      { title: 'freebuff', content: 'FB-222' },
    ],
  })
  vault.createAccount({
    username: 'bob',
    kvRecords: [
      { title: 'freebuff', content: 'FB-333' },
      { title: 'freebuff 2026-08-22', content: 'FB-444' }, // 密钥更新的日期标注记录也应导出
    ],
  })
  vault.createAccount({ username: 'carol', kvRecords: [{ title: 'opencode', content: '' }] })
  vault.createAccount({ username: 'nokey' })
  await vault.save()

  // opencode 导出：只含 opencode 记录，不含 freebuff / 空内容 / 无记录账号
  const oc = vault.exportKeys({ name: 'opencode' })
  assert.ok(oc.includes('alice-sk-AAA111'))
  assert.ok(!oc.includes('FB-'))
  assert.ok(!oc.includes('bob-'))
  assert.ok(!oc.includes('carol-'))
  assert.ok(!oc.includes('nokey-'))

  // freebuff 导出：含日期标注记录，不含 opencode
  const fb = vault.exportKeys({ name: 'freebuff' })
  assert.ok(fb.includes('alice-FB-222'))
  assert.ok(fb.includes('bob-FB-333'))
  assert.ok(fb.includes('bob-FB-444'))
  assert.ok(!fb.includes('sk-AAA111'))
  assert.ok(!fb.includes('carol-'))

  // 空库/无匹配 → 空字符串
  const empty = new Vault(path.join(dir, 'empty.json'))
  await empty.load()
  await empty.setupPassword('pw123456')
  empty.setDataKey('pw123456')
  assert.equal(empty.exportKeys({ name: 'opencode' }), '')
  rmSync(dir, { recursive: true, force: true })
})

test('封号状态：默认 unknown，setBannedStatus 持久化，旧数据兼容', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('pw123456')
  vault.setDataKey('pw123456')
  const rec = vault.createAccount({ username: 'ban-user' })
  // 新账号默认 unknown
  assert.equal(vault.listAccounts()[0].banned, 'unknown')
  assert.equal(vault.listAccounts()[0].bannedCheckedAt, null)

  // 设置被封并持久化
  vault.setBannedStatus(rec.id, 'banned')
  await vault.save()
  const reloaded = new Vault(vault.filePath)
  await reloaded.load()
  reloaded.setDataKey('pw123456')
  assert.equal(reloaded.listAccounts()[0].banned, 'banned')
  assert.ok(reloaded.listAccounts()[0].bannedCheckedAt)

  // 设为正常
  vault.setBannedStatus(rec.id, 'normal')
  assert.equal(vault.listAccounts()[0].banned, 'normal')
  // 非法值归一为 unknown
  vault.setBannedStatus(rec.id, 'garbage')
  assert.equal(vault.listAccounts()[0].banned, 'unknown')

  // 旧数据（无 banned 字段）兼容
  const raw = JSON.parse(readFileSync(vault.filePath, 'utf8'))
  delete raw.accounts[0].banned
  delete raw.accounts[0].bannedCheckedAt
  writeFileSync(vault.filePath, JSON.stringify(raw))
  const v2 = new Vault(vault.filePath)
  await v2.load()
  v2.setDataKey('pw123456')
  assert.equal(v2.listAccounts()[0].banned, 'unknown')
  assert.equal(v2.listAccounts()[0].bannedCheckedAt, null)
  rmSync(dir, { recursive: true, force: true })
})

test('修改密码后旧密钥失效、数据可读', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('old-pw-1')
  vault.setDataKey('old-pw-1')
  vault.createAccount({ username: 'u1', password: 'secret-pass', email: 'u1@x.com', setupKey: 'ABCDEFGH' })
  await vault.save()

  const ok = await vault.changePassword('old-pw-1', 'new-pw-2')
  assert.equal(ok, true)
  assert.ok(vault.verifyPassword('new-pw-2'))
  assert.ok(!vault.verifyPassword('old-pw-1'))

  // 新密钥下数据可读
  const full = vault.getFullAccount(vault.data.accounts[0].id)
  assert.equal(full.password, 'secret-pass')
  assert.equal(full.email, 'u1@x.com')
  assert.equal(full.setupKey, 'ABCDEFGH')
  rmSync(dir, { recursive: true, force: true })
})

test('备份导出 → 新实例导入（同密码）完整还原', async () => {
  const { vault, dir } = makeVault()
  await vault.load()
  await vault.setupPassword('backup-pass')
  vault.setDataKey('backup-pass')
  vault.createAccount({ username: 'u1', password: 'p1', recoveryCodes: ['aa-11'], pat: 'ghp_x' })
  await vault.save()
  const backup = vault.exportBackup()

  // 备份不含 jwtSecret
  assert.ok(!('jwtSecret' in backup.meta))

  // 新实例导入
  const { vault: v2, dir: dir2 } = makeVault()
  await v2.load()
  const count = await v2.importBackup(backup, 'backup-pass')
  assert.equal(count, 1)
  const full = v2.getFullAccount(v2.data.accounts[0].id)
  assert.equal(full.password, 'p1')
  assert.deepEqual(full.recoveryCodes, ['aa-11'])
  assert.equal(full.pat, 'ghp_x')

  // 错误密码导入失败
  const { vault: v3, dir: dir3 } = makeVault()
  await v3.load()
  await assert.rejects(() => v3.importBackup(backup, 'wrong-pass'), /密码错误/)
  rmSync(dir, { recursive: true, force: true })
  rmSync(dir2, { recursive: true, force: true })
  rmSync(dir3, { recursive: true, force: true })
})
