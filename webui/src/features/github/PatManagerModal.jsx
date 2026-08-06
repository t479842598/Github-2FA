// PAT 管理弹窗：查看账号名下全部 PAT（名称/权限/过期/最后使用）+ 撤销
import { useEffect, useState } from 'react'
import { KeyRound, Loader2, RefreshCw, ShieldOff } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../api.js'

export default function PatManagerModal({ account, onClose, onChanged }) {
  const [pats, setPats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revoking, setRevoking] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const d = await api.githubPats(account.id)
      setPats(d.pats)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [account.id])

  const revoke = async (pat) => {
    if (!confirm(`确定撤销 PAT「${pat.name}」吗？撤销后立即失效，不可恢复`)) return
    setRevoking(pat.id)
    try {
      await api.githubRevokePat(account.id, pat.id)
      await load()
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setRevoking(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full sm:max-w-lg p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar rounded-b-none sm:rounded-b-[calc(var(--radius)+0.125rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2 min-w-0">
            <KeyRound className="w-4 h-4 text-primary shrink-0" />
            PAT 管理 · <span className="font-mono text-sm truncate">{account.username}</span>
          </h3>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/70 shrink-0">✕</button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg border border-destructive/25 bg-destructive/10 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : pats && pats.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            该账号名下暂无 PAT
          </div>
        ) : (
          <div className="space-y-2">
            {pats?.map((pat) => (
              <div key={pat.id} className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-sm font-medium truncate">{pat.name}</div>
                  <button
                    onClick={() => revoke(pat)}
                    disabled={revoking === pat.id}
                    className="btn btn-danger btn-sm !px-2.5 shrink-0"
                    title="撤销此 PAT"
                  >
                    {revoking === pat.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">撤销</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {pat.scopes?.map((s) => (
                    <span key={s} className="font-mono text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{s}</span>
                  ))}
                </div>
                <div className="flex gap-3 text-[11px] text-muted-foreground flex-wrap">
                  {pat.expires && <span>⏳ {pat.expires}</span>}
                  {pat.lastUsed && <span>📅 {pat.lastUsed}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            <RefreshCw className="w-3.5 h-3.5" /> 刷新
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
