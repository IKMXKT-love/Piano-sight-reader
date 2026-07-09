/**
 * usePianoAudioEngine — 稳定版音频检测引擎（修复 19000Hz + Ghost Loop）
 *
 * 架构变更（vs 崩溃版）：
 *   ✅ fftSize 回到 2048（42.7ms @48kHz，F2-C3 也有 3.7 周期）
 *   ✅ 移除单帧延迟（直接当前帧 YIN，不再跳过击弦瞬态）
 *   ✅ YIN 显式传入 threshold 0.15（比默认 0.1 更稳健）
 *   ✅ RAF 清理：世代计数 + cancelledRef 双重互斥，杜绝幽灵循环
 *   ✅ RMS 阈值设为 0.01（匹配历史版本，排除量化底噪伪触）
 *   ✅ 每 100ms 打印一次诊断日志（与历史版本行为一致）
 *
 * 容忍监听（Tolerant Listening）:
 *   - 只对匹配目标频率的音符做命中判定
 *   - 错误音高完全忽略，不做任何处理
 *   - 超时由上层 useGameLoop 的 setTimeout 管理
 */

import { useRef, useCallback, useEffect } from 'react'
import { YIN } from 'pitchfinder'

// ============================================================
// 常量（与历史成功版本对齐）
// ============================================================

/** fftSize = 2048：@48kHz 窗口 42.7ms，C4≈11 周期，F2≈3.7 周期 */
const FFT_SIZE = 2048

/** RMS 起音阈值：排除量化底噪，超过视为有真实音频输入 */
const ONSET_RMS_THRESHOLD = 0.01

/** 频率匹配容差：±3% */
const FREQ_TOLERANCE_RATIO = 0.03

/** 命中后防抖冷却 ms（防同音多击） */
const HIT_COOLDOWN_MS = 300

/** YIN 可信度阈值：默认 0.1 → 提升至 0.15，减少噪声伪基频 */
const YIN_THRESHOLD = 0.15

// ============================================================
// 音频资源句柄
// ============================================================

interface AudioPipeline {
  audioCtx: AudioContext
  source:   MediaStreamAudioSourceNode
  analyser: AnalyserNode
  stream:   MediaStream
}

// ============================================================
// 回调接口
// ============================================================

export interface AudioEngineCallbacks {
  onHit: () => void
}

// ============================================================
// Hook 返回接口
// ============================================================

export interface UsePianoAudioEngineReturn {
  startEngine:   () => Promise<boolean>
  destroyEngine: () => void
  setTarget:     (targetHz: number) => void
  clearTarget:   () => void
}

// ============================================================
// Hook 实现
// ============================================================

export function usePianoAudioEngine(
  callbacks: AudioEngineCallbacks,
): UsePianoAudioEngineReturn {
  // ── Refs ──
  const pipelineRef       = useRef<AudioPipeline | null>(null)
  const targetHzRef       = useRef<number | null>(null)
  const rafIdRef          = useRef<number>(0)
  const lastHitTimeRef    = useRef<number>(0)
  const cancelledRef      = useRef(true)  // 初始为 true，startEngine 中置 false
  const callbacksRef      = useRef(callbacks)
  const generationRef     = useRef(0)

  // 保持回调引用最新
  useEffect(() => { callbacksRef.current = callbacks }, [callbacks])

  // ── 构建 DSP 管线 ──────────────────────────────────────────
  //
  // ⚠ TAURI_MIGRATION: buildPipeline 是迁移的核心靶点。
  //    当前依赖两个 Web API，在 Tauri 移动端将被完全替换：
  //
  //   [标记点 A] navigator.mediaDevices.getUserMedia (第 ~97 行)
  //       → 替换为 Tauri Rust 侧原生麦克风采集，
  //         前端通过 @tauri-apps/api/event 的 listen() 接收 PCM 流。
  //
  //   [标记点 B] new AudioContext() (第 ~106 行)
  //       → AudioContext 在 Android WebView 中受限于 AGC/降噪，
  //         迁移后仅保留 AnalyserNode 本地逻辑，数据源改为 Rust 推送。
  //
  //   替换方案：
  //     - Rust 侧：cpal + pitchfinder (或 YIN 纯 Rust 实现) 完成采集+基频提取
  //     - 前端：listen('pitch-detected', (e) => { onNativePitch(e.payload) })
  //     - bridge: tauri::Emitter 推送检测结果给 WebView
  // ────────────────────────────────────────────────────────────

  const buildPipeline = useCallback(async (): Promise<AudioPipeline> => {
    // ⚠ [标记点 A] — Tauri 迁移时移除整个 getUserMedia 调用
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression:  false,
        autoGainControl:   false,
      },
      video: false,
    })

    // ⚠ [标记点 B] — Tauri 迁移时 AudioContext 仅在本地做 FFT 分析，
    //   数据源从 MediaStream 切换为 Rust 推送的裸 PCM
    const audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended') {
      console.log('[AudioEngine] AudioContext 挂起，正在唤醒…')
      await audioCtx.resume()
      console.log('[AudioEngine] AudioContext 唤醒成功, state:', audioCtx.state)
    }

    const source   = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize               = FFT_SIZE
    analyser.smoothingTimeConstant  = 0  // 不做平滑，保持原始波形

    source.connect(analyser)

    // 连接到 destination（静音）以保证浏览器不暂停音频处理管线
    // 创建一个增益为 0 的节点连接到底，保持管线活跃
    const dummyGain = audioCtx.createGain()
    dummyGain.gain.value = 0
    analyser.connect(dummyGain)
    dummyGain.connect(audioCtx.destination)

    return { audioCtx, source, analyser, stream }
  }, [])

  // ── 计算 RMS ──

  function computeRMS(buf: Float32Array): number {
    let sum = 0
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i]!
      sum += v * v
    }
    return Math.sqrt(sum / buf.length)
  }

  // ── 销毁引擎（双重保险：cancelledRef + rafIdRef） ──

  const destroyEngine = useCallback(() => {
    // 第一道锁：置取消标志，loop 下次迭代立即退出
    cancelledRef.current = true

    // 第二道锁：取消已排期的 RAF
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = 0
    }

    // 销毁音频管线
    const p = pipelineRef.current
    if (p) {
      try { p.source.disconnect()     } catch (_) { /* ignore */ }
      try { p.analyser.disconnect()   } catch (_) { /* ignore */ }
      p.stream.getTracks().forEach((t) => t.stop())
      void p.audioCtx.close()
      pipelineRef.current = null
    }

    targetHzRef.current = null
    lastHitTimeRef.current = 0
  }, [])

  // ── 启动引擎（世代计数防 StrictMode 双调用） ──

  const startEngine = useCallback(async (): Promise<boolean> => {
    const gen = ++generationRef.current

    // 先彻底杀死旧引擎
    destroyEngine()
    cancelledRef.current = false  // 重置取消标志

    console.log(`[AudioEngine] 启动引擎… (gen ${gen})`)
    const pipeline = await buildPipeline()

    // 世代校验：如果在 await 期间有更新调用，丢弃当前管线
    if (generationRef.current !== gen) {
      console.warn(`[AudioEngine] gen ${gen} 已过期 (当前 ${generationRef.current})，丢弃`)
      try { pipeline.source.disconnect()     } catch (_) {}
      try { pipeline.analyser.disconnect()   } catch (_) {}
      pipeline.stream.getTracks().forEach((t) => t.stop())
      void pipeline.audioCtx.close()
      return false
    }

    pipelineRef.current = pipeline
    lastHitTimeRef.current = 0
    console.log('[AudioEngine] 管线就绪, sampleRate:', pipeline.audioCtx.sampleRate, 'Hz')

    // 启动 RAF 主循环
    startLoop(pipeline)

    console.log('[AudioEngine] RAF 主循环已启动')
    return true
    // startLoop 不在依赖数组中因为它是纯函数，每次都重新创建闭包
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildPipeline, destroyEngine])

  // ── 设置 / 清除目标频率 ──

  const setTarget = useCallback((hz: number) => {
    targetHzRef.current = hz
    lastHitTimeRef.current = 0
  }, [])

  const clearTarget = useCallback(() => {
    targetHzRef.current = null
  }, [])

  // ── RAF 主循环（作为独立函数，非 useCallback，防止闭包陷阱） ──

  function startLoop(pipeline: AudioPipeline) {
    // 预分配 buffer（2048 个 float），复用避免 GC
    const buffer      = new Float32Array(FFT_SIZE)
    const detectPitch = YIN({
      sampleRate: pipeline.audioCtx.sampleRate,
      threshold:  YIN_THRESHOLD,
    })
    let lastDiagTime = 0

    const loop = () => {
      // ── 取消标志检查：必须在 schedule 下一帧之前 ──
      if (cancelledRef.current) {
        rafIdRef.current = 0
        return
      }

      // 排期下一帧
      rafIdRef.current = requestAnimationFrame(loop)

      const target = targetHzRef.current
      if (target === null) return  // 无目标，休眠

      // ── Step 1: 提取时域 PCM ──
      pipeline.analyser.getFloatTimeDomainData(buffer)

      // ── Step 2: RMS 唤醒 ──
      const rms = computeRMS(buffer)

      // 每 100ms 打印诊断日志
      const now = Date.now()
      if (now - lastDiagTime >= 100) {
        lastDiagTime = now
        console.log(
          `[AudioEngine] RMS:${rms.toFixed(4)} thresh:${ONSET_RMS_THRESHOLD} ` +
          `${rms > ONSET_RMS_THRESHOLD ? '🔊' : '🤫'}`
        )
      }

      if (rms < ONSET_RMS_THRESHOLD) return

      // ── Step 3: 防抖冷却 ──
      if (now - lastHitTimeRef.current < HIT_COOLDOWN_MS) return

      // ── Step 4: YIN 频率检测（无单帧延迟，直接当前帧） ──
      try {
        const freq = detectPitch(buffer)

        if (freq === null || freq <= 0) return // 环境噪声，无可用基频

        const ratio = Math.abs(freq - target) / target
        console.log(`[AudioEngine] 🎯 freq=${freq.toFixed(2)} target=${target.toFixed(2)} ratio=${(ratio * 100).toFixed(1)}%`)

        if (ratio <= FREQ_TOLERANCE_RATIO) {
          console.log('[AudioEngine] 💥 命中目标!')
          lastHitTimeRef.current = now
          callbacksRef.current.onHit()
        }
      } catch (err) {
        console.error('[AudioEngine] pitchfinder 异常:', err)
      }
    }

    // 启动第一帧
    rafIdRef.current = requestAnimationFrame(loop)
  }

  // ── 组件卸载清理 ──

  useEffect(() => {
    return () => { destroyEngine() }
  }, [destroyEngine])

  return { startEngine, destroyEngine, setTarget, clearTarget }
}
