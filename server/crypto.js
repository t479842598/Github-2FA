// 零依赖加密原语：scrypt 派生 / AES-256-GCM / 随机工具
import crypto from 'node:crypto'

export const KEY_LEN = 32
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 }

export function randomHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex')
}

export function randomBytes(bytes = 16) {
  return crypto.randomBytes(bytes)
}

// 登录密码 → 32 字节数据密钥（用于 AES-256-GCM 字段加密）
export function deriveKey(password, saltHex, n = SCRYPT_OPTS.N) {
  return crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), KEY_LEN, {
    ...SCRYPT_OPTS,
    N: n,
  })
}

// 密码哈希（scrypt，64 字节输出）；可传入外部 salt 以复用同一盐
export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT_OPTS)
  return { salt: salt.toString('hex'), hash: hash.toString('hex') }
}

export function verifyPassword(password, saltHex, hashHex) {
  const candidate = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 64, SCRYPT_OPTS)
  const expected = Buffer.from(hashHex, 'hex')
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
}

// 字段级加密：enc = { iv, ct, tag }，均 hex
export function encrypt(key, plaintext) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { iv: iv.toString('hex'), ct: ct.toString('hex'), tag: tag.toString('hex') }
}

// 解密失败（密钥不符/数据损坏）抛错，由调用方处理
export function decrypt(key, enc) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(enc.tag, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(enc.ct, 'hex')), decipher.final()]).toString('utf8')
}

export function uuid() {
  return crypto.randomUUID()
}
