// API 封装：统一鉴权头、401 自动登出回调
const TOKEN_KEY = 'ghvault_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`/api${path}`, { ...options, headers })

  if (res.status === 401 && onUnauthorized) {
    onUnauthorized()
    throw new Error('登录已过期')
  }
  if (!res.ok) {
    let detail = `请求失败 (${res.status})`
    try {
      const data = await res.json()
      if (data.detail) detail = data.detail
    } catch { /* ignore */ }
    throw new Error(detail)
  }
  return res.json()
}

export const api = {
  status: () => request('/status'),
  setup: (password) => request('/setup', { method: 'POST', body: JSON.stringify({ password }) }),
  login: (password) => request('/login', { method: 'POST', body: JSON.stringify({ password }) }),
  accounts: () => request('/accounts'),
  accountFull: (id) => request(`/accounts/${id}/full`),
  createAccount: (data) => request('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id, data) => request(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (id) => request(`/accounts/${id}`, { method: 'DELETE' }),
  otps: () => request('/otps'),
  importText: (text, dry = false) => request('/import', { method: 'POST', body: JSON.stringify({ text, dry }) }),
  changePassword: (oldPassword, newPassword) => request('/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) }),
  backup: () => request('/backup'),
  importBackup: (backup, password) => request('/backup/import', { method: 'POST', body: JSON.stringify({ backup, password }) }),
  // GitHub 会话与 PAT
  githubLogin: (id) => request(`/accounts/${id}/github/login`, { method: 'POST' }),
  githubStatus: (id) => request(`/accounts/${id}/github/status`),
  githubPat: (id, scopes, expiration) => request(`/accounts/${id}/github/pat`, { method: 'POST', body: JSON.stringify({ scopes, expiration }) }),
  githubLogout: (id) => request(`/accounts/${id}/github/logout`, { method: 'POST' }),
  githubSaveCookies: (id, cookieString) => request(`/accounts/${id}/github/cookies`, { method: 'POST', body: JSON.stringify({ cookieString }) }),
  githubGetCookies: (id) => request(`/accounts/${id}/github/cookies`),
  otpauth: (id) => request(`/accounts/${id}/otpauth`),
  // 运营增强
  auditLogs: (limit = 100) => request(`/audit?limit=${limit}`),
  clearAudit: () => request('/audit', { method: 'DELETE' }),
  exportAll: () => request('/export'),
  recoveryMark: (id, index, used) => request(`/accounts/${id}/recovery-used`, { method: 'PUT', body: JSON.stringify({ index, used }) }),
  tags: () => request('/tags'),
  healthCheck: () => request('/accounts/health', { method: 'POST' }),
  githubCheck: (id) => request(`/accounts/${id}/github/check`, { method: 'POST' }),
  githubPats: (id) => request(`/accounts/${id}/github/pats`),
  githubRevokePat: (id, tokenId) => request(`/accounts/${id}/github/pats/${tokenId}/revoke`, { method: 'POST' }),
  // 版本与更新
  updateCheck: () => request('/update'),
}
