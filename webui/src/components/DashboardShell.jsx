import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Upload, Settings as SettingsIcon, LogOut,
  Menu, Users, Loader2, ChevronRight, ShieldCheck, Github, ScanLine,
} from 'lucide-react'
import clsx from 'clsx'
import ThemeToggle from './ThemeToggle.jsx'
import { api, setToken } from '../api.js'

const AccountsPage = lazy(() => import('../features/accounts/AccountsPage.jsx'))
const GithubPage = lazy(() => import('../features/github/GithubPage.jsx'))
const ScanPage = lazy(() => import('../features/scan/ScanPage.jsx'))
const ImportPage = lazy(() => import('../features/import/ImportPage.jsx'))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage.jsx'))

function TabLoading() {
  return (
    <div className="min-h-[320px] rounded-xl border border-border bg-card/60 flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span>加载中…</span>
      </div>
    </div>
  )
}

function BrandMark({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={clsx(
        'rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/25',
        compact ? 'w-7 h-7' : 'w-9 h-9'
      )}>
        <ShieldCheck className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-bold text-lg tracking-tight">GitHub 2FA</div>
        </div>
      )}
    </div>
  )
}

export default function DashboardShell({ token, onLogout }) {
  const [activeTab, setActiveTab] = useState('accounts')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [stats, setStats] = useState({ accounts: 0, otpReady: 0 })
  const [versionInfo, setVersionInfo] = useState(null)
  const [message, setMessage] = useState(null)

  const showMessage = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  // 版本与更新检测（参考 ds2apiNew 侧边栏版本块）
  useEffect(() => {
    let disposed = false
    api.updateCheck()
      .then((info) => { if (!disposed) setVersionInfo(info) })
      .catch(() => { if (!disposed) setVersionInfo(null) })
    return () => { disposed = true }
  }, [])

  useEffect(() => {
    api.accounts().then(async ({ accounts }) => {
      let ghLoggedIn = 0
      try {
        const s = await api.githubSummary()
        ghLoggedIn = s.ghLoggedIn || 0
      } catch { /* ignore */ }
      setStats({ accounts: accounts.length, otpReady: accounts.filter((a) => a.hasSecret).length, ghLoggedIn })
    }).catch(() => {})
  }, [activeTab])

  const navItems = [
    { id: 'accounts', label: '账号管理', icon: Users, desc: '2FA 动态码、凭据与二维码' },
    { id: 'scan', label: '扫码添加', icon: ScanLine, desc: '摄像头/图片/URI 录入 OTP 账号' },
    { id: 'github', label: 'GitHub', icon: Github, desc: '自动登录、生成 PAT 与会话管理' },
    { id: 'import', label: '一键导入', icon: Upload, desc: '粘贴文本或上传文件批量导入账号' },
    { id: 'settings', label: '设置', icon: SettingsIcon, desc: '修改密码与数据备份' },
  ]

  const activeNav = navItems.find((n) => n.id === activeTab)

  const renderTab = () => {
    switch (activeTab) {
      case 'accounts': return <AccountsPage showMessage={showMessage} />
      case 'scan': return <ScanPage showMessage={showMessage} />
      case 'github': return <GithubPage showMessage={showMessage} />
      case 'import': return <ImportPage showMessage={showMessage} />
      case 'settings': return <SettingsPage showMessage={showMessage} />
      default: return null
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground app-backdrop">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={clsx(
        'fixed lg:static inset-y-0 left-0 z-50 w-64 border-r border-border bg-card/70 backdrop-blur-xl transition-transform duration-300 ease-in-out lg:transform-none flex flex-col',
        sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
      )}>
        <div className="px-5 pt-6 pb-5 border-b border-border/60">
          <BrandMark />
          <p className="mt-3 text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground">
            账号保险库
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false) }}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group relative',
                  isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                )}
              >
                {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-primary" />}
                <Icon className={clsx('w-4 h-4 shrink-0 transition-colors', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                <span className="flex-1 text-left">{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-primary" />}
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border/60 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">系统状态</span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              在线
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">账号</div>
              <div className="text-lg font-bold leading-tight">{stats.accounts}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">2FA</div>
              <div className="text-lg font-bold leading-tight text-primary">{stats.otpReady}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">GitHub</div>
              <div className="text-lg font-bold leading-tight text-blue-500">{stats.ghLoggedIn}</div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              版本
            </div>
            <div className="text-xs font-semibold text-foreground">
              v{versionInfo?.current || '-'}
            </div>
            {versionInfo?.hasUpdate && (
              <a
                className="inline-flex mt-1 text-[10px] font-medium text-primary hover:underline"
                href={versionInfo?.url || 'https://github.com/t479842598/Github-2FA/releases/latest'}
                target="_blank"
                rel="noreferrer"
              >
                ✨ 发现新版本 v{versionInfo?.latest}
              </a>
            )}
            {versionInfo?.hasUpdate === false && (
              <div className="mt-1 text-[10px] font-medium text-emerald-500">已是最新版本</div>
            )}
          </div>

          <button
            onClick={() => { setToken(null); onLogout() }}
            className="w-full h-9 flex items-center justify-center gap-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            退出登录
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="lg:hidden h-14 flex items-center justify-between px-4 border-b border-border bg-card/70 backdrop-blur-xl">
          <BrandMark compact />
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -mr-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/70"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-4 py-6 lg:px-10 lg:py-10 space-y-5 lg:space-y-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl lg:text-[1.75rem] font-bold tracking-tight">{activeNav?.label}</h1>
                <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{activeNav?.desc}</p>
              </div>
              <div className="hidden lg:flex items-center gap-2 shrink-0">
                <ThemeToggle />
              </div>
            </div>

            {message && (
              <div className={clsx(
                'px-4 py-3 rounded-lg border flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2',
                message.type === 'error'
                  ? 'bg-destructive/10 border-destructive/25 text-destructive'
                  : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500'
              )}>
                {message.type === 'error' ? (
                  <span className="text-base leading-none">✕</span>
                ) : (
                  <span className="text-base leading-none">✓</span>
                )}
                <span>{message.text}</span>
              </div>
            )}

            <div className="animate-in fade-in duration-300">
              <Suspense fallback={<TabLoading />}>
                {renderTab()}
              </Suspense>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
