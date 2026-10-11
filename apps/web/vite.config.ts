import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '../../'), '')
  const printMode = (rootEnv.PRINT_MODE || process.env.PRINT_MODE || 'real').toLowerCase()

  return {
    envDir: path.resolve(__dirname, '../../'),
    plugins: [react()],
    define: {
      'import.meta.env.VITE_PRINT_MODE': JSON.stringify(printMode),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true, // Listen on all network interfaces (0.0.0.0)
      port: 5200,
      allowedHosts: true, // Allow ngrok and external LAN host headers
      proxy: {
        '/api': {
          target: 'https://api.printbooth.co.in',
          changeOrigin: true,
          secure: true,
          configure: (proxy) => {
            const originalEmit = proxy.emit
            proxy.emit = function (event: string, ...args: any[]) {
              if (event === 'error') {
                const err = args[0] as any
                if (
                  err?.code === 'ECONNRESET' ||
                  err?.code === 'ECONNREFUSED' ||
                  err?.code === 'EPIPE' ||
                  err?.message?.includes('ECONNRESET') ||
                  err?.message?.includes('socket hang up')
                ) {
                  return false
                }
              }
              return originalEmit.apply(this, [event, ...args] as any)
            }
          },
        },
        '/ws': {
          target: 'ws://localhost:5000',
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            const originalEmit = proxy.emit
            proxy.emit = function (event: string, ...args: any[]) {
              if (event === 'error') {
                const err = args[0] as any
                if (
                  err?.code === 'ECONNRESET' ||
                  err?.code === 'ECONNREFUSED' ||
                  err?.code === 'EPIPE' ||
                  err?.message?.includes('ECONNRESET') ||
                  err?.message?.includes('socket hang up')
                ) {
                  return false
                }
              }
              return originalEmit.apply(this, [event, ...args] as any)
            }
            ;(proxy as any).on('proxySocket', (proxySocket: any) => {
              proxySocket.on('error', (err: any) => {
                if (err?.code === 'ECONNRESET' || err?.code === 'EPIPE') {
                  // Harmless client socket drop
                }
              })
            })
          },
        },
      },
    },
  }
})
