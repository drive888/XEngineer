import type { DrawOperation, PositionName, ShapeKind, SizeName } from './types'

export interface RealtimeAiStatus {
  readonly available: boolean
  readonly reason: string
  readonly model: string
}

export interface OpenAIRealtimeSession {
  readonly provider: 'openai-realtime'
  readonly model: string
  readonly clientSecret: {
    readonly value: string
    readonly expiresAt?: number
  }
}

export interface RealtimeDrawCommand {
  readonly provider?: string
  readonly operations: DrawOperation[]
  readonly normalizedText: string
  readonly confidence: number
  readonly isFinal: boolean
}

export interface RealtimeConnection {
  readonly stop: () => void
}

type FetchLike = typeof fetch

export async function fetchRealtimeAiStatus(fetcher: FetchLike = fetch): Promise<RealtimeAiStatus> {
  try {
    const response = await fetcher('/api/realtime/status')
    if (!response.ok) {
      return {
        available: false,
        reason: 'Realtime AI status request failed',
        model: 'gpt-realtime',
      }
    }
    const body = (await response.json()) as { openaiRealtime?: RealtimeAiStatus }
    return body.openaiRealtime ?? {
      available: false,
      reason: 'Realtime AI status missing',
      model: 'gpt-realtime',
    }
  } catch {
    return {
      available: false,
      reason: 'API 服务未启动，请运行 npm run dev:api',
      model: 'gpt-realtime',
    }
  }
}

export async function createOpenAIRealtimeSession(fetcher: FetchLike = fetch): Promise<OpenAIRealtimeSession> {
  const response = await fetcher('/api/realtime/openai/session', { method: 'POST' })
  const body = (await response.json()) as Partial<OpenAIRealtimeSession> & { message?: string }
  if (!response.ok) throw new Error(body.message ?? 'Realtime AI 会话创建失败。')
  if (body.provider !== 'openai-realtime' || !body.clientSecret?.value || !body.model) {
    throw new Error('Realtime AI 会话返回格式无效。')
  }
  return {
    provider: 'openai-realtime',
    model: body.model,
    clientSecret: {
      value: body.clientSecret.value,
      expiresAt: body.clientSecret.expiresAt,
    },
  }
}

export function parseRealtimeDrawEvent(event: unknown): RealtimeDrawCommand | null {
  if (!isRecord(event)) return null
  if (event.type !== 'response.function_call_arguments.done') return null
  if (event.name !== 'emit_draw_operations') return null
  if (typeof event.arguments !== 'string') return null

  try {
    const payload = JSON.parse(event.arguments) as unknown
    if (!isRecord(payload) || !Array.isArray(payload.operations)) return null
    return {
      normalizedText: typeof payload.normalizedText === 'string' ? payload.normalizedText : '',
      confidence: parseConfidence(payload.confidence),
      isFinal: payload.isFinal === true,
      operations: payload.operations.map(parseRealtimeDrawOperation).filter((operation): operation is DrawOperation => Boolean(operation)),
    }
  } catch {
    return null
  }
}

export async function connectOpenAIRealtime(options: {
  readonly onDrawCommand: (command: RealtimeDrawCommand) => void
  readonly onStatus?: (status: string) => void
  readonly createSession?: () => Promise<OpenAIRealtimeSession>
  readonly getUserMedia?: typeof navigator.mediaDevices.getUserMedia
  readonly peerConnectionFactory?: () => RTCPeerConnection
  readonly fetcher?: FetchLike
}): Promise<RealtimeConnection> {
  const createSession = options.createSession ?? (() => createOpenAIRealtimeSession(options.fetcher))
  const getUserMedia = options.getUserMedia ?? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
  if (!getUserMedia) throw new Error('当前浏览器不支持麦克风采集。')

  options.onStatus?.('Realtime AI 创建会话中')
  const session = await createSession()
  const peerConnection = options.peerConnectionFactory?.() ?? new RTCPeerConnection()
  const dataChannel = peerConnection.createDataChannel('oai-events')
  const stream = await getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream))

  dataChannel.onmessage = (message) => {
    try {
      const parsed = parseRealtimeDrawEvent(JSON.parse(String(message.data)))
      if (parsed && parsed.operations.length > 0) options.onDrawCommand(parsed)
    } catch {
      // Ignore malformed provider events; the stream should stay alive.
    }
  }

  options.onStatus?.('Realtime AI 连接中')
  const offer = await peerConnection.createOffer()
  await peerConnection.setLocalDescription(offer)
  const response = await (options.fetcher ?? fetch)('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.clientSecret.value}`,
      'Content-Type': 'application/sdp',
    },
    body: offer.sdp ?? '',
  })
  if (!response.ok) throw new Error(`Realtime AI WebRTC 连接失败: ${response.status} ${await readRealtimeErrorMessage(response)}`)
  const answerSdp = await response.text()
  await peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp })
  options.onStatus?.('Realtime AI 聆听中')

  return {
    stop: () => {
      stream.getTracks().forEach((track) => track.stop())
      dataChannel.close()
      peerConnection.close()
    },
  }
}

async function readRealtimeErrorMessage(response: Response): Promise<string> {
  const text = await response.text()
  if (!text) return response.statusText || 'unknown error'
  try {
    const payload = JSON.parse(text) as unknown
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string') return payload.error.message
    if (isRecord(payload) && typeof payload.message === 'string') return payload.message
  } catch {
    // Fall back to provider text below.
  }
  return text
}

export function parseRealtimeDrawOperation(value: unknown): DrawOperation | null {
  if (!isRecord(value) || typeof value.action !== 'string') return null
  if (value.action === 'undo' || value.action === 'redo' || value.action === 'clear' || value.action === 'export') return { action: value.action }
  if (value.action === 'create') {
    const kind = value.kind
    if (kind !== 'shape' && kind !== 'text' && kind !== 'arrow' && kind !== 'asset') return null
    const operation: Extract<DrawOperation, { action: 'create' }> = compact({
      action: 'create',
      kind,
      shape: parseShape(value.shape),
      assetId: typeof value.assetId === 'string' ? value.assetId : undefined,
      text: typeof value.text === 'string' ? value.text.slice(0, 80) : undefined,
      fill: parseColor(value.fill),
      stroke: parseColor(value.stroke),
      position: parsePosition(value.position),
      size: parseSize(value.size),
      x: parseBoundedNumber(value.x, 0, 900),
      y: parseBoundedNumber(value.y, 0, 560),
      width: parseBoundedNumber(value.width, 24, 500),
      height: parseBoundedNumber(value.height, 24, 400),
    })
    return operation
  }
  if (value.action === 'update') {
    const operation: Extract<DrawOperation, { action: 'update' }> = compact({
      action: 'update',
      target: { type: 'last' as const },
      fill: parseColor(value.fill),
      stroke: parseColor(value.stroke),
      text: typeof value.text === 'string' ? value.text.slice(0, 80) : undefined,
    })
    return operation
  }
  if (value.action === 'move') {
    const operation: Extract<DrawOperation, { action: 'move' }> = compact({
      action: 'move',
      target: { type: 'last' as const },
      dx: parseBoundedNumber(value.dx, -300, 300),
      dy: parseBoundedNumber(value.dy, -300, 300),
    })
    return operation
  }
  if (value.action === 'resize' && typeof value.scale === 'number') return { action: 'resize', target: { type: 'last' }, scale: Math.min(3, Math.max(0.25, value.scale)) }
  if (value.action === 'delete' || value.action === 'select') return { action: value.action, target: { type: 'last' } }
  return null
}

function parseConfidence(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.7
}

function parseShape(value: unknown): ShapeKind | undefined {
  if (value === 'rectangle' || value === 'ellipse' || value === 'triangle' || value === 'diamond' || value === 'line') return value
  return undefined
}

function parsePosition(value: unknown): PositionName | undefined {
  if (value === 'top-left' || value === 'top' || value === 'top-right' || value === 'left' || value === 'center' || value === 'right' || value === 'bottom-left' || value === 'bottom' || value === 'bottom-right') return value
  return undefined
}

function parseSize(value: unknown): SizeName | undefined {
  if (value === 'small' || value === 'medium' || value === 'large') return value
  return undefined
}

function parseColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (/^(red|blue|green|yellow|black|white|gray|purple|orange|pink|brown|cyan)$/.test(value)) return value
  return undefined
}

function parseBoundedNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, value))
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
