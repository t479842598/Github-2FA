// 账号文本/JSON 导入解析器
// 支持格式：
//   账号: xxx / 邮箱: xxx / 密码: xxx / setup key: xxx / otpauth: ... / 恢复码: 多行 / PAT: xxx / 备注: xxx
//   块之间用 ──── 分隔线或连续空行分隔
// 兼容 JSON 数组（中英字段名均可）

import { secretFromUri } from './totp.js'

const KEY_ALIASES = {
  // 中文
  '账号': 'username', '用户名': 'username', '账户': 'username',
  '邮箱': 'email', '邮件': 'email',
  '密码': 'password', '口令': 'password',
  'setup key': 'setupKey', 'setupkey': 'setupKey', 'setup': 'setupKey',
  '密钥': 'setupKey', '2fa密钥': 'setupKey', '2fa key': 'setupKey',
  'otpauth': 'otpauth', 'otp': 'otpauth', 'otp uri': 'otpauth', 'otpauth uri': 'otpauth',
  '恢复码': 'recoveryCodes', '恢复代码': 'recoveryCodes', '备份码': 'recoveryCodes',
  'pat': 'pat', '令牌': 'pat', 'token': 'pat', 'access token': 'pat', 'apitoken': 'pat',
  '备注': 'remark', '注释': 'remark', 'note': 'remark',
  '记录': 'kvRecords', '授权记录': 'kvRecords', '授权信息': 'kvRecords', 'kv': 'kvRecords', 'authnotes': 'kvRecords',
  // 英文
  'username': 'username', 'user': 'username', 'login': 'username', 'account': 'username',
  'email': 'email', 'mail': 'email',
  'password': 'password', 'pass': 'password', 'passwd': 'password', 'pwd': 'password',
  'setupkey': 'setupKey', 'setup-key': 'setupKey', 'secret': 'setupKey', '2fakey': 'setupKey',
  'otpauth': 'otpauth', 'otpuri': 'otpauth', 'otp-uri': 'otpauth',
  'recoverycodes': 'recoveryCodes', 'recovery-codes': 'recoveryCodes', 'backupcodes': 'recoveryCodes',
  'pat': 'pat', 'token': 'pat', 'access-token': 'pat', 'apitoken': 'pat',
  'remark': 'remark', 'note': 'remark', 'comment': 'remark',
}

const SEPARATOR_RE = /^[─\-—_]{4,}$/
const RECOVERY_CODE_RE = /^[A-Za-z0-9]{4,8}-[A-Za-z0-9]{4,8}$/

function emptyAccount() {
  return {
    username: '', email: '', password: '', setupKey: '', otpauth: '',
    secret: '', recoveryCodes: [], pat: '', remark: '', kvRecords: [],
  }
}

// 文本 → 行块数组（分隔线 / 空行切块，连续空行合并）
export function splitBlocks(text) {
  const lines = String(text).split(/\r?\n/)
  const blocks = []
  let cur = []
  let blankRun = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (SEPARATOR_RE.test(trimmed)) {
      if (cur.length) { blocks.push(cur); cur = [] }
      blankRun = 0
      continue
    }
    if (trimmed === '') {
      blankRun += 1
      if (blankRun === 1 && cur.length) { blocks.push(cur); cur = [] }
      continue
    }
    blankRun = 0
    cur.push(line)
  }
  if (cur.length) blocks.push(cur)
  return blocks.filter(b => b.length > 0)
}

// 单块行数组 → 账号对象；未识别到任何字段返回 null
export function parseAccountBlock(lines) {
  const acc = emptyAccount()
  let sawField = false
  let collectingRecovery = false
  let collectingKv = false

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const m = line.match(/^([^:：]+)[:：]\s*(.*)$/)
    if (m) {
      const key = m[1].trim().toLowerCase()
      const value = m[2].trim()
      const field = KEY_ALIASES[key]
      if (field) {
        sawField = true
        if (field === 'recoveryCodes') {
          collectingRecovery = true
          collectingKv = false
          continue
        }
        if (field === 'kvRecords') {
          collectingKv = true
          collectingRecovery = false
          continue
        }
        collectingRecovery = false
        collectingKv = false
        if (field === 'username') {
          if (!acc.username) acc.username = value
        } else {
          acc[field] = value
        }
        continue
      }
      // 未知键：退出收集模式
      collectingRecovery = false
      collectingKv = false
      continue
    }

    // 恢复码收集模式：所有行都收
    if (collectingRecovery) {
      acc.recoveryCodes.push(line)
      continue
    }
    // 授权记录收集模式：[标题] 内容
    if (collectingKv) {
      const kv = line.match(/^\[([^\]]+)\](?:\s*(.*))?$/)
      if (kv) acc.kvRecords.push({ title: kv[1].trim(), content: (kv[2] || '').trim() })
      continue
    }
    // 宽松：形如 xxxx-xxxx 的行直接当恢复码
    if (RECOVERY_CODE_RE.test(line)) {
      acc.recoveryCodes.push(line)
      continue
    }
  }

  if (!sawField && acc.recoveryCodes.length === 0) return null

  acc.recoveryCodes = [...new Set(acc.recoveryCodes)]
  // secret 优先取 otpauth URI 内值，其次 setup key
  acc.secret = secretFromUri(acc.otpauth) || acc.setupKey || ''
  return acc
}

// 文本 → 账号对象数组（跳过空块）
export function parseText(text) {
  const blocks = splitBlocks(text)
  const results = []
  for (const block of blocks) {
    const acc = parseAccountBlock(block)
    if (acc) results.push(acc)
  }
  return results
}

const JSON_KEY_MAP = {
  username: 'username', user: 'username', login: 'username', account: 'username', 账号: 'username',
  email: 'email', 邮箱: 'email',
  password: 'password', pass: 'password', pwd: 'password', 密码: 'password',
  setupKey: 'setupKey', setup_key: 'setupKey', setupkey: 'setupKey', secret: 'setupKey', 密钥: 'setupKey',
  otpauth: 'otpauth', otp_uri: 'otpauth',
  recoveryCodes: 'recoveryCodes', recovery_codes: 'recoveryCodes', backupCodes: 'recoveryCodes', 恢复码: 'recoveryCodes',
  kvRecords: 'kvRecords', kv_records: 'kvRecords', records: 'kvRecords', 记录: 'kvRecords', 授权记录: 'kvRecords',
  pat: 'pat', token: 'pat', 令牌: 'pat',
  remark: 'remark', note: 'remark', 备注: 'remark',
}

// JSON（数组或对象）→ 账号对象数组
export function parseJson(input) {
  let data = typeof input === 'string' ? JSON.parse(input) : input
  if (data && !Array.isArray(data) && typeof data === 'object') {
    if (Array.isArray(data.accounts)) data = data.accounts
    else data = [data]
  }
  if (!Array.isArray(data)) throw new Error('JSON 格式不支持：应为账号对象数组')

  return data.map((item) => {
    if (typeof item !== 'object' || item === null) return null
    const acc = emptyAccount()
    for (const [k, v] of Object.entries(item)) {
      const field = JSON_KEY_MAP[String(k).toLowerCase()] || JSON_KEY_MAP[k]
      if (!field || v === undefined || v === null || v === '') continue
      if (field === 'recoveryCodes') {
        acc.recoveryCodes = Array.isArray(v) ? v.map(String) : String(v).split(/[\s,，;；]+/).filter(Boolean)
      } else if (field === 'kvRecords') {
        acc.kvRecords = Array.isArray(v) ? v : []
      } else {
        acc[field] = String(v)
      }
    }
    if (!acc.username && !acc.email && !acc.password && !acc.secret) return null
    acc.recoveryCodes = [...new Set(acc.recoveryCodes)]
    acc.secret = secretFromUri(acc.otpauth) || acc.setupKey || ''
    return acc
  }).filter(Boolean)
}

// 字段长度/数量校验（防存储膨胀与异常输入）
const LIMITS = {
  username: 100, email: 200, password: 500, setupKey: 200, otpauth: 500,
  pat: 200, remark: 500, recoveryCode: 64,
}
const MAX_RECOVERY_CODES = 1000

export function sanitizeAccount(acc) {
  const out = { ...acc }
  for (const f of ['username', 'email', 'password', 'setupKey', 'otpauth', 'pat', 'remark']) {
    if (typeof out[f] === 'string' && out[f].length > LIMITS[f]) out[f] = out[f].slice(0, LIMITS[f])
  }
  if (Array.isArray(out.recoveryCodes)) {
    out.recoveryCodes = out.recoveryCodes
      .map((s) => String(s).slice(0, LIMITS.recoveryCode))
      .slice(0, MAX_RECOVERY_CODES)
  }
  if (Array.isArray(out.kvRecords)) {
    out.kvRecords = out.kvRecords
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        title: String(r.title || '').trim().slice(0, 100),
        content: String(r.content || '').trim().slice(0, 2000),
      }))
      .filter((r) => r.title)
      .slice(0, 20)
  }
  return out
}

// 统一入口：自动识别 JSON 或文本
export function parseImport(input) {
  const text = String(input).trim()
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      return parseJson(text)
    } catch {
      // 不是合法 JSON，按文本解析
    }
  }
  return parseText(text)
}
