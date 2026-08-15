import { useRef, useState } from 'react'
import { FileUp, Import, KeyRound, Trash2, Upload, Users } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../api.js'

const PLACEHOLDER = `账号: tqH8iLZ7VEV9
邮箱: user@example.com
密码: your-password
setup key: KDI5GIHR6P3HECLE
otpauth: otpauth://totp/GitHub:tqH8iLZ7VEV9?secret=KDI5GIHR6P3HECLE&issuer=GitHub
恢复码:
  3e54b-8f3af
  d5288-b2cba

────────

账号: CCryD7L6wWRd
邮箱: other@example.com
密码: another-password
setup key: G3VDNO6VQNWAUZTW
otpauth: otpauth://totp/GitHub:CCryD7L6wWRd?secret=G3VDNO6VQNWAUZTW&issuer=GitHub
恢复码:
  179aa-047a1
  ec2b1-3ac1d`

const KEY_PLACEHOLDER = `每行一个：账号-密钥（第一个 - 之前是账号，之后是密钥）

SiND2Fvct4w4-sk-FtB58T2AmVG4XE285L8FY0qXn0uO4iUZG3nIFuDBv6VSWJkKS4YVGRIrLKJuiQ04
SiND2Fvct4w4-f54b73eb-6ff2-4f7a-b3ce-0660a70d2c66`

// 密钥导入模块（opencode / freebuff 共用，仅 name 与文案不同）
function KeyImportModule({ name, showMessage }) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  const doPreview = async () => {
    if (!text.trim()) return
    setPreviewing(true)
    setResult(null)
    try {
      const data = await api.importKeys(text, name, true)
      setPreview(data.preview)
      if (data.count === 0) showMessage('error', '未识别到任何「账号-密钥」对，请检查格式')
    } catch (e) {
      showMessage('error', e.message)
    } finally {
      setPreviewing(false)
    }
  }

  const doImport = async () => {
    setImporting(true)
    try {
      const data = await api.importKeys(text, name, false)
      setResult(data)
      setPreview(null)
      showMessage(
        'success',
        `导入完成：新增 ${data.imported.length} 个，跳过 ${data.skipped.length} 个${data.notFound.length ? `，账号不存在 ${data.notFound.length} 个` : ''}`
      )
    } catch (e) {
      showMessage('error', e.message)
    } finally {
      setImporting(false)
    }
  }

  const statusBadge = (s) => {
    if (s === 'new') return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">新增</span>
    if (s === 'update') return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">密钥更新（日期标注）</span>
    if (s === 'duplicate') return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">重复跳过</span>
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">账号不存在</span>
  }

  return (
    <div className="space-y-4">
      <div className="card p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              {name} 密钥导入
            </h2>
            <p className="text-sm text-muted-foreground">
              每行一个「账号-密钥」：密钥将保存到对应账号的授权记录（{name}），账号不存在会提示，重复密钥自动跳过
            </p>
          </div>
          <button
            onClick={() => { setText(''); setPreview(null); setResult(null) }}
            className="btn btn-secondary btn-sm self-start"
            disabled={!text}
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null) }}
          placeholder={KEY_PLACEHOLDER}
          className="input-field h-56 resize-y font-mono text-xs leading-relaxed"
        />

        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={doPreview} disabled={!text.trim() || previewing}>
            {previewing ? '解析中…' : '解析预览'}
          </button>
          <button className="btn btn-primary" onClick={doImport} disabled={!text.trim() || importing}>
            <Import className="w-4 h-4" />
            {importing ? '导入中…' : '一键导入'}
          </button>
        </div>
      </div>

      {result && (
        <div className="card p-5 space-y-3">
          <h3 className="text-base font-semibold">导入结果</h3>
          <div className="grid grid-cols-3 gap-3 max-w-md">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-center">
              <div className="text-xl font-bold text-emerald-500">{result.imported.length}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">新增</div>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-center">
              <div className="text-xl font-bold text-amber-500">{result.skipped.length}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">跳过（重复）</div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-center">
              <div className="text-xl font-bold text-destructive">{result.notFound.length}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">账号不存在</div>
            </div>
          </div>
          {result.skipped.length > 0 && (
            <div className="text-xs text-muted-foreground">
              跳过：{result.skipped.map((s) => `${s.username}${s.reason ? `（${s.reason}）` : ''}`).join('、')}
            </div>
          )}
          {result.notFound.length > 0 && (
            <div className="text-xs text-amber-500">
              账号不存在：{result.notFound.join('、')} —— 请先在「一键导入」中添加这些账号
            </div>
          )}
          {result.imported.length > 0 && (
            <div className="text-xs text-muted-foreground">
              已保存：{result.imported.map((i) => `${i.username}（${i.title}）`).join('、')}
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">解析预览</h3>
              <p className="text-sm text-muted-foreground">
                识别到 {preview.length} 个密钥对，确认无误后点击「一键导入」
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
              <Upload className="w-3 h-3" />
              {preview.length} 个
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 font-semibold">账号</th>
                  <th className="px-5 py-2.5 font-semibold">密钥</th>
                  <th className="px-5 py-2.5 font-semibold text-center">判定</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {preview.map((p, i) => (
                  <tr key={i} className="hover:bg-muted/40 transition-colors">
                    <td className="px-5 py-2.5 font-mono text-xs">{p.username || '-'}</td>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-muted-foreground truncate max-w-[280px]">{p.key || '-'}</td>
                    <td className="px-5 py-2.5 text-center">{statusBadge(p.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-border flex justify-end">
            <button className="btn btn-primary btn-sm" onClick={doImport} disabled={importing}>
              <Import className="w-3.5 h-3.5" />
              {importing ? '导入中…' : `确认导入 ${preview.length} 个密钥`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ImportPage({ showMessage }) {
  const [mode, setMode] = useState('accounts') // accounts | opencode | freebuff
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const doPreview = async () => {
    if (!text.trim()) return
    setPreviewing(true)
    setResult(null)
    try {
      const data = await api.importText(text, true)
      setPreview(data.preview)
      if (data.count === 0) showMessage('error', '未识别到任何账号，请检查格式')
    } catch (e) {
      showMessage('error', e.message)
    } finally {
      setPreviewing(false)
    }
  }

  const doImport = async () => {
    setImporting(true)
    try {
      const data = await api.importText(text, false)
      setResult(data)
      setPreview(null)
      showMessage(
        'success',
        `导入完成：新增 ${data.imported} 个，跳过 ${data.skipped.length} 个${data.errors.length ? `，失败 ${data.errors.length} 个` : ''}`
      )
    } catch (e) {
      showMessage('error', e.message)
    } finally {
      setImporting(false)
    }
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const content = await file.text()
      setText(content)
      showMessage('success', `已读取文件 ${file.name}（${content.length} 字符），点击「解析预览」`)
    } catch (err) {
      showMessage('error', `读取文件失败：${err.message}`)
    }
    e.target.value = ''
  }

  if (mode !== 'accounts') {
    return (
      <div className="space-y-4">
        <div className="card p-3 flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setMode('accounts')}
            className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors', mode === 'accounts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary/70')}
          >
            <Users className="w-3.5 h-3.5" /> 账号导入
          </button>
          <button
            onClick={() => setMode('opencode')}
            className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors', mode === 'opencode' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary/70')}
          >
            <KeyRound className="w-3.5 h-3.5" /> opencode 密钥
          </button>
          <button
            onClick={() => setMode('freebuff')}
            className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors', mode === 'freebuff' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary/70')}
          >
            <KeyRound className="w-3.5 h-3.5" /> freebuff 密钥
          </button>
        </div>
        <KeyImportModule key={mode} name={mode} showMessage={showMessage} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card p-3 flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setMode('accounts')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors', mode === 'accounts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary/70')}
        >
          <Users className="w-3.5 h-3.5" /> 账号导入
        </button>
        <button
          onClick={() => setMode('opencode')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors', mode === 'opencode' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary/70')}
        >
          <KeyRound className="w-3.5 h-3.5" /> opencode 密钥
        </button>
        <button
          onClick={() => setMode('freebuff')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors', mode === 'freebuff' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary/70')}
        >
          <KeyRound className="w-3.5 h-3.5" /> freebuff 密钥
        </button>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">批量导入账号</h2>
            <p className="text-sm text-muted-foreground">支持用户格式文本（账号/邮箱/密码/setup key/otpauth/恢复码），也支持 JSON 数组</p>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".txt,.json,.log" className="hidden" onChange={onFile} />
            <button onClick={() => fileRef.current?.click()} className="btn btn-secondary btn-sm">
              <FileUp className="w-3.5 h-3.5" />
              上传文件
            </button>
            <button onClick={() => { setText(''); setPreview(null); setResult(null) }} className="btn btn-secondary btn-sm" disabled={!text}>
              <Trash2 className="w-3.5 h-3.5" />
              清空
            </button>
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null) }}
          placeholder={PLACEHOLDER}
          className="input-field h-72 resize-y font-mono text-xs leading-relaxed"
        />

        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={doPreview} disabled={!text.trim() || previewing}>
            {previewing ? '解析中…' : '解析预览'}
          </button>
          <button className="btn btn-primary" onClick={doImport} disabled={!text.trim() || importing}>
            <Import className="w-4 h-4" />
            {importing ? '导入中…' : '一键导入'}
          </button>
        </div>
      </div>

      {result && (
        <div className="card p-5 space-y-3">
          <h3 className="text-base font-semibold">导入结果</h3>
          <div className="grid grid-cols-3 gap-3 max-w-md">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-center">
              <div className="text-xl font-bold text-emerald-500">{result.imported}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">新增</div>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-center">
              <div className="text-xl font-bold text-amber-500">{result.skipped.length}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">跳过（重复）</div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-center">
              <div className="text-xl font-bold text-destructive">{result.errors.length}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">失败</div>
            </div>
          </div>
          {result.skipped.length > 0 && (
            <div className="text-xs text-muted-foreground">
              跳过：{result.skipped.map((s) => `${s.username}${s.reason ? `（${s.reason}）` : ''}`).join('、')}
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="text-xs text-destructive">
              失败：{result.errors.map((s) => `${s.username}（${s.reason}）`).join('、')}
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">解析预览</h3>
              <p className="text-sm text-muted-foreground">
                识别到 {preview.length} 个账号，确认无误后点击「一键导入」
                {preview.filter((p) => p.dup).length > 0 && (
                  <span className="ml-1.5 text-amber-500">（其中 {preview.filter((p) => p.dup).length} 个与已有账号重复，将自动跳过）</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
              <Upload className="w-3 h-3" />
              {preview.length} 个
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 font-semibold">账号</th>
                  <th className="px-5 py-2.5 font-semibold">邮箱</th>
                  <th className="px-5 py-2.5 font-semibold text-center">密码</th>
                  <th className="px-5 py-2.5 font-semibold text-center">2FA 密钥</th>
                  <th className="px-5 py-2.5 font-semibold text-center">恢复码</th>
                  <th className="px-5 py-2.5 font-semibold text-center">PAT</th>
                  <th className="px-5 py-2.5 font-semibold text-center">去重</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {preview.map((p, i) => (
                  <tr key={i} className="hover:bg-muted/40 transition-colors">
                    <td className="px-5 py-2.5 font-mono text-xs">{p.username || '-'}</td>
                    <td className="px-5 py-2.5 text-xs text-muted-foreground truncate max-w-[220px]">{p.email || '-'}</td>
                    <td className="px-5 py-2.5 text-center">
                      {p.hasPassword
                        ? <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="已识别" />
                        : <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/30" title="缺失" />}
                    </td>
                    <td className="px-5 py-2.5 text-center">
                      {p.hasSecret
                        ? <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="已识别" />
                        : <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/30" title="缺失" />}
                    </td>
                    <td className="px-5 py-2.5 text-center">
                      <span className={clsx('font-mono text-[11px] px-1.5 py-0.5 rounded', p.recoveryCount > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground')}>
                        {p.recoveryCount}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-center">
                      {p.hasPat
                        ? <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title="已识别" />
                        : <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/30" title="缺失" />}
                    </td>
                    <td className="px-5 py-2.5 text-center">
                      {p.dup
                        ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20" title="与已有账号重复，导入时将跳过">
                            重复
                          </span>
                        : <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            新增
                          </span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-border flex justify-end">
            <button className="btn btn-primary btn-sm" onClick={doImport} disabled={importing}>
              <Import className="w-3.5 h-3.5" />
              {importing ? '导入中…' : `确认导入 ${preview.length} 个账号`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
