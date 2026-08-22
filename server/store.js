// vault.json 加密存储：账号 CRUD、重加密、备份导出/导入
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { encrypt, decrypt, deriveKey, verifyPassword, hashPassword, randomHex, uuid } from './crypto.js'
import { secretFromUri } from './totp.js'

const SENSITIVE_FIELDS = ['email', 'password', 'setupKey', 'otpauth', 'recoveryCodes', 'pat', 'remark', 'kvRecords']

// 明文全等比较（空值视为空串，用于导入去重内容比对）
function plainEq(a, b) {
  return String(a || '').trim() === String(b || '').trim()
}

export const DEFAULT_PASSWORD = 'sk-admin'

const EMPTY_ACCOUNT = {
  username: '', email: '', password: '', setupKey: '', otpauth: '',
  secret: '', recoveryCodes: [], pat: '', remark: '', tags: [], kvRecords: [],
  flagged: false,
}

// 授权记录规范化：{title, content}，≤20 条，title ≤100 字符，content ≤2000 字符
export function normalizeKvRecords(records) {
  if (!Array.isArray(records)) return []
  const out = []
  for (const r of records) {
    if (!r || typeof r !== 'object') continue
    const title = String(r.title || '').trim().slice(0, 100)
    const content = String(r.content || '').trim().slice(0, 2000)
    if (title && out.length < 20) out.push({ title, content })
  }
  return out
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

  async _writeFile() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    await fs.chmod(tmp, 0o600) // 数据文件含密钥，仅属主可读写
    await fs.rename(tmp, this.filePath)
  }

  // 串行化落盘：并发写请求排队，避免 tmp 文件交错覆盖
  // 即使前一次写失败，后续排队写仍会执行；本次调用方仍能感知自己的写失败
  save() {
    const prev = this._saveChain || Promise.resolve()
    const next = prev.then(() => this._writeFile(), () => this._writeFile())
    this._saveChain = next.catch(() => {}) // 链吞掉错误，避免影响后续排队
    return next
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

  // 数据密钥是否已在内存（重启后为 null，需重新登录派生）
  get dataKeyReady() {
    return this.dataKey !== null
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

  decKvRecords(enc) {
    if (!enc) return []
    const raw = this.dec(enc)
    if (raw === '__decrypt_failed__') return []
    try {
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }

  // ---- 账号 CRUD ----
  listAccounts() {
    return this.data.accounts.map((a) => {
      const kv = this.decKvRecords(a.kvRecords)
      return {
        id: a.id,
        username: a.username,
        hasSecret: a.hasSecret,
        hasPat: a.hasPat,
        hasEmail: a.hasEmail,
        // opencode / freebuff 凭证标记（与导出口径一致：title 精确匹配或日期标注记录，且内容非空）
        hasOpencode: kv.some((r) => r.content && (r.title === 'opencode' || r.title.startsWith('opencode '))),
        hasFreebuff: kv.some((r) => r.content && (r.title === 'freebuff' || r.title.startsWith('freebuff '))),
        tags: a.tags || [],
        flagged: Boolean(a.flagged),
        banned: a.banned || 'unknown',
        bannedCheckedAt: a.bannedCheckedAt || null,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      }
    })
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
      kvRecords: this.decKvRecords(a.kvRecords),
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
      kvRecords: normalizeKvRecords(acc.kvRecords),
      flagged: Boolean(acc.flagged),
      banned: 'unknown',
      bannedCheckedAt: null,
      createdAt: now,
      updatedAt: now,
      hasSecret: Boolean(secretFromUri(acc.otpauth) || acc.setupKey),
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
    if ('kvRecords' in patch) {
      patch.kvRecords = normalizeKvRecords(patch.kvRecords) // 先规范化再加密
    }
    // 裸 secret 字段（旧 API/解析器遗留）归一为 setupKey，避免被静默丢弃
    // 仅当 setupKey/otpauth 都未显式传时才归一，避免覆盖更明确的字段
    if ('secret' in patch && !('setupKey' in patch) && !('otpauth' in patch)) {
      patch.setupKey = patch.secret ?? ''
    }
    delete patch.secret
    for (const f of SENSITIVE_FIELDS) {
      if (f in patch) {
        a[f] = this.enc(patch[f])
      }
    }
    if ('username' in patch) a.username = String(patch.username || '').trim()
    if ('tags' in patch) a.tags = normalizeTags(patch.tags)
    // 依据新值重算标记：直接解密重算，绕开 getSecret 的旧标志门控（支持 false→true）
    const secret = secretFromUri(this.dec(a.otpauth)) || this.dec(a.setupKey) || null
    a.hasSecret = Boolean(secret)
    const patVal = patch.pat !== undefined ? patch.pat : this.dec(a.pat)
    a.hasPat = Boolean(patVal && patVal !== '__decrypt_failed__')
    const emailVal = patch.email !== undefined ? patch.email : this.dec(a.email)
    a.hasEmail = Boolean(emailVal && emailVal !== '__decrypt_failed__')
    a.updatedAt = now
    return a
  }

  deleteAccount(id) {
    const idx = this.data.accounts.findIndex((a) => a.id === id)
    if (idx < 0) return false
    this.data.accounts.splice(idx, 1)
    return true
  }

  // 批量删除所有被标记（flagged）账号，返回删除数量
  deleteFlaggedAccounts() {
    const before = this.data.accounts.length
    this.data.accounts = this.data.accounts.filter((a) => !a.flagged)
    return before - this.data.accounts.length
  }

  // 导入去重索引：一次性解密全部已有账号的比对字段，供导入循环复用
  // （避免每个导入项都全量解密 O(N×M)，导入循环内新建账号需手动 push 保持同步）
  buildDupIndex() {
    return this.data.accounts.map((a) => ({
      account: a,
      username: String(a.username || '').trim().toLowerCase(),
      password: this.dec(a.password),
      setupKey: this.dec(a.setupKey),
      otpauth: this.dec(a.otpauth),
    }))
  }

  // 导入去重：返回命中已存账号的重复项 { reason, account }，否则 null
  // 规则：① 账号（用户名）已存在 → 重复；② 密码、setup key、otpauth 与已存账号完全一致 → 重复（账号不同也算）
  // 说明：② 仅当导入项至少含一个凭据字段时启用，避免「空凭据新账号」被误判重复
  // 性能：传入 buildDupIndex() 的结果可避免逐项解密；缺省时退化为实时全量扫描（语义一致）
  findImportDuplicate({ username, email, password, setupKey, otpauth }, dupIndex = null) {
    const rows = dupIndex || this.buildDupIndex()
    const entryKey = String(username || email || '').trim().toLowerCase()
    if (entryKey) {
      for (const row of rows) {
        if (row.username === entryKey) {
          return { reason: '账号已存在', account: row.account }
        }
      }
    }
    if (password || setupKey || otpauth) {
      for (const row of rows) {
        if (plainEq(row.password, password) &&
            plainEq(row.setupKey, setupKey) &&
            plainEq(row.otpauth, otpauth)) {
          return { reason: '内容与已有账号重复', account: row.account }
        }
      }
    }
    return null
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

  // ---- 封号状态（明文，非敏感） ----
  setBannedStatus(id, banned, checkedAt = Date.now()) {
    const a = this.getAccount(id)
    if (!a) return false
    a.banned = banned === 'banned' ? 'banned' : banned === 'normal' ? 'normal' : 'unknown'
    a.bannedCheckedAt = checkedAt
    a.updatedAt = Date.now()
    return true
  }

  // 设置/清除「被标记」标识（明文，非敏感）
  setFlagged(id, flagged) {
    const a = this.getAccount(id)
    if (!a) return false
    a.flagged = Boolean(flagged)
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
  // flaggedOnly=true 时只导出被标记（flagged）账号
  exportText({ flaggedOnly = false } = {}) {
    const parts = []
    for (const a of this.data.accounts) {
      if (flaggedOnly && !a.flagged) continue
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
      const kv = this.decKvRecords(a.kvRecords)
      if (kv.length > 0) {
        lines.push('记录:')
        for (const r of kv) lines.push(`  [${r.title}] ${r.content}`)
      }
      if (lines.length > 0) parts.push(lines.join('\n'))
    }
    return parts.join('\n\n────────\n\n')
  }

  // ---- 密钥导出（opencode / freebuff）----
  // 输出「账号-密钥」格式，与密钥导入 parseKeyList 格式一致，可往返
  // name: 'opencode' | 'freebuff'；密钥更新的日期标注记录（如 "freebuff 2026-08-22"）一并导出
  exportKeys({ name = 'opencode' } = {}) {
    const target = String(name)
    const lines = []
    for (const a of this.data.accounts) {
      const kv = this.decKvRecords(a.kvRecords)
      if (!kv.length) continue
      for (const r of kv) {
        if (r.title !== target && !r.title.startsWith(`${target} `)) continue
        if (!r.content) continue
        lines.push(`${a.username}-${r.content}`)
      }
    }
    return lines.join('\n')
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
      auditLog: this.data.auditLog || [],
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

    // 试解密任意一个加密字段，验证密码正确性（不限于 password/email）
    const ALL_FIELDS = [...SENSITIVE_FIELDS, 'ghSession']
    const sample = backup.accounts.find((a) => ALL_FIELDS.some((f) => a[f]))
    if (sample) {
      const encField = ALL_FIELDS.find((f) => sample[f])
      try {
        decrypt(key, sample[encField])
      } catch {
        throw new Error('密码错误或备份已损坏，无法解密')
      }
    }

    // 导入前自动备份当前数据
    if (this.data.accounts.length > 0) {
      const pre = `${this.filePath}.pre-import.json`
      await fs.writeFile(pre, JSON.stringify(this.data, null, 2), 'utf8')
      await fs.chmod(pre, 0o600)
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
      auditLog: Array.isArray(backup.auditLog) ? backup.auditLog : [],
    }
    this.dataKey = key
    await this.save()
    return this.data.accounts.length
  }
}

export const SENSITIVE_FIELDS_LIST = SENSITIVE_FIELDS
