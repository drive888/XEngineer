import { ArrowRight, Check, Cloud, History, Mic, MicOff, RotateCcw, RotateCw, Send, Square, Trash2 } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tldraw, type Editor, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import { createInitialCanvasState, executeOperations, executeOperationsWithTimeline, serializeSvg, type CanvasItem, type ExecuteResult } from './voice-drawing/executor'
import { parseCommandWithAi, planStrokesWithAi } from './voice-drawing/aiCommandParser'
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
const strokePlannerIntentPattern = /风景|场景|森林|海边|山|河|湖|城市|街道|草原|草地|花园|天空|动物园|房间|公园|一片/

function shouldUseAiParser(text: string, confidence: number, needsConfirmation: boolean) {
  if (/太阳/.test(text) && /云/.test(text) && confidence >= 0.9 && !needsConfirmation) return false
  return needsConfirmation || confidence < 0.75 || aiIntentPattern.test(text)
}

function shouldUseAiStrokePlanner(text: string, parsedOperations: DrawOperation[]) {
  return parsedOperations.length === 0 && strokePlannerIntentPattern.test(text)
}

function speakExecutionErrors(result: ExecuteResult, speak: (text: string) => void) {
  if (result.errors.length > 0) speak(result.errors.join('；'))
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function createLocalStrokeFallback(text: string): DrawOperation[] {
  if (/森林|树/.test(text)) {
    return [
      strokePath('green', [
        [78, 452],
        [190, 438],
        [312, 458],
        [460, 440],
        [612, 456],
        [818, 444],
      ]),
      strokePath('#166534', [
        [94, 490],
        [240, 500],
        [384, 486],
        [560, 496],
        [798, 486],
      ]),
      ...createSketchTree(150, 230, 0.9),
      ...createSketchTree(352, 196, 1.12),
      ...createSketchTree(602, 238, 0.82),
      { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'yellow', stroke: 'orange', x: 680, y: 82, width: 82, height: 82, selected: false },
    ]
  }
  if (/草原|草地|草坪/.test(text)) {
    return [
      strokePath('green', [
        [70, 356],
        [220, 342],
        [360, 364],
        [520, 344],
        [830, 356],
      ]),
      strokePath('#22c55e', [
        [90, 386],
        [240, 398],
        [410, 380],
        [604, 394],
        [800, 386],
      ]),
      strokePath('#15803d', [
        [126, 420],
        [280, 410],
        [450, 430],
        [650, 412],
        [776, 420],
      ]),
      strokePath('#166534', [
        [72, 454],
        [270, 462],
        [468, 448],
        [640, 458],
        [818, 454],
      ]),
      strokeLine(116, 430, 38, 8, '#166534', -64),
      strokeLine(214, 438, 44, 8, '#166534', -58),
      strokeLine(424, 442, 46, 8, '#166534', -62),
      strokeLine(632, 440, 42, 8, '#166534', -60),
      { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'yellow', stroke: 'orange', x: 168, y: 410, width: 22, height: 22, selected: false },
      { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'pink', stroke: '#be185d', x: 548, y: 418, width: 18, height: 18, selected: false },
    ]
  }
  return [
    strokePath('green', [
      [80, 420],
      [240, 410],
      [420, 432],
      [610, 416],
      [800, 422],
    ]),
    strokePath('#166534', [
      [110, 460],
      [284, 470],
      [480, 456],
      [770, 462],
    ]),
    { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'cyan', stroke: '#38bdf8', x: 120, y: 94, width: 86, height: 86, selected: false },
    { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'yellow', stroke: 'orange', x: 674, y: 78, width: 92, height: 92, selected: false },
    ...createSketchTree(380, 230, 1),
  ]
}

function createSketchTree(x: number, y: number, scale: number): DrawOperation[] {
  return [
    { action: 'create', kind: 'shape', shape: 'rectangle', fill: 'brown', stroke: 'black', x: Math.round(x + 48 * scale), y: Math.round(y + 108 * scale), width: Math.round(34 * scale), height: Math.round(138 * scale), selected: false },
    strokePath('green', [
      [Math.round(x + 4 * scale), Math.round(y + 86 * scale)],
      [Math.round(x + 32 * scale), Math.round(y + 38 * scale)],
      [Math.round(x + 92 * scale), Math.round(y + 16 * scale)],
      [Math.round(x + 160 * scale), Math.round(y + 48 * scale)],
      [Math.round(x + 188 * scale), Math.round(y + 102 * scale)],
      [Math.round(x + 120 * scale), Math.round(y + 136 * scale)],
      [Math.round(x + 42 * scale), Math.round(y + 128 * scale)],
      [Math.round(x + 4 * scale), Math.round(y + 86 * scale)],
    ]),
    { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'green', stroke: 'black', x: Math.round(x + 44 * scale), y: Math.round(y), width: Math.round(132 * scale), height: Math.round(118 * scale), selected: false },
    strokeLine(Math.round(x + 64 * scale), Math.round(y + 156 * scale), Math.round(56 * scale), 4, 'brown', -28),
    strokeLine(Math.round(x + 76 * scale), Math.round(y + 178 * scale), Math.round(48 * scale), 4, 'brown', 24),
  ]
}

function strokePath(stroke: string, points: [number, number][]): DrawOperation {
  return { action: 'create', kind: 'shape', shape: 'path', fill: stroke, stroke, points, selected: false }
}

function strokeLine(x: number, y: number, width: number, height: number, stroke: string, rotation: number): DrawOperation {
  return { action: 'create', kind: 'shape', shape: 'line', fill: stroke, stroke, x, y, width, height, rotation, selected: false }
}

function containsLocalAssetOperation(operations: DrawOperation[]) {
  return operations.some((operation) => operation.action === 'create' && operation.kind === 'asset')
}

export function App() {
  const [route, setRoute] = useState(() => window.location.pathname)

  useEffect(() => {
    const handlePopState = () => setRoute(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigateToWorkspace = useCallback(() => {
    window.history.pushState({}, '', '/workspace')
    setRoute('/workspace')
  }, [])

  if (route !== '/workspace') return <LandingPage onStart={navigateToWorkspace} />
  return <WorkspaceApp />
}

function LandingPage({ onStart }: { onStart: () => void }) {
  const waveformBars = [28, 46, 34, 62, 42, 70, 52, 38, 64, 48, 72, 44, 58, 36, 66, 50, 40, 60]

  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="产品导航">
        <div className="brand-mark">
          <span className="brand-icon">
            <Mic aria-hidden="true" />
          </span>
          <span>DrawLess</span>
        </div>
        <div className="landing-links">
          <a href="#features">功能</a>
          <a href="#examples">示例</a>
          <a href="#how">使用方法</a>
        </div>
        <div className="landing-actions">
          <button className="primary-cta" type="button" onClick={onStart}>
            <Mic aria-hidden="true" />
            进入工作区
          </button>
        </div>
      </nav>

      <section className="hero-section">
        <div className="hero-copy">
          <span className="hero-pill">Voice controlled drawing</span>
          <h1>说话时，画布跟着动起来</h1>
          <p>点击话筒或按空格开始录音，说出要画的内容，DrawLess 会把语音理解成绘图步骤，并在画布上一笔一画生成结果。</p>
          <div className="hero-buttons">
            <button className="primary-cta hero-start" type="button" onClick={onStart}>
              <Mic aria-hidden="true" />
              开始语音绘图
            </button>
            <a className="ghost-cta hero-example" href="#examples">
              查看示例
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
          <div className="trust-row" aria-label="产品特性">
            <span>
              <Check aria-hidden="true" />
              实时语音
            </span>
            <span>
              <Check aria-hidden="true" />
              AI 解析
            </span>
            <span>
              <Check aria-hidden="true" />
              逐笔绘制
            </span>
          </div>
        </div>

        <div className="product-preview" aria-label="语音绘图产品预览">
          <div className="preview-toolbar">
            <span>Live session</span>
            <span className="preview-status">正在监听</span>
          </div>

          <section className="preview-panel waveform-panel" aria-label="语音波形">
            <div className="preview-label">实时语音</div>
            <div className="waveform" aria-hidden="true">
              {waveformBars.map((height, index) => (
                <span key={index} style={{ '--bar-height': `${height}px` } as React.CSSProperties} />
              ))}
            </div>
          </section>

          <section className="preview-panel transcript-panel" aria-label="识别文本">
            <div className="preview-label">识别文本</div>
            <p>画一棵树在草地上，旁边再画一辆小汽车。</p>
          </section>

          <section className="preview-panel command-panel" aria-label="AI 指令">
            <div className="preview-label">AI 解析</div>
            <div className="command-card">
              <span>识别对象：树、草地、汽车</span>
              <span>布局关系：汽车在树旁边</span>
              <span>输出动作：分步骤绘制</span>
            </div>
          </section>

          <section className="preview-panel canvas-preview-panel" aria-label="画布预览">
            <div className="preview-label">逐笔绘制</div>
            <div className="mini-canvas">
              <div className="canvas-ground" aria-hidden="true" />
              <div className="canvas-tree-trunk" aria-hidden="true" />
              <div className="canvas-tree-crown" aria-hidden="true" />
              <div className="canvas-car-body" aria-hidden="true" />
              <div className="canvas-car-roof" aria-hidden="true" />
              <div className="canvas-car-wheel wheel-left" aria-hidden="true" />
              <div className="canvas-car-wheel wheel-right" aria-hidden="true" />
              <div className="canvas-note">录音结束后，仍可继续说“把车向右移一点”。</div>
            </div>
          </section>
        </div>
      </section>

      <section className="feature-section" id="features">
        <span className="section-kicker">功能</span>
        <h2>
          从语音到<span>可修改画布</span>
        </h2>
        <p>DrawLess 面向语音绘图创作：先听懂你说的内容，再拆成绘图动作，最后用逐步动画呈现出来。</p>
        <div className="feature-grid">
          <article>
            <h3>自然语言绘图</h3>
            <p>可以直接说“画一片草原”“画一棵树在车旁边”，不需要记固定模板。</p>
          </article>
          <article>
            <h3>过程可见</h3>
            <p>画面不是突然出现，而是按操作顺序逐步生成，更像人手在画布上完成。</p>
          </article>
          <article>
            <h3>继续追改</h3>
            <p>生成后还能继续说移动、改色、清空、添加新元素，逐步把画面调准。</p>
          </article>
        </div>
      </section>

      <section className="examples-section" id="examples">
        <span className="section-kicker">示例</span>
        <h2>看一次完整语音绘图过程</h2>
        <div className="demo-movie" aria-label="语音绘图操作动图演示">
          <div className="demo-sidebar">
            <div className="demo-mic">
              <Mic aria-hidden="true" />
            </div>
            <div>
              <span className="demo-status">示例演示</span>
              <p>按空格开始录音</p>
              <p>说：“画一片草原，再加太阳和云”</p>
              <p>再按一次结束录音</p>
            </div>
          </div>
          <div className="demo-canvas" aria-hidden="true">
            <div className="demo-sun" />
            <div className="demo-cloud cloud-a" />
            <div className="demo-cloud cloud-b" />
            <div className="demo-horizon" />
            <div className="demo-grass grass-a" />
            <div className="demo-grass grass-b" />
            <div className="demo-grass grass-c" />
            <div className="demo-cursor" />
          </div>
        </div>
        <div className="prompt-strip" aria-label="可测试语音示例">
          <span>画一片草原</span>
          <span>画一棵树在草原上</span>
          <span>清空画布后画一个火箭</span>
        </div>
      </section>

      <section className="how-section" id="how">
        <span className="section-kicker">使用方法</span>
        <h2>两种方式开始录音</h2>
        <div className="step-row">
          <span>进入工作区</span>
          <span>点击话筒按钮，或按空格开始录音</span>
          <span>说出要画或修改的内容</span>
          <span>再次点击按钮，或再按一次空格结束录音</span>
        </div>
        <button className="primary-cta section-cta" type="button" onClick={onStart}>
          进入工作区
        </button>
      </section>
    </main>
  )
}

function WorkspaceApp() {
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
  const [commandText, setCommandText] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
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
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new window.SpeechSynthesisUtterance(text)
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
      }, prefersReducedMotion ? 0 : index * 180)
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
        if (shouldUseAiStrokePlanner(text, parsed.operations)) {
          try {
            setStatus('AI 笔画规划中')
            const strokePlan = await planStrokesWithAi(text)
            const previousState = canvasStateRef.current
            const result = executeOperationsWithTimeline(previousState, strokePlan.operations)
            canvasStateRef.current = result.state
            setCanvasState(result.state)
            animateTimeline(previousState, result.timeline)
            const elapsed = Math.round(performance.now() - started)
            const message = [...result.messages, ...result.errors].join('；') || '无操作'
            setStatus(result.errors.length ? '执行失败' : `AI 笔画已执行 ${elapsed}ms`)
            speakExecutionErrors(result, speak)
            setLogs((entries) => [
              {
                id: logIdRef.current++,
                heard: text,
                normalized: strokePlan.normalizedText,
                operations: JSON.stringify(formatOperationsForLog(strokePlan.operations)),
                result: message,
                provider: strokePlan.provider,
              },
              ...entries,
            ])
            return
          } catch (error) {
            setStatus(error instanceof Error ? `AI 笔画失败，转旧路径：${error.message}` : 'AI 笔画失败，转旧路径')
            const fallbackOperations = createLocalStrokeFallback(text)
            const previousState = canvasStateRef.current
            const result = executeOperationsWithTimeline(previousState, fallbackOperations)
            canvasStateRef.current = result.state
            setCanvasState(result.state)
            animateTimeline(previousState, result.timeline)
            const elapsed = Math.round(performance.now() - started)
            const message = [...result.messages, ...result.errors].join('；') || '无操作'
            setStatus(result.errors.length ? '执行失败' : `本地笔画已执行 ${elapsed}ms`)
            speakExecutionErrors(result, speak)
            setLogs((entries) => [
              {
                id: logIdRef.current++,
                heard: text,
                normalized: text,
                operations: JSON.stringify(formatOperationsForLog(fallbackOperations)),
                result: message,
                provider: 'local-stroke-fallback',
              },
              ...entries,
            ])
            return
          }
        }
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
            speakExecutionErrors(result, speak)
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
          speakExecutionErrors(result, speak)
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
      speakExecutionErrors(result, speak)
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
      speakExecutionErrors(result, speak)
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

  const submitTypedCommand = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const text = commandText.trim()
      if (!text) return
      setCommandText('')
      void runCommand(text)
    },
    [commandText, runCommand],
  )

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
    const activeRecorder = bolnaRecorderRef.current
    if (activeRecorder) {
      bolnaRecorderRef.current = null
      activeRecorder.processor.disconnect()
      activeRecorder.source.disconnect()
      activeRecorder.stream.getTracks().forEach((track) => track.stop())
      void activeRecorder.context.close()
      setRecordingBolnaMimo(false)
      setStatus('Bolna MiMo 识别中')
      try {
        const audio = encodeWavBlob(activeRecorder.chunks, activeRecorder.sampleRate)
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

  const toggleVoiceConversation = useCallback(() => {
    if (recordingBolnaMimo || bolnaMimoStatus?.available) {
      void toggleBolnaMimoRecording()
      return
    }
    if (speech.supported) {
      if (speech.listening) {
        speech.stop()
        setStatus('Web Speech 已停止')
      } else {
        speech.start()
        setStatus('Web Speech 录音中')
      }
      return
    }
    setStatus(bolnaMimoStatus?.reason ?? '语音服务检测中')
  }, [bolnaMimoStatus, recordingBolnaMimo, speech, toggleBolnaMimoRecording])

  useEffect(() => {
    const handleSpaceToggle = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if (isEditableKeyboardTarget(event.target)) return
      event.preventDefault()
      toggleVoiceConversation()
    }

    window.addEventListener('keydown', handleSpaceToggle)
    return () => window.removeEventListener('keydown', handleSpaceToggle)
  }, [toggleVoiceConversation])

  const voiceConversationActive = recordingBolnaMimo || speech.listening
  const voiceConversationReady = bolnaMimoStatus?.available || speech.supported || bolnaMimoStatus === null

  return (
    <main className="app-shell fullscreen-shell">
      <section className="fullscreen-canvas" aria-label="全屏画布区域">
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
      </section>

      <div className="floating-status" aria-live="polite">
        <span>DrawLess</span>
        <span>{status}</span>
      </div>

      <button
        className="history-button"
        type="button"
        aria-label="查看对话历史"
        aria-expanded={historyOpen}
        onClick={() => setHistoryOpen((open) => !open)}
      >
        <History aria-hidden="true" />
      </button>

      {historyOpen ? (
        <section className="history-popover" aria-label="对话历史记录">
          <div className="history-popover-header">
            <span>历史记录</span>
          </div>
          <div className="history-popover-list">
            {logs.length === 0 ? (
              <p className="empty-history">暂无对话记录</p>
            ) : (
              logs.map((log) => (
                <article className="history-entry" key={log.id}>
                  <div className="log-heard">{log.heard}</div>
                  <div className="log-meta">provider: {log.provider}</div>
                  <div className="log-result">{log.result}</div>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      <form className={`floating-composer ${commandText.length > 24 ? 'is-expanded' : ''}`} aria-label="底部绘图对话框" onSubmit={submitTypedCommand}>
        <button
          className="composer-mic-button"
          type="button"
          onClick={toggleVoiceConversation}
          disabled={!voiceConversationReady}
          aria-label="话筒对话"
        >
          {voiceConversationActive ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
        </button>
        <label className="sr-only" htmlFor="typed-command">
          输入绘图指令
        </label>
        <textarea
          id="typed-command"
          value={commandText}
          onChange={(event) => setCommandText(event.target.value)}
          placeholder="要求后续变更"
          data-auto-grow="true"
          rows={commandText.length > 36 ? 2 : 1}
        />
        <button className="send-button" type="submit" aria-label="发送指令" disabled={!commandText.trim()}>
          <Send aria-hidden="true" />
        </button>
      </form>

      <div className="sr-only" aria-label="演示指令">
        {demoCommands.map(([label, command]) => (
          <button className="demo-command" key={command} type="button" onClick={() => runCommand(command)}>
            {label}
          </button>
        ))}
      </div>
      <div className="sr-only log-list">
        <span>
          Web Speech: {speech.supported ? '可用' : '不可用'}；Realtime AI:{' '}
          {realtimeAiStatus?.available ? `${realtimeAiStatus.model} 可用` : realtimeAiStatus?.reason || '检测中'}；Gemini Live: 待完成
        </span>
        <span>Bolna MiMo: {bolnaMimoStatus?.available ? '可用' : bolnaMimoStatus?.reason || '检测中'}</span>
        <button type="button" onClick={toggleBolnaMimoRecording}>
          {recordingBolnaMimo ? '结束 MiMo' : 'Bolna MiMo'}
        </button>
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
  const renderedSvg = useMemo(
    () => renderItemAsRoughSvg(item),
    [
      item.assetId,
      item.assetLabel,
      item.externalElements,
      item.externalSource,
      item.fill,
      item.height,
      item.id,
      item.kind,
      item.points,
      item.rotation,
      item.shape,
      item.stroke,
      item.text,
      item.width,
      item.x,
      item.y,
    ],
  )
  return <g className={className} dangerouslySetInnerHTML={{ __html: renderedSvg }} />
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
  if (item.shape === 'path') {
    const points = item.points ?? []
    const d = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
    return (
      <g className={selection} transform={rotation}>
        <path d={d} fill="none" stroke={item.stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
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
