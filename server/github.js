// GitHub 网页协议封装：CookieJar / 登录（密码+2FA）/ Classic PAT 创建 / 登出
// 纯 Node fetch 实现，模拟浏览器 header，无第三方依赖。
import { totp } from './totp.js'

const BASE = 'https://github.com'
const TIMEOUT_MS = 20000

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Upgrade-Insecure-Requests': '1',
}

// ---------- 错误分类 ----------
export class GhError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

// ---------- CookieJar ----------
export class CookieJar {
  constructor(cookies = []) {
    this.cookies = cookies // [{name, value, domain, path, expires, secure, httpOnly}]
  }

  // 解析 Set-Cookie 响应头列表
  setFromHeaders(setCookieHeaders, fallbackDomain) {
    if (!setCookieHeaders) return
    for (const raw of Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]) {
      const parts = String(raw).split(';').map((s) => s.trim())
      const [nameValue, ...attrs] = parts
      const eq = nameValue.indexOf('=')
      if (eq < 0) continue
      const name = nameValue.slice(0, eq).trim()
      const value = nameValue.slice(eq + 1).trim()
      if (!name) continue
      const cookie = {
        name, value,
        domain: '', path: '/',
        expires: null, secure: false, httpOnly: false,
      }
      for (const attr of attrs) {
        const [k, ...rest] = attr.split('=')
        const key = k.trim().toLowerCase()
        const val = rest.join('=').trim()
        if (key === 'domain') cookie.domain = val.replace(/^\./, '')
        else if (key === 'path') cookie.path = val || '/'
        else if (key === 'expires') cookie.expires = Date.parse(val) || null
        else if (key === 'max-age') {
          const n = parseInt(val, 10)
          cookie.expires = Number.isFinite(n) ? Date.now() + n * 1000 : null
        } else if (key === 'secure') cookie.secure = true
        else if (key === 'httponly') cookie.httpOnly = true
        else if (key === 'samesite') cookie.sameSite = val
      }
      if (!cookie.domain) cookie.domain = fallbackDomain || ''
      // 替换同名同域同路径
      this.cookies = this.cookies.filter(
        (c) => !(c.name === name && c.domain === cookie.domain && c.path === cookie.path)
      )
      this.cookies.push(cookie)
    }
  }

  // 生成请求 Cookie 头
  buildHeader(url) {
    let host = ''
    try { host = new URL(url).hostname } catch { return '' }
    const now = Date.now()
    const parts = []
    for (const c of this.cookies) {
      if (c.expires && c.expires <= now) continue
      if (c.domain && !(host === c.domain || host.endsWith(`.${c.domain}`))) continue
      parts.push(`${c.name}=${c.value}`)
    }
    return parts.join('; ')
  }

  get(name) {
    const c = this.cookies.find((x) => x.name === name)
    return c ? c.value : null
  }

  clear() {
    this.cookies = []
  }

  toJSON() {
    return this.cookies.map(({ name, value, domain, path, expires, secure }) => ({
      name, value, domain, path, expires, secure,
    }))
  }

  static fromJSON(arr) {
    return new CookieJar(Array.isArray(arr) ? arr : [])
  }
}

// ---------- HTTP 工具 ----------
// 手动跟随重定向：收集每一跳的 Set-Cookie（GitHub 的 user_session 在 302 里下发）
async function ghFetch(jar, pathOrUrl, { method = 'GET', body, headers = {}, referer, maxRedirects = 6 } = {}) {
  let url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE}${pathOrUrl}`
  let currentMethod = method
  let currentBody = body

  for (let i = 0; ; i++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let res
    try {
      res = await fetch(url, {
        method: currentMethod,
        redirect: 'manual',
        headers: {
          ...BROWSER_HEADERS,
          ...(jar.buildHeader(url) ? { Cookie: jar.buildHeader(url) } : {}),
          ...(referer ? { Referer: referer } : {}),
          ...(currentMethod === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...headers,
        },
        body: currentMethod === 'POST' && currentBody
          ? (currentBody instanceof URLSearchParams ? currentBody : new URLSearchParams(currentBody)).toString()
          : undefined,
        signal: controller.signal,
      })
      jar.setFromHeaders(res.headers.getSetCookie?.() || [], new URL(url).hostname)
    } catch (e) {
      if (e.name === 'AbortError') throw new GhError('NETWORK_ERROR', `请求超时（${TIMEOUT_MS / 1000}s）：${url}`)
      throw new GhError('NETWORK_ERROR', `网络错误：${e.message}`)
    } finally {
      clearTimeout(timer)
    }

    const isRedirect = res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308
    if (isRedirect && i < maxRedirects) {
      const location = res.headers.get('location')
      if (!location) return res
      url = new URL(location, url).toString()
      // 302/303 → GET；307/308 保持原方法
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentMethod === 'POST')) {
        currentMethod = 'GET'
        currentBody = undefined
      }
      continue
    }
    return res
  }
}

async function ghGetText(jar, path, opts = {}) {
  const res = await ghFetch(jar, path, { ...opts, method: 'GET' })
  return { res, text: await res.text() }
}

async function ghPost(jar, path, body, opts = {}) {
  return ghFetch(jar, path, { ...opts, method: 'POST', body })
}

// ---------- HTML 解析 ----------
export function extractFormToken(html, name = 'authenticity_token') {
  // <input name="authenticity_token" value="..." 或 type="hidden"
  const re = new RegExp(`name=["']${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}["'][^>]*value=["']([^"']+)`, 'i')
  const re2 = new RegExp(`value=["']([^"']+)["'][^>]*name=["']${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}`, 'i')
  const m = html.match(re) || html.match(re2)
  return m ? m[1].replace(/&amp;/g, '&') : null
}

export function extractRequiredFields(html) {
  // required_field_xxx 字段（GitHub 反机器人）
  const names = []
  const re = /name=["'](required_field_[a-z0-9]+)["']/gi
  let m
  while ((m = re.exec(html))) names.push(m[1])
  return names
}

export function extractPat(html) {
  // 创建成功后 flash 区展示新 token：ghp_ + 36 字符
  const m = html.match(/ghp_[A-Za-z0-9]{36}/)
  return m ? m[0] : null
}

export function extractScopes(html) {
  // /settings/tokens/new 页面：<input type="checkbox" name="token_scopes[]" value="repo" ...>
  const scopes = []
  const re = /name=["']token_scopes\[\]["'][^>]*value=["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html))) scopes.push(m[1])
  return scopes
}

// 会话建立标志：user_session 存在或 logged_in=yes
// （登录页本身会下发 logged_in=no，不能作数，必须严格比较）
export function isSessionEstablished(jar) {
  return Boolean(jar.get('user_session')) || jar.get('logged_in') === 'yes'
}

// ---------- 登录流程 ----------
export async function loginToGithub({ username, password, secret, jar, force2fa = true }) {
  const ctx = { jar: jar || new CookieJar() }

  // 1. 获取登录页与表单令牌
  const { text: loginHtml } = await ghGetText(ctx.jar, '/login')
  if (!loginHtml.includes('authenticity_token')) {
    throw new GhError('PARSE_FAILED', '登录页解析失败（GitHub 页面结构可能已变化）')
  }
  const authToken = extractFormToken(loginHtml)
  const timestampSecret = extractFormToken(loginHtml, 'timestamp_secret')
  const requiredFields = extractRequiredFields(loginHtml)
  if (!authToken) throw new GhError('PARSE_FAILED', '未找到登录表单令牌')

  // 2. 提交账号密码（自动跟随重定向，302 中的 user_session 已收集）
  const body = {
    commit: 'Sign in',
    authenticity_token: authToken,
    login: username,
    password,
    ...(timestampSecret ? { timestamp_secret: timestampSecret } : {}),
    ...(requiredFields.length ? Object.fromEntries(requiredFields.map((f) => [f, ''])) : {}),
  }
  const res = await ghPost(ctx.jar, '/session', body, { referer: `${BASE}/login` })

  // 会话建立标志：user_session 存在或 logged_in=yes（登录页本身会下发 logged_in=no，不能作数）
  const sessionEstablished = () => isSessionEstablished(ctx.jar)

  if (sessionEstablished()) {
    await finishLogin(ctx, username)
    return ctx.jar
  }

  const html = await res.text()

  // 422：GitHub 间歇节流（同 IP 短时间内多次登录）→ 退避重试
  if (res.status === 422 && !html.includes('name="otp"') && !/Incorrect username/i.test(html)) {
    for (const delay of [3000, 6000]) {
      await new Promise((r) => setTimeout(r, delay))
      const retry = await ghPost(ctx.jar, '/session', body, { referer: `${BASE}/login` })
      await retry.text()
      if (sessionEstablished()) {
        await finishLogin(ctx, username)
        return ctx.jar
      }
      if (retry.status !== 422) break
    }
    const finalHtml = await ghPost(ctx.jar, '/session', body, { referer: `${BASE}/login` }).then((r) => r.text())
    if (sessionEstablished()) {
      await finishLogin(ctx, username)
      return ctx.jar
    }
    throw new GhError('RATE_LIMITED', 'GitHub 临时限流（登录尝试过于频繁），请稍后重试')
  }

  // 3. 检测 2FA 表单（跟随 302 后落在 two-factor 页面，或页面含 otp 输入）
  const isTwoFaPage = /sessions\/two-factor/i.test(res.url || '') || html.includes('name="otp"') || html.includes('name="app_otp"')
  if (res.status === 200 && isTwoFaPage) {
    if (!secret) throw new GhError('TWO_FA_FAILED', '账号已开启 2FA，但缺少 2FA secret，无法自动登录')
    const otpCode = totp(secret)
    const otpToken = extractFormToken(html, 'authenticity_token')
    const otpTs = extractFormToken(html, 'timestamp_secret')
    const otpRequired = extractRequiredFields(html)
    if (!otpToken) throw new GhError('PARSE_FAILED', '2FA 页面解析失败')

    const twoFaRes = await ghPost(ctx.jar, '/sessions/two-factor', {
      authenticity_token: otpToken,
      otp: otpCode,
      ...(otpTs ? { timestamp_secret: otpTs } : {}),
      ...(otpRequired.length ? Object.fromEntries(otpRequired.map((f) => [f, ''])) : {}),
    }, { referer: `${BASE}/session` })

    if (isSessionEstablished(ctx.jar)) {
      await finishLogin(ctx, username)
      return ctx.jar
    }
    throw new GhError('TWO_FA_FAILED', '2FA 验证失败（动态码可能已过期或 secret 不匹配）')
  }

  // 4. 风控 / 其它
  if (res.status === 200 && /webauthn|passkey|security key|安全密钥/i.test(html)) {
    throw new GhError('WEBAUTHN_REQUIRED', 'GitHub 要求 WebAuthn/通行密钥验证，请手动在浏览器完成登录')
  }
  if (res.status === 200 && /device verification|verify your identity|device_verification|captcha|验证码/i.test(html)) {
    throw new GhError('VERIFICATION_REQUIRED', 'GitHub 触发设备验证（验证码），请手动在浏览器完成一次登录')
  }
  if (res.status === 200 && /incorrect username or password|账号或密码错误|did not match|Incorrect/i.test(html)) {
    throw new GhError('BAD_CREDENTIALS', '账号或密码错误')
  }
  throw new GhError('LOGIN_FAILED', `登录失败（HTTP ${res.status}），GitHub 页面结构可能已变化或触发风控`)
}

// 登录成功后的公共收尾：验证会话 cookie 并记录
async function finishLogin(ctx, username) {
  // 跟随到主页验证会话（确认 logged_in=yes / user_session）
  await ghGetText(ctx.jar, '/')
  if (!isSessionEstablished(ctx.jar)) {
    throw new GhError('LOGIN_FAILED', '登录后未获得会话 cookie')
  }
  // 从主页提取已登录用户名（可选，验证用）
  ctx.loggedInAt = Date.now()
  ctx.username = username
}

// ---------- 会话有效性检测 ----------
// 用保存的 cookie 探测会话：/settings/profile 未重定向到登录页即有效
export async function checkSession(jar) {
  if (!jar || !jar.get('user_session')) {
    return { valid: false, reason: 'no_session' }
  }
  try {
    const { res, text } = await ghGetText(jar, '/settings/profile', { referer: `${BASE}/` })
    if (res.status === 404) return { valid: false, reason: 'expired' }
    if (/Sign in to GitHub|action="\/session"/i.test(text)) {
      return { valid: false, reason: 'expired' }
    }
    // 提取页面中的登录用户名
    const m = text.match(/<meta name="user-login" content="([^"]+)"/) || text.match(/data-login="([^"]+)"/)
    return { valid: true, username: m ? m[1] : null }
  } catch (e) {
    return { valid: null, reason: 'network', error: e.message }
  }
}

// ---------- PAT 有效性检测 ----------
// 用 PAT 调 api.github.com/user：200 有效 / 401 失效
export async function checkPat(pat) {
  if (!pat) return { valid: null, reason: 'no_pat' }
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        'User-Agent': BROWSER_HEADERS['User-Agent'],
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${pat}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 200) {
      const data = await res.json().catch(() => null)
      return { valid: true, login: data?.login || null }
    }
    if (res.status === 401) return { valid: false, reason: 'invalid' }
    return { valid: null, reason: 'http_' + res.status }
  } catch (e) {
    return { valid: null, reason: 'network', error: e.message }
  }
}

// ---------- 封号检测 ----------
// 探测账号是否被 GitHub 封禁/暂停。信号优先级：
//   ① PAT → api.github.com/user（200=正常，403 含 suspend/blocked=被封）
//   ② 已存会话 → 主页文本含 suspended 横幅=被封
//   ③ 兜底 → 公开资料页 github.com/{username}（200=正常，404=被封/删除）
// 返回 { banned: 'normal'|'banned'|'unknown', via: 'pat'|'session'|'profile'|'none' }
export async function checkBanned({ username, pat, jar } = {}) {
  // ① PAT 信号
  if (pat) {
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          'User-Agent': BROWSER_HEADERS['User-Agent'],
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${pat}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.status === 200) return { banned: 'normal', via: 'pat' }
      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => '')
        if (/suspend|banned|blocked/i.test(text)) return { banned: 'banned', via: 'pat' }
        // PAT 无效或权限不足，无法据此判断 → 降级到会话/公开页
      } else {
        return { banned: 'unknown', via: 'pat' }
      }
    } catch (e) {
      // 网络错误 → 降级
    }
  }

  // ② 会话信号
  if (jar && jar.get('user_session')) {
    try {
      const { text } = await ghGetText(jar, '/', { referer: `${BASE}/` })
      if (/account has been suspended|account was suspended|has been flagged|suspended for|suspended/i.test(text)) {
        return { banned: 'banned', via: 'session' }
      }
      if (/Sign in to GitHub|action="\/session"/i.test(text)) {
        // 会话已失效，无法判定 → 降级
      } else {
        return { banned: 'normal', via: 'session' }
      }
    } catch (e) {
      // 网络错误 → 降级
    }
  }

  // ③ 公开资料页兜底
  if (username) {
    try {
      const res = await fetch(`https://github.com/${encodeURIComponent(username)}`, {
        headers: BROWSER_HEADERS,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.status === 200) return { banned: 'normal', via: 'profile' }
      if (res.status === 404) return { banned: 'banned', via: 'profile' }
      if (res.status === 301 || res.status === 302 || res.status === 308) return { banned: 'normal', via: 'profile' } // 重定向=账号存在（可能改名）
      return { banned: 'unknown', via: 'profile' }
    } catch (e) {
      return { banned: 'unknown', via: 'profile' }
    }
  }

  return { banned: 'unknown', via: 'none' }
}

// ---------- PAT 列表（/settings/tokens 卡片解析，GitHub 2025+ 结构） ----------
export async function listPats(jar) {
  if (!jar || !jar.get('user_session')) {
    throw new GhError('NOT_LOGGED_IN', '请先登录 GitHub')
  }
  const { res, text } = await ghGetText(jar, '/settings/tokens')
  if (/Sign in to GitHub|action="\/session"/i.test(text)) {
    throw new GhError('NOT_LOGGED_IN', 'GitHub 会话已失效，请重新登录')
  }
  // 卡片：<div id="access-token-{id}" class="access-token js-revoke-item" data-id="...">
  const cards = [...text.matchAll(/<div[^>]*id="access-token-([^"]+)"[^>]*data-id="[^"]*"[^>]*>([\s\S]*?)(?=<\/div>\s*<div id="access-token-|<\/div>\s*<\/div>\s*<\/div>)/g)]
  const pats = []
  for (const m of cards) {
    const id = m[1]
    const html = m[2]
    // 名称：strong 或 name 字段
    const nameMatch = html.match(/<strong[^>]*>([\s\S]*?)<\/strong>/) || html.match(/"name":"([^"]+)"/)
    const name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : '(未命名)'
    // 权限：Label 徽章（排除时间标签）
    const scopes = [...html.matchAll(/class="[^"]*Label[^"]*"[^>]*>([^<]+)</g)]
      .map((x) => x[1].trim())
      .filter((x) => !/^\d+ (days|months?|years?) (ago|from now)/.test(x) && x !== 'Private')
    // 过期与最后使用
    const expires = html.match(/(?:Expires|expires)[^<]{0,40}/i)?.[0]?.replace(/^[^:]*:\s*/, '').trim()
      || html.match(/(\d+ days? from now|\d+ months? from now)/i)?.[1] || ''
    const lastUsed = html.match(/(?:Last used|last used)[^<]{0,40}/i)?.[0]?.replace(/^[^:]*:\s*/, '').trim()
      || html.match(/(\d+ (?:days?|months?|years?) ago)/i)?.[1] || ''
    pats.push({ id, name, scopes: scopes.slice(0, 8), expires, lastUsed })
  }
  if (pats.length === 0 && !text.includes('access-token-')) {
    throw new GhError('PARSE_FAILED', 'PAT 列表解析失败（GitHub 页面结构可能已变化）')
  }
  return pats
}

// ---------- PAT 撤销（_method=delete 表单） ----------
export async function revokePat(jar, tokenId) {
  if (!jar || !jar.get('user_session')) {
    throw new GhError('NOT_LOGGED_IN', '请先登录 GitHub')
  }
  const { text } = await ghGetText(jar, '/settings/tokens')
  if (/Sign in to GitHub|action="\/session"/i.test(text)) {
    throw new GhError('NOT_LOGGED_IN', 'GitHub 会话已失效，请重新登录')
  }
  // 删除表单：js-revoke-access-form，内含 authenticity_token
  const formRe = new RegExp(`<form[^>]*class="js-revoke-access-form"[^>]*data-id="${tokenId}"[\s\S]*?<\/form>`)
  const form = text.match(formRe)?.[0]
  const authToken = form ? extractFormToken(form) : extractFormToken(text)
  if (!authToken) throw new GhError('PARSE_FAILED', 'PAT 删除表单解析失败')
  const res = await ghPost(jar, `/settings/tokens/${encodeURIComponent(tokenId)}`, {
    _method: 'delete',
    authenticity_token: authToken,
  }, { referer: `${BASE}/settings/tokens` })
  const html = await res.text()
  if (/Sign in to GitHub/.test(html)) throw new GhError('NOT_LOGGED_IN', 'GitHub 会话已失效')
  return true
}

// ---------- PAT 创建 ----------
export async function createPat({ username, jar, scopes = ['repo'], expiration = '90', tokenName, customDate }) {
  const reqCustomDate = customDate || ''
  if (!jar || !jar.get('user_session')) {
    throw new GhError('NOT_LOGGED_IN', '请先登录 GitHub')
  }

  // 1. 获取令牌页与表单（自动跟随重定向；失效时会落到登录页）
  const { res, text: newHtml } = await ghGetText(jar, '/settings/tokens/new')
  if (res.status === 404) {
    throw new GhError('SESSION_EXPIRED', '会话已过期（可能是新安全策略），请重新登录')
  }
  // 未登录判定：无 user_session，或页面是登录页（含 sign in 表单）
  if (!jar.get('user_session') || /Sign in to GitHub|action="\/session"/i.test(newHtml)) {
    throw new GhError('NOT_LOGGED_IN', 'GitHub 会话已失效，请重新登录')
  }
  const authToken = extractFormToken(newHtml)
  if (!authToken) throw new GhError('PARSE_FAILED', 'PAT 创建页解析失败（页面结构可能已变化）')

  // 2. 提交创建（GitHub 2025+ 表单：oauth_access[...] 字段）
  const name = tokenName || `ghvault-${username}-${Date.now().toString(36).slice(-6)}`
  const body = new URLSearchParams()
  body.set('authenticity_token', authToken)
  body.set('oauth_access[description]', name)
  body.set('oauth_access[default_expires_at]', expiration === 'custom' ? '' : expiration)
  if (expiration === 'custom') {
    // 自定义：默认 30 天后，前端可传 customDate(YYYY-MM-DD)
    body.set('oauth_access[custom_expires_at]', reqCustomDate || '')
  }
  for (const s of scopes) body.append('oauth_access[scopes][]', s)

  const postRes = await ghPost(jar, '/settings/tokens', body, { referer: `${BASE}/settings/tokens/new` })
  const html = await postRes.text()

  const token = extractPat(html)
  if (!token) {
    if (/verify|verification|验证/i.test(html) && postRes.status === 200) {
      throw new GhError('VERIFICATION_REQUIRED', 'GitHub 要求验证身份后才能创建令牌')
    }
    throw new GhError('PAT_PARSE_FAILED', `未在返回页面找到新令牌（HTTP ${postRes.status}）`)
  }
  return { token, name }
}

// ---------- 登出 ----------
export async function logoutFromGithub(jar) {
  if (!jar) return
  try {
    const { text } = await ghGetText(jar, '/logout')
    const token = extractFormToken(text)
    if (token) {
      await ghPost(jar, '/logout', { authenticity_token: token }, { referer: `${BASE}/logout` })
    }
  } catch { /* 尽力而为 */ }
  jar.clear()
}
