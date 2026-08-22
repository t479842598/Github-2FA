// 端到端集成验证：启动真实 server，验证 P0 修复 + 新增鉴权 + github summary
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const NODE = process.execPath
const ROOT = path.resolve(import.meta.dirname, "..", "..")
const dir = mkdtempSync(path.join(tmpdir(), 'ghvault-e2e-'))
const port = 3188 + Math.floor(Math.random() * 100)

const server = spawn(NODE, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port), VAULT_FILE: path.join(dir, 'vault.json'), TRUST_PROXY: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
server.stdout.on('data', (d) => { log += d })
server.stderr.on('data', (d) => { log += d })

const base = `http://127.0.0.1:${port}`
let token = null

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitReady() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${base}/api/status`)
      if (r.ok) return
    } catch { /* retry */ }
    await sleep(200)
  }
  throw new Error('server not ready: ' + log)
}
async function req(p, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${base}${p}`, { ...opts, headers })
  let data = null
  try { data = await res.json() } catch { /* no body */ }
  return { status: res.status, data }
}
const checks = []
function check(name, cond, detail = '') {
  checks.push({ name, pass: Boolean(cond), detail })
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

try {
  await waitReady()

  // 首次启动默认密码 sk-admin
  let r = await req('/api/login', { method: 'POST', body: JSON.stringify({ password: 'sk-admin' }) })
  check('默认密码登录', r.status === 200, `status=${r.status}`)
  token = r.data.token

  // 默认密码未改时写操作应被拒（mustChangePassword 守卫）
  r = await req('/api/accounts', { method: 'POST', body: JSON.stringify({ username: 'blocked' }) })
  check('默认密码未改时写操作被拒（403）', r.status === 403, `status=${r.status}`)

  // 改密后解锁
  r = await req('/api/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: 'sk-admin', newPassword: 'e2e-pass-1' }) })
  check('修改默认密码', r.status === 200)
  r = await req('/api/login', { method: 'POST', body: JSON.stringify({ password: 'e2e-pass-1' }) })
  check('新密码登录', r.status === 200)
  token = r.data.token

  // 创建含完整凭据的账号
  r = await req('/api/accounts', { method: 'POST', body: JSON.stringify({
    username: 'alice', email: 'alice@x.com', password: 'secret-pass-123',
    setupKey: 'KDI5GIHR6P3HECLE', otpauth: 'otpauth://totp/GitHub:alice?secret=KDI5GIHR6P3HECLE&issuer=GitHub',
    recoveryCodes: ['aaaa-1111'], pat: 'ghp_xxx', remark: '备注',
  }) })
  check('创建账号', r.status === 200, `status=${r.status}`)
  const id = r.data.account.id

  // P0 复现场景：只改 username（旧版 EditModal 会带上空敏感字段，新版本端不再发送）
  // 模拟旧版前端行为（发送空敏感字段）——服务端应拒绝空 username，但允许清空语义？
  // 新版前端修复后不会发送这些字段，这里验证「只发 username」不会清空其他字段
  r = await req(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ username: 'alice2' }) })
  check('仅改用户名 PUT 成功', r.status === 200)
  r = await req(`/api/accounts/${id}/full`)
  check('敏感字段未被清空（只改 username 时）', r.data.password === 'secret-pass-123' && r.data.setupKey === 'KDI5GIHR6P3HECLE' && r.data.recoveryCodes.length === 1, `password=${r.data.password}`)

  // PUT 空 username 应被拒绝
  r = await req(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ username: '  ' }) })
  check('空 username 被拒绝', r.status === 400, `status=${r.status}`)

  // PUT 超长字段被 sanitize 截断
  r = await req(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ remark: 'x'.repeat(900) }) })
  check('超长字段被截断', r.status === 200)
  r = await req(`/api/accounts/${id}/full`)
  check('remark 被截断到 500', r.data.remark.length === 500)

  // 未登录访问 /api/export 应 401（原先是明文漏洞）
  const noAuth = await fetch(`${base}/api/export`)
  check('未登录访问 /api/export 被拒（401）', noAuth.status === 401, `status=${noAuth.status}`)
  const noAuthTags = await fetch(`${base}/api/tags`)
  check('未登录访问 /api/tags 被拒（401）', noAuthTags.status === 401)

  // 登录后 /api/github/summary 可用
  r = await req('/api/github/summary')
  check('github summary 接口', r.status === 200 && r.data.accounts === 1, JSON.stringify(r.data))

  // 导入去重索引路径（端到端 import）
  // 预览在批量创建前运行 → 同批次内不判定重复（与旧行为一致）；正式导入时批次内去重生效
  const importText = '账号: bob\n密码: pass-b\nsetup key: BBBB2222\n\n────────\n\n账号: carol\n密码: pass-c\nsetup key: CCCC3333\n\n────────\n\n账号: bob2\n密码: pass-b\nsetup key: BBBB2222'
  r = await req('/api/import', { method: 'POST', body: JSON.stringify({ text: importText, dry: 1 }) })
  check('导入预览（3 个全为新）', r.status === 200 && r.data.preview.length === 3 && !r.data.preview.some((p) => p.dup), JSON.stringify(r.data.preview))
  r = await req('/api/import', { method: 'POST', body: JSON.stringify({ text: importText }) })
  check('导入：新增 2 跳过 1（批次内去重）', r.status === 200 && r.data.imported === 2 && r.data.skipped.length === 1 && r.data.skipped[0].username === 'bob2', JSON.stringify(r.data))

  // TRUST_PROXY 下 clientIp 取 XFF：用一个会写审计日志的请求验证
  r = await req('/api/export', { headers: { 'X-Forwarded-For': '8.8.8.8' } })
  check('带 XFF 的导出请求成功', r.status === 200)
  r = await req('/api/audit')
  check('TRUST_PROXY 生效（审计记录 XFF IP）', r.status === 200 && r.data.logs.some((l) => l.ip === '8.8.8.8'), JSON.stringify(r.data.logs.slice(0, 2)))

  // 备份往返（含审计日志）——用当前密码 e2e-pass-1
  r = await req('/api/backup')
  check('导出备份', r.status === 200 && Array.isArray(r.data.auditLog))
  const backup = r.data
  r = await req('/api/backup/import', { method: 'POST', body: JSON.stringify({ backup, password: 'e2e-pass-1' }) })
  check('导入备份成功', r.status === 200 && r.data.count === 3, JSON.stringify(r.data))
  // 备份导入会重新生成 jwtSecret → 旧 token 失效，需重新登录
  r = await req('/api/login', { method: 'POST', body: JSON.stringify({ password: 'e2e-pass-1' }) })
  check('备份导入后重新登录', r.status === 200)
  token = r.data.token

  // 改密后旧 token 失效
  r = await req('/api/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: 'e2e-pass-1', newPassword: 'new-pass-9' }) })
  check('修改密码', r.status === 200, `status=${r.status} body=${JSON.stringify(r.data)}`)
  const oldToken = token
  r = await req('/api/accounts')
  check('改密后旧 token 失效（401）', r.status === 401, `status=${r.status}`)
  r = await req('/api/login', { method: 'POST', body: JSON.stringify({ password: 'new-pass-9' }) })
  check('新密码登录', r.status === 200, `status=${r.status} body=${JSON.stringify(r.data)}`)
  token = r.data.token
  r = await req('/api/accounts')
  check('新 token 可用', r.status === 200, `status=${r.status}`)
  void oldToken

  // opencode / freebuff 密钥导入 → 导出往返（"账号-密钥"格式）
  r = await req('/api/accounts', { method: 'POST', body: JSON.stringify({ username: 'keyuser' }) })
  check('创建 keyuser 账号', r.status === 200, `status=${r.status}`)
  r = await req('/api/import/keys', { method: 'POST', body: JSON.stringify({ text: 'keyuser-opencode-sk-AAA111', name: 'opencode' }) })
  check('导入 opencode 密钥', r.status === 200 && r.data.imported.length === 1, JSON.stringify(r.data))
  r = await req('/api/import/keys', { method: 'POST', body: JSON.stringify({ text: 'keyuser-freebuff-FB-222', name: 'freebuff' }) })
  check('导入 freebuff 密钥', r.status === 200 && r.data.imported.length === 1, JSON.stringify(r.data))
  r = await req('/api/export/keys?name=opencode')
  check('导出 opencode 密钥（账号-密钥）', r.status === 200 && r.data.text === 'keyuser-opencode-sk-AAA111' && r.data.count === 1, JSON.stringify(r.data))
  r = await req('/api/export/keys?name=freebuff')
  check('导出 freebuff 密钥（账号-密钥）', r.status === 200 && r.data.text === 'keyuser-freebuff-FB-222' && r.data.count === 1, JSON.stringify(r.data))
  r = await req('/api/export/keys?name=opencode', { headers: { 'X-Forwarded-For': '8.8.8.8' } })
  check('密钥导出接口正常', r.status === 200, `status=${r.status}`)
  r = await req('/api/audit')
  check('密钥导出审计留痕', r.status === 200 && r.data.logs.some((l) => l.action === 'key_export'), JSON.stringify(r.data.logs.slice(0, 2)))
} catch (e) {
  console.error('FATAL:', e.message)
  console.error(log.slice(-2000))
  process.exitCode = 1
} finally {
  server.kill('SIGTERM')
  await sleep(300)
}

const failed = checks.filter((c) => !c.pass)
console.log(`\n结果: ${checks.length - failed.length}/${checks.length} 通过`)
if (failed.length) { console.log('失败项:', failed.map((f) => f.name)); process.exitCode = 1 }
