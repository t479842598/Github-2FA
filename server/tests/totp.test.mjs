import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hotp, totp, totpRemaining, base32Decode, secretFromUri } from '../totp.js'

// RFC 6238 附录 B 测试向量（SHA1，secret = ASCII "12345678901234567890"）
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii')
const VECTORS_8D = [
  [0, '84755224'], // counter=0，6 位模 = 755224 与 RFC 4226 一致
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
]

test('RFC 6238 SHA1 8 位向量对拍', () => {
  for (const [t, expected] of VECTORS_8D) {
    const code = totp(RFC_SECRET, { now: t * 1000, digits: 8 })
    assert.equal(code, expected, `t=${t}`)
  }
})

test('6 位模式与 8 位取模一致', () => {
  const t = 1111111109
  const code6 = totp(RFC_SECRET, { now: t * 1000, digits: 6 })
  assert.equal(code6, '081804') // 07081804 mod 10^6
})

test('HOTP RFC 4226 附录 D 向量（SHA1, 6 位）', () => {
  const secret = Buffer.from('12345678901234567890', 'ascii')
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489']
  for (let i = 0; i < expected.length; i++) {
    assert.equal(hotp(secret, i), expected[i], `counter=${i}`)
  }
})

test('base32 解码："12345678901234567890" 的 Base32 与 ASCII 等价', () => {
  // GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ = Base32("12345678901234567890")
  const k = base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  assert.deepEqual(k, RFC_SECRET)
  // 小写 + 空格容忍
  const k2 = base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')
  assert.deepEqual(k2, RFC_SECRET)
})

test('用户示例 secret 生成 6 位码（格式合法且稳定）', () => {
  for (const secret of ['KDI5GIHR6P3HECLE', 'G3VDNO6VQNWAUZTW', '457WE4LNMRNODMP4']) {
    const code = totp(secret)
    assert.match(code, /^\d{6}$/)
  }
})

test('totpRemaining 在 1..step 范围内', () => {
  const r = totpRemaining({ now: Date.now() })
  assert.ok(r >= 1 && r <= 30)
  assert.equal(totpRemaining({ now: 0 }), 30)
  assert.equal(totpRemaining({ now: 29 * 1000 }), 1)
  assert.equal(totpRemaining({ now: 30 * 1000 }), 30)
})

test('secretFromUri 提取', () => {
  assert.equal(secretFromUri('otpauth://totp/GitHub:xx?secret=ABC123&issuer=GitHub'), 'ABC123')
  assert.equal(secretFromUri('otpauth://totp/x?issuer=GitHub'), null)
})
