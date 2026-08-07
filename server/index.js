// GitHub 2FA Manager — Express 入口
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Vault } from './store.js'
import { issueToken, requireAuth } from './auth.js'
import { totp, totpRemaining } from './totp.js'
import { parseImport, sanitizeAccount } from './parser.js'
import {
  loginToGithub, createPat, logoutFromGithub, checkSession, checkPat, listPats, revokePat,
  CookieJar, GhError,
} from './github.js'
import QRCode from 'qrcode'
import { securityHeaders, notFound, errorHandler, checkRateLimit, recordFailure, clearFailures, clientIp } from './security.js'
import { VERSION, APP_NAME, checkUpdate } from './version.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3000)
const DATA_FILE = process.env.VAULT_FILE || path.join(__dirname, '..', 'data', 'vault.json')

const vault = new Vault(DATA_FILE)
await vault.load()

const app = express()
app.use(express.json({ limit: '10mb' }))

// 安全头
app.use(securityHeaders)

function fail(res, status, detail) {
  return res.status(status).json({ detail })
}

// ---- 公开接口 ----
app.get('/api/status', (_req, res) => {
  res.json({ setup: vault.isSetup, mustChangePassword: vault.mustChangePassword, version: VERSION, app: APP_NAME })
})

app.post('/api/setup', async (req, res) => {
  if (vault.isSetup) return fail(res, 409, '已设置过密码')
  const { password } = req.body || {}
  if (!password || String(password).length < 6) {
    return fail(res, 400, '密码至少 6 位')
  }
  await vault.setupPassword(String(password))
  res.json({ success: true, token: issueToken(vault) })
})

app.post('/api/login', (req, res) => {
  const ip = clientIp(req)
  const limit = checkRateLimit(ip)
  if (limit.locked) {
    return fail(res, 429, `尝试过于频繁，请 ${Math.ceil(limit.retryAfterSec / 60)} 分钟后再试`)
  }
  if (!vault.isSetup) return fail(res, 400, '尚未设置密码')
  const { password } = req.body || {}
  if (!password || !vault.verifyPassword(String(password))) {
    recordFailure(ip)
    vault.log('login_fail', '', ip, 'fail')
    return fail(res, 401, '密码错误')
  }
  clearFailures(ip)
  vault.setDataKey(String(password))
  vault.log('login_ok', '', ip)
  res.json({ success: true, token: issueToken(vault), mustChangePassword: vault.mustChangePassword })
})

// ---- 受保护接口 ----
const auth = requireAuth(vault)

// 强制改密守卫：默认密码未修改前，禁止写操作与导入
const requirePasswordChanged = (req, res, next) => {
  if (vault.mustChangePassword) {
    return res.status(403).json({ detail: '请先修改默认密码（sk-admin）后再操作', code: 'MUST_CHANGE_PASSWORD' })
  }
  next()
}
app.use('/api/accounts', auth)
app.use('/api/otps', auth)
app.use('/api/import', auth)
app.use('/api/change-password', auth)
app.use('/api/backup', auth)
// 默认密码未改时：禁止导入、添加/编辑/删除账号、GitHub 登录/PAT（只读列表与改密放行）
app.post('/api/import', requirePasswordChanged)
app.post('/api/accounts', requirePasswordChanged)
app.put('/api/accounts/:id', requirePasswordChanged)
app.delete('/api/accounts/:id', requirePasswordChanged)
app.post('/api/accounts/:id/github/login', requirePasswordChanged)
app.post('/api/accounts/:id/github/pat', requirePasswordChanged)
app.post('/api/accounts/:id/github/cookies', requirePasswordChanged)

app.get('/api/accounts', (_req, res) => {
  res.json({ accounts: vault.listAccounts() })
})

app.get('/api/accounts/:id/full', (req, res) => {
  const acc = vault.getFullAccount(req.params.id)
  if (!acc) return fail(res, 404, '账号不存在')
  res.json(acc)
})

app.post('/api/accounts', (req, res) => {
  const { username, email, password, setupKey, otpauth, secret, recoveryCodes, pat, remark, tags, kvRecords } = req.body || {}
  if (!username || !String(username).trim()) return fail(res, 400, '账号名不能为空')
  if (String(username).length > 100) return fail(res, 400, '账号名过长')
  const acc = vault.createAccount(sanitizeAccount({
    username, email, password, setupKey, otpauth, secret,
    recoveryCodes: Array.isArray(recoveryCodes) ? recoveryCodes : [],
    pat, remark, tags, kvRecords,
  }))
  vault.log('account_add', acc.username, clientIp(req))
  res.json({ success: true, account: { id: acc.id, username: acc.username } })
})

app.put('/api/accounts/:id', (req, res) => {
  const { username, email, password, setupKey, otpauth, secret, recoveryCodes, pat, remark, tags, kvRecords } = req.body || {}
  const patch = {
    username, email, password, setupKey, otpauth, secret,
    recoveryCodes: recoveryCodes !== undefined ? (Array.isArray(recoveryCodes) ? recoveryCodes : []) : undefined,
    pat, remark, tags, kvRecords,
  }
  // 未传的字段不覆盖
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) delete patch[k]
  }
  const acc = vault.updateAccount(req.params.id, patch)
  if (!acc) return fail(res, 404, '账号不存在')
  vault.log('account_update', acc.username, clientIp(req))
  res.json({ success: true })
})

app.delete('/api/accounts/:id', async (req, res) => {
  const acc = vault.getAccount(req.params.id)
  if (!vault.deleteAccount(req.params.id)) return fail(res, 404, '账号不存在')
  vault.log('account_delete', acc?.username || '', clientIp(req))
  await vault.save()
  res.json({ success: true })
})

// 2FA 二维码：后端生成 QR dataURL + 返回 otpauth URI（无 secret 则 404）
app.get('/api/accounts/:id/otpauth', async (req, res) => {
  const acc = vault.getFullAccount(req.params.id)
  if (!acc) return fail(res, 404, '账号不存在')
  let uri = acc.otpauth
  if (!uri && acc.setupKey) {
    uri = `otpauth://totp/GitHub:${encodeURIComponent(acc.username)}?secret=${acc.setupKey}&issuer=GitHub`
  }
  if (!uri) return fail(res, 404, '该账号没有 2FA secret，无法生成二维码')
  try {
    const qrDataUrl = await QRCode.toDataURL(uri, { width: 240, margin: 1 })
    res.json({ uri, qrDataUrl, username: acc.username })
  } catch (e) {
    return fail(res, 500, `二维码生成失败：${e.message}`)
  }
})

// ---- GitHub 会话（登录 cookie / PAT / 登出） ----
app.post('/api/accounts/:id/github/login', async (req, res) => {
  const acc = vault.getFullAccount(req.params.id)
  if (!acc) return fail(res, 404, '账号不存在')
  if (!acc.password) return fail(res, 400, '该账号没有保存密码，无法自动登录')

  const jar = new CookieJar()
  try {
    vault.log('gh_login', acc.username, clientIp(req), 'start')
    await loginToGithub({
      username: acc.username,
      password: acc.password,
      secret: (acc.otpauth?.match(/[?&]secret=([A-Za-z0-9]+)/)?.[1]) || acc.setupKey || null,
      jar,
    })
  } catch (e) {
    if (e instanceof GhError) return fail(res, 400, e.message)
    return fail(res, 500, `登录异常：${e.message}`)
  }

  vault.setGhSession(acc.id, {
    cookies: jar.toJSON(),
    loggedInAt: Date.now(),
    username: acc.username,
  })
  await vault.save()
  res.json({ success: true, loggedInAt: Date.now() })
})

app.get('/api/accounts/:id/github/status', (req, res) => {
  const acc = vault.getFullAccount(req.params.id)
  if (!acc) return fail(res, 404, '账号不存在')
  const session = vault.getGhSession(acc.id)
  res.json({
    loggedIn: Boolean(session && session.cookies && session.cookies.length > 0),
    loggedInAt: session?.loggedInAt || null,
    cookieCount: session?.cookies?.length || 0,
    username: session?.username || acc.username,
  })
})

app.post('/api/accounts/:id/github/pat', async (req, res) => {
  const acc = vault.getFullAccount(req.params.id)
  if (!acc) return fail(res, 404, '账号不存在')
  const session = vault.getGhSession(acc.id)
  if (!session) return fail(res, 400, '请先登录 GitHub（该账号没有保存会话）')

  const { scopes, expiration } = req.body || {}
  const jar = CookieJar.fromJSON(session.cookies)
  try {
    const { token, name } = await createPat({
      username: acc.username,
      jar,
      scopes: Array.isArray(scopes) && scopes.length ? scopes : ['repo'],
      expiration: String(expiration || '90'),
    })
    // 自动保存到账号 PAT（加密）
    vault.updateAccount(acc.id, { pat: token })
    vault.log('pat_create', acc.username, clientIp(req), 'ok', `${scopes?.length || 1} scopes / ${expiration}d`)
    // 会话可能刷新了 cookie
    vault.setGhSession(acc.id, { ...session, cookies: jar.toJSON() })
    await vault.save()
    res.json({ success: true, token, name })
  } catch (e) {
    if (e instanceof GhError) {
      // 会话失效则清掉本地会话
      if (e.code === 'NOT_LOGGED_IN' || e.code === 'SESSION_EXPIRED') {
        vault.clearGhSession(acc.id)
        await vault.save()
      }
      return fail(res, 400, e.message)
    }
    return fail(res, 500, `创建 PAT 异常：${e.message}`)
  }
})

app.post('/api/accounts/:id/github/logout', async (req, res) => {
  const acc = vault.getFullAccount(req.params.id)
  if (!acc) return fail(res, 404, '账号不存在')
  const session = vault.getGhSession(acc.id)
  if (session) {
    try {
      await logoutFromGithub(CookieJar.fromJSON(session.cookies))
    } catch { /* 尽力而为 */ }
  }
  vault.clearGhSession(acc.id)
  await vault.save()
  res.json({ success: true })
})

// 手动粘贴 cookie：解析 "a=b; c=d" 并保存为会话；GET 返回当前 cookie 字符串
app.post('/api/accounts/:id/github/cookies', async (req, res) => {
  const acc = vault.getFullAccount(req.params.id)
  if (!acc) return fail(res, 404, '账号不存在')
  const { cookieString } = req.body || {}
  if (!cookieString || !String(cookieString).trim()) return fail(res, 400, 'Cookie 内容为空')
  const cookies = []
  for (const part of String(cookieString).split(';')) {
    const eq = part.indexOf('=')
    if (eq < 1) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (name && value) cookies.push({ name, value, domain: 'github.com', path: '/', expires: null, secure: true })
  }
  if (cookies.length === 0) return fail(res, 400, '无法解析 Cookie（格式：name=value; name2=value2）')
  vault.setGhSession(acc.id, { cookies, loggedInAt: Date.now(), username: acc.username, manual: true })
  await vault.save()
  res.json({ success: true, count: cookies.length })
})

app.get('/api/accounts/:id/github/cookies', (req, res) => {
  const acc = vault.getFullAccount(req.params.id)
  if (!acc) return fail(res, 404, '账号不存在')
  const session = vault.getGhSession(acc.id)
  const jar = session ? CookieJar.fromJSON(session.cookies) : new CookieJar()
  res.json({ cookieString: jar.buildHeader('https://github.com/') })
})

// 批量 TOTP：{ id: { code, remaining } }
app.get('/api/otps', (_req, res) => {
  const now = Date.now()
  const remaining = totpRemaining({ now })
  const result = {}
  for (const acc of vault.data.accounts) {
    const secret = vault.getSecret(acc.id)
    if (!secret) continue
    try {
      result[acc.id] = { code: totp(secret, { now }), remaining }
    } catch {
      // secret 非法则跳过
    }
  }
  res.json({ otps: result, remaining, step: 30 })
})

// 导入：POST { text } → 解析预览(dry=1) 或入库
app.post('/api/import', async (req, res) => {
  const { text, dry } = req.body || {}
  if (!text || !String(text).trim()) return fail(res, 400, '导入内容为空')

  let parsed
  try {
    parsed = parseImport(String(text))
  } catch (e) {
    return fail(res, 400, `解析失败：${e.message}`)
  }

  const preview = parsed.map((a) => ({
    username: a.username,
    email: a.email,
    hasPassword: Boolean(a.password),
    hasSecret: Boolean(a.secret),
    recoveryCount: a.recoveryCodes.length,
    hasPat: Boolean(a.pat),
    dup: Boolean(vault.findImportDuplicate(a)),
  }))

  if (dry) return res.json({ preview, count: preview.length })

  let imported = 0
  const skipped = []
  const errors = []
  for (const raw of parsed) {
    const acc = sanitizeAccount(raw)
    if (!acc.username && !acc.email) {
      errors.push({ username: acc.username || '(未命名)', reason: '缺少账号/邮箱' })
      continue
    }
    const dup = vault.findImportDuplicate(acc)
    if (dup) {
      skipped.push({ username: acc.username || acc.email, reason: dup.reason })
      continue
    }
    vault.createAccount(acc)
    imported += 1
  }
  await vault.save()
  vault.log('import', '', clientIp(req), 'ok', `${imported} imported / ${skipped.length} skipped`)
  res.json({ imported, skipped, errors })
})

// 修改密码
app.post('/api/change-password', async (req, res) => {
  const ip = clientIp(req)
  const limit = checkRateLimit(ip)
  if (limit.locked) {
    return fail(res, 429, `尝试过于频繁，请 ${Math.ceil(limit.retryAfterSec / 60)} 分钟后再试`)
  }
  const { oldPassword, newPassword } = req.body || {}
  if (!oldPassword || !newPassword) return fail(res, 400, '缺少参数')
  if (String(newPassword).length < 6) return fail(res, 400, '新密码至少 6 位')
  const ok = await vault.changePassword(String(oldPassword), String(newPassword))
  if (!ok) {
    recordFailure(ip)
    vault.log('password_change', '', ip, 'fail')
    return fail(res, 401, '旧密码错误')
  }
  clearFailures(ip)
  vault.log('password_changed', '', ip)
  res.json({ success: true })
})

// 备份导出（加密数据，需密码才能导入）
app.get('/api/backup', (_req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="vault-backup.json"')
  res.json(vault.exportBackup())
})

// 备份导入：{ backup, password }
app.post('/api/backup/import', async (req, res) => {
  const { backup, password } = req.body || {}
  if (!backup || !password) return fail(res, 400, '缺少备份内容或密码')
  try {
    const count = await vault.importBackup(backup, String(password))
    vault.log('backup_import', '', clientIp(req), 'ok', `${count} accounts`)
    res.json({ success: true, count })
  } catch (e) {
    return fail(res, 400, e.message)
  }
})

// ---- 生产：托管前端 ----
const distDir = path.join(__dirname, '..', 'webui', 'dist')
app.use(express.static(distDir))
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) res.status(404).end()
  })
})

// ---- 审计日志 ----
app.get('/api/audit', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  res.json({ logs: vault.getAuditLog(limit) })
})

app.delete('/api/audit', async (req, res) => {
  vault.clearAuditLog()
  vault.log('audit_clear', '', clientIp(req))
  await vault.save()
  res.json({ success: true })
})

// ---- 批量导出（用户导入格式） ----
app.get('/api/export', async (req, res) => {
  try {
    const text = vault.exportText()
    vault.log('export', '', clientIp(req))
    await vault.save()
    res.json({ text })
  } catch (e) {
    return fail(res, 500, `导出失败：${e.message}`)
  }
})

// ---- 恢复码使用标记 ----
app.put('/api/accounts/:id/recovery-used', async (req, res) => {
  const { index, used } = req.body || {}
  if (!Number.isInteger(index) || typeof used !== 'boolean') return fail(res, 400, '参数错误')
  const ok = vault.setRecoveryUsed(req.params.id, index, used)
  if (!ok) return fail(res, 404, '账号不存在或恢复码索引越界')
  await vault.save()
  vault.log('recovery_mark', vault.getAccount(req.params.id)?.username || '', clientIp(req), used ? 'used' : 'restored', `#${index}`)
  res.json({ success: true })
})

// ---- 标签 ----
app.get('/api/tags', (req, res) => {
  const tagSet = new Set()
  for (const a of vault.data.accounts) {
    for (const t of a.tags || []) tagSet.add(t)
  }
  res.json({ tags: [...tagSet].sort() })
})

// ---- 账号健康检查（会话 + PAT 有效性） ----
app.post('/api/accounts/health', async (req, res) => {
  const results = []
  const accounts = vault.data.accounts
  for (let i = 0; i < accounts.length; i++) {
    const a = accounts[i]
    const item = { id: a.id, username: a.username, session: 'none', pat: 'none', patLogin: null }
    const session = vault.getGhSession(a.id)
    if (session) {
      const r = await checkSession(CookieJar.fromJSON(session.cookies))
      item.session = r.valid === true ? 'valid' : r.valid === false ? 'invalid' : 'error'
    }
    const full = vault.getFullAccount(a.id)
    if (full.pat && full.pat !== '__decrypt_failed__') {
      const r = await checkPat(full.pat)
      item.pat = r.valid === true ? 'valid' : r.valid === false ? 'invalid' : 'error'
      item.patLogin = r.login || null
    }
    results.push(item)
    if (i < accounts.length - 1) await new Promise((r) => setTimeout(r, 600)) // GitHub 限流保护
  }
  vault.log('health_check', '', clientIp(req), 'ok', `${results.length} accounts`)
  await vault.save()
  res.json({ results })
})

// ---- GitHub 会话检测（单账号） ----
app.post('/api/accounts/:id/github/check', async (req, res) => {
  const acc = vault.getFullAccount(req.params.id)
  if (!acc) return fail(res, 404, '账号不存在')
  const session = vault.getGhSession(acc.id)
  if (!session) return res.json({ valid: null, reason: 'no_session' })
  const r = await checkSession(CookieJar.fromJSON(session.cookies))
  res.json(r)
})

// ---- PAT 列表与撤销 ----
app.get('/api/accounts/:id/github/pats', async (req, res) => {
  const acc = vault.getFullAccount(req.params.id)
  if (!acc) return fail(res, 404, '账号不存在')
  const session = vault.getGhSession(acc.id)
  if (!session) return fail(res, 400, '请先登录 GitHub')
  try {
    const pats = await listPats(CookieJar.fromJSON(session.cookies))
    res.json({ pats })
  } catch (e) {
    if (e instanceof GhError) return fail(res, 400, e.message)
    return fail(res, 500, `获取 PAT 列表异常：${e.message}`)
  }
})

app.post('/api/accounts/:id/github/pats/:tokenId/revoke', async (req, res) => {
  const acc = vault.getFullAccount(req.params.id)
  if (!acc) return fail(res, 404, '账号不存在')
  const session = vault.getGhSession(acc.id)
  if (!session) return fail(res, 400, '请先登录 GitHub')
  try {
    await revokePat(CookieJar.fromJSON(session.cookies), req.params.tokenId)
    vault.log('pat_revoke', acc.username, clientIp(req), 'ok', req.params.tokenId.slice(0, 12))
    await vault.save()
    res.json({ success: true })
  } catch (e) {
    if (e instanceof GhError) return fail(res, 400, e.message)
    return fail(res, 500, `撤销 PAT 异常：${e.message}`)
  }
})

// ---- 版本与更新检测（免鉴权，仅版本信息） ----
app.get('/api/update', async (_req, res) => {
  const info = await checkUpdate()
  res.json(info)
})

// 统一 404 与错误处理
app.use(notFound)
app.use(errorHandler)

const HOST = process.env.HOST || '127.0.0.1' // 默认仅本机访问，局域网部署时显式设置 HOST=0.0.0.0
app.listen(PORT, HOST, () => {
  console.log(`▶ GitHub 2FA Manager 已启动: http://${HOST}:${PORT}`)
  console.log(`  数据文件: ${DATA_FILE}`)
})
