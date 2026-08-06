// GitHub 会话卡片：自动登录（密码+2FA）、登录状态、生成 PAT、手动 cookie
import { useCallback, useEffect, useState } from 'react'
import {
  Check, Copy, Github, HeartPulse, KeyRound, ListChecks, Loader2, LogOut, Plus,
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../api.js'
import PatManagerModal from './PatManagerModal.jsx'

const PAT_SCOPES = [
  { value: 'repo', label: 'repo', desc: '仓库读写（代码/提交/PR）' },
  { value: 'workflow', label: 'workflow', desc: '更新 GitHub Actions 工作流' },
  { value: 'gist', label: 'gist', desc: 'Gist 读写' },
  { value: 'read:org', label: 'read:org', desc: '读取组织' },
  { value: 'read:user', label: 'read:user', desc: '读取用户资料' },
  { value: 'user:email', label: 'user:email', desc: '读取邮箱' },
  { value: 'delete_repo', label: 'delete_repo', desc: '删除仓库' },
  { value: 'admin:org', label: 'admin:org', desc: '管理组织' },
]

const EXPIRATIONS = [
  { value: '7', label: '7 天' },
  { value: '30', label: '30 天' },
  { value: '60', label: '60 天' },
  { value: '90', label: '90 天' },
  { value: 'custom', label: '自定义' },
]

function PatModal({ account, onClose, onDone }) {
  const [scopes, setScopes] = useState(['repo'])
  const [expiration, setExpiration] = useState('30')
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState(null)
  const [error, setError] = useState('')

  const toggleScope = (v) => {
    setScopes((prev) => (prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v]))
  }

  const generate = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.githubPat(account.id, scopes, expiration)
      setToken(data.token)
      onDone()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full sm:max-w-md p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar rounded-b-none sm:rounded-b-[calc(var(--radius)+0.125rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2 min-w-0">
            <KeyRound className="w-4 h-4 text-primary shrink-0" />
            生成 PAT · <span className="font-mono text-sm truncate">{account.username}</span>
          </h3>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/70 shrink-0">✕</button>
        </div>

        {token ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4 space-y-2">
              <div className="text-xs font-semibold text-emerald-500 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> 生成成功（已自动保存到账号）
              </div>
              <code className="block font-mono text-xs bg-background/80 border border-border rounded-lg px-3 py-2.5 break-all select-all">{token}</code>
              <div className="text-[10px] text-muted-foreground">令牌只显示这一次，请立即复制保存</div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => { await navigator.clipboard.writeText(token); alert('PAT 已复制到剪贴板') }}
              >
                <Copy className="w-3.5 h-3.5" /> 复制令牌
              </button>
              <button className="btn btn-secondary btn-sm" onClick={onClose}>完成</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="px-4 py-3 rounded-lg border border-destructive/25 bg-destructive/10 text-sm text-destructive">{error}</div>
            )}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">权限 Scopes</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                {PAT_SCOPES.map((s) => (
                  <label key={s.value} className={clsx(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                    scopes.includes(s.value) ? 'border-primary/50 bg-primary/10' : 'border-border hover:bg-secondary/50'
                  )}>
                    <input type="checkbox" className="peer sr-only" checked={scopes.includes(s.value)} onChange={() => toggleScope(s.value)} />
                    <div className={clsx(
                      'w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0',
                      scopes.includes(s.value) ? 'bg-primary border-primary' : 'border-border bg-secondary'
                    )}>
                      {scopes.includes(s.value) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-medium">{s.label}</div>
                      <div className="text-[10px] text-muted-foreground">{s.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">过期时间</div>
              <div className="flex gap-2 flex-wrap">
                {EXPIRATIONS.map((e) => (
                  <button
                    key={e.value}
                    onClick={() => setExpiration(e.value)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                      expiration === e.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary/70'
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn btn-secondary btn-sm" onClick={onClose}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={generate} disabled={loading || scopes.length === 0}>
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {loading ? '创建中…' : '生成 PAT'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// compact=false：展开卡片（GitHub 菜单页）；compact=true：单行状态条（列表用）
export default function GitHubSession({ account, onChanged, compact = false, defaultOpenCookies = false }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(null)
  const [showPatModal, setShowPatModal] = useState(false)
  const [showPatManager, setShowPatManager] = useState(false)
  const [checkResult, setCheckResult] = useState(null)
  const [checking, setChecking] = useState(false)
  const [showCookies, setShowCookies] = useState(defaultOpenCookies)
  const [cookieText, setCookieText] = useState('')
  const [copied, setCopied] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.githubStatus(account.id)
      setStatus(s)
    } catch { setStatus({ loggedIn: false }) }
  }, [account.id])

  useEffect(() => { loadStatus() }, [loadStatus])

  const doLogin = async () => {
    setBusy('login')
    try {
      await api.githubLogin(account.id)
      await loadStatus()
      onChanged?.()
    } catch (e) {
      alert(`登录失败：${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  const doLogout = async () => {
    if (!confirm('确认退出 GitHub 登录？本地保存的会话 cookie 将被清除')) return
    setBusy('logout')
    try {
      await api.githubLogout(account.id)
      await loadStatus()
      onChanged?.()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(null)
    }
  }

  const doCheck = async () => {
    setChecking(true)
    setCheckResult(null)
    try {
      const r = await api.githubCheck(account.id)
      setCheckResult(r)
    } catch (e) {
      setCheckResult({ valid: null, reason: 'error', error: e.message })
    } finally {
      setChecking(false)
    }
  }

  const loadCookies = async () => {
    try {
      const data = await api.githubGetCookies(account.id)
      setCookieText(data.cookieString || '')
    } catch { /* ignore */ }
  }

  const saveCookies = async () => {
    if (!cookieText.trim()) return
    try {
      const data = await api.githubSaveCookies(account.id, cookieText)
      await loadStatus()
      onChanged?.()
      alert(`已保存 ${data.count} 个 cookie`)
    } catch (e) {
      alert(e.message)
    }
  }

  const loggedIn = status?.loggedIn

  const statusBadge = loggedIn ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      已登录
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
      未登录
    </span>
  )

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="rounded-xl border border-border bg-card/60 px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Github className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground hidden sm:inline">GitHub</span>
            {statusBadge}
            {checkResult && checkResult.valid === true && (
              <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">会话有效</span>
            )}
            {checkResult && checkResult.valid === false && (
              <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">会话已失效</span>
            )}
            {checkResult && checkResult.valid === null && checkResult.reason !== 'no_session' && (
              <span className="text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">检测失败</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={doCheck} disabled={checking} className="btn btn-secondary btn-sm !px-2.5" title="检测会话有效性">
              {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HeartPulse className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">检测</span>
            </button>
            {loggedIn && (
              <>
                <button onClick={() => setShowPatModal(true)} className="btn btn-primary btn-sm !px-2.5" title="生成 PAT">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">生成 PAT</span>
                </button>
                <button onClick={() => setShowPatManager(true)} className="btn btn-secondary btn-sm !px-2.5" title="管理 PAT">
                  <ListChecks className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">管理 PAT</span>
                </button>
              </>
            )}
            {loggedIn ? (
              <button onClick={doLogout} disabled={busy === 'logout'} className="btn btn-secondary btn-sm !px-2.5" title="退出登录">
                {busy === 'logout' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <button onClick={doLogin} disabled={busy === 'login'} className="btn btn-primary btn-sm !px-2.5">
                {busy === 'login' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">自动登录</span>
              </button>
            )}
          </div>
        </div>
        {showPatModal && <PatModal account={account} onClose={() => setShowPatModal(false)} onDone={onChanged} />}
        {showPatManager && <PatManagerModal account={account} onClose={() => setShowPatManager(false)} onChanged={onChanged} />}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Github className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold flex items-center gap-2">
              GitHub 会话 {statusBadge}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {loggedIn ? (
                <>登录于 {new Date(status.loggedInAt).toLocaleString('zh-CN')} · {status.cookieCount} 个 cookie · <span className="font-mono">{status.username}</span></>
              ) : (
                '使用账号密码 + 自动 2FA 一键登录'
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {loggedIn ? (
            <>
              <button onClick={() => setShowPatModal(true)} className="btn btn-primary btn-sm">
                <KeyRound className="w-3.5 h-3.5" />
                生成 PAT
              </button>
              <button onClick={doLogout} disabled={busy === 'logout'} className="btn btn-secondary btn-sm" title="退出 GitHub 登录">
                {busy === 'logout' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                退出
              </button>
            </>
          ) : (
            <button onClick={doLogin} disabled={busy === 'login'} className="btn btn-primary btn-sm">
              {busy === 'login' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />}
              {busy === 'login' ? '登录中…' : '自动登录'}
            </button>
          )}
        </div>
      </div>

      {!loggedIn && (
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
          自动登录使用账号已保存的密码，2FA 动态码自动提交。若 GitHub 触发设备验证/通行密钥，请手动登录后粘贴 Cookie。
        </p>
      )}

      <div className="space-y-2">
        <button
          onClick={() => { if (!showCookies) loadCookies(); setShowCookies(!showCookies) }}
          className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
        >
          {showCookies ? '收起 Cookie' : '手动 Cookie'}（可选）
        </button>
        {showCookies && (
          <div className="space-y-2">
            <textarea
              rows={3}
              value={cookieText}
              onChange={(e) => setCookieText(e.target.value)}
              placeholder={'_gh_sess=xxx; logged_in=yes; user_session=yyy'}
              className="input-field text-xs font-mono h-20 resize-y"
            />
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" onClick={saveCookies} disabled={!cookieText.trim()}>
                保存 Cookie
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(cookieText)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                复制
              </button>
            </div>
          </div>
        )}
      </div>

      {showPatModal && <PatModal account={account} onClose={() => setShowPatModal(false)} onDone={onChanged} />}
    </div>
  )
}
