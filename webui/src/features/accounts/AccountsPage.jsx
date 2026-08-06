import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check, Copy, Download, Eye, EyeOff, KeyRound, ListPlus, Pencil, Plus, RefreshCw, Search, ShieldCheck, QrCode, Tag, Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../api.js'
import OtpQrModal from './OtpQrModal.jsx'

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
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 w-20">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
        {Array.isArray(value) ? (
          <div className="flex flex-wrap gap-1 justify-end max-h-40 overflow-y-auto custom-scrollbar">
            {value.map((v, i) => {
              const used = recoveryUsed?.[i]
              return (
                <button
                  key={v}
                  onClick={onToggleRecovery ? () => onToggleRecovery(i, !used) : undefined}
                  title={onToggleRecovery ? (used ? '点击恢复为未使用' : '点击标记为已使用') : undefined}
                  className={clsx(
                    'font-mono text-[11px] px-1.5 py-0.5 rounded border transition-colors',
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
  const [form, setForm] = useState({
    username: account?.username || '',
    email: account?.email || '',
    password: account?.password || '',
    setupKey: account?.setupKey || '',
    otpauth: account?.otpauth || '',
    recoveryCodes: account?.recoveryCodes?.join('\n') || '',
    pat: account?.pat || '',
    remark: account?.remark || '',
    tags: (account?.tags || []).join(', '),
  })
  const [saving, setSaving] = useState(false)

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
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
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

  useEffect(() => {
    api.tags().then(({ tags }) => setAllTags(tags)).catch(() => {})
  }, [accounts])

  const handleExport = async () => {
    try {
      const { text } = await api.exportAll()
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `accounts-export-${new Date().toISOString().slice(0, 10)}.txt`
      a.click()
      URL.revokeObjectURL(url)
      showMessage('success', `已导出 ${accounts.length} 个账号（用户导入格式）`)
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

  const filtered = accounts.filter((a) => {
    if (search && !a.username.toLowerCase().includes(search.toLowerCase())) return false
    if (tagFilter && !(a.tags || []).includes(tagFilter)) return false
    return true
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
          <div className="flex flex-wrap gap-2 items-center">
            {allTags.length > 0 && (
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="px-2.5 py-2 text-xs bg-secondary border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">全部标签</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
            <button onClick={handleExport} className="flex items-center px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-xs font-medium border border-border" title="按导入格式导出全部账号">
              <Download className="w-3 h-3 mr-1.5" />
              导出
            </button>
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索账号…"
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>
            <button onClick={refresh} className="flex items-center px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-xs font-medium border border-border" title="刷新动态码">
              <RefreshCw className="w-3 h-3 mr-1.5" />
              {remaining}s
            </button>
            <button onClick={() => setEditTarget({})} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm shadow-sm">
              <Plus className="w-4 h-4" />
              添加账号
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
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => toggleExpand(acc)}
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className={clsx('w-2 h-2 rounded-full shrink-0', otp ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-muted-foreground/40')} />
                    <div className="min-w-0 w-36 sm:w-40 shrink-0">
                      <div className="text-sm font-medium truncate">{acc.username || '-'}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
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
                          <div className="hidden sm:block">
                            <OtpBar remaining={remaining} />
                          </div>
                          <span className={clsx('text-[11px] font-mono tabular-nums', remaining <= 5 ? 'text-destructive' : 'text-muted-foreground')}>
                            {remaining}s
                          </span>
                          <button
                            onClick={(e) => copyOtp(e, acc.id, otp.code)}
                            className="p-2 lg:p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
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

                  <div className="flex items-center gap-2 shrink-0 ml-12 md:ml-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setEditTarget(acc)}
                      className="p-2 lg:p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                      title="编辑"
                    >
                      <Pencil className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(acc)}
                      className="p-2 lg:p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                    </button>
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
                            onToggleRecovery={(i, used) => {
                              if (!confirm(`确定标记恢复码 ${details.recoveryCodes[i]} 为${used ? '已使用' : '未使用'}吗？`)) return
                              api.recoveryMark(acc.id, i, used).then(() => {
                                toggleExpand(acc)
                                toggleExpand(acc)
                              }).catch((e) => showMessage('error', e.message))
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
    </div>
  )
}
