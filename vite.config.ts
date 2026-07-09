import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // 防止 Vite 在 Tauri 启动时清空终端日志
  clearScreen: false,

  server: {
    // 绑定所有网络接口，以便 Android 模拟器 / 真机通过局域网访问
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },

  // 移动端构建优化
  build: {
    target: 'es2021',
    minify: 'esbuild',
    sourcemap: false,
  },
})