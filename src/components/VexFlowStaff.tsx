/**
 * VexFlowStaff — 五线谱渲染组件
 *
 * 职责边界：
 *   ✅ 接收 targetNote prop（标准 MIDI 格式，如 'C4'），渲染五线谱
 *   ✅ 自动判断高音 / 低音谱号
 *   ✅ 每次渲染前清空容器，防止 DOM 重叠
 *   ❌ 严禁包含任何游戏状态逻辑
 *   ❌ 严禁调用麦克风 / 音频 API
 */

import { useRef, useEffect } from 'react'
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow'

// ── 常量 ────────────────────────────────────────────────────

/** 中央 C 的 MIDI 编号（C4 = 60），用于谱号判断 */
const MIDDLE_C_MIDI = 60

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

// ── 辅助函数 ─────────────────────────────────────────────────

/**
 * midiToNoteInfo — 将标准 MIDI 音符名（如 'C4', 'F#3'）解析为 MIDI 编号
 * 返回 null 表示格式非法
 */
function parseMidiName(noteName: string): { midi: number; accidental: string } | null {
  // 匹配格式：字母 + 可选升降号 + 八度数字，例如 C4, F#3, Bb2
  const match = noteName.match(/^([A-Ga-g])([#b]?)(-?\d+)$/)
  if (!match) return null

  const [, letter, acc, octaveStr] = match
  const octave = parseInt(octaveStr!, 10)

  const baseNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  const baseSemitones = [0, 2, 4, 5, 7, 9, 11]
  const baseIdx = baseNames.indexOf(letter!.toUpperCase())
  if (baseIdx === -1) return null

  let semitone = baseSemitones[baseIdx]!
  if (acc === '#') semitone += 1
  if (acc === 'b') semitone -= 1

  const midi = (octave + 1) * 12 + semitone
  return { midi, accidental: acc ?? '' }
}

/**
 * toVexFlowKey — 将标准 MIDI 音符名转为 VexFlow key 格式
 *
 * 输入宽容度：变音记号使用无视大小写的安全校验（.toLowerCase()）。
 * 输出契约：key 为全小写带斜杠标准格式，升降号嵌入 key 字符串。
 * 同时返回规范化后的 accidental 供 Accidental 修饰器双重保障。
 *
 * 输入：'C4'  → { key: 'c/4',   accidental: '' }
 * 输入：'Eb4' → { key: 'eb/4',  accidental: 'b' }
 * 输入：'F#3' → { key: 'f#/3',  accidental: '#' }
 * 输入：'Bb2' → { key: 'bb/2',  accidental: 'b' }
 */
function toVexFlowKey(noteName: string): { key: string; accidental: string } | null {
  // 正则宽松匹配：允许大写 B 作为降号输入（防御上层数据管道污染）
  const match = noteName.match(/^([A-Ga-g])([#bB]?)(-?\d+)$/)
  if (!match) return null

  const [, letter, acc, octave] = match
  // 全小写规范化：升降号归一化为小写，key 嵌入升降号（如 'eb/4'）
  const accidental = acc.toLowerCase()
  const key = `${letter!.toLowerCase()}${accidental}/${octave}`
  return { key, accidental }
}

/**
 * isLowNote — 判断是否应使用低音谱号
 * 规则：MIDI 编号 < 60（即低于中央 C4）使用低音谱号
 */
function isLowNote(noteName: string): boolean {
  const info = parseMidiName(noteName)
  if (!info) return false
  return info.midi < MIDDLE_C_MIDI
}

// ── 组件 ─────────────────────────────────────────────────────

export interface VexFlowStaffProps {
  /**
   * 目标音符，标准 MIDI 格式，例如 'C4'、'F#3'、'Bb5'
   * 由 App.tsx 传入，来源于 useGameLoop 的 targetNote（经 formatNote 转换）
   */
  targetNote: string
  /** 监听中时显示脉冲高亮效果 */
  listening?: boolean
  /**
   * 直接控制音符渲染颜色
   * 优先级高于 listening 推断的颜色
   * 用于结算反馈：'#22c55e'(命中绿) / '#ef4444'(超时红)
   */
  noteColor?: string
  /**
   * 显式指定谱号，覆盖自动检测
   * 传入后不再根据 MIDI 值自动判断
   */
  clef?: 'treble' | 'bass'
}

export default function VexFlowStaff({ targetNote, listening = false, noteColor, clef: forceClef }: VexFlowStaffProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // ── 生死线：必须先清空容器，防止 VexFlow SVG 重叠 ──
    el.innerHTML = ''

    const vfKey = toVexFlowKey(targetNote)
    if (!vfKey) {
      el.innerHTML = `<p style="color:#f87171;text-align:center">无效音符: ${targetNote}</p>`
      return
    }

    const clef = forceClef ?? (isLowNote(targetNote) ? 'bass' : 'treble')

    try {
      // 画布尺寸：宽度自适应，高度大幅扩展以容纳 88 键极端加线
      const width  = Math.max(el.clientWidth || 320, 320)
      const height = 300

      // 初始化 SVG 渲染器
      const renderer = new Renderer(el, Renderer.Backends.SVG)
      renderer.resize(width, height)
      const context = renderer.getContext()

      // 设置 SVG 样式（透明背景，白色线条）
      context.setFillStyle('#ffffff')
      context.setStrokeStyle('#ffffff')

      // 五线谱锚定画布正中央：水平 40px 边距，垂直 y=100 使上下对称
      const staveX = 40
      const staveW = width - 80
      const staveY = 100
      const stave  = new Stave(staveX, staveY, staveW)
      stave.addClef(clef).addTimeSignature('4/4')
      stave.setContext(context).draw()

      // 构建 StaveNote
      const staveNote = new StaveNote({
        clef,
        keys:     [vfKey.key],
        duration: 'q',
      })

      // 附加升降号
      if (vfKey.accidental !== '') {
        staveNote.addModifier(new Accidental(vfKey.accidental), 0)
      }

      // 颜色优先级：noteColor prop > listening 紫色 > 默认白色
      const color = noteColor ?? (listening ? '#c084fc' : '#ffffff')
      staveNote.setStyle({ fillStyle: color, strokeStyle: color })

      // 创建 Voice 并格式化
      const voice = new Voice({ num_beats: 4, beat_value: 4 })
      voice.setStrict(false)
      voice.addTickables([staveNote])

      new Formatter().joinVoices([voice]).format([voice], staveW - 60)
      voice.draw(context, stave)

    } catch (err) {
      // VexFlow 渲染失败时降级为文字显示
      el.innerHTML = `
        <div style="
          display:flex;align-items:center;justify-content:center;
          height:${height}px;color:#c084fc;font-size:48px;font-weight:bold;
        ">${targetNote}</div>
      `
      console.warn('[VexFlowStaff] 渲染失败，降级为文字:', err)
    }

    return () => {
      if (el) el.innerHTML = ''
    }
  }, [targetNote, listening, noteColor])

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ minHeight: 300 }}
      aria-label={`五线谱：${targetNote}`}
    />
  )
}
