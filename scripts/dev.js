import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

console.log('\x1b[36m%s\x1b[0m', '════════════════════════════════════════════════════════')
console.log('\x1b[1m\x1b[32m%s\x1b[0m', '  Starting PrintBooth Web App + Hardware Print Engine  ')
console.log('\x1b[36m%s\x1b[0m', '════════════════════════════════════════════════════════\n')

const isWindows = process.platform === 'win32'
const npmCmd = isWindows ? 'npm.cmd' : 'npm'

// 1. Start Backend API (Port 5000)
const apiProcess = spawn(npmCmd, ['run', 'dev', '--workspace=services/api'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
})

// 2. Start Web Frontend (Port 5200)
const webProcess = spawn(npmCmd, ['run', 'dev', '--workspace=apps/web'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
})

function shutdown() {
  console.log('\nShutting down PrintBooth dev servers...')
  apiProcess.kill()
  webProcess.kill()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
