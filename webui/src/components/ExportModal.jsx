import { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'

// 导出预览弹窗：只读 textarea 预览 + 复制 + 下载（账号导出 / 密钥导出共用）
export default function ExportModal({ title, text, filename, onClose }) {
  const [copied, setCopied] = useState(false)
  const download = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">预览导出内容，可复制或下载 .txt 文件</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/70 shrink-0">✕</button>
        </div>
        <textarea
          readOnly
          value={text}
          className="input-field w-full h-80 resize-y font-mono text-xs leading-relaxed"
          onFocus={(e) => e.target.select()}
        />
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary btn-sm" onClick={copy}>
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? '已复制' : '复制'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={download}>
            <Download className="w-3.5 h-3.5" />
            下载 .txt
          </button>
        </div>
      </div>
    </div>
  )
}
