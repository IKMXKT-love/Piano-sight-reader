import { useState, useEffect, useRef, useCallback } from 'react'
import AnimeBackground from './components/AnimeBackground'
import VexFlowStaff from './components/VexFlowStaff'
import {
  useGameLoop, GamePhase,
  loadTasks, saveTasks, deleteTask, generateId,
  midiToLabel, PIANO_MIN_MIDI, PIANO_MAX_MIDI,
} from './hooks/useGameLoop'
import type { PracticeTask } from './hooks/useGameLoop'

/* ============================================================
   视图路由枚举
   ============================================================ */

type ViewScreen = 'HOME' | 'TASK_LIST' | 'TASK_CREATE' | 'PRACTICE'

/* ============================================================
   主题状态持久化
   ============================================================ */

const THEME_KEY = 'piano_theme_index'

function loadTheme(): number {
  try {
    const v = parseInt(localStorage.getItem(THEME_KEY) ?? '0', 10)
    return (v >= 0 && v <= 3) ? v : 0
  } catch {
    return 0
  }
}

function saveTheme(index: number): void {
  localStorage.setItem(THEME_KEY, String(index))
}

/* ============================================================
   辅助函数
   ============================================================ */

function formatNote(note: string): string {
  const [name, octave] = note.split('/')
  const base = name![0]!.toUpperCase()
  const accidental = name!.slice(1)
  return `${base}${accidental}${octave}`
}

function isPlaying(phase: GamePhase): boolean {
  return phase !== GamePhase.SETUP && phase !== GamePhase.INIT
}

function buildMidiOptions(): { value: number; label: string }[] {
  const opts: { value: number; label: string }[] = []
  for (let m = PIANO_MIN_MIDI; m <= PIANO_MAX_MIDI; m++) {
    opts.push({ value: m, label: midiToLabel(m) })
  }
  return opts
}

const ALL_MIDI_OPTIONS = buildMidiOptions()

function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12)
}

/* ============================================================
   App 主组件 — 视图路由调度中心
   ============================================================ */

function App() {
  const { state, start, reset, notifyRenderComplete } = useGameLoop(5000)
  const { phase, targetNote, targetClef, isSuccess, score, combo, micError, lastRating, isStriking } = state

  const [currentScreen, setCurrentScreen] = useState<ViewScreen>('HOME')
  const [themeIndex, setThemeIndex] = useState<number>(() => loadTheme())

  // 主题变更 → 同步 localStorage
  useEffect(() => { saveTheme(themeIndex) }, [themeIndex])

  const displayNote = targetNote ? formatNote(targetNote) : null

  const lastNoteRef = useRef<string | null>(null)
  if (displayNote) lastNoteRef.current = displayNote
  const stableNote = displayNote ?? lastNoteRef.current

  const resolveNoteColor =
    phase === GamePhase.RESOLVE
      ? isSuccess ? '#22c55e' : '#ef4444'
      : undefined

  const statusText =
    phase === GamePhase.RENDER ? '目标音符' :
    phase === GamePhase.LISTEN_TOLERANT ? '请演奏以下音符' :
    phase === GamePhase.RESOLVE
      ? (micError ? `异常详情: ${micError}`  : isSuccess ? '命中！' : lastRating === null && isSuccess === false ? '超时' : '超时')
      : null

  /** 启动练习：注入任务配置 → 切至 PRACTICE 视图 */
  const handleStartPractice = useCallback((task: PracticeTask) => {
    start(task)
    setCurrentScreen('PRACTICE')
  }, [start])

  /** 退回主页：重置游戏状态 → 切回 HOME */
  const handleGoHome = useCallback(() => {
    reset()
    setCurrentScreen('HOME')
  }, [reset])

  const overlayClass = currentScreen === 'PRACTICE'
      ? 'bg-black/20 backdrop-blur-none'
      : 'bg-black/30 backdrop-blur-sm'

  return (
    <div className="relative min-h-screen w-full overflow-hidden" data-theme={`theme-${themeIndex}`}>
      {/* ── 主题 0 视频背景引擎（粉色） ── */}
      {themeIndex === 0 && (
        <>
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover z-0"
            src="/first_.mp4"
          />
          <div className={`absolute inset-0 z-0 transition-all duration-700 ${overlayClass}`} />
        </>
      )}

      {/* ── 主题 1 视频背景引擎（紫色） ── */}
      {themeIndex === 1 && (
        <>
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover z-0"
            src="/second.mp4"
          />
          <div className={`absolute inset-0 z-0 transition-all duration-700 ${overlayClass}`} />
        </>
      )}

      {/* ── 主题 2 视频背景引擎（蓝色） ── */}
      {themeIndex === 2 && (
        <>
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover z-0"
            src="/third.mp4"
          />
          <div className={`absolute inset-0 z-0 transition-all duration-700 ${overlayClass}`} />
        </>
      )}

      {/* ── 主题 3 视频背景引擎（绿色） ── */}
      {themeIndex === 3 && (
        <>
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover z-0"
            src="/four.mp4"
          />
          <div className={`absolute inset-0 z-0 transition-all duration-700 ${overlayClass}`} />
        </>
      )}

      <AnimeBackground />

      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4">

        {/* ── HOME：主页 ── */}
        {currentScreen === 'HOME' && (
          <HomeScreen
            themeIndex={themeIndex}
            onThemeChange={setThemeIndex}
            onShowTime={(task) => handleStartPractice(task)}
            onSelectTask={() => setCurrentScreen('TASK_LIST')}
            onCreateTask={() => setCurrentScreen('TASK_CREATE')}
          />
        )}

        {/* ── TASK_LIST：任务列表 ── */}
        {currentScreen === 'TASK_LIST' && (
          <TaskListScreen
            onStart={(task) => handleStartPractice(task)}
            onBack={() => setCurrentScreen('HOME')}
          />
        )}

        {/* ── TASK_CREATE：新建任务 ── */}
        {currentScreen === 'TASK_CREATE' && (
          <TaskCreateScreen
            onBack={() => setCurrentScreen('HOME')}
            onSaved={() => setCurrentScreen('HOME')}
          />
        )}

        {/* ── PRACTICE：练习中 ── */}
        {currentScreen === 'PRACTICE' && (
          <>
            {phase === GamePhase.INIT && (
              <div className="flex flex-col items-center gap-6">
                <h1 className="text-4xl font-bold text-purple-300 tracking-widest">
                  Piano Sight Reader
                </h1>
                <p className="text-gray-400 text-sm animate-pulse">正在请求麦克风权限…</p>
                {micError && (
                  <p className="text-red-400 text-sm mt-2">麦克风授权失败：{micError}</p>
                )}
              </div>
            )}

            {isPlaying(phase) && (
              <PracticeView
                phase={phase}
                stableNote={stableNote}
                clef={targetClef}
                score={score}
                combo={combo}
                noteColor={resolveNoteColor}
                listening={phase === GamePhase.LISTEN_TOLERANT}
                statusText={statusText}
                lastRating={lastRating}
                isSuccess={isSuccess}
                isStriking={isStriking}
                onRenderReady={notifyRenderComplete}
                onBack={handleGoHome}
              />
            )}
          </>
        )}

      </main>
    </div>
  )
}

/* ============================================================
   ThemeSwitcher — ⊕ 顺时针主题状态机
   ============================================================ */

interface ThemeSwitcherProps {
  themeIndex: number
  onChange:   (index: number) => void
}

function ThemeSwitcher({ themeIndex, onChange }: ThemeSwitcherProps) {
  const handleClick = () => {
    onChange((themeIndex + 1) % 4)
  }

  // 顺时针：左上→右上→右下→左下
  // 激活色：pink → purple → blue → green
  const isActive = (pos: number) => themeIndex === pos

  return (
    <button
      onClick={handleClick}
      className="
        fixed top-4 right-4 z-50
        w-10 h-10 rounded-full
        grid grid-cols-2 grid-rows-2 gap-0.5
        overflow-hidden p-0.5
        bg-white/10 hover:bg-white/15
        border border-white/10
        transition-all duration-200
        active:scale-95
      "
      title="切换主题"
    >
      {/* 左上 — 粉红 pink */}
      <span
        className={`rounded-tl-full transition-colors duration-300 ${
          isActive(0) ? 'bg-pink-500' : 'bg-white/5'
        }`}
      />
      {/* 右上 — 紫色 purple */}
      <span
        className={`rounded-tr-full transition-colors duration-300 ${
          isActive(1) ? 'bg-purple-500' : 'bg-white/5'
        }`}
      />
      {/* 左下 — 绿色 green */}
      <span
        className={`rounded-bl-full transition-colors duration-300 ${
          isActive(3) ? 'bg-green-500' : 'bg-white/5'
        }`}
      />
      {/* 右下 — 蓝色 blue */}
      <span
        className={`rounded-br-full transition-colors duration-300 ${
          isActive(2) ? 'bg-blue-500' : 'bg-white/5'
        }`}
      />
    </button>
  )
}

/* ============================================================
   HomeScreen — 主页
   ============================================================ */

interface HomeScreenProps {
  themeIndex:    number
  onThemeChange: (index: number) => void
  onShowTime:    (task: PracticeTask) => void
  onSelectTask:  () => void
  onCreateTask:  () => void
}

function HomeScreen({ themeIndex, onThemeChange, onShowTime, onSelectTask, onCreateTask }: HomeScreenProps) {
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(timer)
  }, [toast])

  const handleShowTime = () => {
    const tasks = loadTasks()
    if (tasks.length === 0) {
      setToast('暂无保存的任务，请先创建任务')
      return
    }
    const randomTask = tasks[Math.floor(Math.random() * tasks.length)]!
    onShowTime(randomTask)
  }

  return (
    <div className="relative flex flex-col items-center gap-8">
      {/* ── ThemeSwitcher：右上角 ⊕ 主题切换器 ── */}
      <ThemeSwitcher themeIndex={themeIndex} onChange={onThemeChange} />

      <h1 className="text-5xl font-bold text-purple-300 tracking-widest">
        Piano Sight Reader
      </h1>
      <p className="text-gray-500 text-sm">视奏练习引擎</p>

      <div className="flex flex-col gap-4 w-72">
        <button
          onClick={handleShowTime}
          className="
            w-full px-8 py-5 text-lg font-bold rounded-2xl
            bg-purple-600 hover:bg-purple-500 active:scale-[0.98]
            text-white shadow-lg shadow-purple-900/60
            transition-all duration-150
            border border-purple-400/30
          "
        >
          Show Time
        </button>

        <button
          onClick={onSelectTask}
          className="
            w-full px-8 py-5 text-lg font-bold rounded-2xl
            bg-white/5 hover:bg-white/10 active:scale-[0.98]
            text-gray-300 hover:text-white
            border border-white/10 hover:border-white/20
            transition-all duration-150
          "
        >
          选择任务
        </button>

        <button
          onClick={onCreateTask}
          className="
            w-full px-8 py-5 text-lg font-bold rounded-2xl
            bg-white/5 hover:bg-white/10 active:scale-[0.98]
            text-gray-300 hover:text-white
            border border-white/10 hover:border-white/20
            transition-all duration-150
          "
        >
          创造任务
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="
          fixed bottom-8 left-1/2 -translate-x-1/2 z-50
          px-6 py-3 rounded-xl
          bg-amber-500/90 text-white text-sm font-medium
          shadow-lg backdrop-blur-sm
          animate-pulse
        ">
          {toast}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   TaskListScreen — 任务列表
   ============================================================ */

interface TaskListScreenProps {
  onStart: (task: PracticeTask) => void
  onBack:  () => void
}

function TaskListScreen({ onStart, onBack }: TaskListScreenProps) {
  const [tasks, setTasks] = useState<PracticeTask[]>(loadTasks)

  const handleDelete = (id: string) => {
    const updated = deleteTask(id)
    setTasks(updated)
  }

  return (
    <div className="w-full max-w-md flex flex-col gap-4">
      <h1 className="text-3xl font-bold text-purple-300 tracking-widest text-center">
        Piano Sight Reader
      </h1>
      <h2 className="text-gray-400 text-sm uppercase tracking-widest text-center">
        选择任务
      </h2>

      {tasks.length === 0 ? (
        <p className="text-gray-600 text-sm text-center italic">
          暂无保存的任务，请先创建任务
        </p>
      ) : (
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => onStart(task)}
              className="
                flex items-center justify-between gap-2 p-4 rounded-xl
                bg-white/5 border border-white/10
                hover:bg-white/10 hover:border-purple-400/30
                transition-all duration-150 text-left w-full
              "
            >
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate">{task.name}</p>
                <p className="text-gray-500 text-xs">
                  {task.notePool.length} 个音符{task.useFlats ? ' · 降号优先' : ''}
                </p>
              </div>
              <span
                onClick={(e) => { e.stopPropagation(); handleDelete(task.id) }}
                className="
                  px-3 py-1.5 text-xs rounded-lg
                  bg-red-500/20 hover:bg-red-500/40
                  text-red-400 transition-colors flex-shrink-0
                "
              >
                删除
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={onBack}
        className="
          mt-2 px-6 py-3 text-sm rounded-xl
          bg-white/5 hover:bg-white/10 active:scale-[0.98]
          text-gray-400 hover:text-gray-300
          border border-white/10 hover:border-white/20
          transition-all duration-150
        "
      >
        返回主页
      </button>
    </div>
  )
}

/* ============================================================
   TaskCreateScreen — 新建任务
   ============================================================ */

interface TaskCreateScreenProps {
  onBack:  () => void
  onSaved: () => void
}

function TaskCreateScreen({ onBack, onSaved }: TaskCreateScreenProps) {
  const [name, setName] = useState('')
  const [notePool, setNotePool] = useState<number[]>([])
  const [useFlats, setUseFlats] = useState(false)

  const [rangeFrom, setRangeFrom] = useState(PIANO_MIN_MIDI)
  const [rangeTo, setRangeTo] = useState(PIANO_MIN_MIDI)

  const handleRangeAdd = () => {
    const from = Math.min(rangeFrom, rangeTo)
    const to   = Math.max(rangeFrom, rangeTo)
    const newNotes: number[] = []
    for (let m = from; m <= to; m++) {
      if (!notePool.includes(m)) newNotes.push(m)
    }
    if (newNotes.length === 0) return
    setNotePool([...notePool, ...newNotes].sort((a, b) => a - b))
  }

  const toggleNote = (midi: number) => {
    if (notePool.includes(midi)) {
      setNotePool(notePool.filter((m) => m !== midi))
    } else {
      setNotePool([...notePool, midi].sort((a, b) => a - b))
    }
  }

  const clearPool = () => setNotePool([])

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (notePool.length === 0) return
    const tasks = loadTasks()
    saveTasks([...tasks, {
      id: generateId(),
      name: trimmed,
      notePool: [...notePool],
      useFlats,
    }])
    onSaved()
  }

  const octaveGroups = useCallback(() => {
    const groups: { octave: number; notes: number[] }[] = []
    for (let oct = 0; oct <= 8; oct++) {
      const notes: number[] = []
      for (let s = 0; s < 12; s++) {
        const midi = (oct + 1) * 12 + s
        if (midi >= PIANO_MIN_MIDI && midi <= PIANO_MAX_MIDI) {
          notes.push(midi)
        }
      }
      if (notes.length > 0) groups.push({ octave: oct, notes })
    }
    return groups
  }, [])

  const groups = octaveGroups()

  return (
    <div className="w-full max-w-lg flex flex-col gap-5">
      <h1 className="text-3xl font-bold text-purple-300 tracking-widest text-center">
        Piano Sight Reader
      </h1>
      <h2 className="text-gray-400 text-sm uppercase tracking-widest text-center">
        新建任务
      </h2>

      {/* 任务名称 */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="输入任务名称…"
        className="
          w-full px-4 py-3 rounded-xl
          bg-white/5 border border-white/10
          text-white text-sm placeholder:text-gray-600
          focus:outline-none focus:border-purple-400/50
          transition-colors
        "
      />

      {/* 池构建器 */}
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-gray-300 text-sm font-medium">音符池</h3>
          <span className="text-gray-500 text-xs">{notePool.length} 个音符</span>
        </div>

        {/* 区间快速添加 */}
        <div className="flex items-center gap-2 mb-4">
          <select
            value={rangeFrom}
            onChange={(e) => setRangeFrom(Number(e.target.value))}
            className="flex-1 px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-purple-400/50"
          >
            {ALL_MIDI_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="text-gray-500 text-xs">至</span>
          <select
            value={rangeTo}
            onChange={(e) => setRangeTo(Number(e.target.value))}
            className="flex-1 px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-purple-400/50"
          >
            {ALL_MIDI_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={handleRangeAdd}
            className="px-3 py-2 text-xs rounded-lg bg-purple-600/80 hover:bg-purple-500 text-white transition-colors flex-shrink-0"
          >
            添加
          </button>
        </div>

        {/* 已选音符预览 chips */}
        {notePool.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3 max-h-24 overflow-y-auto">
            {notePool.slice(0, 40).map((midi) => (
              <span
                key={midi}
                onClick={() => toggleNote(midi)}
                className={`
                  inline-flex items-center px-2 py-0.5 text-xs rounded-md cursor-pointer
                  transition-colors select-none
                  ${isBlackKey(midi)
                    ? 'bg-amber-500/20 text-amber-300 hover:bg-red-500/30'
                    : 'bg-white/10 text-gray-300 hover:bg-red-500/30'
                  }
                `}
              >
                {midiToLabel(midi)}
                <span className="ml-1 text-gray-500">×</span>
              </span>
            ))}
            {notePool.length > 40 && (
              <span className="text-gray-500 text-xs self-center">
                …还有 {notePool.length - 40} 个
              </span>
            )}
          </div>
        )}

        {notePool.length > 0 && (
          <button
            onClick={clearPool}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors mb-3"
          >
            清空全部
          </button>
        )}

        {/* 单音点选：八度分组按钮网格 */}
        <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto pr-1">
          {groups.map(({ octave, notes }) => (
            <div key={octave} className="flex items-center gap-1">
              <span className="text-gray-600 text-xs w-7 flex-shrink-0 text-right">
                {octave}
              </span>
              <div className="flex flex-wrap gap-0.5">
                {notes.map((midi) => {
                  const selected = notePool.includes(midi)
                  const black   = isBlackKey(midi)
                  const label   = midiToLabel(midi)
                  const shortLabel = label.replace(/\d+$/, '')
                  return (
                    <button
                      key={midi}
                      onClick={() => toggleNote(midi)}
                      title={label}
                      className={`
                        text-[10px] leading-none rounded-md transition-colors select-none
                        ${black ? 'w-7 h-7' : 'w-7 h-8'}
                        ${selected
                          ? black
                            ? 'bg-amber-500 text-white'
                            : 'bg-purple-500 text-white'
                          : black
                            ? 'bg-white/[0.03] text-gray-600 hover:bg-amber-500/30 hover:text-amber-300'
                            : 'bg-white/5 text-gray-500 hover:bg-purple-500/30 hover:text-purple-300'
                        }
                      `}
                    >
                      {shortLabel}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 降号优先开关 */}
      <div className="flex items-center justify-between">
        <label className="text-gray-400 text-xs uppercase tracking-widest">
          优先使用降号 (b)
        </label>
        <button
          onClick={() => setUseFlats(!useFlats)}
          className={`
            relative w-12 h-6 rounded-full overflow-hidden transition-colors duration-200
            ${useFlats ? 'bg-amber-500' : 'bg-white/10'}
          `}
        >
          <span
            className={`
              absolute top-0.5 w-5 h-5 rounded-full bg-white
              transition-all duration-200
              ${useFlats ? 'left-[calc(100%-1.25rem-0.125rem)]' : 'left-0.5'}
            `}
          />
        </button>
      </div>

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={!name.trim() || notePool.length === 0}
        className="
          w-full px-8 py-4 text-lg font-bold rounded-2xl
          bg-purple-600 hover:bg-purple-500 active:scale-[0.98]
          text-white shadow-lg shadow-purple-900/60
          transition-all duration-150
          border border-purple-400/30
          disabled:opacity-30 disabled:cursor-not-allowed
          disabled:hover:bg-purple-600 disabled:active:scale-100
        "
      >
        保存任务
      </button>

      <button
        onClick={onBack}
        className="
          px-6 py-3 text-sm rounded-xl
          bg-white/5 hover:bg-white/10 active:scale-[0.98]
          text-gray-400 hover:text-gray-300
          border border-white/10 hover:border-white/20
          transition-all duration-150
        "
      >
        返回主页
      </button>
    </div>
  )
}

/* ============================================================
   PracticeView — 练习视图（常驻五线谱）
   ============================================================ */

interface PracticeViewProps {
  phase: GamePhase
  stableNote: string | null
  clef: 'treble' | 'bass' | null
  score: number
  combo: number
  noteColor?: string
  listening: boolean
  statusText: string | null
  lastRating: 'perfect' | 'great' | 'good' | null
  isSuccess: boolean | null
  isStriking: boolean
  onRenderReady: () => void
  onBack: () => void
}

function PracticeView({
  phase, stableNote, clef, score, combo,
  noteColor, listening, statusText, lastRating, isSuccess, isStriking,
  onRenderReady, onBack,
}: PracticeViewProps) {
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (phase !== GamePhase.RENDER) return
    renderTimerRef.current = setTimeout(onRenderReady, 600)
    return () => {
      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current)
        renderTimerRef.current = null
      }
    }
  }, [phase, onRenderReady])

  return (
    <div className="relative flex flex-col items-center gap-6 w-full max-w-2xl">
      <ScoreBar score={score} combo={combo} />

      {/* ── 评级文字 ── */}
      {phase === GamePhase.RESOLVE && lastRating && (
        <p className={`text-xl font-bold tracking-widest animate-bounce ${
          lastRating === 'perfect' ? 'text-yellow-300' :
          lastRating === 'great' ? 'text-green-400' : 'text-blue-400'
        }`}>
          {lastRating === 'perfect' ? 'Perfect!' : lastRating === 'great' ? 'Great!' : 'Good!'}
        </p>
      )}

      {phase === GamePhase.RESOLVE && !lastRating && (
        <p className={`text-lg ${
          noteColor === '#22c55e' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'
        }`}>
          {statusText}
        </p>
      )}

      {phase !== GamePhase.RESOLVE && statusText && (
        <p className="text-lg text-gray-400">{statusText}</p>
      )}

      {phase === GamePhase.GENERATE && !stableNote && (
        <p className="text-gray-400 text-xl animate-pulse">正在生成题目…</p>
      )}

      {stableNote && (
        <div className="glass-panel p-4 w-full">
          <VexFlowStaff
            targetNote={stableNote}
            listening={listening}
            noteColor={noteColor}
            clef={clef ?? undefined}
          />
        </div>
      )}

      {phase === GamePhase.LISTEN_TOLERANT && (
        <p className={`text-sm animate-pulse ${
          isStriking ? 'text-yellow-400' : 'text-purple-400/60'
        }`}>
          {isStriking ? '检测到击弦…' : '正在监听…'}
        </p>
      )}

      <button
        onClick={onBack}
        className="
          mt-4 px-6 py-2 text-sm rounded-xl
          bg-white/5 hover:bg-white/10 active:scale-[0.98]
          text-gray-400 hover:text-gray-300
          border border-white/10 hover:border-white/20
          transition-all duration-150
        "
      >
        返回主页
      </button>
    </div>
  )
}

/* ============================================================
   ScoreBar — 分数栏（动效 + 阈值变色 + 失误惩罚）
   ============================================================ */

interface ScoreBarProps {
  score: number
  combo: number
}

function ScoreBar({ score, combo }: ScoreBarProps) {
  const prevComboRef = useRef(combo)
  const [comboPop, setComboPop] = useState(false)
  const [missFlash, setMissFlash] = useState(false)

  useEffect(() => {
    const prev = prevComboRef.current
    if (combo > prev && combo > 0) {
      setComboPop(true)
      const timer = setTimeout(() => setComboPop(false), 300)
      prevComboRef.current = combo
      return () => clearTimeout(timer)
    }
    if (combo === 0 && prev > 0) {
      setMissFlash(true)
      const timer = setTimeout(() => setMissFlash(false), 500)
      prevComboRef.current = combo
      return () => clearTimeout(timer)
    }
    prevComboRef.current = combo
  }, [combo])

  // 阈值颜色
  const comboColorClass =
    combo >= 50 ? 'text-red-400 animate-pulse' :
    combo >= 10 ? 'text-yellow-400' :
    'text-white'

  return (
    <>
      {/* 失误闪红叠加层 */}
      {missFlash && (
        <div className="fixed inset-0 z-40 pointer-events-none bg-red-500/20 transition-opacity duration-300" />
      )}

      <div className="flex gap-8 text-center">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-widest">Score</p>
          <p className="text-2xl font-bold text-purple-300">{score}</p>
        </div>
        {combo > 0 && (
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-widest">Combo</p>
            <p
              className={`text-2xl font-bold transition-transform duration-300 ${
                comboPop ? 'scale-125' : 'scale-100'
              } ${comboColorClass}`}
            >
              {combo}×
            </p>
          </div>
        )}
      </div>
    </>
  )
}

export default App