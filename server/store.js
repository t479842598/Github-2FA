// vault.json 加密存储：账号 CRUD、重加密、备份导出/导入
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { encrypt, decrypt, deriveKey, verifyPassword, hashPassword, randomHex, uuid } from './crypto.js'

const SENSITIVE_FIELDS = ['email', 'password', 'setupKey', 'otpauth', 'recoveryCodes', 'pat', 'remark']

export const DEFAULT_PASSWORD = 'sk-admin'

const EMPTY_ACCOUNT = {
  username: '', email: '', password: '', setupKey: '', otpauth: '',
  secret: '', recoveryCodes: [], pat: '', remark: '', tags: [],
}

// 标签规范化：trim、去空、≤5 个、每项 ≤20 字符
export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  const seen = new Set()
  const out = []
  for (const t of tags) {
    const tag = String(t).trim().replace(/,/g, ' ').replace(/\s+/g, ' ').slice(0, 20)
    if (tag && !seen.has(tag) && out.length < 5) {
      seen.add(tag)
      out.push(tag)
    }
  }
  return out
}

function newVaultData() {
  return {
    meta: {
      version: 1,
      salt: randomHex(16),
      jwtSecret: randomHex(32),
      passwordHash: null,
      tokenVersion: 0,
      createdAt: Date.now(),
    },
    accounts: [],
    auditLog: [],
  }
}

export class Vault {
  constructor(filePath) {
    this.filePath = filePath
    this.data = null
    this.dataKey = null // 登录后由密码派生，内存态
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      this.data = JSON.parse(raw)
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
      this.data = newVaultData()
      // 首次启动：自动初始化默认密码 sk-admin，并标记必须修改密码
      await this.setupPassword(DEFAULT_PASSWORD, { mustChange: true })
    }
    return this.data
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    await fs.rename(tmp, this.filePath)
  }

  // ---- 密码 / 密钥 ----
  get isSetup() {
    return Boolean(this.data?.meta?.passwordHash)
  }

  get tokenVersion() {
    return this.data.meta.tokenVersion || 0
  }

  get mustChangePassword() {
    return Boolean(this.data.meta.mustChangePassword)
  }

  // ---- 审计日志（明文，不含敏感数据；最多 2000 条） ----
  log(action, object = '', ip = '', result = 'ok', extra = '') {
    if (!this.data.auditLog) this.data.auditLog = []
    this.data.auditLog.push({ ts: Date.now(), action, object: String(object).slice(0, 100), ip, result, extra: String(extra).slice(0, 200) })
    if (this.data.auditLog.length > 2000) {
      this.data.auditLog = this.data.auditLog.slice(this.data.auditLog.length - 2000)
    }
    return this.data.auditLog.length
  }

  getAuditLog(limit = 100) {
    const list = this.data.auditLog || []
    return list.slice(-limit).reverse()
  }

  clearAuditLog() {
    this.data.auditLog = []
  }

  async setupPassword(password, { mustChange = false } = {}) {
    const { salt, hash } = hashPassword(password)
    this.data.meta.passwordHash = hash
    this.data.meta.salt = salt
    if (!this.data.meta.jwtSecret) this.data.meta.jwtSecret = randomHex(32)
    if (mustChange) this.data.meta.mustChangePassword = true
    this.dataKey = deriveKey(password, salt)
    await this.save()
  }

  verifyPassword(password) {
    return verifyPassword(password, this.data.meta.salt, this.data.meta.passwordHash)
  }

  setDataKey(password) {
    this.dataKey = deriveKey(password, this.data.meta.salt)
  }

  get jwtSecret() {
    return this.data.meta.jwtSecret
  }

  // ---- 加密辅助 ----
  enc(value) {
    if (value === undefined || value === null || value === '') return null
    return encrypt(this.dataKey, typeof value === 'object' ? JSON.stringify(value) : String(value))
  }

  dec(enc) {
    if (!enc) return ''
    try {
      const raw = decrypt(this.dataKey, enc)
      return raw
    } catch {
      return '__decrypt_failed__'
    }
  }

  decRecoveryCodes(enc) {
    if (!enc) return []
    const raw = this.dec(enc)
    if (raw === '__decrypt_failed__') return ['__decrypt_failed__']
    try {
      return JSON.parse(raw)
    } catch {
      return []
    }
  }

  // ---- 账号 CRUD ----
  listAccounts() {
    return this.data.accounts.map((a) => ({
      id: a.id,
      username: a.username,
      hasSecret: a.hasSecret,
      hasPat: a.hasPat,
      hasEmail: a.hasEmail,
      tags: a.tags || [],
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }))
  }

  getAccount(id) {
    return this.data.accounts.find((a) => a.id === id) || null
  }

  // 完整解密视图（仅授权接口调用）
  getFullAccount(id) {
    const a = this.getAccount(id)
    if (!a) return null
    return {
      id: a.id,
      username: a.username,
      email: this.dec(a.email),
      password: this.dec(a.password),
      setupKey: this.dec(a.setupKey),
      otpauth: this.dec(a.otpauth),
      recoveryCodes: this.decRecoveryCodes(a.recoveryCodes),
      pat: this.dec(a.pat),
      remark: this.dec(a.remark),
      tags: a.tags || [],
      recoveryCodesUsed: this.decRecoveryUsed(a),
      hasSecret: a.hasSecret,
      hasPat: a.hasPat,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }
  }

  // 恢复码使用标记（旧数据无字段 → 全 false）
  decRecoveryUsed(a) {
    if (!a.recoveryCodesUsed) {
      const codes = this.decRecoveryCodes(a.recoveryCodes)
      if (codes.length === 0 || codes[0] === '__decrypt_failed__') return []
      return codes.map(() => false)
    }
    try {
      const raw = decrypt(this.dataKey, a.recoveryCodesUsed)
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }

  setRecoveryUsed(id, index, used) {
    const a = this.getAccount(id)
    if (!a) return false
    const codes = this.decRecoveryCodes(a.recoveryCodes)
    if (index < 0 || index >= codes.length) return false
    const usedArr = this.decRecoveryUsed(a)
    while (usedArr.length < codes.length) usedArr.push(false)
    usedArr[index] = used
    a.recoveryCodesUsed = this.enc(JSON.stringify(usedArr))
    a.updatedAt = Date.now()
    return true
  }

  // 解密 TOTP secret（优先 otpauth 内 secret，其次 setupKey；无法解密返回 null）
  getSecret(id) {
    const a = this.getAccount(id)
    if (!a) return null
    if (!a.hasSecret) return null
    const otpauth = this.dec(a.otpauth)
    if (otpauth && otpauth !== '__decrypt_failed__') {
      const m = otpauth.match(/[?&]secret=([A-Za-z0-9]+)/)
      if (m) return m[1]
    }
    const sk = this.dec(a.setupKey)
    return sk && sk !== '__decrypt_failed__' ? sk : null
  }

  createAccount(fields) {
    const acc = { ...EMPTY_ACCOUNT, ...fields }
    const id = uuid()
    const now = Date.now()
    const record = {
      id,
      username: String(acc.username || '').trim(),
      tags: normalizeTags(acc.tags),
      createdAt: now,
      updatedAt: now,
      hasSecret: Boolean(acc.secret || acc.setupKey || acc.otpauth),
      hasPat: Boolean(acc.pat),
      hasEmail: Boolean(acc.email),
    }
    for (const f of SENSITIVE_FIELDS) {
      record[f] = this.enc(acc[f])
    }
    this.data.accounts.push(record)
    return record
  }

  updateAccount(id, patch) {
    const a = this.getAccount(id)
    if (!a) return null
    const now = Date.now()
    for (const f of SENSITIVE_FIELDS) {
      if (f in patch) {
        a[f] = this.enc(patch[f])
      }
    }
    if ('username' in patch) a.username = String(patch.username || '').trim()
    if ('tags' in patch) a.tags = normalizeTags(patch.tags)
    if ('secret' in patch) a.hasSecret = Boolean(patch.secret)
    // 依据新值重算标记
    const secret = this.getSecret(id)
    a.hasSecret = Boolean(secret)
    a.hasPat = Boolean(patch.pat !== undefined ? patch.pat : (this.dec(a.pat) && this.dec(a.pat) !== '__decrypt_failed__'))
    a.hasEmail = Boolean(patch.email !== undefined ? patch.email : (this.dec(a.email) && this.dec(a.email) !== '__decrypt_failed__'))
    a.updatedAt = now
    return a
  }

  deleteAccount(id) {
    const idx = this.data.accounts.findIndex((a) => a.id === id)
    if (idx < 0) return false
    this.data.accounts.splice(idx, 1)
    return true
  }

  findByUsername(username) {
    return this.data.accounts.find((a) => a.username.toLowerCase() === String(username).toLowerCase()) || null
  }

  // ---- GitHub 会话（可选加密字段，旧数据兼容） ----
  getGhSession(id) {
    const a = this.getAccount(id)
    if (!a || !a.ghSession) return null
    try {
      const raw = decrypt(this.dataKey, a.ghSession)
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  setGhSession(id, session) {
    const a = this.getAccount(id)
    if (!a) return false
    a.ghSession = session ? this.enc(JSON.stringify(session)) : null
    a.updatedAt = Date.now()
    return true
  }

  clearGhSession(id) {
    const a = this.getAccount(id)
    if (!a) return false
    a.ghSession = null
    a.updatedAt = Date.now()
    return true
  }

  // ---- 修改密码：重派生密钥并全量重加密 ----
  async changePassword(oldPassword, newPassword) {
    if (!this.verifyPassword(oldPassword)) return false
    // 统一用同一个 salt：既作为数据密钥派生盐，也作为密码哈希盐
    const salt = randomHex(16)
    const newKey = deriveKey(newPassword, salt)
    const { hash } = hashPassword(newPassword, Buffer.from(salt, 'hex'))

    // 用旧 key 解密全部字段（含 ghSession），用新 key 重加密
    const ALL_FIELDS = [...SENSITIVE_FIELDS, 'ghSession']
    for (const a of this.data.accounts) {
      const plain = {}
      for (const f of ALL_FIELDS) {
        plain[f] = a[f] ? decrypt(this.dataKey, a[f]) : ''
      }
      for (const f of ALL_FIELDS) {
        a[f] = plain[f] ? encrypt(newKey, plain[f]) : null
      }
    }

    this.data.meta.salt = salt
    this.data.meta.passwordHash = hash
    this.data.meta.tokenVersion = (this.data.meta.tokenVersion || 0) + 1
    this.data.meta.mustChangePassword = false
    this.dataKey = newKey
    await this.save()
    return true
  }

  // ---- 批量导出（与导入格式一致，可往返） ----
  exportText() {
    const parts = []
    for (const a of this.data.accounts) {
      const lines = []
      if (a.username) lines.push(`账号: ${a.username}`)
      const email = this.dec(a.email)
      if (email && email !== '__decrypt_failed__') lines.push(`邮箱: ${email}`)
      const password = this.dec(a.password)
      if (password && password !== '__decrypt_failed__') lines.push(`密码: ${password}`)
      const setupKey = this.dec(a.setupKey)
      if (setupKey && setupKey !== '__decrypt_failed__') lines.push(`setup key: ${setupKey}`)
      const otpauth = this.dec(a.otpauth)
      if (otpauth && otpauth !== '__decrypt_failed__') lines.push(`otpauth: ${otpauth}`)
      const codes = this.decRecoveryCodes(a.recoveryCodes)
      if (codes.length > 0 && codes[0] !== '__decrypt_failed__') {
        lines.push('恢复码:')
        for (const code of codes) lines.push(`  ${code}`)
      }
      const pat = this.dec(a.pat)
      if (pat && pat !== '__decrypt_failed__') lines.push(`PAT: ${pat}`)
      const remark = this.dec(a.remark)
      if (remark && remark !== '__decrypt_failed__') lines.push(`备注: ${remark}`)
      if (lines.length > 0) parts.push(lines.join('\n'))
    }
    return parts.join('\n\n────────\n\n')
  }

  // ---- 备份导出/导入 ----
  exportBackup() {
    return {
      app: 'github-2fa-manager',
      version: 1,
      meta: {
        salt: this.data.meta.salt,
        createdAt: this.data.meta.createdAt,
      },
      accounts: this.data.accounts.map((a) => ({ ...a })),
    }
  }

  // 用密码验证备份可解后整体还原；导入前自动备份当前数据为 .pre-import.json
  async importBackup(backup, password) {
    if (!backup || backup.app !== 'github-2fa-manager' || !Array.isArray(backup.accounts)) {
      throw new Error('备份文件格式不正确')
    }
    const salt = backup.meta?.salt
    if (!salt) throw new Error('备份文件缺少 salt，无法解密')
    const key = deriveKey(password, salt)

    // 试解密第一个账号，验证密码正确性
    const sample = backup.accounts.find((a) => a.password || a.email)
    if (sample) {
      const encField = sample.password || sample.email
      try {
        decrypt(key, encField)
      } catch {
        throw new Error('密码错误或备份已损坏，无法解密')
      }
    }

    // 导入前自动备份当前数据
    if (this.data.accounts.length > 0) {
      await fs.writeFile(`${this.filePath}.pre-import.json`, JSON.stringify(this.data, null, 2), 'utf8')
    }

    const { hash } = hashPassword(password, Buffer.from(salt, 'hex'))
    this.data = {
      meta: {
        version: 1,
        salt,
        jwtSecret: randomHex(32), // 新实例重新生成，旧 token 失效
        passwordHash: hash,
        tokenVersion: 0,
        createdAt: backup.meta?.createdAt || Date.now(),
      },
      accounts: backup.accounts,
    }
    this.dataKey = key
    await this.save()
    return this.data.accounts.length
  }
}

export const SENSITIVE_FIELDS_LIST = SENSITIVE_FIELDS
