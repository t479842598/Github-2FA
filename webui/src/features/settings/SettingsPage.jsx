import { useState } from 'react'
import { DatabaseBackup, Download, ExternalLink, KeyRound, ListChecks, Lock, RefreshCw, Trash2, Upload } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../api.js'

const ACTION_LABELS = {
  login_ok: '登录成功', login_fail: '登录失败', password_changed: '修改密码', password_change: '修改密码失败',
  import: '批量导入', account_add: '添加账号', account_update: '编辑账号', account_delete: '删除账号',
  pat_create: '生成 PAT', pat_revoke: '撤销 PAT', gh_login: 'GitHub 登录', gh_logout: 'GitHub 退出',
  backup_import: '导入备份', export: '导出数据', health_check: '健康检查', recovery_mark: '标记恢复码',
  audit_clear: '清空审计日志',
}

function UpdatePanel() {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(false)

  const check = async () => {
    setLoading(true)
    try {
      const d = await api.updateCheck()
      setInfo(d)
    } catch (e) {
      setInfo({ error: e.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-6 space-y-4 lg:col-span-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <RefreshCw className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">版本与更新</h2>
            <p className="text-sm text-muted-foreground">当前版本 v{info?.current || '0.0.1'}，检测 GitHub Releases 最新版本</p>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={check} disabled={loading}>
          {loading ? '检查中…' : '检查更新'}
        </button>
      </div>

      {info && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-between gap-3 flex-wrap">
          {info.error ? (
            <div className="text-sm text-destructive">{info.error}</div>
          ) : info.hasUpdate ? (
            <>
              <div className="text-sm">
                <span className="text-muted-foreground">发现新版本</span>{' '}
                <span className="font-mono font-bold text-primary">v{info.latest}</span>
                <span className="text-muted-foreground">（当前 v{info.current}）</span>
                {info.name && <div className="text-xs text-muted-foreground mt-1">{info.name}</div>}
              </div>
              <a className="btn btn-primary btn-sm" href={info.url} target="_blank" rel="noreferrer">
                前往仓库下载 <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </>
          ) : (
            <div className="text-sm text-emerald-500">✓ 已是最新版本（v{info.current}）</div>
          )}
        </div>
      )}
    </div>
  )
}

function AuditPanel() {
  const [logs, setLogs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const d = await api.auditLogs(200)
      setLogs(d.logs)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const clear = async () => {
    if (!confirm('确定清空全部审计日志？')) return
    try {
      await api.clearAudit()
      setLogs([])
    } catch (e) {
      setError(e.message)
    }
  }

  const fmt = (ts) => new Date(ts).toLocaleString('zh-CN', { hour12: false })

  return (
    <div className="card p-6 space-y-4 lg:col-span-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <ListChecks className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">审计日志</h2>
            <p className="text-sm text-muted-foreground">登录、导入、改密、PAT 等关键操作记录（最多保留 2000 条）</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            {loading ? '加载中…' : '刷新'}
          </button>
          <button className="btn btn-danger btn-sm" onClick={clear} disabled={!logs?.length}>
            <Trash2 className="w-3.5 h-3.5" /> 清空
          </button>
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-lg border border-destructive/25 bg-destructive/10 text-sm text-destructive">{error}</div>}

      {!logs ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          尚未加载，点击「刷新」查看日志
        </div>
      ) : logs.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">暂无日志</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="max-h-96 overflow-y-auto custom-scrollbar divide-y divide-border/60">
            {logs.map((log, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-muted/30">
                <span className="font-mono text-[11px] text-muted-foreground shrink-0 w-36">{fmt(log.ts)}</span>
                <span className={clsx(
                  'text-[11px] font-semibold px-2 py-0.5 rounded shrink-0',
                  log.result === 'fail' || log.action === 'login_fail'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {ACTION_LABELS[log.action] || log.action}
                </span>
                <span className="font-mono text-xs text-foreground truncate shrink-0">{log.object || '-'}</span>
                {log.extra && <span className="text-[11px] text-muted-foreground truncate flex-1 text-right">{log.extra}</span>}
                <span className="font-mono text-[10px] text-muted-foreground/60 shrink-0 hidden sm:inline">{log.ip}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage({ showMessage }) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changing, setChanging] = useState(false)
  const [backupPassword, setBackupPassword] = useState('')
  const [importing, setImporting] = useState(false)

  const changePassword = async (e) => {
    e.preventDefault()
    if (newPassword.length < 6) return showMessage('error', '新密码至少 6 位')
    if (newPassword !== confirmPassword) return showMessage('error', '两次输入的新密码不一致')
    setChanging(true)
    try {
      await api.changePassword(oldPassword, newPassword)
      showMessage('success', '密码已修改，请使用新密码重新登录')
      setTimeout(() => {
        localStorage.removeItem('ghvault_token')
        window.location.reload()
      }, 1200)
    } catch (err) {
      showMessage('error', err.message)
    } finally {
      setChanging(false)
    }
  }

  const exportBackup = async () => {
    try {
      const backup = await api.backup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vault-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      showMessage('success', '备份已导出（含加密数据，恢复时需要登录密码）')
    } catch (err) {
      showMessage('error', err.message)
    }
  }

  const onImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!backupPassword) return showMessage('error', '请先输入用于解密备份的密码')
    if (!confirm(`将用「${file.name}」覆盖当前全部数据（当前数据会自动备份为 .pre-import.json）。确定继续？`)) return

    setImporting(true)
    try {
      const backup = JSON.parse(await file.text())
      const data = await api.importBackup(backup, backupPassword)
      showMessage('success', `备份恢复成功，共 ${data.count} 个账号。请重新登录`)
      setTimeout(() => {
        localStorage.removeItem('ghvault_token')
        window.location.reload()
      }, 1200)
    } catch (err) {
      showMessage('error', `恢复失败：${err.message}`)
    } finally {
      setImporting(false)
    }
  }

  const labelCls = 'ml-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground'

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <UpdatePanel />

      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <Lock className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">修改访问密码</h2>
            <p className="text-sm text-muted-foreground">修改后所有数据将使用新密钥重新加密</p>
          </div>
        </div>

        <form onSubmit={changePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label className={labelCls}>当前密码</label>
            <input type="password" className="input-field" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="输入当前密码" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>新密码</label>
            <input type="password" className="input-field" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 6 位" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>确认新密码</label>
            <input type="password" className="input-field" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次输入" />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={changing}>
            <KeyRound className="w-4 h-4" />
            {changing ? '重加密中…' : '修改密码'}
          </button>
        </form>
      </div>

      <AuditPanel />

      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <DatabaseBackup className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">数据备份</h2>
            <p className="text-sm text-muted-foreground">所有敏感字段均为密文，恢复备份需输入当时设置的登录密码</p>
          </div>
        </div>

        <div className="space-y-4">
          <button className="btn btn-secondary w-full" onClick={exportBackup}>
            <Download className="w-4 h-4" />
            导出加密备份
          </button>

          <div className="border-t border-border pt-4 space-y-3">
            <div className="space-y-1.5">
              <label className={labelCls}>备份密码（恢复用）</label>
              <input type="password" className="input-field" value={backupPassword} onChange={(e) => setBackupPassword(e.target.value)} placeholder="导出备份时设置的登录密码" />
            </div>
            <label className="btn btn-secondary w-full cursor-pointer">
              <Upload className="w-4 h-4" />
              {importing ? '恢复中…' : '导入备份文件'}
              <input type="file" accept=".json" className="hidden" onChange={onImportFile} />
            </label>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              导入会<strong className="text-destructive">覆盖</strong>当前全部数据。导入前系统会自动把现有数据保存为
              <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">vault.json.pre-import.json</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
