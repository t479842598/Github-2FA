// 开发模式：并行启动 API server + Vite dev server
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const children = []
function start(name, cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`)
    shutdown()
  })
  children.push(child)
}

let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) c.kill('SIGTERM')
  setTimeout(() => process.exit(0), 500)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log('▶ 启动 API server (端口 3000) + Vite dev server...')
start('api', process.execPath, ['--watch', 'server/index.js'], root)
start('webui', 'npm', ['run', 'dev'], path.join(root, 'webui'))
