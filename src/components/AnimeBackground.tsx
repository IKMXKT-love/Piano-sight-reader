/**
 * AnimeBackground — 二次元主题背景层
 *
 * 职责边界（严格遵守）：
 *   ✅ 渲染背景立绘、粒子特效、渐变光晕等纯视觉元素
 *   ✅ 读取 CSS 变量实现主题切换
 *   ❌ 严禁包含任何游戏状态逻辑
 *   ❌ 严禁调用音频 / 麦克风 API
 *   ❌ 严禁与 VexFlowStaff 产生任何耦合
 *
 * 资源预留：
 *   - 背景立绘图片放置于 /src/assets/backgrounds/
 *   - 特效序列帧放置于 /src/assets/effects/
 */

export default function AnimeBackground() {
  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* 基础渐变背景 */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-purple-950/30 to-gray-950" />

      {/* 光晕装饰层 — 二次元风格氛围光 */}
      <div
        className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full opacity-20"
        style={{
          background: 'radial-gradient(circle, rgb(var(--accent-rgb)) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full opacity-15"
        style={{
          background: 'radial-gradient(circle, rgb(var(--accent-glow-rgb)) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      {/* TODO（第二阶段）：在此处挂载背景立绘 <img> 和粒子特效 Canvas */}
      {/* 示例：<img src="/src/assets/backgrounds/chara_01.png" className="..." /> */}
    </div>
  )
}
