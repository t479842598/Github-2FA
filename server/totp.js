// RFC 6238 TOTP / RFC 4226 HOTP —— 纯 Node crypto 实现
import crypto from 'node:crypto'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// Base32 解码（容忍空格/短横线/等号/小写），非法字符跳过
export function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[\s\-=]/g, '')
  const out = []
  let bits = 0
  let value = 0
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  if (out.length === 0) throw new Error('invalid base32 secret')
  return Buffer.from(out)
}

export function hotp(key, counter, digits = 6) {
  const k = Buffer.isBuffer(key) ? key : base32Decode(key)
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', k).update(msg).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(code % 10 ** digits).padStart(digits, '0')
}

export function totp(secret, { step = 30, digits = 6, now = Date.now() } = {}) {
  const counter = Math.floor(now / 1000 / step)
  return hotp(secret, counter, digits)
}

// 当前步剩余秒数
export function totpRemaining({ step = 30, now = Date.now() } = {}) {
  return step - (Math.floor(now / 1000) % step)
}

// 从 otpauth URI 中提取 secret，无则返回 null
export function secretFromUri(uri) {
  if (!uri) return null
  const m = String(uri).match(/[?&]secret=([A-Za-z0-9]+)/)
  return m ? m[1] : null
}
