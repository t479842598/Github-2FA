// GitHub 会话管理菜单：全部账号的登录状态 / 自动登录 / PAT / Cookie / 健康检查
import { useCallback, useEffect, useState } from 'react'
import { Github, HeartPulse, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import GitHubSession from './GitHubSession.jsx'
import { api } from '../../api.js'

function StatusBadge({ state, label }) {
  if (state === 'valid') return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">{label} ✓</span>
  if (state === 'invalid') return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full border border-destructive/20">{label} ✗</span>
  if (state === 'error') return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">{label} ?</span>
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">{label} —</span>
}

export default function GithubPage({ showMessage }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState(null)
  const [checking, setChecking] = useState(false)

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

  const runHealth = async () => {
    setChecking(true)
    setHealth(null)
    try {
      const d = await api.healthCheck()
      const map = {}
      for (const r of d.results) map[r.id] = r
      setHealth(map)
      const invalid = d.results.filter((r) => r.session === 'invalid' || r.pat === 'invalid')
      showMessage(
        invalid.length ? 'error' : 'success',
        `健康检查完成：${d.results.length} 个账号，${invalid.length} 个异常`
      )
    } catch (e) {
      showMessage('error', `健康检查失败：${e.message}`)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Github className="w-4 h-4 text-primary" />
              GitHub 会话
            </h2>
            <p className="text-sm text-muted-foreground">
              自动登录（密码 + 2FA）、生成 PAT、会话/PAT 有效性检测、手动 Cookie
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="btn btn-secondary btn-sm">刷新</button>
            <button onClick={runHealth} disabled={checking || accounts.length === 0} className="btn btn-primary btn-sm">
              {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HeartPulse className="w-3.5 h-3.5" />}
              {checking ? '检查中…' : '健康检查'}
            </button>
          </div>
        </div>

        {health && (
          <div className="px-6 py-3 border-b border-border bg-muted/20 flex flex-wrap gap-2">
            {accounts.map((a) => {
              const h = health[a.id]
              if (!h) return null
              return (
                <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-card/60">
                  <span className="font-mono text-[11px]">{a.username}</span>
                  <StatusBadge state={h.session} label="会话" />
                  <StatusBadge state={h.pat} label="PAT" />
                </div>
              )
            })}
          </div>
        )}

        <div className="divide-y divide-border">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">加载中…</div>
          ) : accounts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">暂无账号，请先到「一键导入」批量导入</div>
          ) : (
            accounts.map((acc) => (
              <div key={acc.id} className={clsx('p-4 sm:p-5 space-y-3')}>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-sm font-bold shrink-0">
                    {acc.username?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate font-mono">{acc.username || '-'}</div>
                    <div className="text-[11px] text-muted-foreground">
                      凭据与 2FA 在「账号管理」查看
                    </div>
                  </div>
                  {health?.[acc.id] && (
                    <div className="flex gap-1.5">
                      <StatusBadge state={health[acc.id].session} label="会话" />
                      <StatusBadge state={health[acc.id].pat} label="PAT" />
                    </div>
                  )}
                </div>
                <GitHubSession account={acc} onChanged={load} compact />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
