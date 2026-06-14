import { Cloud, Mic, MicOff, RotateCcw, RotateCw, Square, Trash2 } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tldraw, type Editor, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import { createInitialCanvasState, executeOperations, executeOperationsWithTimeline, serializeSvg, type CanvasItem } from './voice-drawing/executor'
import { parseCommandWithAi } from './voice-drawing/aiCommandParser'
import { fetchBolnaMimoStatus, transcribeWithBolnaMimo, type BolnaMimoStatus } from './voice-drawing/bolnaMimoAsr'
import { fetchVoiceStatus, transcribeAudio, type VoiceServiceStatus } from './voice-drawing/cloudTranscribe'
import { createTimelineRevealFrames } from './voice-drawing/drawingAnimation'
import { hydrateExternalAssetOperations, resolveExternalLibraryAssetOperation } from './voice-drawing/excalidrawLibraryAssets'
import { parseVoiceCommand } from './voice-drawing/parser'
import { buildRealtimePreview, type RealtimePreview } from './voice-drawing/realtimePreview'
import { connectOpenAIRealtime, fetchRealtimeAiStatus, type RealtimeAiStatus, type RealtimeConnection, type RealtimeDrawCommand } from './voice-drawing/realtimeAi'
import { renderItemAsRoughSvg } from './voice-drawing/roughSvgRenderer'
import { projectItemsToTldrawShapes, projectSelectionToTldrawIds } from './voice-drawing/tldrawAdapter'
import type { DrawOperation } from './voice-drawing/types'
import { useSpeechRecognition } from './voice-drawing/useSpeechRecognition'
import { encodeWavBlob } from './voice-drawing/wavEncoder'

type LogEntry = {
  id: number
  heard: string
  normalized: string
  operations: string
  result: string
  provider: string
}

const initialState = createInitialCanvasState()
const tldrawComponents: TLComponents = {
  ActionsMenu: null,
  ContextMenu: null,
  DebugMenu: null,
  DebugPanel: null,
  HelpMenu: null,
  MainMenu: null,
  Minimap: null,
  NavigationPanel: null,
  PageMenu: null,
  QuickActions: null,
  StylePanel: null,
  Toolbar: null,
  ZoomMenu: null,
}
const demoCommands = [
  ['画红色圆形', '画一个红色圆形'],
  ['右上蓝矩形', '在右上角画一个大的蓝色矩形'],
  ['写欢迎', '写上欢迎使用'],
  ['改成绿色', '把刚才那个改成绿色'],
  ['右移一点', '向右移动一点'],
  ['简单流程图', '画一个开始到结束的简单流程图'],
  ['太阳和云', '画一个太阳旁边有几朵云'],
  ['树状图', '画树状图'],
  ['画大象', '画一头大象'],
  ['画猫', '画一只猫'],
  ['画树', '画一棵树'],
  ['画房子', '画一座房子'],
  ['画汽车', '画一辆小汽车'],
  ['画火箭', '画一艘火箭'],
  ['画机器人', '画一个机器人'],
  ['雪花图标', '画一个雪花数据仓库图标'],
  ['清空后火箭', '清空画布，然后画一个火箭'],
  ['树后清除火箭', '先画一棵树，清除画布后，画一个火箭'],
  ['登录页草图', '帮我画一个登录页面草图，有标题、输入框和按钮'],
] as const

const aiIntentPattern = /帮我|页面|草图|旁边|附近|多个|几个|三个|四个|一排|排列|对齐|步骤|流程|注册|登录|用户|看起来|更像|布局|界面|图标|太阳|云|房子|树/

function shouldUseAiParser(text: string, confidence: number, needsConfirmation: boolean) {
  if (/太阳/.test(text) && /云/.test(text) && confidence >= 0.9 && !needsConfirmation) return false
  return needsConfirmation || confidence < 0.75 || aiIntentPattern.test(text)
}

function containsLocalAssetOperation(operations: DrawOperation[]) {
  return operations.some((operation) => operation.action === 'create' && operation.kind === 'asset')
}

export function App() {
  const [canvasState, setCanvasState] = useState(initialState)
  const [renderState, setRenderState] = useState(initialState)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [status, setStatus] = useState('待命')
  const [voiceStatus, setVoiceStatus] = useState<VoiceServiceStatus | null>(null)
  const [bolnaMimoStatus, setBolnaMimoStatus] = useState<BolnaMimoStatus | null>(null)
  const [realtimeAiStatus, setRealtimeAiStatus] = useState<RealtimeAiStatus | null>(null)
  const [recordingCloud, setRecordingCloud] = useState(false)
  const [recordingBolnaMimo, setRecordingBolnaMimo] = useState(false)
  const [recordingRealtimeAi, setRecordingRealtimeAi] = useState(false)
  const [preview, setPreview] = useState<RealtimePreview | null>(null)
  const logIdRef = useRef(1)
  const canvasStateRef = useRef(initialState)
  const renderTimersRef = useRef<number[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const realtimeConnectionRef = useRef<RealtimeConnection | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const bolnaRecorderRef = useRef<{
    context: AudioContext
    processor: ScriptProcessorNode
    source: MediaStreamAudioSourceNode
    stream: MediaStream
    chunks: Float32Array[]
    sampleRate: number
  } | null>(null)

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 1.08
    window.speechSynthesis.speak(utterance)
  }, [])

  const animateTimeline = useCallback((previousState: typeof initialState, timeline: typeof initialState[]) => {
    renderTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    renderTimersRef.current = []
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const frames = prefersReducedMotion ? [timeline.at(-1) ?? previousState] : createTimelineRevealFrames(previousState, timeline)
    if (frames.length > 1) setStatus(`绘制中 1/${frames.length}`)
    frames.forEach((frame, index) => {
      const timer = window.setTimeout(() => {
        setRenderState(frame)
        if (frames.length > 1) setStatus(index === frames.length - 1 ? '绘制完成' : `绘制中 ${index + 2}/${frames.length}`)
      }, prefersReducedMotion ? 0 : index * 320)
      renderTimersRef.current.push(timer)
    })
  }, [])

  const runCommand = useCallback(
    async (text: string, provider = 'local-rules') => {
      setPreview(null)
      const started = performance.now()
      setStatus('理解中')
      const parsed = parseVoiceCommand(text)
      const hasLocalAssetOperation = containsLocalAssetOperation(parsed.operations)
      const executionProvider = provider === 'local-rules' && hasLocalAssetOperation ? 'local-asset' : provider

      if (provider !== 'ai-parser' && !hasLocalAssetOperation && shouldUseAiParser(text, parsed.confidence, parsed.needsConfirmation)) {
        try {
          setStatus('检索素材中')
          const externalOperation = await resolveExternalLibraryAssetOperation(text)
          if (externalOperation) {
            const previousState = canvasStateRef.current
            const result = executeOperationsWithTimeline(previousState, [externalOperation])
            canvasStateRef.current = result.state
            setCanvasState(result.state)
            animateTimeline(previousState, result.timeline)
            const elapsed = Math.round(performance.now() - started)
            const message = [...result.messages, ...result.errors].join('；') || '无操作'
            setStatus(result.errors.length ? '执行失败' : `素材已执行 ${elapsed}ms`)
            speak(message)
            setLogs((entries) => [
              {
                id: logIdRef.current++,
                heard: text,
                normalized: parsed.normalizedText,
                operations: JSON.stringify(formatOperationsForLog([externalOperation])),
                result: message,
                provider: 'local-asset',
              },
              ...entries,
            ])
            return
          }
        } catch (error) {
          setStatus(error instanceof Error ? `素材检索失败，转 AI：${error.message}` : '素材检索失败，转 AI')
        }
        try {
          setStatus('AI 理解中')
          const aiParsed = await parseCommandWithAi(text)
          const aiOperations = await hydrateExternalAssetOperations(aiParsed.operations)
          const previousState = canvasStateRef.current
          const result = executeOperationsWithTimeline(previousState, aiOperations)
          canvasStateRef.current = result.state
          setCanvasState(result.state)
          animateTimeline(previousState, result.timeline)
          const elapsed = Math.round(performance.now() - started)
          const message = [...result.messages, ...result.errors].join('；') || '无操作'
          setStatus(result.errors.length ? '执行失败' : `AI 已执行 ${elapsed}ms`)
          speak(message)
          setLogs((entries) => [
            {
              id: logIdRef.current++,
              heard: text,
              normalized: aiParsed.normalizedText,
              operations: JSON.stringify(formatOperationsForLog(aiOperations)),
              result: message,
              provider: aiParsed.provider,
            },
            ...entries,
          ])
          return
        } catch (error) {
          if (!parsed.needsConfirmation && parsed.operations.length > 0) {
            setStatus(error instanceof Error ? `AI 失败，使用本地规则：${error.message}` : 'AI 失败，使用本地规则')
          } else {
            setStatus(error instanceof Error ? error.message : 'AI 解析失败')
          }
        }
      }

      if (parsed.needsConfirmation) {
        setStatus('需要确认')
        speak(parsed.question)
        setLogs((current) => [
          {
            id: logIdRef.current++,
            heard: text,
            normalized: parsed.normalizedText,
            operations: '[]',
            result: parsed.question,
            provider: executionProvider,
          },
          ...current,
        ])
        return
      }

      const previousState = canvasStateRef.current
      setStatus('加载素材中')
      const operations = await hydrateExternalAssetOperations(parsed.operations)
      const result = executeOperationsWithTimeline(previousState, operations)
      canvasStateRef.current = result.state
      setCanvasState(result.state)
      animateTimeline(previousState, result.timeline)
      const elapsed = Math.round(performance.now() - started)
      const message = [...result.messages, ...result.errors].join('；') || '无操作'
      setStatus(result.errors.length ? '执行失败' : `已执行 ${elapsed}ms`)
      speak(message)
      setLogs((entries) => [
        {
          id: logIdRef.current++,
          heard: text,
          normalized: parsed.normalizedText,
          operations: JSON.stringify(formatOperationsForLog(operations)),
          result: message,
          provider: executionProvider,
        },
        ...entries,
      ])
    },
    [animateTimeline, speak],
  )

  const runRealtimeDrawCommand = useCallback(
    async (command: RealtimeDrawCommand) => {
      const safePreviewOperations = command.operations
        .filter((operation) => operation.action === 'create')
        .map((operation) => ({ ...operation, selected: false }))

      if (!command.isFinal) {
        if (safePreviewOperations.length === 0) return
        const result = executeOperations(canvasStateRef.current, safePreviewOperations)
        setPreview({
          key: command.normalizedText || JSON.stringify(safePreviewOperations),
          text: command.normalizedText || 'Realtime AI 草稿',
          state: result.state,
        })
        setStatus('Realtime AI 预览中')
        return
      }

      setPreview(null)
      const previousState = canvasStateRef.current
      setStatus('Realtime AI 执行中')
      const operations = await hydrateExternalAssetOperations(command.operations)
      const result = executeOperationsWithTimeline(previousState, operations)
      canvasStateRef.current = result.state
      setCanvasState(result.state)
      animateTimeline(previousState, result.timeline)
      const message = [...result.messages, ...result.errors].join('；') || '无操作'
      setStatus(result.errors.length ? '执行失败' : 'Realtime AI 已执行')
      speak(message)
      setLogs((entries) => [
        {
          id: logIdRef.current++,
          heard: command.normalizedText || 'Realtime AI',
          normalized: command.normalizedText,
          operations: JSON.stringify(formatOperationsForLog(operations)),
          result: message,
          provider: command.provider ?? 'openai-realtime',
        },
        ...entries,
      ])
    },
    [animateTimeline, speak],
  )

  useEffect(() => {
    return () => {
      renderTimersRef.current.forEach((timer) => window.clearTimeout(timer))
      realtimeConnectionRef.current?.stop()
    }
  }, [])

  const handleInterimText = useCallback((text: string) => {
    const nextPreview = buildRealtimePreview(canvasStateRef.current, text)
    if (nextPreview) setStatus('实时预览中')
    setPreview((current) => {
      if (!nextPreview) return current ? null : current
      if (current?.key === nextPreview.key) return current
      return nextPreview
    })
  }, [])

  const speech = useSpeechRecognition({
    onFinalText: runCommand,
    onInterimText: handleInterimText,
  })

  useEffect(() => {
    fetchVoiceStatus()
      .then(setVoiceStatus)
      .catch(() =>
        setVoiceStatus({
          transcribeAvailable: false,
          reason: 'Voice service is not reachable',
        }),
      )
  }, [])

  useEffect(() => {
    fetchBolnaMimoStatus()
      .then(setBolnaMimoStatus)
      .catch(() =>
        setBolnaMimoStatus({
          available: false,
          reason: 'Bolna MiMo status request failed',
        }),
      )
  }, [])

  useEffect(() => {
    fetchRealtimeAiStatus()
      .then(setRealtimeAiStatus)
      .catch(() =>
        setRealtimeAiStatus({
          available: false,
          reason: 'Realtime AI status request failed',
          model: 'gpt-realtime',
        }),
      )
  }, [])

  const runSystemOperation = useCallback(
    (text: string) => {
      runCommand(text)
    },
    [runCommand],
  )

  const exportHref = useMemo(() => {
    const svg = canvasState.exportedSvg ?? serializeSvg(canvasState.items)
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }, [canvasState.exportedSvg, canvasState.items])

  const displayedItems = preview?.state.items ?? renderState.items

  const toggleCloudRecording = useCallback(async () => {
    if (recordingCloud) {
      mediaRecorderRef.current?.stop()
      return
    }

    if (!voiceStatus?.transcribeAvailable) {
      setStatus(voiceStatus?.reason ?? '云端转写不可用')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('当前浏览器不支持麦克风录音')
      return
    }

    setStatus('云端录音中')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      setRecordingCloud(false)
      setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? '麦克风权限被拒绝，请在浏览器允许麦克风。' : '无法打开麦克风。')
      return
    }

    const recorderOptions = MediaRecorder.isTypeSupported?.('audio/webm') ? { mimeType: 'audio/webm' } : undefined
    const recorder = new MediaRecorder(stream, recorderOptions)
    audioChunksRef.current = []
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data)
    }
    recorder.onstop = async () => {
      setRecordingCloud(false)
      stream.getTracks().forEach((track) => track.stop())
      setStatus('云端转写中')
      try {
        const audio = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const text = await transcribeAudio(audio)
        setStatus('转写完成')
        runCommand(text)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '云端转写失败')
      }
    }

    recorder.start()
    setRecordingCloud(true)
  }, [recordingCloud, runCommand, voiceStatus])

  const toggleBolnaMimoRecording = useCallback(async () => {
    if (recordingBolnaMimo) {
      const recorder = bolnaRecorderRef.current
      if (!recorder) return
      bolnaRecorderRef.current = null
      recorder.processor.disconnect()
      recorder.source.disconnect()
      recorder.stream.getTracks().forEach((track) => track.stop())
      void recorder.context.close()
      setRecordingBolnaMimo(false)
      setStatus('Bolna MiMo 识别中')
      try {
        const audio = encodeWavBlob(recorder.chunks, recorder.sampleRate)
        const result = await transcribeWithBolnaMimo(audio)
        setStatus(`Bolna MiMo 已识别 ${result.latencyMs}ms`)
        runCommand(result.text, result.provider)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Bolna MiMo 识别失败')
      }
      return
    }

    if (!bolnaMimoStatus?.available) {
      setStatus(bolnaMimoStatus?.reason ?? 'Bolna MiMo 未配置')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('当前浏览器不支持麦克风录音')
      return
    }

    setStatus('Bolna MiMo 录音中')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      setRecordingBolnaMimo(false)
      setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? '麦克风权限被拒绝，请在浏览器允许麦克风。' : '无法打开麦克风。')
      return
    }

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextConstructor) {
      stream.getTracks().forEach((track) => track.stop())
      setStatus('当前浏览器不支持音频采集')
      return
    }
    const context = new AudioContextConstructor()
    const source = context.createMediaStreamSource(stream)
    const processor = context.createScriptProcessor(4096, 1, 1)
    const chunks: Float32Array[] = []
    processor.onaudioprocess = (event) => {
      chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
    }
    source.connect(processor)
    processor.connect(context.destination)
    bolnaRecorderRef.current = {
      context,
      processor,
      source,
      stream,
      chunks,
      sampleRate: context.sampleRate,
    }
    setRecordingBolnaMimo(true)
  }, [bolnaMimoStatus, recordingBolnaMimo, runCommand])

  const toggleRealtimeAiRecording = useCallback(async () => {
    if (recordingRealtimeAi) {
      realtimeConnectionRef.current?.stop()
      realtimeConnectionRef.current = null
      setRecordingRealtimeAi(false)
      setPreview(null)
      setStatus('Realtime AI 已停止')
      return
    }

    if (!realtimeAiStatus?.available) {
      setStatus(realtimeAiStatus?.reason ?? 'Realtime AI 未配置')
      return
    }

    try {
      setRecordingRealtimeAi(true)
      realtimeConnectionRef.current = await connectOpenAIRealtime({
        onDrawCommand: (command) => {
          void runRealtimeDrawCommand(command)
        },
        onStatus: setStatus,
      })
    } catch (error) {
      realtimeConnectionRef.current?.stop()
      realtimeConnectionRef.current = null
      setRecordingRealtimeAi(false)
      setStatus(error instanceof Error ? error.message : 'Realtime AI 连接失败')
    }
  }, [realtimeAiStatus, recordingRealtimeAi, runRealtimeDrawCommand])

  return (
    <main className="app-shell">
      <section className="control-strip" aria-label="语音控制">
        <div>
          <h1>AI 语音绘图工具</h1>
          <p className="status-line">{status}</p>
        </div>
        <div className="control-actions">
          <button
            className="icon-button primary"
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            disabled={!speech.supported}
          >
            {speech.listening ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
            <span>{speech.listening ? '停止' : '聆听'}</span>
          </button>
          <button className="icon-button" type="button" onClick={toggleCloudRecording}>
            {recordingCloud ? <Square aria-hidden="true" /> : <Cloud aria-hidden="true" />}
            <span>{recordingCloud ? '结束转写' : '云端转写'}</span>
          </button>
          <button className="icon-button" type="button" onClick={toggleBolnaMimoRecording}>
            {recordingBolnaMimo ? <Square aria-hidden="true" /> : <Cloud aria-hidden="true" />}
            <span>{recordingBolnaMimo ? '结束 MiMo' : 'Bolna MiMo'}</span>
          </button>
          <button className="icon-button" type="button" onClick={toggleRealtimeAiRecording}>
            {recordingRealtimeAi ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
            <span>{recordingRealtimeAi ? '结束实时 AI' : 'Realtime AI'}</span>
          </button>
          <button className="icon-button" type="button" onClick={() => runSystemOperation('撤销')}>
            <RotateCcw aria-hidden="true" />
            <span>撤销</span>
          </button>
          <button className="icon-button" type="button" onClick={() => runSystemOperation('重做')}>
            <RotateCw aria-hidden="true" />
            <span>重做</span>
          </button>
          <button className="icon-button danger" type="button" onClick={() => runSystemOperation('清空画布')}>
            <Trash2 aria-hidden="true" />
            <span>清空</span>
          </button>
        </div>
      </section>

      <section className="workspace">
        <div className="canvas-panel">
          <TldrawCanvasView items={[]} selectedItemIds={[]} />
          <svg className="drawing-canvas rough-canvas-overlay" viewBox="0 0 900 560" role="img" aria-label="语音绘图画布">
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#d9e1ec" strokeWidth="1" />
              </pattern>
            </defs>
            {displayedItems.map((item) => (
              <RoughCanvasItemView key={`${preview ? 'preview' : 'render'}-${item.id}`} item={item} preview={Boolean(preview)} />
            ))}
          </svg>
        </div>

        <aside className="side-panel" aria-label="执行日志">
          <div className="demo-panel" aria-label="演示指令">
            <span className="eyebrow">演示指令</span>
            <div className="demo-command-grid">
              {demoCommands.map(([label, command]) => (
                <button className="demo-command" key={command} type="button" onClick={() => runCommand(command)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="transcript-box">
            <span className="eyebrow">语音能力</span>
            <p>
              Web Speech: {speech.supported ? '可用' : '不可用'}；云端转写:{' '}
              {voiceStatus?.transcribeAvailable ? '可用' : voiceStatus?.reason || '检测中'}；Bolna MiMo:{' '}
              {bolnaMimoStatus?.available ? '可用' : bolnaMimoStatus?.reason || '检测中'}；Realtime AI:{' '}
              {realtimeAiStatus?.available ? `${realtimeAiStatus.model} 可用` : realtimeAiStatus?.reason || '检测中'}；Gemini Live: 待完成
            </p>
          </div>
          <div className="transcript-box">
            <span className="eyebrow">实时识别</span>
            <p>{preview ? `${speech.interimText}（草稿）` : speech.interimText || speech.error || '...'}</p>
          </div>
          <a className="download-link" href={exportHref} download="voice-drawing.svg">
            导出 SVG
          </a>
          <div className="log-list">
            {logs.map((log) => (
              <article className="log-item" key={log.id}>
                <div className="log-heard">{log.heard}</div>
                <div className="log-meta">{log.normalized}</div>
                <div className="log-meta">provider: {log.provider}</div>
                <code>{log.operations}</code>
                <div className="log-result">{log.result}</div>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </main>
  )
}

function TldrawCanvasView({ items, selectedItemIds }: { items: CanvasItem[]; selectedItemIds: string[] }) {
  const editorRef = useRef<Editor | null>(null)

  const syncEditor = useCallback((editor: Editor, nextItems: CanvasItem[], nextSelectedItemIds: string[]) => {
    const currentIds = [...editor.getCurrentPageShapeIds()]
    if (currentIds.length > 0) editor.deleteShapes(currentIds)
    const shapes = projectItemsToTldrawShapes(nextItems)
    if (shapes.length > 0) editor.createShapes(shapes)
    editor.setSelectedShapes(projectSelectionToTldrawIds(nextSelectedItemIds))
  }, [])

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      syncEditor(editor, items, selectedItemIds)
    },
    [items, selectedItemIds, syncEditor],
  )

  useEffect(() => {
    if (editorRef.current) syncEditor(editorRef.current, items, selectedItemIds)
  }, [items, selectedItemIds, syncEditor])

  return (
    <div className="tldraw-canvas" aria-label="tldraw 语音绘图画布">
      <Tldraw components={tldrawComponents} onMount={handleMount} />
    </div>
  )
}

const RoughCanvasItemView = memo(function RoughCanvasItemView({ item, preview = false }: { item: CanvasItem; preview?: boolean }) {
  const className = [item.selected ? 'selected-shape' : '', preview ? 'preview-shape' : ''].filter(Boolean).join(' ') || undefined
  return <g className={className} dangerouslySetInnerHTML={{ __html: renderItemAsRoughSvg(item) }} />
})

function formatOperationsForLog(operations: DrawOperation[]) {
  return operations.map((operation) => {
    if (operation.action !== 'create' || !operation.externalElements) return operation
    return {
      ...operation,
      externalElements: `[${operation.externalElements.length} excalidraw elements]`,
    }
  })
}

function CanvasItemView({ item }: { item: CanvasItem }) {
  const selection = item.selected ? 'selected-shape' : undefined
  const rotation = item.rotation ? `rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})` : undefined
  if (item.kind === 'text') {
    return (
      <text className={selection} x={item.x} y={item.y + 36} fill={item.fill} fontSize="30" fontWeight="700">
        {item.text}
      </text>
    )
  }
  if (item.kind === 'arrow') {
    return (
      <g className={selection} transform={rotation}>
        <line
          x1={item.x}
          y1={item.y + item.height / 2}
          x2={item.x + item.width}
          y2={item.y + item.height / 2}
          stroke={item.fill}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <polygon
          points={`${item.x + item.width},${item.y + item.height / 2} ${item.x + item.width - 14},${item.y + 2} ${item.x + item.width - 14},${item.y + item.height - 2}`}
          fill={item.fill}
        />
      </g>
    )
  }
  if (item.shape === 'ellipse') {
    return (
      <g className={selection} transform={rotation}>
        <ellipse
          cx={item.x + item.width / 2}
          cy={item.y + item.height / 2}
          rx={item.width / 2}
          ry={item.height / 2}
          fill={item.fill}
          stroke={item.stroke}
          strokeWidth="3"
        />
        {item.text ? <ShapeLabel item={item} /> : null}
      </g>
    )
  }
  if (item.shape === 'triangle') {
    const points = `${item.x + item.width / 2},${item.y} ${item.x + item.width},${item.y + item.height} ${item.x},${item.y + item.height}`
    return (
      <g className={selection} transform={rotation}>
        <polygon points={points} fill={item.fill} stroke={item.stroke} strokeWidth="3" />
        {item.text ? <ShapeLabel item={item} /> : null}
      </g>
    )
  }
  if (item.shape === 'diamond') {
    const points = `${item.x + item.width / 2},${item.y} ${item.x + item.width},${item.y + item.height / 2} ${item.x + item.width / 2},${item.y + item.height} ${item.x},${item.y + item.height / 2}`
    return (
      <g className={selection} transform={rotation}>
        <polygon points={points} fill={item.fill} stroke={item.stroke} strokeWidth="3" />
        {item.text ? <ShapeLabel item={item} /> : null}
      </g>
    )
  }
  return (
    <g className={selection} transform={rotation}>
      <rect
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        rx="14"
        fill={item.fill}
        stroke={item.stroke}
        strokeWidth="3"
      />
      {item.text ? <ShapeLabel item={item} /> : null}
    </g>
  )
}

function ShapeLabel({ item }: { item: CanvasItem }) {
  return (
    <text
      x={item.x + item.width / 2}
      y={item.y + item.height / 2 + 9}
      fill="#ffffff"
      fontSize="26"
      fontWeight="800"
      textAnchor="middle"
    >
      {item.text}
    </text>
  )
}
