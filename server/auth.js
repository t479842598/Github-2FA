// 认证：首次设置密码 / 登录 / JWT（HMAC-SHA256，零依赖）
import crypto from 'node:crypto'

const TOKEN_TTL_SEC = 7 * 24 * 3600

function sign(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

function verify(token, secret) {
  const parts = String(token).split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function issueToken(vault) {
  const now = Math.floor(Date.now() / 1000)
  return sign({
    sub: 'admin', tv: vault.tokenVersion,
    iat: now, exp: now + TOKEN_TTL_SEC,
  }, vault.jwtSecret)
}

export function verifyToken(token, vault) {
  const payload = verify(token, vault.jwtSecret)
  if (payload && payload.tv !== vault.tokenVersion) return null // 改密码后吊销旧 token
  return payload
}

// Express 中间件：未登录/无效 → 401
export function requireAuth(vault) {
  return (req, res, next) => {
    const header = req.headers.authorization || ''
    const m = header.match(/^Bearer\s+(.+)$/i)
    if (!m || !verifyToken(m[1], vault)) {
      return res.status(401).json({ detail: '未登录或会话已过期' })
    }
    next()
  }
}
