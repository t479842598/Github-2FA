import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseImport, parseText, parseAccountBlock, splitBlocks, parseKeyList } from '../parser.js'

const fixture = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sample-accounts.txt'), 'utf8')

test('分割：3 段示例文本 → 3 个块', () => {
  const blocks = splitBlocks(fixture)
  assert.equal(blocks.length, 3)
})

test('解析 3 段示例文本：字段完整、恢复码 16 条', () => {
  const accounts = parseText(fixture)
  assert.equal(accounts.length, 3)

  const a1 = accounts[0]
  assert.equal(a1.username, 'tqH8iLZ7VEV9')
  assert.equal(a1.email, 'w38du6y79p3iqe@i.yutiankejiai.com')
  assert.equal(a1.password, 'pVBYB9Fh4Mu8ayNEF8')
  assert.equal(a1.setupKey, 'KDI5GIHR6P3HECLE')
  assert.equal(a1.otpauth, 'otpauth://totp/GitHub:tqH8iLZ7VEV9?secret=KDI5GIHR6P3HECLE&issuer=GitHub')
  assert.equal(a1.secret, 'KDI5GIHR6P3HECLE')
  assert.equal(a1.recoveryCodes.length, 16)
  assert.equal(a1.recoveryCodes[0], '3e54b-8f3af')
  assert.equal(a1.recoveryCodes[15], 'bb554-47ad8')

  const a3 = accounts[2]
  assert.equal(a3.username, 'n3JMhzC2ui3C')
  assert.equal(a3.setupKey, '457WE4LNMRNODMP4')
  assert.equal(a3.secret, '457WE4LNMRNODMP4')
  assert.equal(a3.recoveryCodes.length, 16)
  assert.equal(a3.recoveryCodes[15], 'eb3e2-5b2c8')
})

test('恢复码去重', () => {
  const acc = parseAccountBlock(['账号: test1', '恢复码:', '  aaaa-1111', '  aaaa-1111', '  bbbb-2222'])
  assert.deepEqual(acc.recoveryCodes, ['aaaa-1111', 'bbbb-2222'])
})

test('otpauth 无 secret 时回退 setup key', () => {
  const acc = parseAccountBlock(['账号: t2', 'setup key: ABCDEFGH', 'otpauth: otpauth://totp/GitHub:t2?issuer=GitHub'])
  assert.equal(acc.secret, 'ABCDEFGH')
})

test('未知块返回 null', () => {
  assert.equal(parseAccountBlock(['随便一段文字']), null)
  assert.equal(parseAccountBlock([]), null)
})

test('无分隔线、仅空行分隔', () => {
  const text = '账号: a\n密码: p1\n\n账号: b\n密码: p2'
  const accounts = parseText(text)
  assert.equal(accounts.length, 2)
  assert.equal(accounts[1].username, 'b')
})

test('JSON 数组导入', () => {
  const json = JSON.stringify([
    { username: 'j1', email: 'j1@x.com', password: 'pw', setupKey: 'SECRET1', recoveryCodes: ['aa-11', 'bb-22'], pat: 'ghp_xxx' },
  ])
  const accounts = parseImport(json)
  assert.equal(accounts.length, 1)
  assert.equal(accounts[0].username, 'j1')
  assert.equal(accounts[0].pat, 'ghp_xxx')
  assert.equal(accounts[0].secret, 'SECRET1')
  assert.equal(accounts[0].recoveryCodes.length, 2)
})

test('统一入口自动识别 JSON 与文本', () => {
  assert.equal(parseImport(fixture).length, 3)
  assert.equal(parseImport('[{"username":"x"}]').length, 1)
  // 坏 JSON 回退文本解析
  assert.equal(parseImport('[{bad json} 账号: y\n密码: z').length, 1)
})

test('中文冒号兼容', () => {
  const acc = parseAccountBlock(['账号：c1', '密码：cpass', '恢复码：', '  aaaa-1111'])
  assert.equal(acc.username, 'c1')
  assert.equal(acc.password, 'cpass')
  assert.deepEqual(acc.recoveryCodes, ['aaaa-1111'])
})

test('parseKeyList：opencode 格式（第一个 - 前是账号）', () => {
  const text = `SiND2Fvct4w4-sk-FtB58T2AmVG4XE285L8FY0qXn0uO4iUZG3nIFuDBv6VSWJkKS4YVGRIrLKJuiQ04
SiND2Fvct4w4-f54b73eb-6ff2-4f7a-b3ce-0660a70d2c66`
  const pairs = parseKeyList(text)
  assert.equal(pairs.length, 2)
  assert.equal(pairs[0].username, 'SiND2Fvct4w4')
  assert.equal(pairs[0].key, 'sk-FtB58T2AmVG4XE285L8FY0qXn0uO4iUZG3nIFuDBv6VSWJkKS4YVGRIrLKJuiQ04')
  assert.equal(pairs[1].username, 'SiND2Fvct4w4')
  assert.equal(pairs[1].key, 'f54b73eb-6ff2-4f7a-b3ce-0660a70d2c66')
})

test('parseKeyList：空行/无 - 行跳过，key 保留 - 部分', () => {
  const pairs = parseKeyList('u1-sk-abc-123\n\nnodashline\n  \nu2-sk-xyz')
  assert.equal(pairs.length, 2)
  assert.equal(pairs[0].key, 'sk-abc-123')
  assert.equal(pairs[1].key, 'sk-xyz')
})

test('parseKeyList：无有效对返回空数组', () => {
  assert.deepEqual(parseKeyList(''), [])
  assert.deepEqual(parseKeyList('随便一行文字'), [])
  assert.deepEqual(parseKeyList('-sk-alone'), [])
})

test('固定格式：账号----密码----setupkey → flagged=true', () => {
  const acc = parseAccountBlock(['tqH8iLZ7VEV9----pVBYB9Fh4Mu8ayNEF8----KDI5GIHR6P3HECLE'])
  assert.equal(acc.username, 'tqH8iLZ7VEV9')
  assert.equal(acc.password, 'pVBYB9Fh4Mu8ayNEF8')
  assert.equal(acc.setupKey, 'KDI5GIHR6P3HECLE')
  assert.equal(acc.secret, 'KDI5GIHR6P3HECLE')
  assert.equal(acc.flagged, true)
})

test('固定格式：普通格式不受影响，flagged=false', () => {
  const acc = parseAccountBlock(['账号: normal-user', '密码: pass-1', 'setup key: ABCDEFGH'])
  assert.equal(acc.username, 'normal-user')
  assert.equal(acc.flagged, false)
})

test('固定格式：文本多行解析且保留标记', () => {
  const accounts = parseText('tqH8iLZ7VEV9----pVBYB9Fh4Mu8ayNEF8----KDI5GIHR6P3HECLE\n\n账号: normal-user\n密码: pass-1')
  assert.equal(accounts.length, 2)
  assert.equal(accounts[0].flagged, true)
  assert.equal(accounts[1].flagged, false)
})

test('固定格式：不足三段或空字段不误判', () => {
  const acc = parseAccountBlock(['aaa----bbb'])
  assert.equal(acc, null)
  const acc2 = parseAccountBlock(['aaa----bbb----'])
  assert.equal(acc2, null)
})
