module.exports = {
  apps: [
    {
      name: 'printbooth-api',
      cwd: './services/api',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
    {
      name: 'printbooth-web',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: './apps/web/dist',
        PM2_SERVE_PORT: 5200,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html',
      },
    },
    {
      name: 'printbooth-admin',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: './apps/admin/dist',
        PM2_SERVE_PORT: 5174,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html',
      },
    },
  ],
}
