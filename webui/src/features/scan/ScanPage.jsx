// 扫码添加 OTP：摄像头实时识别 / 图片上传 / 粘贴 URI 三入口
import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Camera, Check, ImageUp, Link2, Loader2, ScanLine, X } from 'lucide-react'
import clsx from 'clsx'
import { parseOtpUri } from '../../utils/otpUri.js'
import { api } from '../../api.js'

const CAMERA_OK = typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && window.isSecureContext

function decodeFromCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
}

export default function ScanPage({ showMessage }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const scanTimerRef = useRef(null)

  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [parsed, setParsed] = useState(null) // { username, issuer, secret, digits, period, uri }
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [fileScanning, setFileScanning] = useState(false)

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (scanTimerRef.current) clearInterval(scanTimerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
    setScanning(false)
  }

  useEffect(() => () => stopCamera(), [])

  const startCamera = async () => {
    setCameraError('')
    setScanning(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCameraOn(true)
      // 解码循环：30fps 抽帧
      const tick = () => {
        const video = videoRef.current
        const canvas = canvasRef.current
        if (video && canvas && video.readyState === 4) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
          }
          canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0)
          try {
            const result = decodeFromCanvas(canvas)
            if (result?.data) {
              try {
                const p = parseOtpUri(result.data)
                setParsed(p)
                stopCamera()
                return
              } catch { /* 非 otpauth 码，继续 */ }
            }
          } catch { /* 帧解码失败跳过 */ }
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      setCameraError(e.name === 'NotAllowedError' ? '摄像头授权被拒绝，可使用上传图片或粘贴 URI' : `摄像头不可用：${e.message}`)
      setScanning(false)
    }
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFileScanning(true)
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0)
      const result = decodeFromCanvas(canvas)
      if (!result?.data) {
        showMessage('error', '图片中未识别到二维码')
      } else {
        try {
          const p = parseOtpUri(result.data)
          setParsed(p)
          showMessage('success', '二维码识别成功，请确认信息后保存')
        } catch (err) {
          showMessage('error', `识别内容不是有效的 OTP URI：${err.message}`)
        }
      }
    } catch (err) {
      showMessage('error', `图片解析失败：${err.message}`)
    } finally {
      setFileScanning(false)
    }
  }

  const onPaste = () => {
    try {
      const p = parseOtpUri(pasteText)
      setParsed(p)
      showMessage('success', 'URI 解析成功，请确认信息后保存')
    } catch (e) {
      showMessage('error', e.message)
    }
  }

  const confirmAdd = () => {
    setForm(parsed) // 打开可编辑表单
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        username: form.username,
        setupKey: form.secret,
        otpauth: form.uri,
        remark: form.issuer ? `扫码添加（${form.issuer}）` : '扫码添加',
      }
      await api.createAccount(payload)
      setParsed(null)
      setForm(null)
      showMessage('success', `已添加账号 ${form.username}`)
    } catch (e) {
      showMessage('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'input-field text-sm'
  const labelCls = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 扫码区 */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <ScanLine className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">扫码添加 OTP</h2>
            <p className="text-sm text-muted-foreground">扫描 Authenticator 二维码（otpauth://），自动录入账号</p>
          </div>
        </div>

        <div className={clsx(
          'relative rounded-xl border border-border overflow-hidden bg-background/60 aspect-video flex items-center justify-center',
          cameraOn && 'ring-2 ring-primary/40'
        )}>
          {cameraOn ? (
            <>
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/5 aspect-square border-2 border-primary/70 rounded-2xl opacity-80" />
              </div>
              <div className="absolute bottom-3 left-0 right-0 text-center text-[11px] text-muted-foreground">
                对准二维码，自动识别…
              </div>
            </>
          ) : (
            <div className="text-center space-y-3 p-6">
              <div className="text-4xl opacity-40">📷</div>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                {CAMERA_OK ? '使用手机后置摄像头扫描已有账号的 OTP 二维码' : '当前环境不支持摄像头（需 HTTPS），请使用下方备用方式'}
              </p>
              {cameraError && (
                <p className="text-xs text-destructive">{cameraError}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {CAMERA_OK && !cameraOn && (
            <button onClick={startCamera} disabled={scanning} className="btn btn-primary flex-1 min-w-[120px]">
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {scanning ? '启动中…' : '打开摄像头'}
            </button>
          )}
          {cameraOn && (
            <button onClick={stopCamera} className="btn btn-secondary flex-1 min-w-[120px]">
              <X className="w-4 h-4" /> 关闭摄像头
            </button>
          )}
          <label className="btn btn-secondary flex-1 min-w-[120px] cursor-pointer">
            {fileScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageUp className="w-4 h-4" />}
            上传二维码图片
            <input type="file" accept="image/*" className="hidden" onChange={onFile} />
          </label>
        </div>

        <div className="space-y-2">
          <label className={labelCls}>或粘贴 OTP URI</label>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="otpauth://totp/GitHub:user?secret=XXXX&issuer=GitHub"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <button onClick={onPaste} className="btn btn-secondary shrink-0" disabled={!pasteText.trim()}>
              <Link2 className="w-4 h-4" /> 解析
            </button>
          </div>
        </div>
      </div>

      {/* 识别结果区 */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
            <Check className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">识别结果</h2>
            <p className="text-sm text-muted-foreground">确认无误后保存为新账号</p>
          </div>
        </div>

        {parsed ? (
          <div className="space-y-4">
            {!form && (
              <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">账号</span>
                  <span className="font-mono font-medium">{parsed.username}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Issuer</span>
                  <span>{parsed.issuer || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Secret</span>
                  <span className="font-mono text-xs">{parsed.secret.slice(0, 4)}•••••{parsed.secret.slice(-3)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">参数</span>
                  <span className="font-mono text-xs">{parsed.digits} 位 / {parsed.period}s</span>
                </div>
              </div>
            )}

            {form ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className={labelCls}>账号名</label>
                  <input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Secret（Base32）</label>
                  <input className={clsx(inputCls, 'font-mono text-xs')} value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Issuer</label>
                  <input className={inputCls} value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} />
                </div>
                <div className="flex gap-2 pt-1">
                  <button className="btn btn-secondary flex-1" onClick={() => setForm(null)}>返回</button>
                  <button className="btn btn-primary flex-1" onClick={save} disabled={saving || !form.username || !form.secret}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    保存账号
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={confirmAdd} className="btn btn-primary w-full">
                <Check className="w-4 h-4" /> 确认并录入
              </button>
            )}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <div className="text-3xl opacity-30 mb-3">◈</div>
            暂无识别结果
            <div className="text-xs mt-2 opacity-70">扫描二维码或粘贴 URI 后显示在此处</div>
          </div>
        )}
      </div>
    </div>
  )
}
