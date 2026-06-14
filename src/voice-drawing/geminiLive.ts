import { parseRealtimeDrawOperation, type RealtimeConnection, type RealtimeDrawCommand } from './realtimeAi'

export interface GeminiLiveStatus {
  readonly available: boolean
  readonly reason: string
  readonly model: string
}

export interface GeminiLiveToken {
  readonly provider: 'gemini-live'
  readonly model: string
  readonly accessToken: {
    readonly value: string
    readonly expiresAt?: string
  }
  readonly websocketUrl: string
}

export interface GeminiLiveParsedToolCall {
  readonly toolCallId: string
  readonly command: RealtimeDrawCommand
}

type FetchLike = typeof fetch
type WebSocketLike = Pick<WebSocket, 'send' | 'close' | 'readyState' | 'onopen' | 'onmessage' | 'onerror' | 'onclose'>

export async function fetchGeminiLiveStatus(fetcher: FetchLike = fetch): Promise<GeminiLiveStatus> {
  try {
    const response = await fetcher('/api/realtime/status')
    if (!response.ok) return { available: false, reason: 'Gemini Live status request failed', model: 'gemini-3.1-flash-live-preview' }
    const body = (await response.json()) as { geminiLive?: GeminiLiveStatus }
    return body.geminiLive ?? { available: false, reason: 'Gemini Live status missing', model: 'gemini-3.1-flash-live-preview' }
  } catch {
    return {
      available: false,
      reason: 'API 服务未启动，请运行 npm run dev:api',
      model: 'gemini-3.1-flash-live-preview',
    }
  }
}

export async function createGeminiLiveToken(fetcher: FetchLike = fetch): Promise<GeminiLiveToken> {
  const response = await fetcher('/api/realtime/gemini/token', { method: 'POST' })
  const body = (await response.json()) as Partial<GeminiLiveToken> & { message?: string }
  if (!response.ok) throw new Error(body.message ?? 'Gemini Live token 创建失败。')
  if (body.provider !== 'gemini-live' || !body.model || !body.accessToken?.value || !body.websocketUrl) throw new Error('Gemini Live token 返回格式无效。')
  return {
    provider: 'gemini-live',
    model: body.model,
    accessToken: {
      value: body.accessToken.value,
      expiresAt: body.accessToken.expiresAt,
    },
    websocketUrl: body.websocketUrl,
  }
}

export function buildGeminiLiveSetupMessage(model: string) {
  return {
    setup: {
      model: `models/${model}`,
      generationConfig: {
        responseModalities: ['TEXT'],
      },
      systemInstruction: {
        parts: [
          {
            text: [
              '你是 AI 语音绘图工具的实时意图解析器。',
              '用户边说边画。听到清晰绘图意图时调用 emit_draw_operations。',
              'isFinal=false 用于预览；用户停顿、意图完整、或破坏性操作确认后 isFinal=true。',
              '破坏性操作 clear/delete/undo/redo/export 必须等待明确最终意图。',
              '只输出受控 DrawOperation，不要解释。',
            ].join('\n'),
          },
        ],
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'emit_draw_operations',
              description: 'Emit structured drawing operations for the voice drawing canvas.',
              parameters: {
                type: 'object',
                properties: {
                  normalizedText: { type: 'string' },
                  confidence: { type: 'number' },
                  isFinal: { type: 'boolean' },
                  operations: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        action: { type: 'string' },
                        kind: { type: 'string' },
                        shape: { type: 'string' },
                        assetId: { type: 'string' },
                        text: { type: 'string' },
                        fill: { type: 'string' },
                        stroke: { type: 'string' },
                        position: { type: 'string' },
                        size: { type: 'string' },
                        x: { type: 'number' },
                        y: { type: 'number' },
                        width: { type: 'number' },
                        height: { type: 'number' },
                      },
                    },
                  },
                },
                required: ['normalizedText', 'confidence', 'isFinal', 'operations'],
              },
            },
          ],
        },
      ],
      inputAudioTranscription: {},
    },
  }
}

export function parseGeminiLiveMessage(message: unknown): GeminiLiveParsedToolCall[] {
  if (!isRecord(message) || !isRecord(message.toolCall) || !Array.isArray(message.toolCall.functionCalls)) return []
  return message.toolCall.functionCalls
    .map((call): GeminiLiveParsedToolCall | null => {
      if (!isRecord(call) || call.name !== 'emit_draw_operations' || !isRecord(call.args)) return null
      const operations = Array.isArray(call.args.operations)
        ? call.args.operations.map(parseRealtimeDrawOperation).filter((operation): operation is RealtimeDrawCommand['operations'][number] => Boolean(operation))
        : []
      if (operations.length === 0) return null
      return {
        toolCallId: typeof call.id === 'string' ? call.id : '',
        command: {
          provider: 'gemini-live',
          normalizedText: typeof call.args.normalizedText === 'string' ? call.args.normalizedText : '',
          confidence: typeof call.args.confidence === 'number' ? Math.max(0, Math.min(1, call.args.confidence)) : 0.7,
          isFinal: call.args.isFinal === true,
          operations,
        },
      }
    })
    .filter((entry): entry is GeminiLiveParsedToolCall => Boolean(entry))
}

export async function connectGeminiLive(options: {
  readonly onDrawCommand: (command: RealtimeDrawCommand) => void
  readonly onStatus?: (status: string) => void
  readonly createToken?: () => Promise<GeminiLiveToken>
  readonly getUserMedia?: typeof navigator.mediaDevices.getUserMedia
  readonly websocketFactory?: (url: string) => WebSocketLike
  readonly fetcher?: FetchLike
  readonly audioContextFactory?: () => AudioContext
}): Promise<RealtimeConnection> {
  const getUserMedia = options.getUserMedia ?? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
  if (!getUserMedia) throw new Error('当前浏览器不支持麦克风采集。')

  options.onStatus?.('Gemini Live 创建 token 中')
  const token = await (options.createToken ?? (() => createGeminiLiveToken(options.fetcher)))()
  const websocket = options.websocketFactory?.(token.websocketUrl) ?? new WebSocket(token.websocketUrl)
  const stream = await getUserMedia({ audio: true })
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
  const context = options.audioContextFactory?.() ?? new AudioContextConstructor({ sampleRate: 16_000 })
  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(4096, 1, 1)
  source.connect(processor)
  processor.connect(context.destination)

  websocket.onopen = () => {
    websocket.send(JSON.stringify(buildGeminiLiveSetupMessage(token.model)))
    options.onStatus?.('Gemini Live 聆听中')
  }
  websocket.onmessage = (event) => {
    try {
      const parsed = parseGeminiLiveMessage(JSON.parse(String(event.data)))
      for (const entry of parsed) {
        options.onDrawCommand(entry.command)
        sendGeminiToolResponse(websocket, entry)
      }
    } catch {
      // Ignore malformed provider events; stream should stay alive.
    }
  }
  websocket.onerror = () => options.onStatus?.('Gemini Live WebSocket 错误')
  websocket.onclose = (event) => options.onStatus?.(buildGeminiLiveCloseStatus(event))

  processor.onaudioprocess = (event) => {
    if (websocket.readyState !== WebSocket.OPEN) return
    const channel = event.inputBuffer.getChannelData(0)
    websocket.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            data: float32ToPcm16Base64(channel),
            mimeType: 'audio/pcm;rate=16000',
          },
        },
      }),
    )
  }

  return {
    stop: () => {
      processor.disconnect()
      source.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
      websocket.close()
    },
  }
}

export function buildGeminiLiveCloseStatus(event: Pick<CloseEvent, 'code' | 'reason'>): string {
  if (!event.reason && (event.code === 1005 || event.code === 1000)) return 'Gemini Live 已断开'
  return `Gemini Live 已断开: ${event.code}${event.reason ? ` ${event.reason}` : ''}`
}

function sendGeminiToolResponse(websocket: WebSocketLike, entry: GeminiLiveParsedToolCall) {
  websocket.send(
    JSON.stringify({
      toolResponse: {
        functionResponses: [
          {
            id: entry.toolCallId,
            name: 'emit_draw_operations',
            response: { ok: true },
          },
        ],
      },
    }),
  )
}

function float32ToPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
