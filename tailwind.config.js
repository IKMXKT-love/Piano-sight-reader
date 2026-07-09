/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // 二次元主题皮肤扩展点
      backdropBlur: {
        'anime': '20px',
      },
      colors: {
        // 通过 CSS 变量桥接，支持运行时主题切换
        'panel-bg': 'rgba(var(--panel-bg-rgb) / var(--panel-opacity))',
        'accent': 'rgb(var(--accent-rgb))',
        'accent-glow': 'rgb(var(--accent-glow-rgb))',
      },
    },
  },
  plugins: [],
}
