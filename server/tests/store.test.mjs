import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
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
