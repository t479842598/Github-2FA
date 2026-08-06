// otpauth URI 解析与组装（前端工具，与后端 parser 的 secret 提取互补）
// 格式：otpauth://totp/{label}?secret=...&issuer=...&digits=...&period=...

export function parseOtpUri(uri) {
  if (typeof uri !== 'string') throw new Error('URI 无效')
  const trimmed = uri.trim()
  if (!trimmed) throw new Error('URI 为空')

  let url
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('不是有效的 otpauth URI（应为 otpauth://totp/... 格式）')
  }
  if (url.protocol !== 'otpauth:') {
    throw new Error('仅支持 otpauth:// 协议的 URI')
  }
  const type = url.hostname
  if (type !== 'totp' && type !== 'hotp') {
    throw new Error(`不支持的 otpauth 类型：${type}（仅 totp）`)
  }
  if (type === 'hotp') {
    throw new Error('HOTP（事件型）暂不支持，仅支持 TOTP')
  }

  const label = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!label) throw new Error('URI 缺少账号标签')

  const secret = url.searchParams.get('secret') || ''
  if (!secret) throw new Error('URI 缺少 secret 参数，无法添加')

  // label 支持 "Issuer:account" 与纯 account
  let username = label
  let issuerFromLabel = null
  const colonIdx = label.indexOf(':')
  if (colonIdx > 0) {
    issuerFromLabel = label.slice(0, colonIdx)
    username = label.slice(colonIdx + 1)
  }
  const issuer = url.searchParams.get('issuer') || issuerFromLabel || ''

  const digits = Number(url.searchParams.get('digits') || 6)
  const period = Number(url.searchParams.get('period') || 30)

  return {
    type: 'totp',
    username,
    issuer,
    secret,
    digits: Number.isInteger(digits) && digits >= 6 && digits <= 8 ? digits : 6,
    period: Number.isInteger(period) && period > 0 ? period : 30,
    uri: trimmed,
  }
}

// 组装 URI（用于展示或构造）
export function buildOtpUri({ username, secret, issuer = 'GitHub', digits = 6, period = 30 }) {
  const label = issuer ? `${issuer}:${username}` : username
  const params = new URLSearchParams()
  params.set('secret', secret)
  if (issuer) params.set('issuer', issuer)
  if (digits !== 6) params.set('digits', String(digits))
  if (period !== 30) params.set('period', String(period))
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
}
