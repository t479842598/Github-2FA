import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { Vault, normalizeTags } from '../store.js'
import { parseImport } from '../parser.js'

function makeVault() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ghvault-ops-'))
  const vault = new Vault(path.join(dir, 'vault.json'))
  return { vault, dir }
}

async function readyVault() {
  const { vault, dir } = makeVault()
  await vault.load()
  vault.setDataKey('sk-admin')
  return { vault, dir }
}

test('标签规范化：trim/去空/去重/上限', () => {
  assert.deepEqual(normalizeTags([' 备用 ', '备用', '', '主号']), ['备用', '主号'])
  assert.deepEqual(normalizeTags(['a', 'b', 'c', 'd', 'e', 'f']), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(normalizeTags(['x'.repeat(30)]), ['x'.repeat(20)])
  assert.deepEqual(normalizeTags('not-array'), [])
})

test('标签创建与更新', async () => {
  const { vault, dir } = await readyVault()
  const rec = vault.createAccount({ username: 'u1', tags: ['备用', '主号'] })
  assert.deepEqual(rec.tags, ['备用', '主号'])
  const list = vault.listAccounts()
  assert.deepEqual(list[0].tags, ['备用', '主号'])
  vault.updateAccount(rec.id, { tags: ['新标签'] })
  await vault.save()
  assert.deepEqual(vault.listAccounts()[0].tags, ['新标签'])
  // 旧数据无 tags 不报错
  const raw = JSON.parse(readFileSync(vault.filePath, 'utf8'))
  raw.accounts[0].tags = undefined
  writeFileSync(vault.filePath, JSON.stringify(raw))
  const v2 = new Vault(vault.filePath)
  await v2.load()
  v2.setDataKey('sk-admin')
  assert.deepEqual(v2.listAccounts()[0].tags || [], [])
  rmSync(dir, { recursive: true, force: true })
})

test('恢复码使用标记（含旧数据兼容）', async () => {
  const { vault, dir } = await readyVault()
  const rec = vault.createAccount({ username: 'u2', recoveryCodes: ['aaaa-1111', 'bbbb-2222', 'cccc-3333'] })
  // 旧数据：无 recoveryCodesUsed → 全 false
  const full0 = vault.getFullAccount(rec.id)
  assert.deepEqual(full0.recoveryCodesUsed, [false, false, false])

  // 标记第 2 条已用
  assert.equal(vault.setRecoveryUsed(rec.id, 1, true), true)
  const full = vault.getFullAccount(rec.id)
  assert.deepEqual(full.recoveryCodesUsed, [false, true, false])

  // 越界拒绝
  assert.equal(vault.setRecoveryUsed(rec.id, 99, true), false)
  assert.equal(vault.setRecoveryUsed(rec.id, -1, true), false)

  // 恢复
  assert.equal(vault.setRecoveryUsed(rec.id, 1, false), true)
  assert.deepEqual(vault.getFullAccount(rec.id).recoveryCodesUsed, [false, false, false])
  rmSync(dir, { recursive: true, force: true })
})

test('审计日志：追加/裁剪/倒序', async () => {
  const { vault, dir } = await readyVault()
  vault.log('login_ok', '', '127.0.0.1')
  vault.log('import', 'u1', '127.0.0.1', 'ok', '3 imported')
  const logs = vault.getAuditLog()
  assert.equal(logs.length, 2)
  assert.equal(logs[0].action, 'import') // 倒序：最新在前
  assert.equal(logs[0].extra, '3 imported')
  // 裁剪：超过 2000 只留最新
  for (let i = 0; i < 2500; i++) vault.log('x', `obj${i}`)
  assert.equal(vault.getAuditLog(9999).length, 2000)
  assert.equal(vault.getAuditLog(1)[0].object, 'obj2499')
  vault.clearAuditLog()
  assert.equal(vault.getAuditLog().length, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('导出文本与导入往返一致', async () => {
  const { vault, dir } = await readyVault()
  const codes = Array.from({ length: 16 }, (_, i) => `code-${String(i).padStart(2, '0')}`)
  vault.createAccount({
    username: 'tqH8iLZ7VEV9',
    email: 'a@b.com',
    password: 'pVBYB9Fh4Mu8ayNEF8',
    setupKey: 'KDI5GIHR6P3HECLE',
    otpauth: 'otpauth://totp/GitHub:tqH8iLZ7VEV9?secret=KDI5GIHR6P3HECLE&issuer=GitHub',
    recoveryCodes: codes,
    pat: 'ghp_test123',
    remark: '备注测试',
  })
  vault.createAccount({ username: 'simple-acc', password: 'only-pass' })

  const text = vault.exportText()
  // 文本包含关键字段
  assert.ok(text.includes('账号: tqH8iLZ7VEV9'))
  assert.ok(text.includes('密码: pVBYB9Fh4Mu8ayNEF8'))
  assert.ok(text.includes('setup key: KDI5GIHR6P3HECLE'))
  assert.ok(text.includes('PAT: ghp_test123'))
  assert.ok(text.includes('备注: 备注测试'))
  assert.ok(text.includes('恢复码:'))
  assert.ok(text.includes('  code-15'))
  assert.ok(text.includes('────────'))

  // 往返：导出文本可直接被 parser 导入
  const parsed = parseImport(text)
  assert.equal(parsed.length, 2)
  const a1 = parsed[0]
  assert.equal(a1.username, 'tqH8iLZ7VEV9')
  assert.equal(a1.password, 'pVBYB9Fh4Mu8ayNEF8')
  assert.equal(a1.setupKey, 'KDI5GIHR6P3HECLE')
  assert.equal(a1.pat, 'ghp_test123')
  assert.equal(a1.remark, '备注测试')
  assert.equal(a1.recoveryCodes.length, 16)
  assert.equal(a1.secret, 'KDI5GIHR6P3HECLE')
  const a2 = parsed[1]
  assert.equal(a2.username, 'simple-acc')
  assert.equal(a2.password, 'only-pass')
  rmSync(dir, { recursive: true, force: true })
})

test('导出不含解密失败字段（密钥不符时跳过）', async () => {
  const { vault, dir } = await readyVault()
  vault.createAccount({ username: 'ok-acc', password: 'visible-pass' })
  // 篡改密文模拟密钥不符
  const rec = vault.data.accounts[0]
  rec.password.ct = 'deadbeef'
  const text = vault.exportText()
  assert.ok(text.includes('账号: ok-acc'))
  assert.ok(!text.includes('visible-pass'))
  rmSync(dir, { recursive: true, force: true })
})

test('授权记录 KV：创建/更新/加密/导出往返', async () => {
  const { vault, dir } = await readyVault()
  const rec = vault.createAccount({
    username: 'kv-user',
    password: 'pass1',
    kvRecords: [
      { title: 'Telegram 绑定', content: '@telegram_id_xxx' },
      { title: '备用邮箱', content: 'backup@x.com' },
    ],
  })
  await vault.save()
  // 磁盘密文不含明文
  const raw = JSON.parse(readFileSync(vault.filePath, 'utf8'))
  const stored = raw.accounts[0]
  assert.ok(typeof stored.kvRecords === 'object' && stored.kvRecords.ct)
  assert.ok(!JSON.stringify(raw).includes('telegram_id_xxx'))

  // 全量视图解密
  const full = vault.getFullAccount(rec.id)
  assert.equal(full.kvRecords.length, 2)
  assert.equal(full.kvRecords[0].title, 'Telegram 绑定')
  assert.equal(full.kvRecords[0].content, '@telegram_id_xxx')

  // 更新
  vault.updateAccount(rec.id, { kvRecords: [{ title: '新记录', content: '新内容' }] })
  assert.equal(vault.getFullAccount(rec.id).kvRecords.length, 1)

  // 规范化：超长/空标题
  vault.updateAccount(rec.id, { kvRecords: [{ title: '', content: 'x' }, { title: 'a'.repeat(150), content: 'c'.repeat(3000) }] })
  const norm = vault.getFullAccount(rec.id).kvRecords
  assert.equal(norm.length, 1)
  assert.equal(norm[0].title.length, 100)
  assert.equal(norm[0].content.length, 2000)

  // 导出含记录，且可往返导入
  vault.updateAccount(rec.id, { kvRecords: [{ title: 'API Key', content: 'sk-test-123' }] })
  await vault.save()
  const text = vault.exportText()
  assert.ok(text.includes('记录:'))
  assert.ok(text.includes('[API Key] sk-test-123'))
  const parsed = parseImport(text)
  const p = parsed.find((x) => x.username === 'kv-user')
  assert.equal(p.kvRecords.length, 1)
  assert.equal(p.kvRecords[0].title, 'API Key')
  assert.equal(p.kvRecords[0].content, 'sk-test-123')
  rmSync(dir, { recursive: true, force: true })
})

test('授权记录：改密码重加密覆盖', async () => {
  const { vault, dir } = await readyVault()
  vault.createAccount({ username: 'kv2', kvRecords: [{ title: 'SSH 密钥', content: 'ssh-rsa AAA...' }] })
  await vault.save()
  await vault.changePassword('sk-admin', 'new-pass-kv')
  const full = vault.getFullAccount(vault.data.accounts[0].id)
  assert.equal(full.kvRecords[0].title, 'SSH 密钥')
  assert.equal(full.kvRecords[0].content, 'ssh-rsa AAA...')
  rmSync(dir, { recursive: true, force: true })
})
