import cors from 'cors'
import dotenv from 'dotenv'
import express, { type ErrorRequestHandler } from 'express'
import multer from 'multer'
import OpenAI, { toFile } from 'openai'
import type { DrawOperation, PositionName, ShapeKind, SizeName } from '../voice-drawing/types'
import { isVisualAssetId } from '../voice-drawing/visualAssets'

dotenv.config()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
})

interface TranscribeStatus {
  readonly transcribeAvailable: boolean
  readonly reason: string
}

interface TranscribeInput {
  readonly buffer: Buffer
  readonly filename: string
  readonly mimeType: string
}

type TranscribeAudioFile = (input: TranscribeInput) => Promise<string>
type TranscribeBolnaMimo = (input: TranscribeInput) => Promise<{ text: string; latencyMs: number }>
type ParseCommandWithAi = (input: { text: string }) => Promise<AiParseResult>
type CreateRealtimeSession = () => Promise<RealtimeSessionResult>

interface AiParseResult {
  readonly operations: DrawOperation[]
  readonly normalizedText: string
  readonly confidence: number
}

interface RealtimeSessionResult {
  readonly provider: 'openai-realtime'
  readonly model: string
  readonly clientSecret: {
    readonly value: string
    readonly expiresAt?: number
  }
}

interface CreateServerAppOptions {
  readonly transcribeAudioFile?: TranscribeAudioFile
  readonly transcribeBolnaMimo?: TranscribeBolnaMimo
  readonly parseCommandWithAi?: ParseCommandWithAi
  readonly createRealtimeSession?: CreateRealtimeSession
}

export function createServerApp(options: CreateServerAppOptions = {}) {
  const app = express()
  const transcribeAudioFile = options.transcribeAudioFile ?? transcribeWithOpenAI
  const transcribeBolnaMimo = options.transcribeBolnaMimo ?? transcribeWithBolnaMimo
  const parseCommandWithAi = options.parseCommandWithAi ?? parseWithOpenAI
  const createRealtimeSession = options.createRealtimeSession ?? createOpenAIRealtimeSession

  app.use(cors())
  app.use(express.json())

  app.get('/api/voice/status', (_request, response) => {
    response.json(getTranscribeStatus())
  })

  app.get('/api/asr/status', (_request, response) => {
    response.json({
      bolnaMimo: getBolnaMimoStatus(),
    })
  })

  app.get('/api/realtime/status', (_request, response) => {
    response.json({
      openaiRealtime: getOpenAIRealtimeStatus(),
    })
  })

  app.post('/api/realtime/openai/session', async (_request, response, next) => {
    try {
      const status = getOpenAIRealtimeStatus()
      if (!status.available) {
        response.status(503).json({
          error: 'REALTIME_UNAVAILABLE',
          message: status.reason,
        })
        return
      }

      response.json(await createRealtimeSession())
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/parse-command', async (request, response, next) => {
    try {
      const text = typeof request.body?.text === 'string' ? request.body.text.trim() : ''
      if (!text) {
        response.status(400).json({
          error: 'TEXT_REQUIRED',
          message: 'Command text is required',
        })
        return
      }

      const aiParserStatus = getAiParserStatus()
      if (!aiParserStatus.available) {
        response.status(503).json({
          error: 'AI_PARSER_UNAVAILABLE',
          message: aiParserStatus.reason,
        })
        return
      }

      const result = parseCommandResult(await parseCommandWithAi({ text }))
      response.json({
        ...result,
        provider: 'ai-parser',
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/transcribe', upload.single('audio'), async (request, response, next) => {
    try {
      const status = getTranscribeStatus()
      if (!status.transcribeAvailable) {
        response.status(503).json({
          error: 'TRANSCRIBE_UNAVAILABLE',
          message: status.reason,
        })
        return
      }

      if (!request.file) {
        response.status(400).json({
          error: 'AUDIO_REQUIRED',
          message: 'Upload an audio file in the audio form field',
        })
        return
      }

      const text = await transcribeAudioFile({
        buffer: request.file.buffer,
        filename: request.file.originalname || 'voice.webm',
        mimeType: request.file.mimetype || 'audio/webm',
      })

      response.json({
        text,
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/asr/bolna-mimo', upload.single('audio'), async (request, response, next) => {
    try {
      const status = getBolnaMimoStatus()
      if (!status.available) {
        response.status(503).json({
          error: 'BOLNA_MIMO_UNAVAILABLE',
          message: status.reason,
        })
        return
      }

      if (!request.file) {
        response.status(400).json({
          error: 'AUDIO_REQUIRED',
          message: 'Upload an audio file in the audio form field',
        })
        return
      }

      const result = await transcribeBolnaMimo({
        buffer: request.file.buffer,
        filename: request.file.originalname || 'voice.webm',
        mimeType: request.file.mimetype || 'audio/webm',
      })

      response.json({
        text: result.text,
        provider: 'bolna-mimo',
        model: 'mimo-v2.5-asr',
        latencyMs: result.latencyMs,
      })
    } catch (error) {
      next(error)
    }
  })

  app.use(errorHandler)

  return app
}

async function createOpenAIRealtimeSession(): Promise<RealtimeSessionResult> {
  const model = getRealtimeModel()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OPENAI_REALTIME_TIMEOUT_MS ?? 10_000))
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: createRealtimeSessionConfig(model),
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))
    const body = (await response.json()) as unknown
    if (!response.ok) throw new Error(readProviderError(body) || `OpenAI Realtime session request failed with ${response.status}`)
    if (!isRecord(body) || typeof body.value !== 'string') throw new Error('REALTIME_INVALID_RESPONSE')
    return {
      provider: 'openai-realtime',
      model,
      clientSecret: {
        value: body.value,
        expiresAt: typeof body.expires_at === 'number' ? body.expires_at : undefined,
      },
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('OpenAI Realtime session request timed out')
    throw error
  }
}

function createRealtimeSessionConfig(model: string) {
  return {
    type: 'realtime',
    model,
    instructions: [
      '你是 AI 语音绘图工具的实时意图解析器。',
      '用户边说边画。只在意图清楚时调用 emit_draw_operations。',
      '破坏性操作如 clear/delete/undo/redo/export 需要 final 或明确确认后才调用。',
      '把中文语音绘图意图转成受控 DrawOperation JSON。',
    ].join('\n'),
    tools: [
      {
        type: 'function',
        name: 'emit_draw_operations',
        description: 'Emit safe structured drawing operations for the voice drawing canvas.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            normalizedText: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            isFinal: { type: 'boolean' },
            operations: {
              type: 'array',
              maxItems: 12,
              items: {
                type: 'object',
                additionalProperties: true,
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
                required: ['action'],
              },
            },
          },
          required: ['normalizedText', 'confidence', 'isFinal', 'operations'],
        },
      },
    ],
  }
}

async function transcribeWithBolnaMimo(input: TranscribeInput): Promise<{ text: string; latencyMs: number }> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Number(process.env.BOLNA_MIMO_TIMEOUT_MS ?? 25_000))
    const response = await fetch(process.env.BOLNA_MIMO_API_URL!, {
      method: 'POST',
      headers: {
        'api-key': process.env.BOLNA_MIMO_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mimo-v2.5-asr',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: `data:${input.mimeType};base64,${input.buffer.toString('base64')}`,
                },
              },
            ],
          },
        ],
        asr_options: {
          language: 'zh',
        },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))
    const body = (await response.json()) as unknown
    if (!response.ok) {
      throw new Error(readProviderError(body) || `Bolna MiMo request failed with ${response.status}`)
    }
    const text = extractMimoTranscript(body)
    return {
      text,
      latencyMs: Date.now() - start,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Bolna MiMo request timed out')
    }
    throw error
  }
}

async function transcribeWithOpenAI(input: TranscribeInput): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    maxRetries: 0,
    timeout: 20_000,
  })
  const file = await toFile(input.buffer, input.filename, {
    type: input.mimeType,
  })
  const transcript = await client.audio.transcriptions.create({
    file,
    model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe',
    language: 'zh',
  })
  return transcript.text
}

async function parseWithOpenAI(input: { text: string }): Promise<AiParseResult> {
  const compatibleConfig = getCompatibleAiParserConfig()
  if (compatibleConfig) return parseWithCompatibleChat(input, compatibleConfig)

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      maxRetries: 0,
      timeout: Number(process.env.OPENAI_PARSE_TIMEOUT_MS ?? 20_000),
    })
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_PARSE_MODEL || 'gpt-4.1-mini',
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: [
            'You convert Chinese voice drawing commands into strict JSON.',
            'Return only JSON with keys: operations, normalizedText, confidence.',
            'Allowed operations:',
            '- create shape/text/arrow',
            '- create asset with assetId when object matches supported visual asset',
            '- update fill/stroke/text on target',
            '- move dx/dy target',
            '- resize scale target',
            '- delete/select target',
            '- undo/redo/clear/export',
            'Allowed shape: rectangle, ellipse, triangle, diamond, line.',
            'Allowed assetId: elephant, cat, treeDiagram, tree, house, car, rocket.',
            'Allowed colors: red, blue, green, yellow, black, white, gray, purple, orange, pink, brown, cyan.',
            'Allowed positions: top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right.',
            'Allowed sizes: small, medium, large.',
            'Canvas is 900x560. For polished layouts, include x/y/width/height on create operations.',
            'Use 3-12 create operations for pages, flows, scenes, animals, objects, and arrangements. Prefer roomy spacing, clear hierarchy, and varied object sizes.',
            'Sketch strategy: ellipse for heads/bodies/wheels/tree crowns; rectangle for trunks/doors/windows/vehicles; triangle for ears/roofs; line for whiskers/legs/branches/details.',
            'Keep ellipse circles round: width and height should match for circle-like objects.',
            'Never include markdown. Never include unsupported actions.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: input.text,
        },
      ],
    })
    const content = completion.choices[0]?.message?.content ?? ''
    return parseCommandResult(JSON.parse(extractJsonObject(content)))
  } catch (error) {
    if (isTimeoutError(error)) throw new Error('AI parser request timed out')
    throw error
  }
}

async function parseWithCompatibleChat(input: { text: string }, config: { url: string; apiKey: string; model: string }): Promise<AiParseResult> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_PARSER_TIMEOUT_MS ?? 20_000))
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: [
              '你是语音绘图工具的语义解析器。',
              '只返回 JSON，不要 markdown。',
              'JSON 格式: {"operations":[],"normalizedText":"","confidence":0.8}',
              '允许 action: create, update, move, resize, delete, select, undo, redo, clear, export。',
              '允许 kind: shape, text, arrow, asset。',
              '允许 shape: rectangle, ellipse, triangle, diamond, line。',
              '允许 assetId: elephant, cat, treeDiagram, tree, house, car, rocket。用户要求画这些对象时优先返回 create asset，而不是拼 ellipse/rectangle。',
              '允许颜色: red, blue, green, yellow, black, white, gray, purple, orange, pink, brown, cyan。',
              '不要使用允许列表外的颜色。树干/木头用 brown；天空/玻璃可用 cyan；皮肤/浅色主体可用 pink 或 orange。',
              '允许位置: top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right。',
              '允许尺寸: small, medium, large。',
              '画布尺寸 900x560。复杂页面/场景/动物/物体请拆成 3-12 个 create 操作，并优先给 create 操作添加 x、y、width、height。',
              '通用简笔画策略: 用 ellipse 表示身体/头/轮子/树冠；用 rectangle 表示躯干/车身/树干/门窗；用 triangle 表示耳朵/屋顶；用 line 表示胡须/腿/枝条/装饰线。',
              '坐标规则: x 0-900, y 0-560, width 24-500, height 24-400。页面草图要留边距、层级清楚、对象不要拥挤。',
              '创建文字时必须包含 text 和 fill:"black"。',
              '创建图形时必须包含 shape、fill；如果没有 x/y/width/height，才使用 position、size。',
              '圆/太阳/月亮等用 ellipse 时 width 必须等于 height。',
              '登录页示例: 标题 text x:330 y:64 width:240 height:40；卡片 rectangle white x:260 y:120 width:380 height:320；用户名框 rectangle gray x:310 y:190 width:280 height:56；密码框 rectangle gray x:310 y:270 width:280 height:56；按钮 rectangle blue x:340 y:360 width:220 height:60；按钮文字 text x:412 y:376 width:80 height:32。',
              '太阳和云示例: 太阳 yellow ellipse x:120 y:86 width:120 height:120；云用 2-3 个 gray ellipse 在右侧错位组合。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: input.text,
          },
        ],
        max_completion_tokens: 1400,
        temperature: 0.1,
        top_p: 0.95,
        stream: false,
        thinking: {
          type: 'disabled',
        },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))
    const body = (await response.json()) as unknown
    if (!response.ok) throw new Error(readProviderError(body) || `AI parser request failed with ${response.status}`)
    return parseCommandResult(JSON.parse(extractJsonObject(extractChatContent(body))))
  } catch (error) {
    if (isTimeoutError(error) || (error instanceof DOMException && error.name === 'AbortError')) throw new Error('AI parser request timed out')
    throw error
  }
}

function getTranscribeStatus(): TranscribeStatus {
  if (!process.env.OPENAI_API_KEY) {
    return {
      transcribeAvailable: false,
      reason: 'OPENAI_API_KEY is not configured',
    }
  }

  return {
    transcribeAvailable: true,
    reason: 'OpenAI transcription fallback is configured',
  }
}

function getAiParserStatus() {
  if (getCompatibleAiParserConfig() || process.env.OPENAI_API_KEY) {
    return {
      available: true,
      reason: 'AI parser is configured',
    }
  }
  return {
    available: false,
    reason: 'OPENAI_API_KEY or AI_PARSER_API_KEY is not configured',
  }
}

function getOpenAIRealtimeStatus() {
  return {
    available: Boolean(process.env.OPENAI_API_KEY),
    reason: process.env.OPENAI_API_KEY ? 'OpenAI Realtime is configured' : 'OPENAI_API_KEY is not configured',
    model: getRealtimeModel(),
  }
}

function getRealtimeModel() {
  const configured = process.env.OPENAI_REALTIME_MODEL
  if (!configured || configured === 'undefined' || configured === 'null') return 'gpt-realtime'
  return configured
}

function getCompatibleAiParserConfig() {
  if (!process.env.AI_PARSER_API_URL || !process.env.AI_PARSER_API_KEY) return null
  return {
    url: process.env.AI_PARSER_API_URL,
    apiKey: process.env.AI_PARSER_API_KEY,
    model: process.env.AI_PARSER_MODEL || 'mimo-v2.5-pro',
  }
}

function getBolnaMimoStatus() {
  const missing = [
    !process.env.BOLNA_MIMO_API_URL ? 'BOLNA_MIMO_API_URL' : '',
    !process.env.BOLNA_MIMO_API_KEY ? 'BOLNA_MIMO_API_KEY' : '',
  ].filter(Boolean)

  if (missing.length > 0) {
    return {
      available: false,
      reason: `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not configured`,
    }
  }

  return {
    available: true,
    reason: 'Bolna MiMo ASR is configured',
  }
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error'
  if (isTimeoutError(error)) {
    if (message.includes('AI parser')) {
      response.status(504).json({
        error: 'AI_PARSER_TIMEOUT',
        message: 'AI 解析超时，请重试或换短一点的描述。',
      })
      return
    }
    if (message.includes('Bolna MiMo')) {
      response.status(504).json({
        error: 'BOLNA_MIMO_TIMEOUT',
        message: 'Bolna MiMo 识别超时，请重试或缩短语音。',
      })
      return
    }
    response.status(504).json({
      error: 'TRANSCRIBE_TIMEOUT',
      message: '云端转写超时，请重试或缩短语音。',
    })
    return
  }

  if (isBolnaEndpointNotFound(error)) {
    response.status(502).json({
      error: 'BOLNA_MIMO_ENDPOINT_NOT_FOUND',
      message: '当前 Base URL 不支持 /audio/transcriptions，请提供 MiMo ASR 的完整转写接口地址。',
    })
    return
  }

  if (isBolnaAuthError(error)) {
    response.status(401).json({
      error: 'BOLNA_MIMO_AUTH_FAILED',
      message: 'Bolna MiMo API Key 无效，请重新复制专属 API key。',
    })
    return
  }

  if (isAiParserInvalidResponse(error)) {
    response.status(502).json({
      error: 'AI_PARSER_INVALID_RESPONSE',
      message: 'AI 解析返回了不支持的绘图操作。',
    })
    return
  }

  if (message === 'REALTIME_INVALID_RESPONSE') {
    response.status(502).json({
      error: 'REALTIME_INVALID_RESPONSE',
      message: 'Realtime AI 返回格式无效。',
    })
    return
  }

  response.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message,
  })
}

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) return false
  return error.name.includes('Timeout') || /timed out/i.test(error.message)
}

function isBolnaEndpointNotFound(error: unknown) {
  if (!(error instanceof Error)) return false
  return /404/.test(error.message) && /Not Found|openresty|audio\/transcriptions/i.test(error.message)
}

function isBolnaAuthError(error: unknown) {
  if (!(error instanceof Error)) return false
  return /Invalid API Key|unauthorized|401|forbidden|403/i.test(error.message)
}

function isAiParserInvalidResponse(error: unknown) {
  return error instanceof Error && (error.message === 'AI_PARSER_INVALID_RESPONSE' || error instanceof SyntaxError)
}

function parseCommandResult(value: unknown): AiParseResult {
  if (!isRecord(value) || !Array.isArray(value.operations)) throw new Error('AI_PARSER_INVALID_RESPONSE')
  const operations = value.operations.map(parseDrawOperation)
  return {
    operations,
    normalizedText: typeof value.normalizedText === 'string' ? value.normalizedText : '',
    confidence: typeof value.confidence === 'number' && Number.isFinite(value.confidence) ? clamp(value.confidence, 0, 1) : 0.7,
  }
}

function parseDrawOperation(value: unknown): DrawOperation {
  if (!isRecord(value) || typeof value.action !== 'string') throw new Error('AI_PARSER_INVALID_RESPONSE')
  if (value.action === 'undo' || value.action === 'redo' || value.action === 'clear' || value.action === 'export') {
    return { action: value.action }
  }
  if (value.action === 'create') {
    const kind = value.kind
    if (kind !== 'shape' && kind !== 'text' && kind !== 'arrow' && kind !== 'asset') throw new Error('AI_PARSER_INVALID_RESPONSE')
    return compactOperation({
      action: 'create',
      kind,
      shape: parseOptionalShape(value.shape),
      assetId: parseOptionalAssetId(value.assetId),
      text: parseOptionalString(value.text),
      fill: parseOptionalColor(value.fill),
      stroke: parseOptionalColor(value.stroke),
      position: parseOptionalPosition(value.position),
      size: parseOptionalSize(value.size),
      x: parseOptionalBoundedNumber(value.x, 0, 900),
      y: parseOptionalBoundedNumber(value.y, 0, 560),
      width: parseOptionalBoundedNumber(value.width, 24, 500),
      height: parseOptionalBoundedNumber(value.height, 24, 400),
    })
  }
  if (value.action === 'update') {
    return compactOperation({
      action: 'update',
      target: parseTarget(value.target),
      fill: parseOptionalColor(value.fill),
      stroke: parseOptionalColor(value.stroke),
      text: parseOptionalString(value.text),
    })
  }
  if (value.action === 'move') {
    return compactOperation({
      action: 'move',
      target: parseTarget(value.target),
      direction: value.direction === 'left' || value.direction === 'right' || value.direction === 'up' || value.direction === 'down' ? value.direction : undefined,
      dx: parseOptionalBoundedNumber(value.dx, -300, 300),
      dy: parseOptionalBoundedNumber(value.dy, -300, 300),
    })
  }
  if (value.action === 'resize') {
    return {
      action: 'resize',
      target: parseTarget(value.target),
      scale: parseRequiredBoundedNumber(value.scale, 0.25, 3),
    }
  }
  if (value.action === 'delete' || value.action === 'select') {
    return {
      action: value.action,
      target: parseTarget(value.target),
    }
  }
  throw new Error('AI_PARSER_INVALID_RESPONSE')
}

function parseOptionalAssetId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (isVisualAssetId(value)) return value
  throw new Error('AI_PARSER_INVALID_RESPONSE')
}

function parseTarget(value: unknown): DrawOperation extends infer _ ? NonNullable<Extract<DrawOperation, { target: unknown }>['target']> : never {
  if (!isRecord(value) || typeof value.type !== 'string') return { type: 'last' }
  if (value.type === 'last' || value.type === 'selected') return { type: value.type }
  if (value.type === 'byId' && typeof value.id === 'string') return { type: 'byId', id: value.id }
  if (value.type === 'query') {
    return compactOperation({
      type: 'query',
      shape: value.shape === 'text' ? 'text' : parseOptionalShape(value.shape),
      color: parseOptionalColor(value.color),
      position: parseOptionalPosition(value.position),
      order: value.order === 'largest' || value.order === 'smallest' || value.order === 'first' || value.order === 'last' ? value.order : undefined,
    })
  }
  return { type: 'last' }
}

function parseOptionalShape(value: unknown): ShapeKind | undefined {
  if (value === undefined || value === null) return undefined
  if (value === 'rectangle' || value === 'ellipse' || value === 'triangle' || value === 'diamond' || value === 'line') return value
  throw new Error('AI_PARSER_INVALID_RESPONSE')
}

function parseOptionalColor(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (
    value === 'red' ||
    value === 'blue' ||
    value === 'green' ||
    value === 'yellow' ||
    value === 'black' ||
    value === 'white' ||
    value === 'gray' ||
    value === 'purple' ||
    value === 'orange' ||
    value === 'pink' ||
    value === 'brown' ||
    value === 'cyan'
  ) {
    return value
  }
  throw new Error('AI_PARSER_INVALID_RESPONSE')
}

function parseOptionalPosition(value: unknown): PositionName | undefined {
  if (value === undefined || value === null) return undefined
  if (value === 'top-left' || value === 'top' || value === 'top-right' || value === 'left' || value === 'center' || value === 'right' || value === 'bottom-left' || value === 'bottom' || value === 'bottom-right') {
    return value
  }
  throw new Error('AI_PARSER_INVALID_RESPONSE')
}

function parseOptionalSize(value: unknown): SizeName | undefined {
  if (value === undefined || value === null) return undefined
  if (value === 'small' || value === 'medium' || value === 'large') return value
  throw new Error('AI_PARSER_INVALID_RESPONSE')
}

function parseOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error('AI_PARSER_INVALID_RESPONSE')
  return value.slice(0, 80)
}

function parseOptionalBoundedNumber(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null) return undefined
  return parseRequiredBoundedNumber(value, min, max)
}

function parseRequiredBoundedNumber(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('AI_PARSER_INVALID_RESPONSE')
  return clamp(value, min, max)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function compactOperation<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

function extractJsonObject(value: string) {
  const trimmed = value.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('AI_PARSER_INVALID_RESPONSE')
  return trimmed.slice(start, end + 1)
}

function extractMimoTranscript(body: unknown): string {
  if (!isRecord(body)) throw new Error('Bolna MiMo 返回格式无效。')
  if (typeof body.text === 'string') return body.text
  if (typeof body.transcript === 'string') return body.transcript
  if (isRecord(body.data) && typeof body.data.text === 'string') return body.data.text
  const choices = body.choices
  if (Array.isArray(choices)) {
    const first = choices[0]
    if (isRecord(first) && isRecord(first.message)) {
      const content = first.message.content
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        const textPart = content.find((part) => isRecord(part) && typeof part.text === 'string')
        if (isRecord(textPart) && typeof textPart.text === 'string') return textPart.text
      }
    }
  }
  throw new Error('Bolna MiMo 返回格式无效。')
}

function extractChatContent(body: unknown): string {
  if (!isRecord(body)) throw new Error('AI_PARSER_INVALID_RESPONSE')
  const choices = body.choices
  if (!Array.isArray(choices)) throw new Error('AI_PARSER_INVALID_RESPONSE')
  const first = choices[0]
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== 'string') throw new Error('AI_PARSER_INVALID_RESPONSE')
  return first.message.content
}

function readProviderError(body: unknown): string {
  if (!isRecord(body)) return ''
  if (typeof body.message === 'string') return body.message
  if (typeof body.error === 'string') return body.error
  if (isRecord(body.error) && typeof body.error.message === 'string') return body.error.message
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
