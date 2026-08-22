import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check, Copy, Download, Eye, EyeOff, Flag, KeyRound, ListPlus, Pencil, Plus, RefreshCw, Search, ShieldCheck, ShieldAlert, QrCode, Tag, Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../api.js'
import OtpQrModal from './OtpQrModal.jsx'
import ExportModal from '../../components/ExportModal.jsx'

const STEP = 30

function useOtps() {
  const [otps, setOtps] = useState({})
  const [remaining, setRemaining] = useState(STEP)
  const fetchRef = useRef(null)

  const fetchOtps = useCallback(async () => {
    try {
      const data = await api.otps()
      fetchRef.current = data
      setOtps(data.otps || {})
      setRemaining(data.remaining ?? STEP)
    } catch { /* 401 由全局处理 */ }
  }, [])

  useEffect(() => {
    fetchOtps()
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          fetchOtps()
          return STEP
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [fetchOtps])

  return { otps, remaining, refresh: fetchOtps }
}

function CopyButton({ text, label = '复制', className }) {
  const [copied, setCopied] = useState(false)
  const copy = async (e) => {
    e.stopPropagation()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }
  return (
    <button
      onClick={copy}
      title={label}
      className={clsx('p-1 rounded-md transition-colors', copied ? 'text-emerald-500' : 'text-muted-foreground hover:text-primary hover:bg-primary/10', className)}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// 封号状态徽章：被封=红、正常=绿、未知=灰
function BannedBadge({ banned }) {
  if (banned === 'banned') {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono bg-destructive/10 text-destructive px-1.5 py-0.5 rounded text-[10px]" title="账号疑似被封（资料页不可访问或 API 返回封禁）">
        <ShieldAlert className="w-2.5 h-2.5" /> 被封
      </span>
    )
  }
  if (banned === 'normal') {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded text-[10px]" title="账号正常">
        <ShieldCheck className="w-2.5 h-2.5" /> 正常
      </span>
    )
  }
  return null
}

function OtpBar({ remaining }) {
  const pct = (remaining / STEP) * 100
  return (
    <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
      <div
        className={clsx('h-full rounded-full transition-[width] duration-1000 ease-linear', remaining <= 5 ? 'bg-destructive' : 'bg-primary')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function DetailRow({ label, value, recoveryCodes, recoveryUsed, onToggleRecovery }) {
  const [visible, setVisible] = useState(false)
  if (!value && value !== 0) return null
  return (
    <div className="flex items-center justify-between gap-2 sm:gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 w-16 sm:w-20 truncate" title={label}>{label}</span>
      <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
        {Array.isArray(value) ? (
          <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto custom-scrollbar justify-items-end">
            {value.map((v, i) => {
              const used = recoveryUsed?.[i]
              return (
                <button
                  key={v}
                  onClick={onToggleRecovery ? () => onToggleRecovery(i, !used) : undefined}
                  title={onToggleRecovery ? (used ? '点击恢复为未使用' : '点击标记为已使用') : undefined}
                  className={clsx(
                    'font-mono text-[11px] px-1.5 py-0.5 rounded border transition-colors max-w-full truncate',
                    used
                      ? 'bg-muted/40 text-muted-foreground/50 line-through border-border/40 cursor-pointer hover:bg-muted/70'
                      : 'bg-muted/60 text-foreground border-transparent cursor-pointer hover:bg-primary/10 hover:text-primary'
                  )}
                >
                  {v}
                  {used && <span className="ml-1 text-[9px] text-destructive/70">已用</span>}
                </button>
              )
            })}
          </div>
        ) : (
          <code className={clsx('font-mono text-xs truncate', visible ? 'text-foreground' : 'blur-sm select-none')}>
            {visible ? value : '••••••••••••'}
          </code>
        )}
        {typeof value === 'string' && (
          <>
            <button
              onClick={() => setVisible(!visible)}
              className="p-1 text-muted-foreground hover:text-primary rounded-md transition-colors shrink-0"
              title={visible ? '隐藏' : '显示'}
            >
              {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <CopyButton text={value} />
          </>
        )}
      </div>
    </div>
  )
}

function EditModal({ account, onClose, onSaved }) {
  // form 为 null 表示正在加载详情（编辑已有账号时必先从服务端拉完整凭据，
  // 避免表单初始化为空导致保存时清空未加载的敏感字段）
  const [form, setForm] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!account?.id) {
      setForm({
        username: '', email: '', password: '', setupKey: '', otpauth: '',
        recoveryCodes: '', pat: '', remark: '', tags: '',
      })
      return
    }
    setLoadError('')
    api.accountFull(account.id)
      .then((full) => {
        if (cancelled) return
        setForm({
          username: full.username || '',
          email: full.email || '',
          password: full.password || '',
          setupKey: full.setupKey || '',
          otpauth: full.otpauth || '',
          recoveryCodes: (full.recoveryCodes || []).join('\n'),
          pat: full.pat || '',
          remark: full.remark || '',
          tags: (full.tags || []).join(', '),
        })
      })
      .catch((e) => { if (!cancelled) setLoadError(e.message) })
    return () => { cancelled = true }
  }, [account?.id])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        recoveryCodes: form.recoveryCodes.split('\n').map((s) => s.trim()).filter(Boolean),
        tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      }
      if (account) {
        await api.updateAccount(account.id, payload)
      } else {
        await api.createAccount(payload)
      }
      onSaved()
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'input-field text-xs'
  const labelCls = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{account ? '编辑账号' : '添加账号'}</h3>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/70">✕</button>
        </div>

        {loadError ? (
          <div className="px-4 py-3 rounded-lg border border-destructive/25 bg-destructive/10 text-sm text-destructive">
            加载账号详情失败：{loadError}
          </div>
        ) : !form ? (
          <div className="py-10 text-center text-sm text-muted-foreground">加载凭据中…</div>
        ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelCls}>账号</label>
              <input className={inputCls} value={form.username} onChange={set('username')} placeholder="GitHub 用户名" />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>邮箱</label>
              <input className={inputCls} value={form.email} onChange={set('email')} placeholder="邮箱" />
            </div>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>密码</label>
            <input className={inputCls} type="password" value={form.password} onChange={set('password')} placeholder="账号密码" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelCls}>Setup Key</label>
              <input className={inputCls} value={form.setupKey} onChange={set('setupKey')} placeholder="2FA 密钥" />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>OTP Auth URI</label>
              <input className={inputCls} value={form.otpauth} onChange={set('otpauth')} placeholder="otpauth://totp/..." />
            </div>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>PAT 令牌</label>
            <input className={inputCls} type="password" value={form.pat} onChange={set('pat')} placeholder="ghp_xxx / github_pat_xxx" />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>恢复码（每行一个）</label>
            <textarea className={clsx(inputCls, 'h-24 resize-y font-mono text-[11px]')} value={form.recoveryCodes} onChange={set('recoveryCodes')} placeholder={'aaaa-1111\nbbbb-2222'} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>标签（逗号分隔，最多 5 个）</label>
            <input className={inputCls} value={form.tags} onChange={set('tags')} placeholder="备用, 主号, 测试" />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>备注</label>
            <input className={inputCls} value={form.remark} onChange={set('remark')} placeholder="可选备注" />
          </div>
        </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !form}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 单条授权记录行：标题 + 掩码内容 + 操作
function KvRow({ title, content, onEdit, onDelete }) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-border/60 bg-muted/20">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-foreground truncate">{title}</div>
        <div className="flex items-center gap-1.5 min-w-0">
          <code className={clsx('font-mono text-[11px] truncate', visible ? 'text-foreground' : 'blur-sm select-none')}>
            {visible ? content : '••••••••••••'}
          </code>
          {content && (
            <>
              <button
                onClick={() => setVisible(!visible)}
                className="p-1 text-muted-foreground hover:text-primary rounded-md transition-colors shrink-0"
                title={visible ? '隐藏' : '显示'}
              >
                {visible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
              <button
                onClick={async () => { await navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                className="p-1 text-muted-foreground hover:text-primary rounded-md transition-colors shrink-0"
                title="复制"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} className="p-1.5 text-muted-foreground hover:text-primary rounded-md transition-colors" title="编辑">
          <Pencil className="w-3 h-3" />
        </button>
        <button onClick={onDelete} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md transition-colors" title="删除">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// 授权记录 KV 编辑弹窗（标题 + 内容）
function KvModal({ record, onClose, onSave }) {
  const [title, setTitle] = useState(record?.title || '')
  const [content, setContent] = useState(record?.content || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({ title: title.trim(), content: content.trim() })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{record ? '编辑授权记录' : '添加授权记录'}</h3>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/70">✕</button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">标题（如：Telegram 绑定 / SSH 密钥 / API Key）</label>
            <input className="input-field text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="记录标题" autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">内容（加密存储）</label>
            <textarea className="input-field text-sm h-28 resize-y font-mono" value={content} onChange={(e) => setContent(e.target.value)} placeholder="授权信息内容" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !title.trim()}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AccountsPage({ showMessage }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [details, setDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [copiedOtp, setCopiedOtp] = useState(null)
  const [qrAccount, setQrAccount] = useState(null)
  const [allTags, setAllTags] = useState([])
  const [tagFilter, setTagFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('') // '' | normal | banned
  const [credFilter, setCredFilter] = useState('') // '' | opencode | freebuff | both | none
  const [bannedChecking, setBannedChecking] = useState(false)
  const [exportModal, setExportModal] = useState(null) // { title, text, filename }
  const [confirmFlaggedDelete, setConfirmFlaggedDelete] = useState(false)
  const [kvModal, setKvModal] = useState(null) // {record} 或 {record: null} 添加
  const { otps, remaining, refresh } = useOtps()

  const load = useCallback(async () => {
    try {
      const { accounts } = await api.accounts()
      setAccounts(accounts)
    } catch (e) {
      showMessage('error', e.message)
    } finally {
      setLoading(false)
    }
  }, [showMessage])

  useEffect(() => { load() }, [load])

  // 默认检测封号状态（服务端 24h 缓存，每天一次）；完成后刷新列表状态
  useEffect(() => {
    let disposed = false
    const run = async () => {
      setBannedChecking(true)
      try {
        await api.bannedCheck(false)
        if (!disposed) load()
      } catch { /* 网络失败静默，保留旧状态 */ } finally {
        if (!disposed) setBannedChecking(false)
      }
    }
    run()
    return () => { disposed = true }
  }, [load])

  const forceBannedCheck = async () => {
    setBannedChecking(true)
    try {
      const d = await api.bannedCheck(true)
      await load()
      showMessage('success', `封号检测完成：${d.checked}/${d.total} 个账号已重新检测`)
    } catch (e) {
      showMessage('error', `封号检测失败：${e.message}`)
    } finally {
      setBannedChecking(false)
    }
  }

  useEffect(() => {
    api.tags().then(({ tags }) => setAllTags(tags)).catch(() => {})
  }, [accounts])

  const handleExport = async () => {
    try {
      const { text } = await api.exportAll()
      setExportModal({
        title: '导出全部账号',
        text,
        filename: `accounts-export-${new Date().toISOString().slice(0, 10)}.txt`,
      })
    } catch (e) {
      showMessage('error', e.message)
    }
  }

  const handleExportFlagged = async () => {
    const flaggedCount = accounts.filter((a) => a.flagged).length
    if (flaggedCount === 0) {
      showMessage('error', '当前没有被标记账号（固定格式导入的账号会自动标记）')
      return
    }
    try {
      const { text } = await api.exportFlagged()
      setExportModal({
        title: `导出被标记账号（${flaggedCount} 个）`,
        text,
        filename: `flagged-accounts-export-${new Date().toISOString().slice(0, 10)}.txt`,
      })
    } catch (e) {
      showMessage('error', e.message)
    }
  }

  const handleDeleteFlagged = async () => {
    try {
      const d = await api.deleteFlagged()
      setConfirmFlaggedDelete(false)
      showMessage('success', `已删除 ${d.count} 个被标记账号`)
      load()
    } catch (e) {
      showMessage('error', e.message)
    }
  }

  const toggleExpand = async (acc) => {
    if (expandedId === acc.id) {
      setExpandedId(null)
      setDetails(null)
      return
    }
    setExpandedId(acc.id)
    setDetailsLoading(true)
    try {
      const full = await api.accountFull(acc.id)
      setDetails(full)
    } catch (e) {
      showMessage('error', e.message)
    } finally {
      setDetailsLoading(false)
    }
  }

  const copyOtp = async (e, accId, code) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(code)
    setCopiedOtp(accId)
    setTimeout(() => setCopiedOtp(null), 1500)
  }

  const filtered = accounts
    .filter((a) => {
      if (search && !a.username.toLowerCase().includes(search.toLowerCase())) return false
      if (tagFilter && !(a.tags || []).includes(tagFilter)) return false
      if (statusFilter === 'flagged') return a.flagged === true
      if (statusFilter && a.banned !== statusFilter) return false
      if (credFilter === 'opencode' && !a.hasOpencode) return false
      if (credFilter === 'freebuff' && !a.hasFreebuff) return false
      if (credFilter === 'both' && !(a.hasOpencode && a.hasFreebuff)) return false
      if (credFilter === 'none' && (a.hasOpencode || a.hasFreebuff)) return false
      return true
    })
    // 封号排最后：normal/unknown 在前（保持原序），banned 在末尾
    .sort((a, b) => {
      const ab = a.banned === 'banned' ? 1 : 0
      const bb = b.banned === 'banned' ? 1 : 0
      return ab - bb
    })

  const refreshDetails = async (accountId) => {
    try {
      const full = await api.accountFull(accountId)
      setDetails(full)
    } catch { /* ignore */ }
  }

  const saveKv = async (record) => {
    const cur = details?.kvRecords || []
    const next = kvModal.record
      ? cur.map((r, i) => (i === kvModal.index ? record : r))
      : [...cur, record]
    await api.updateAccount(kvModal.accountId, { kvRecords: next })
    showMessage('success', '授权记录已保存')
    await refreshDetails(kvModal.accountId)
    load()
    refresh()
  }

  const deleteKv = async (index, accountId) => {
    if (!confirm('确定删除这条授权记录吗？')) return
    const cur = details?.kvRecords || []
    const next = cur.filter((_, i) => i !== index)
    await api.updateAccount(accountId, { kvRecords: next })
    showMessage('success', '授权记录已删除')
    await refreshDetails(accountId)
    load()
    refresh()
  }

  const doDelete = async () => {
    try {
      await api.deleteAccount(confirmDelete.id)
      showMessage('success', `已删除账号 ${confirmDelete.username}`)
      setConfirmDelete(null)
      load()
    } catch (e) {
      showMessage('error', e.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">账号列表</h2>
            <p className="text-sm text-muted-foreground">实时 2FA 动态码，点击账号查看完整凭据与 GitHub 会话</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
            {allTags.length > 0 && (
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="flex-1 sm:flex-none px-2.5 py-2 text-xs bg-secondary border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">全部标签</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 sm:flex-none px-2.5 py-2 text-xs bg-secondary border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
              title="按封号状态筛选"
            >
              <option value="">全部状态</option>
              <option value="normal">正常</option>
              <option value="banned">被封</option>
              <option value="flagged">被标记</option>
            </select>
            <select
              value={credFilter}
              onChange={(e) => setCredFilter(e.target.value)}
              className="flex-1 sm:flex-none px-2.5 py-2 text-xs bg-secondary border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
              title="按 opencode / freebuff 凭证筛选"
            >
              <option value="">全部凭证</option>
              <option value="opencode">有 opencode</option>
              <option value="freebuff">有 freebuff</option>
              <option value="both">两者都有</option>
              <option value="none">两者都没有</option>
            </select>
            <button
              onClick={forceBannedCheck}
              disabled={bannedChecking || accounts.length === 0}
              className="flex items-center justify-center flex-1 sm:flex-none px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-xs font-medium border border-border whitespace-nowrap"
              title="强制重新检测全部账号封号状态（默认每天自动检测一次）"
            >
              <ShieldAlert className="w-3 h-3 mr-1.5" />
              {bannedChecking ? '检测中…' : '检测封号'}
            </button>
            <button onClick={handleExport} className="flex items-center justify-center flex-1 sm:flex-none px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-xs font-medium border border-border whitespace-nowrap" title="按导入格式导出全部账号">
              <Download className="w-3 h-3 mr-1.5" />
              导出
            </button>
            <button onClick={handleExportFlagged} className="flex items-center justify-center flex-1 sm:flex-none px-3 py-2 bg-amber-500/10 text-amber-500 rounded-lg hover:bg-amber-500/20 transition-colors text-xs font-medium border border-amber-500/30 whitespace-nowrap" title="导出全部被标记账号">
              <Flag className="w-3 h-3 mr-1.5" />
              导出被标记
            </button>
            <button onClick={() => {
              if (!accounts.some((a) => a.flagged)) {
                showMessage('error', '当前没有被标记账号（固定格式导入的账号会自动标记）')
                return
              }
              setConfirmFlaggedDelete(true)
            }} className="flex items-center justify-center flex-1 sm:flex-none px-3 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors text-xs font-medium border border-destructive/30 whitespace-nowrap" title="批量删除全部被标记账号">
              <Trash2 className="w-3 h-3 mr-1.5" />
              删除被标记
            </button>
            <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[140px] order-first sm:order-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索账号…"
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>
            <button onClick={refresh} className="flex items-center justify-center flex-1 sm:flex-none px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-xs font-medium border border-border whitespace-nowrap" title="刷新动态码">
              <RefreshCw className="w-3 h-3 mr-1.5" />
              {remaining}s
            </button>
            <button onClick={() => setEditTarget({})} className="flex items-center justify-center gap-1.5 flex-1 sm:flex-none px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm shadow-sm whitespace-nowrap">
              <Plus className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">添加</span>
              <span className="hidden sm:inline">添加账号</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">加载中…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">{search ? '未找到匹配账号' : '暂无账号，请先到「一键导入」批量导入'}</div>
          ) : filtered.map((acc) => {
            const otp = otps[acc.id]
            const isExpanded = expandedId === acc.id
            return (
              <div key={acc.id}>
                <div
                  className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => toggleExpand(acc)}
                >
                  {/* 移动端：行1 = 状态 + 账号名 + 操作按钮；行2 = OTP 大字 */}
                  <div className="md:hidden">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className={clsx('w-2 h-2 rounded-full shrink-0', otp ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-muted-foreground/40')} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{acc.username || '-'}</div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            <BannedBadge banned={acc.banned} />
                            {acc.flagged && (
                              <span className="inline-flex items-center gap-0.5 font-mono bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded text-[10px]" title="被标记账号（固定格式导入）">
                                <Flag className="w-2.5 h-2.5" /> 标记
                              </span>
                            )}
                            {acc.hasOpencode && (
                              <span className="inline-flex items-center gap-0.5 font-mono bg-sky-500/10 text-sky-500 px-1.5 py-0.5 rounded text-[10px]" title="已有 opencode 凭证">opencode</span>
                            )}
                            {acc.hasFreebuff && (
                              <span className="inline-flex items-center gap-0.5 font-mono bg-teal-500/10 text-teal-500 px-1.5 py-0.5 rounded text-[10px]" title="已有 freebuff 凭证">freebuff</span>
                            )}
                            {(acc.tags || []).map((t) => (
                              <span key={t} className="inline-flex items-center gap-0.5 font-mono bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded text-[10px]">
                                <Tag className="w-2.5 h-2.5" /> {t}
                              </span>
                            ))}
                            {acc.hasPat && (
                              <span className="inline-flex items-center gap-0.5 font-mono bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded text-[10px]">
                                <KeyRound className="w-2.5 h-2.5" /> PAT
                              </span>
                            )}
                            {!acc.hasSecret && (
                              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">无 2FA</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setEditTarget(acc)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                          title="编辑"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(acc)}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3">
                      {otp ? (
                        <>
                          <span className="otp-code font-mono text-3xl font-bold tracking-widest text-foreground tabular-nums">
                            {otp.code}
                          </span>
                          <OtpBar remaining={remaining} />
                          <span className={clsx('text-xs font-mono tabular-nums', remaining <= 5 ? 'text-destructive' : 'text-muted-foreground')}>
                            {remaining}s
                          </span>
                          <button
                            onClick={(e) => copyOtp(e, acc.id, otp.code)}
                            className="p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0 ml-auto"
                            title="复制动态码"
                          >
                            {copiedOtp === acc.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">未配置 2FA</span>
                      )}
                    </div>
                  </div>

                  {/* 桌面：一行布局 */}
                  <div className="hidden md:flex md:items-center md:justify-between md:gap-4">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className={clsx('w-2 h-2 rounded-full shrink-0', otp ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-muted-foreground/40')} />
                      <div className="min-w-0 w-40 shrink-0">
                        <div className="text-sm font-medium truncate">{acc.username || '-'}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <BannedBadge banned={acc.banned} />
                          {acc.flagged && (
                            <span className="inline-flex items-center gap-0.5 font-mono bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded text-[10px]" title="被标记账号（固定格式导入）">
                              <Flag className="w-2.5 h-2.5" /> 标记
                            </span>
                          )}
                          {acc.hasOpencode && (
                            <span className="inline-flex items-center gap-0.5 font-mono bg-sky-500/10 text-sky-500 px-1.5 py-0.5 rounded text-[10px]" title="已有 opencode 凭证">opencode</span>
                          )}
                          {acc.hasFreebuff && (
                            <span className="inline-flex items-center gap-0.5 font-mono bg-teal-500/10 text-teal-500 px-1.5 py-0.5 rounded text-[10px]" title="已有 freebuff 凭证">freebuff</span>
                          )}
                          {(acc.tags || []).map((t) => (
                            <span key={t} className="inline-flex items-center gap-0.5 font-mono bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded text-[10px]">
                              <Tag className="w-2.5 h-2.5" /> {t}
                            </span>
                          ))}
                          {acc.hasPat && (
                            <span className="inline-flex items-center gap-0.5 font-mono bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded text-[10px]">
                              <KeyRound className="w-2.5 h-2.5" /> PAT
                            </span>
                          )}
                          {!acc.hasSecret && (
                            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">无 2FA</span>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 flex items-center gap-3 min-w-0">
                        {otp ? (
                          <>
                            <span className="otp-code font-mono text-2xl font-bold tracking-widest text-foreground tabular-nums">
                              {otp.code}
                            </span>
                            <OtpBar remaining={remaining} />
                            <span className={clsx('text-[11px] font-mono tabular-nums', remaining <= 5 ? 'text-destructive' : 'text-muted-foreground')}>
                              {remaining}s
                            </span>
                            <button
                              onClick={(e) => copyOtp(e, acc.id, otp.code)}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
                              title="复制动态码"
                            >
                              {copiedOtp === acc.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditTarget(acc)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                        title="编辑"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(acc)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-6 pb-5 bg-muted/20 border-t border-border/60">
                    {detailsLoading ? (
                      <div className="py-4 text-sm text-muted-foreground">加载凭据…</div>
                    ) : details ? (
                      <div className="pt-3 space-y-4">
                        <div className="max-w-2xl">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                            完整凭据（默认掩码，点击眼睛查看）
                          </div>
                          <DetailRow label="邮箱" value={details.email} />
                          <DetailRow label="密码" value={details.password} />
                          <DetailRow label="Setup Key" value={details.setupKey} />
                          <DetailRow label="OTP Auth" value={details.otpauth} />
                          <DetailRow
                            label="恢复码"
                            value={details.recoveryCodes}
                            recoveryUsed={details.recoveryCodesUsed}
                            onToggleRecovery={async (i, used) => {
                              if (!confirm(`确定标记恢复码 ${details.recoveryCodes[i]} 为${used ? '已使用' : '未使用'}吗？`)) return
                              try {
                                await api.recoveryMark(acc.id, i, used)
                                await refreshDetails(acc.id)
                              } catch (e) {
                                showMessage('error', e.message)
                              }
                            }}
                          />
                          <DetailRow label="PAT" value={details.pat} />
                          <DetailRow label="备注" value={details.remark} />
                          {details.recoveryCodes && details.recoveryCodes[0] === '__decrypt_failed__' && (
                            <div className="mt-2 text-xs text-destructive">部分字段解密失败，可能密码已更换</div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {acc.hasSecret && (
                            <button onClick={() => setQrAccount(acc)} className="btn btn-secondary btn-sm">
                              <QrCode className="w-3.5 h-3.5" />
                              扫码添加 2FA
                            </button>
                          )}
                        </div>

                        {/* 授权记录 KV */}
                        <div className="max-w-2xl">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <KeyRound className="w-3.5 h-3.5 text-primary" />
                              授权记录（其他绑定/密钥信息）
                            </div>
                            <button
                              onClick={() => setKvModal({ record: null, accountId: acc.id })}
                              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                            >
                              <ListPlus className="w-3.5 h-3.5" /> 添加记录
                            </button>
                          </div>
                          {(details.kvRecords || []).length === 0 ? (
                            <div className="text-xs text-muted-foreground/70 py-2">暂无记录，可添加 Telegram 绑定、SSH 密钥、其他平台授权等</div>
                          ) : (
                            <div className="space-y-1.5">
                              {(details.kvRecords || []).map((r, i) => (
                                <KvRow
                                  key={i}
                                  title={r.title}
                                  content={r.content}
                                  onEdit={() => setKvModal({ record: r, index: i, accountId: acc.id })}
                                  onDelete={() => deleteKv(i, acc.id)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {qrAccount && <OtpQrModal account={qrAccount} onClose={() => setQrAccount(null)} />}

      {kvModal && (
        <KvModal
          record={kvModal.record}
          onClose={() => setKvModal(null)}
          onSave={(rec) => saveKv(rec)}
        />
      )}

      {editTarget !== null && (
        <EditModal
          account={editTarget.id ? { ...editTarget, ...(details && details.id === editTarget.id ? details : {}) } : null}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            showMessage('success', '已保存')
            load()
            refresh()
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <div className="card max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold">删除账号</h3>
            <p className="text-sm text-muted-foreground">
              确定删除账号 <span className="font-mono text-foreground">{confirmDelete.username}</span> 吗？此操作不可恢复。
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(null)}>取消</button>
              <button className="btn btn-danger btn-sm" onClick={doDelete}>删除</button>
            </div>
          </div>
        </div>
      )}

      {exportModal && (
        <ExportModal
          title={exportModal.title}
          text={exportModal.text}
          filename={exportModal.filename}
          onClose={() => setExportModal(null)}
        />
      )}

      {confirmFlaggedDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm" onClick={() => setConfirmFlaggedDelete(false)}>
          <div className="card max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive" />
              批量删除被标记账号
            </h3>
            <p className="text-sm text-muted-foreground">
              将删除全部 <span className="font-mono text-foreground">{accounts.filter((a) => a.flagged).length}</span> 个被标记账号（固定格式导入）。此操作不可恢复。
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmFlaggedDelete(false)}>取消</button>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteFlagged}>全部删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
