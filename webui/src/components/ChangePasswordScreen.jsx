// 强制修改默认密码（sk-admin）页面：改密成功前无法进入主界面
import { useState } from 'react'
import { ArrowRight, Key, ShieldAlert, ShieldCheck } from 'lucide-react'
import ThemeToggle from './ThemeToggle.jsx'
import { api, setToken } from '../api.js'

export default function ChangePasswordScreen({ onChanged }) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) return setError('新密码至少 6 位')
    if (newPassword !== confirm) return setError('两次输入的新密码不一致')
    if (newPassword === 'sk-admin') return setError('新密码不能与默认密码相同')

    setLoading(true)
    try {
      await api.changePassword(oldPassword, newPassword)
      // 改密后 tokenVersion+1 旧 token 失效，用新密码重新登录
      const data = await api.login(newPassword)
      setToken(data.token)
      onChanged(data.token)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputWrap = 'flex items-stretch overflow-hidden rounded-lg border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-primary/25'
  const labelCls = 'ml-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground'

  return (
    <div className="app-backdrop relative flex min-h-screen w-full flex-col items-center justify-center p-4 text-foreground">
      <div className="absolute top-5 right-5 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-[400px] animate-in fade-in zoom-in-95 duration-300">
        <div className="rounded-2xl border border-border bg-card/80 p-8 shadow-xl shadow-black/5 backdrop-blur-xl">
          <div className="mb-7 space-y-3 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/25">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">请修改默认密码</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                当前仍在使用默认密码 <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">sk-admin</code>，修改后方可管理账号
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg border border-destructive/25 bg-destructive/10 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className={labelCls}>当前密码</label>
              <div className={inputWrap}>
                <div className="flex items-center justify-center border-r border-border bg-muted/40 px-3 text-muted-foreground">
                  <Key className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  className="h-11 flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                  placeholder="sk-admin"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>新密码</label>
              <div className={inputWrap}>
                <div className="flex items-center justify-center border-r border-border bg-muted/40 px-3 text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  className="h-11 flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                  placeholder="至少 6 位，不要与默认密码相同"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>确认新密码</label>
              <div className={inputWrap}>
                <div className="flex items-center justify-center border-r border-border bg-muted/40 px-3 text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  className="h-11 flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                  placeholder="再次输入新密码"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary h-11 w-full text-sm shadow-lg shadow-primary/20">
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : (
                <>
                  <span>确认修改并进入</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
