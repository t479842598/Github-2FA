// 安全加固：登录限速/失败锁定、安全响应头、统一错误处理
// 零依赖内存实现（单进程部署场景）

// ---------- 失败锁定（IP 维度） ----------
const LOCK_WINDOW_MS = 15 * 60 * 1000 // 锁定 15 分钟
const MAX_FAILURES = 5 // 15 分钟内失败 5 次锁定

const failures = new Map() // ip → { count, lockedUntil }

export function checkRateLimit(ip, { maxFailures = MAX_FAILURES, windowMs = LOCK_WINDOW_MS } = {}) {
  const rec = failures.get(ip)
  const now = Date.now()
  if (rec && rec.lockedUntil && rec.lockedUntil > now) {
    return { locked: true, retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000) }
  }
  return { locked: false }
}

export function recordFailure(ip, { maxFailures = MAX_FAILURES, windowMs = LOCK_WINDOW_MS } = {}) {
  const now = Date.now()
  const rec = failures.get(ip) || { count: 0, lockedUntil: 0 }
  // 窗口过期则重置
  if (rec.count > 0 && now - rec.lastFailureAt > windowMs) {
    rec.count = 0
  }
  rec.count += 1
  rec.lastFailureAt = now
  if (rec.count >= maxFailures) {
    rec.lockedUntil = now + windowMs
    rec.count = 0
  }
  failures.set(ip, rec)
}

export function clearFailures(ip) {
  failures.delete(ip)
}

// 定期清理过期条目，防内存膨胀
setInterval(() => {
  const now = Date.now()
  for (const [ip, rec] of failures) {
    if (!rec.lockedUntil || rec.lockedUntil < now) {
      if (rec.count === 0 || now - rec.lastFailureAt > LOCK_WINDOW_MS) failures.delete(ip)
    }
  }
}, 10 * 60 * 1000).unref()

// ---------- 安全响应头 ----------
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // 严格 CSP：仅同源脚本/样式，图片允许 data:
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  )
  // 禁用缓存（管理后台含敏感数据）
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
  next()
}

// ---------- 统一错误处理 ----------
export function notFound(req, res) {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ detail: '接口不存在' })
  } else {
    res.status(404).end()
  }
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // JSON 解析错误
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ detail: '请求体不是合法 JSON' })
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ detail: '请求体过大' })
  }
  // 其余统一 500，不泄露堆栈
  console.error('[error]', req.method, req.path, err.message)
  res.status(500).json({ detail: '服务器内部错误' })
}

// 客户端 IP（考虑反代，但默认取直连地址）
export function clientIp(req) {
  return req.socket.remoteAddress || 'unknown'
}
