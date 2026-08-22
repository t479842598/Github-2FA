import { useEffect, useState } from 'react'
import { ArrowRight, Key, Lock, ShieldCheck } from 'lucide-react'
import ThemeToggle from './ThemeToggle.jsx'
import { api, setToken } from '../api.js'

export default function Login({ onAuthed }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState('')
  const [mustChangePassword, setMustChangePassword] = useState(false)

  // 版本号与「是否仍为默认密码」从服务端拉取，避免硬编码过期
  useEffect(() => {
    api.status().then((s) => {
      setVersion(s.version || '')
      setMustChangePassword(Boolean(s.mustChangePassword))
    }).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!password) return

    setLoading(true)
    try {
      const data = await api.login(password)
      setToken(data.token)
      onAuthed(data.token, data.mustChangePassword)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-backdrop relative flex min-h-screen w-full flex-col items-center justify-center p-4 text-foreground">
      <div className="absolute top-5 right-5 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-[400px] animate-in fade-in zoom-in-95 duration-300">
        <div className="rounded-2xl border border-border bg-card/80 p-8 shadow-xl shadow-black/5 backdrop-blur-xl">
          <div className="mb-8 space-y-3 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">GitHub 2FA Manager</h1>
              <p className="mt-1 text-sm text-muted-foreground">请输入访问密码以继续</p>
            </div>
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg border border-destructive/25 bg-destructive/10 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="ml-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                访问密码
              </label>
              <div className="flex items-stretch overflow-hidden rounded-lg border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-primary/25">
                <div className="flex items-center justify-center border-r border-border bg-muted/40 px-3 text-muted-foreground">
                  <Key className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  className="h-11 flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                  placeholder="输入访问密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary h-11 w-full text-sm shadow-lg shadow-primary/20">
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : (
                <>
                  <span>登 录</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {mustChangePassword && (
            <div className="mt-6 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/10">
              <div className="text-[11px] text-amber-500 font-medium mb-0.5">首次使用默认密码</div>
              <code className="font-mono text-xs text-amber-500/90 select-all">sk-admin</code>
              <span className="text-[11px] text-muted-foreground ml-2">登录后需立即修改</span>
            </div>
          )}

          <div className="mt-5 flex justify-center border-t border-border pt-4">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              <ShieldCheck className="h-3 w-3" />
              <span>数据 AES-256 加密存储</span>
            </div>
          </div>
        </div>
        <p className="mt-6 text-center font-mono text-[10px] text-muted-foreground/50">
          GitHub 2FA Manager{version ? ` v${version}` : ''} · 团队 GitHub 账号集中管理
        </p>
      </div>
    </div>
  )
}
