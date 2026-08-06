// 版本与更新检测：读根 package.json 版本号，对比 GitHub Releases 最新版
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))

export const VERSION = pkg.version
export const APP_NAME = pkg.name
export const REPO = 't479842598/Github-2FA'
export const REPO_URL = `https://github.com/${REPO}`

// 语义化版本比较：>0 表示 b 更新
export function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number)
  const pb = String(b).replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y ? -1 : 1
  }
  return 0
}

let cache = { at: 0, data: null }
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 分钟缓存，避免频繁打 GitHub API

// 检测更新：返回 { current, latest, hasUpdate, url, name, publishedAt, error? }
export async function checkUpdate() {
  if (cache.data && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.data }
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        'User-Agent': `${APP_NAME}/${VERSION}`,
        'Accept': 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const data = { current: VERSION, latest: null, hasUpdate: false, url: REPO_URL, error: `查询失败（HTTP ${res.status}）` }
      cache = { at: Date.now(), data }
      return { ...data }
    }
    const rel = await res.json()
    const latest = String(rel.tag_name || '').replace(/^v/, '')
    const data = {
      current: VERSION,
      latest,
      hasUpdate: Boolean(latest) && compareVersions(latest, VERSION) > 0,
      url: rel.html_url || REPO_URL,
      name: rel.name || rel.tag_name || '',
      publishedAt: rel.published_at || '',
      error: null,
    }
    cache = { at: Date.now(), data }
    return { ...data }
  } catch (e) {
    const data = { current: VERSION, latest: null, hasUpdate: false, url: REPO_URL, error: `网络错误：${e.message}` }
    cache = { at: Date.now(), data }
    return { ...data }
  }
}
