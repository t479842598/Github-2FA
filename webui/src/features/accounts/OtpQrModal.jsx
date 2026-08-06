// 2FA 二维码弹窗：后端生成 QR 图片 + otpauth URI 复制
import { useEffect, useState } from 'react'
import { Check, Copy, Loader2, QrCode } from 'lucide-react'
import { api } from '../../api.js'

export default function OtpQrModal({ account, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [uri, setUri] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.otpauth(account.id)
      .then((d) => {
        setUri(d.uri)
        setQrDataUrl(d.qrDataUrl)
      })
      .catch((e) => setError(e.message))
  }, [account.id])

  const copyUri = async () => {
    await navigator.clipboard.writeText(uri)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <QrCode className="w-4 h-4 text-primary" />
            扫码添加 2FA
          </h3>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/70">✕</button>
        </div>

        {error ? (
          <div className="px-4 py-3 rounded-lg border border-destructive/25 bg-destructive/10 text-sm text-destructive">{error}</div>
        ) : !qrDataUrl ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center rounded-xl border border-border bg-white p-4">
              <img src={qrDataUrl} alt="2FA 二维码" className="w-[220px] h-[220px]" />
            </div>
            <div className="text-[11px] text-muted-foreground text-center leading-relaxed">
              打开 Authenticator / 1Password / 微信小程序等扫码工具，
              <br />
              扫描二维码即可添加该账号的 2FA（自动同步动态码）
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">OTP Auth URI</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-[10px] bg-muted/60 border border-border rounded-lg px-2.5 py-2 break-all max-h-16 overflow-y-auto custom-scrollbar">
                  {uri}
                </code>
                <button onClick={copyUri} className="p-2 rounded-lg border border-border hover:bg-secondary/70 transition-colors shrink-0" title="复制 URI">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button className="btn btn-secondary btn-sm" onClick={onClose}>关闭</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
