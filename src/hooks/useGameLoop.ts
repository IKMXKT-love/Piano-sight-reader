/**
 * useGameLoop — 业务状态机引擎（音频已解耦至 usePianoAudioEngine）
 *
 * 状态机流转图：
 *
 *   SETUP ──► INIT ──► GENERATE ──► RENDER ──► LISTEN_TOLERANT ──► RESOLVE
 *    ▲                                                                │
 *    │                          (NEXT_ROUND 循环)                     │
 *    └── RESET 退回主页 ◄─────────────────────────────────────────────┘
 *
 * 音频引擎在 INIT 阶段启动，LISTEN_TOLERANT 阶段设置目标频率，
 * 引擎通过 onHit/onMiss/onRollback 回调驱动状态流转。
 */

import { useReducer, useEffect, useRef, useCallback, useMemo } from 'react'
import { usePianoAudioEngine } from './usePianoAudioEngine'
import type { AudioEngineCallbacks } from './usePianoAudioEngine'

// ============================================================
// 1. 任务接口 & localStorage 存储层
// ============================================================

/** 练习任务：包含离散音符池、任务名、降号偏好 */
export interface PracticeTask {
  id: string
  name: string
  /** 离散 MIDI 编号数组，替代旧的 min/max 区间 */
  notePool: number[]
  /** 黑键是否优先使用降号记谱（b） */
  useFlats: boolean
}

const STORAGE_KEY = 'piano_sight_reader_tasks'

export function loadTasks(): PracticeTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveTasks(tasks: PracticeTask[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

export function deleteTask(id: string): PracticeTask[] {
  const tasks = loadTasks().filter((t) => t.id !== id)
  saveTasks(tasks)
  return tasks
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ============================================================
// 2. 常量
// ============================================================

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'] as const

/** 黑键 MIDI 模 12 → 降号记谱对应的基准音名 */
const FLAT_BASE: Record<number, string> = {
  1:  'd',   // C# → Db
  3:  'e',   // D# → Eb
  6:  'g',   // F# → Gb
  8:  'a',   // G# → Ab
  10: 'b',   // A# → Bb
}

const BASE_SEMITONES: Record<string, number> = {
  c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
}

// ============================================================
// 3. 辅助函数：MIDI ↔ 音符名
// ============================================================

/** 钢琴最低音 A0 = MIDI 21 */
export const PIANO_MIN_MIDI = 21
/** 钢琴最高音 C8 = MIDI 108 */
export const PIANO_MAX_MIDI = 108

/**
 * midiToVexFlowKey — 将 MIDI 编号转为 VexFlow 内部格式（升号记谱）
 * 例如 60 → 'c/4'，61 → 'c#/4'
 */
export function midiToVexFlowKey(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  const noteIdx = ((midi % 12) + 12) % 12
  const noteName = NOTE_NAMES[noteIdx]
  return `${noteName}/${octave}`
}

/**
 * midiToFlatVexFlowKey — 将黑键 MIDI 转为降号记谱
 * 例如 61 → 'db/4'（Db4），63 → 'eb/4'（Eb4）
 * 非黑键则回退到升号记谱
 */
export function midiToFlatVexFlowKey(midi: number): string {
  const semitone = ((midi % 12) + 12) % 12
  const baseName = FLAT_BASE[semitone]
  if (!baseName) return midiToVexFlowKey(midi)
  const octave = Math.floor(midi / 12) - 1
  return `${baseName}b/${octave}`
}

/**
 * midiToLabel — MIDI → 可读标签（如 'C4', 'C#4'）
 * 供 UI 下拉框 / 按钮使用
 */
export function midiToLabel(midi: number): string {
  const key = midiToVexFlowKey(midi)
  const [name, octave] = key.split('/')
  return `${name!.toUpperCase()}${octave}`
}

/**
 * freqToNote — 将 Hz 映射为 VexFlow 内部格式（升号记谱）
 */
export function freqToNote(freq: number): string | null {
  if (freq <= 0) return null
  const midi = Math.round(12 * Math.log2(freq / 440) + 69)
  if (midi < 21 || midi > 108) return null
  return midiToVexFlowKey(midi)
}

/**
 * noteToFreq — 将 VexFlow 格式音符名反向转换为中心频率（Hz）
 * 支持升号记谱（'c#/4'）和降号记谱（'db/4'）
 */
export function noteToFreq(note: string): number {
  const [name, octaveStr] = note.split('/')
  const octave = parseInt(octaveStr ?? '4', 10)

  let semitoneOffset = 0
  let baseName = name

  if (name.endsWith('b') && name.length > 1) {
    baseName = name.slice(0, -1)
    semitoneOffset = -1
  } else if (name.endsWith('#')) {
    baseName = name.slice(0, -1)
    semitoneOffset = 1
  }

  const base = BASE_SEMITONES[baseName]
  if (base === undefined) return 0

  const midi = (octave + 1) * 12 + base + semitoneOffset
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// ============================================================
// 4. 纯函数：音符生成器（从 notePool 随机 + 智能谱号 + 同音异名）
// ============================================================

export interface GeneratedNote {
  note: string
  midi: number
  clef: 'treble' | 'bass'
}

/**
 * generateNote — 从任务 notePool 随机抽选单音
 *
 * 智能谱号：MIDI >= 60 → treble，< 60 → bass
 * 同音异名：黑键时，useFlats=true → 降号记谱，否则升号记谱
 */
export function generateNote(task: PracticeTask): GeneratedNote {
  const pool = task.notePool
  if (pool.length === 0) {
    return { note: 'c/4', midi: 60, clef: 'treble' }
  }

  const midi = pool[Math.floor(Math.random() * pool.length)]!
  const clef: 'treble' | 'bass' = midi >= 60 ? 'treble' : 'bass'
  const semitone = ((midi % 12) + 12) % 12
  const isBlackKey = [1, 3, 6, 8, 10].includes(semitone)

  const note = isBlackKey && task.useFlats
    ? midiToFlatVexFlowKey(midi)
    : midiToVexFlowKey(midi)

  return { note, midi, clef }
}

// ============================================================
// 5. 状态枚举
// ============================================================

export enum GamePhase {
  SETUP           = 'SETUP',
  INIT            = 'INIT',
  GENERATE        = 'GENERATE',
  RENDER          = 'RENDER',
  LISTEN_TOLERANT = 'LISTEN_TOLERANT',
  RESOLVE         = 'RESOLVE',
}

// ============================================================
// 6. Action 类型
// ============================================================

export type GameAction =
  | { type: 'START_GAME'; task: PracticeTask }
  | { type: 'MIC_READY' }
  | { type: 'MIC_DENIED'; reason: string }
  | { type: 'NOTE_GENERATED'; note: string; midi: number; clef: 'treble' | 'bass' }
  | { type: 'RENDER_COMPLETE' }
  | { type: 'NOTE_HIT'; elapsedMs: number }
  | { type: 'NOTE_MISS'; elapsedMs: number }
  | { type: 'TIMEOUT' }
  | { type: 'NEXT_ROUND' }
  | { type: 'RESET' }

// ============================================================
// 7. 状态结构
// ============================================================

export interface GameState {
  phase:       GamePhase
  task:        PracticeTask
  targetNote:  string | null
  targetMidi:  number | null
  targetClef:  'treble' | 'bass' | null
  isSuccess:   boolean | null
  micError:    string | null
  score:       number
  combo:       number
  timeoutMs:   number
  /** 最近一次命中评级：'perfect' | 'great' | 'good' | null */
  lastRating:  'perfect' | 'great' | 'good' | null
  /** 引擎是否处于击弦瞬态（INTERCEPT/VALIDATION），UI 应冻结进度条 */
  isStriking:  boolean
}

// ============================================================
// 8. 初始状态
// ============================================================

const DEFAULT_TASK: PracticeTask = {
  id: '',
  name: '',
  notePool: [60],
  useFlats: false,
}

const INITIAL_STATE: GameState = {
  phase:       GamePhase.SETUP,
  task:        DEFAULT_TASK,
  targetNote:  null,
  targetMidi:  null,
  targetClef:  null,
  isSuccess:   null,
  micError:    null,
  score:       0,
  combo:       0,
  timeoutMs:   5000,
  lastRating:  null,
  isStriking:  false,
}

// ============================================================
// 9. Reducer
// ============================================================

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      if (state.phase !== GamePhase.SETUP) return state
      return { ...state, phase: GamePhase.INIT, task: action.task }

    case 'MIC_READY':
      if (state.phase !== GamePhase.INIT) return state
      return { ...state, phase: GamePhase.GENERATE, micError: null }

    case 'MIC_DENIED':
      if (state.phase !== GamePhase.INIT) return state
      return { ...state, phase: GamePhase.RESOLVE, isSuccess: false, micError: action.reason }

    case 'NOTE_GENERATED':
      if (state.phase !== GamePhase.GENERATE) return state
      return {
        ...state,
        phase:      GamePhase.RENDER,
        targetNote: action.note,
        targetMidi: action.midi,
        targetClef: action.clef,
      }

    case 'RENDER_COMPLETE':
      if (state.phase !== GamePhase.RENDER) return state
      return { ...state, phase: GamePhase.LISTEN_TOLERANT }

    case 'NOTE_HIT': {
      if (state.phase !== GamePhase.LISTEN_TOLERANT) return state
      const ratio = action.elapsedMs / state.timeoutMs
      const base = ratio < 0.3 ? 50 : ratio < 0.7 ? 30 : 10
      const rating: 'perfect' | 'great' | 'good' = ratio < 0.3 ? 'perfect' : ratio < 0.7 ? 'great' : 'good'
      const finalScore = Math.round(base * (1 + state.combo * 0.1))
      return {
        ...state,
        phase:      GamePhase.RESOLVE,
        isSuccess:  true,
        score:      state.score + finalScore,
        combo:      state.combo + 1,
        lastRating: rating,
        isStriking: false,
      }
    }

    case 'NOTE_MISS': {
      if (state.phase !== GamePhase.LISTEN_TOLERANT) return state
      return {
        ...state,
        phase:      GamePhase.RESOLVE,
        isSuccess:  false,
        combo:      0,
        lastRating: null,
        isStriking: false,
      }
    }

    case 'TIMEOUT':
      if (state.phase !== GamePhase.LISTEN_TOLERANT) return state
      return { ...state, phase: GamePhase.RESOLVE, isSuccess: false, combo: 0, isStriking: false }

    case 'NEXT_ROUND':
      if (state.phase !== GamePhase.RESOLVE) return state
      return {
        ...state,
        phase:      GamePhase.GENERATE,
        targetNote: null,
        targetMidi: null,
        targetClef: null,
        isSuccess:  null,
        micError:   null,
        lastRating: null,
        isStriking: false,
      }

    case 'RESET':
      return { ...INITIAL_STATE, timeoutMs: state.timeoutMs }

    default:
      return state
  }
}

// ============================================================
// 10. Hook 公共接口
// ============================================================

export interface UseGameLoopReturn {
  state:                GameState
  start:                (task: PracticeTask) => void
  reset:                () => void
  notifyRenderComplete: () => void
  notifyResolveComplete:() => void
}

// ============================================================
// 11. useGameLoop Hook
// ============================================================

export function useGameLoop(timeoutMs = 5000): UseGameLoopReturn {
  const [state, dispatch] = useReducer(gameReducer, { ...INITIAL_STATE, timeoutMs })

  const hasResolvedRef  = useRef(false)
  const timeoutRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listenStartRef  = useRef(0)

  // ── 音频引擎回调（通过 ref 规避闭包陷阱） ──
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch
  const hasResolvedGetter = useCallback(() => hasResolvedRef.current, [])
  const listenStartGetter = useCallback(() => listenStartRef.current, [])

  const engineCallbacks = useMemo<AudioEngineCallbacks>(() => ({
    onHit: () => {
      if (hasResolvedGetter()) return
      hasResolvedRef.current = true
      const elapsed = Date.now() - listenStartGetter()
      console.log('[GameLoop] onHit 触发, 反应时间:', elapsed, 'ms')
      dispatchRef.current({ type: 'NOTE_HIT', elapsedMs: elapsed })
    },
  }), [hasResolvedGetter, listenStartGetter])

  const { startEngine, destroyEngine, setTarget, clearTarget } = usePianoAudioEngine(engineCallbacks)

  // ── 副作用 A：INIT — 启动音频引擎 ──
  useEffect(() => {
    if (state.phase !== GamePhase.INIT) return

    console.log('[GameLoop] INIT 阶段，正在启动音频引擎…')
    let cancelled = false
    startEngine().then((ok) => {
      if (cancelled) return
      if (ok) {
        console.log('[GameLoop] 音频引擎启动成功，进入 GENERATE')
        dispatch({ type: 'MIC_READY' })
      } else {
        console.error('[GameLoop] 音频引擎启动失败（世代过期）')
        dispatch({ type: 'MIC_DENIED', reason: 'Audio engine startup aborted (generation expired)' })
      }
    }).catch((err: unknown) => {
      if (cancelled) return
      console.error('[GameLoop] 音频引擎异常:', err)
      dispatch({ type: 'MIC_DENIED', reason: String(err) })
    })
    return () => { cancelled = true }
  }, [state.phase, startEngine])

  // ── 副作用 B：GENERATE — 从 notePool 随机生成 ──
  useEffect(() => {
    if (state.phase !== GamePhase.GENERATE) return

    const { note, midi, clef } = generateNote(state.task)

    if (!/^[a-g][#b]?\/\d+$/.test(note)) {
      console.error('[GENERATE] 非法音符格式，回退到 c/4:', note)
      dispatch({ type: 'NOTE_GENERATED', note: 'c/4', midi: 60, clef: 'treble' })
      return
    }

    dispatch({ type: 'NOTE_GENERATED', note, midi, clef })
  }, [state.phase, state.task])

  // ── 副作用 C：LISTEN_TOLERANT — 设置引擎目标 + 超时计时器 ──
  useEffect(() => {
    if (state.phase !== GamePhase.LISTEN_TOLERANT) return
    if (!state.targetNote) return

    hasResolvedRef.current = false
    listenStartRef.current = Date.now()

    const targetHz = noteToFreq(state.targetNote)
    console.log('[GameLoop] LISTEN_TOLERANT, 目标:', state.targetNote, '频率:', targetHz.toFixed(2), 'Hz')
    setTarget(targetHz)

    timeoutRef.current = setTimeout(() => {
      if (hasResolvedRef.current) return
      hasResolvedRef.current = true
      clearTarget()
      dispatch({ type: 'TIMEOUT' })
    }, state.timeoutMs)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      clearTarget()
    }
  }, [state.phase, state.targetNote, state.timeoutMs, setTarget, clearTarget])

  // ── 副作用 D：RESOLVE — 结算，1s 后进入下一轮 ──
  useEffect(() => {
    if (state.phase !== GamePhase.RESOLVE) return

    clearTarget()

    const timer = setTimeout(() => {
      dispatch({ type: 'NEXT_ROUND' })
    }, 1000)

    return () => clearTimeout(timer)
  }, [state.phase, clearTarget])

  // ── 公共接口 ──

  const start = useCallback((task: PracticeTask) => {
    dispatch({ type: 'START_GAME', task })
  }, [])

  const reset = useCallback(() => {
    destroyEngine()
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    dispatch({ type: 'RESET' })
  }, [destroyEngine])

  const notifyRenderComplete = useCallback(() => {
    dispatch({ type: 'RENDER_COMPLETE' })
  }, [])

  const notifyResolveComplete = useCallback(() => {
    dispatch({ type: 'NEXT_ROUND' })
  }, [])

  return { state, start, reset, notifyRenderComplete, notifyResolveComplete }
}
