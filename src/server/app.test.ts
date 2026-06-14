import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServerApp } from './app'

const originalApiKey = process.env.OPENAI_API_KEY
const originalRealtimeModel = process.env.OPENAI_REALTIME_MODEL
const originalRealtimeApiKey = process.env.OPENAI_REALTIME_API_KEY
const originalGeminiApiKey = process.env.GEMINI_API_KEY
const originalGeminiLiveModel = process.env.GEMINI_LIVE_MODEL
const originalAiParserUrl = process.env.AI_PARSER_API_URL
const originalAiParserKey = process.env.AI_PARSER_API_KEY
const originalAiParserModel = process.env.AI_PARSER_MODEL

afterEach(() => {
  process.env.OPENAI_API_KEY = originalApiKey
  process.env.OPENAI_REALTIME_MODEL = originalRealtimeModel
  process.env.OPENAI_REALTIME_API_KEY = originalRealtimeApiKey
  process.env.GEMINI_API_KEY = originalGeminiApiKey
  process.env.GEMINI_LIVE_MODEL = originalGeminiLiveModel
  process.env.AI_PARSER_API_URL = originalAiParserUrl
  process.env.AI_PARSER_API_KEY = originalAiParserKey
  process.env.AI_PARSER_MODEL = originalAiParserModel
  vi.unstubAllGlobals()
})

describe('transcription api', () => {
  it('reports transcription fallback availability', async () => {
    delete process.env.OPENAI_API_KEY

    const response = await request(createServerApp()).get('/api/voice/status')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      transcribeAvailable: false,
      reason: 'OPENAI_API_KEY is not configured',
    })
  })

  it('returns 503 when transcription is requested without an api key', async () => {
    delete process.env.OPENAI_API_KEY

    const response = await request(createServerApp())
      .post('/api/transcribe')
      .attach('audio', Buffer.from('not-real-audio'), {
        filename: 'voice.webm',
        contentType: 'audio/webm',
      })

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      error: 'TRANSCRIBE_UNAVAILABLE',
      message: 'OPENAI_API_KEY is not configured',
    })
  })

  it('maps transcription provider timeouts to a clear 504 response', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const response = await request(
      createServerApp({
        transcribeAudioFile: async () => {
          const error = new Error('Request timed out.')
          error.name = 'APIConnectionTimeoutError'
          throw error
        },
      }),
    )
      .post('/api/transcribe')
      .attach('audio', Buffer.from('not-real-audio'), {
        filename: 'voice.webm',
        contentType: 'audio/webm',
      })

    expect(response.status).toBe(504)
    expect(response.body).toEqual({
      error: 'TRANSCRIBE_TIMEOUT',
      message: '云端转写超时，请重试或缩短语音。',
    })
  })
})

describe('bolna mimo asr api', () => {
  const originalUrl = process.env.BOLNA_MIMO_API_URL
  const originalKey = process.env.BOLNA_MIMO_API_KEY

  afterEach(() => {
    process.env.BOLNA_MIMO_API_URL = originalUrl
    process.env.BOLNA_MIMO_API_KEY = originalKey
    vi.unstubAllGlobals()
  })

  it('reports bolna mimo asr missing configuration', async () => {
    delete process.env.BOLNA_MIMO_API_URL
    delete process.env.BOLNA_MIMO_API_KEY

    const response = await request(createServerApp()).get('/api/asr/status')

    expect(response.status).toBe(200)
    expect(response.body.bolnaMimo).toEqual({
      available: false,
      reason: 'BOLNA_MIMO_API_URL and BOLNA_MIMO_API_KEY are not configured',
    })
  })

  it('normalizes bolna mimo provider transcript responses', async () => {
    process.env.BOLNA_MIMO_API_URL = 'https://asr.example.test/transcribe'
    process.env.BOLNA_MIMO_API_KEY = 'test-key'

    const response = await request(
      createServerApp({
        transcribeBolnaMimo: async () => ({
          text: '画一个红色圆形',
          latencyMs: 42,
        }),
      }),
    )
      .post('/api/asr/bolna-mimo')
      .attach('audio', Buffer.from('not-real-audio'), {
        filename: 'voice.webm',
        contentType: 'audio/webm',
      })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      text: '画一个红色圆形',
      provider: 'bolna-mimo',
      model: 'mimo-v2.5-asr',
      latencyMs: 42,
    })
  })

  it('calls MiMo ASR through chat completions input_audio payload', async () => {
    process.env.BOLNA_MIMO_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions'
    process.env.BOLNA_MIMO_API_KEY = 'test-key'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '画一个红色圆形' } }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await request(createServerApp())
      .post('/api/asr/bolna-mimo')
      .attach('audio', Buffer.from('not-real-audio'), {
        filename: 'voice.webm',
        contentType: 'audio/webm',
      })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      text: '画一个红色圆形',
      provider: 'bolna-mimo',
      model: 'mimo-v2.5-asr',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.xiaomimimo.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'api-key': 'test-key',
          'Content-Type': 'application/json',
        }),
      }),
    )
    const [, init] = fetchMock.mock.calls[0]
    const payload = JSON.parse(init.body as string)
    expect(payload.model).toBe('mimo-v2.5-asr')
    expect(payload.asr_options).toEqual({ language: 'zh' })
    expect(payload.messages[0].content[0].type).toBe('input_audio')
    expect(payload.messages[0].content[0].input_audio.data).toMatch(/^data:audio\/webm;base64,/)
  })

  it('maps bolna mimo provider timeouts to 504', async () => {
    process.env.BOLNA_MIMO_API_URL = 'https://asr.example.test/transcribe'
    process.env.BOLNA_MIMO_API_KEY = 'test-key'

    const response = await request(
      createServerApp({
        transcribeBolnaMimo: async () => {
          throw new Error('Bolna MiMo request timed out')
        },
      }),
    )
      .post('/api/asr/bolna-mimo')
      .attach('audio', Buffer.from('not-real-audio'), {
        filename: 'voice.webm',
        contentType: 'audio/webm',
      })

    expect(response.status).toBe(504)
    expect(response.body).toEqual({
      error: 'BOLNA_MIMO_TIMEOUT',
      message: 'Bolna MiMo 识别超时，请重试或缩短语音。',
    })
  })

  it('maps missing OpenAI-compatible transcription endpoint to 502', async () => {
    process.env.BOLNA_MIMO_API_URL = 'https://asr.example.test/v1'
    process.env.BOLNA_MIMO_API_KEY = 'test-key'

    const response = await request(
      createServerApp({
        transcribeBolnaMimo: async () => {
          throw new Error('404 <html><center><h1>404 Not Found</h1></center></html>')
        },
      }),
    )
      .post('/api/asr/bolna-mimo')
      .attach('audio', Buffer.from('not-real-audio'), {
        filename: 'voice.webm',
        contentType: 'audio/webm',
      })

    expect(response.status).toBe(502)
    expect(response.body).toEqual({
      error: 'BOLNA_MIMO_ENDPOINT_NOT_FOUND',
      message: '当前 Base URL 不支持 /audio/transcriptions，请提供 MiMo ASR 的完整转写接口地址。',
    })
  })

  it('maps bolna mimo auth failures to 401', async () => {
    process.env.BOLNA_MIMO_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions'
    process.env.BOLNA_MIMO_API_KEY = 'bad-key'

    const response = await request(
      createServerApp({
        transcribeBolnaMimo: async () => {
          throw new Error('Invalid API Key')
        },
      }),
    )
      .post('/api/asr/bolna-mimo')
      .attach('audio', Buffer.from('not-real-audio'), {
        filename: 'voice.webm',
        contentType: 'audio/webm',
      })

    expect(response.status).toBe(401)
    expect(response.body).toEqual({
      error: 'BOLNA_MIMO_AUTH_FAILED',
      message: 'Bolna MiMo API Key 无效，请重新复制专属 API key。',
    })
  })
})

describe('ai command parser api', () => {
  const originalApiKey = process.env.OPENAI_API_KEY
  const originalAiParserUrl = process.env.AI_PARSER_API_URL
  const originalAiParserKey = process.env.AI_PARSER_API_KEY
  const originalAiParserModel = process.env.AI_PARSER_MODEL

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey
    process.env.AI_PARSER_API_URL = originalAiParserUrl
    process.env.AI_PARSER_API_KEY = originalAiParserKey
    process.env.AI_PARSER_MODEL = originalAiParserModel
    vi.unstubAllGlobals()
  })

  it('returns operations parsed by the ai provider', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const response = await request(
      createServerApp({
        parseCommandWithAi: async () => ({
          operations: [
            { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'yellow', position: 'left', size: 'large' },
            { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'gray', position: 'right', size: 'small' },
          ],
          normalizedText: '画一个太阳旁边有一朵云',
          confidence: 0.86,
        }),
      }),
    )
      .post('/api/parse-command')
      .send({ text: '画一个太阳，旁边有一朵云' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      operations: [
        { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'yellow', position: 'left', size: 'large' },
        { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'gray', position: 'right', size: 'small' },
      ],
      normalizedText: '画一个太阳旁边有一朵云',
      confidence: 0.86,
      provider: 'ai-parser',
    })
  })

  it('accepts explicit create geometry from the ai provider', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const response = await request(
      createServerApp({
        parseCommandWithAi: async () => ({
          operations: [
            {
              action: 'create',
              kind: 'shape',
              shape: 'rectangle',
              fill: 'white',
              x: 260,
              y: 120,
              width: 380,
              height: 72,
            },
          ],
          normalizedText: '画一个登录页输入框',
          confidence: 0.9,
        }),
      }),
    )
      .post('/api/parse-command')
      .send({ text: '画一个登录页输入框' })

    expect(response.status).toBe(200)
    expect(response.body.operations[0]).toMatchObject({
      x: 260,
      y: 120,
      width: 380,
      height: 72,
    })
  })

  it('accepts common illustration colors from the ai provider', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const response = await request(
      createServerApp({
        parseCommandWithAi: async () => ({
          operations: [{ action: 'create', kind: 'shape', shape: 'rectangle', fill: 'brown', x: 390, y: 260, width: 90, height: 180 }],
          normalizedText: '画一棵树',
          confidence: 0.9,
        }),
      }),
    )
      .post('/api/parse-command')
      .send({ text: '画一棵树' })

    expect(response.status).toBe(200)
    expect(response.body.operations[0]).toMatchObject({ fill: 'brown' })
  })

  it('clamps explicit create geometry from the ai provider', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const response = await request(
      createServerApp({
        parseCommandWithAi: async () => ({
          operations: [
            {
              action: 'create',
              kind: 'shape',
              shape: 'rectangle',
              fill: 'white',
              x: -20,
              y: 700,
              width: 1200,
              height: 4,
            },
          ],
          normalizedText: '画一个超界输入框',
          confidence: 0.9,
        }),
      }),
    )
      .post('/api/parse-command')
      .send({ text: '画一个超界输入框' })

    expect(response.status).toBe(200)
    expect(response.body.operations[0]).toMatchObject({
      x: 0,
      y: 560,
      width: 500,
      height: 24,
    })
  })

  it('returns 503 when ai parser is requested without an api key', async () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.AI_PARSER_API_KEY

    const response = await request(createServerApp()).post('/api/parse-command').send({ text: '画一个登录页草图' })

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      error: 'AI_PARSER_UNAVAILABLE',
      message: 'OPENAI_API_KEY or AI_PARSER_API_KEY is not configured',
    })
  })

  it('rejects unsafe operations returned by the ai provider', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const response = await request(
      createServerApp({
        parseCommandWithAi: async () => ({
          operations: [{ action: 'create', kind: 'shape', shape: 'circle', fill: 'yellow' }],
          normalizedText: 'bad',
          confidence: 0.8,
        }),
      }),
    )
      .post('/api/parse-command')
      .send({ text: '画一个太阳' })

    expect(response.status).toBe(502)
    expect(response.body).toEqual({
      error: 'AI_PARSER_INVALID_RESPONSE',
      message: 'AI 解析返回了不支持的绘图操作。',
    })
  })

  it('maps ai parser timeouts to a clear 504 response', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const response = await request(
      createServerApp({
        parseCommandWithAi: async () => {
          throw new Error('AI parser request timed out')
        },
      }),
    )
      .post('/api/parse-command')
      .send({ text: '画一个登录页草图' })

    expect(response.status).toBe(504)
    expect(response.body).toEqual({
      error: 'AI_PARSER_TIMEOUT',
      message: 'AI 解析超时，请重试或换短一点的描述。',
    })
  })

  it('calls OpenAI-compatible ai parser endpoint when configured', async () => {
    delete process.env.OPENAI_API_KEY
    process.env.AI_PARSER_API_URL = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions'
    process.env.AI_PARSER_API_KEY = 'test-mimo-key'
    process.env.AI_PARSER_MODEL = 'mimo-v2.5-pro'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                operations: [{ action: 'create', kind: 'shape', shape: 'ellipse', fill: 'yellow' }],
                normalizedText: '画太阳',
                confidence: 0.82,
              }),
            },
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await request(createServerApp()).post('/api/parse-command').send({ text: '画一个太阳' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      operations: [{ action: 'create', kind: 'shape', shape: 'ellipse', fill: 'yellow' }],
      provider: 'ai-parser',
    })
    const [, init] = fetchMock.mock.calls[0]
    expect(fetchMock).toHaveBeenCalledWith(
      'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'api-key': 'test-mimo-key' }),
      }),
    )
    const payload = JSON.parse(init.body as string)
    expect(payload.model).toBe('mimo-v2.5-pro')
    expect(payload.max_completion_tokens).toBe(1400)
  })

  it('accepts MiMo relative layout operations for anchored placement', async () => {
    delete process.env.OPENAI_API_KEY
    process.env.AI_PARSER_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions'
    process.env.AI_PARSER_API_KEY = 'test-mimo-key'
    process.env.AI_PARSER_MODEL = 'mimo-v2.5-pro'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                operations: [
                  {
                    action: 'create',
                    kind: 'asset',
                    assetId: 'car',
                    position: 'right',
                    target: { type: 'query', assetId: 'tree' },
                  },
                ],
                normalizedText: '在树旁边画汽车',
                confidence: 0.9,
              }),
            },
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await request(createServerApp()).post('/api/parse-command').send({ text: '再画一辆汽车在树的旁边' })

    expect(response.status).toBe(200)
    expect(response.body.operations[0]).toMatchObject({
      action: 'create',
      kind: 'asset',
      assetId: 'car',
      position: 'right',
      target: { type: 'query', assetId: 'tree' },
    })
    const [, init] = fetchMock.mock.calls[0]
    const payload = JSON.parse(init.body as string)
    expect(payload.messages[0].content).toContain('target')
    expect(payload.messages[0].content).toContain('assetId')
  })

  it('accepts grassland as a MiMo visual asset operation', async () => {
    delete process.env.OPENAI_API_KEY
    process.env.AI_PARSER_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions'
    process.env.AI_PARSER_API_KEY = 'test-mimo-key'
    process.env.AI_PARSER_MODEL = 'mimo-v2.5-pro'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                operations: [{ action: 'create', kind: 'asset', assetId: 'grassland', position: 'bottom', size: 'large' }],
                normalizedText: '画一片草原',
                confidence: 0.9,
              }),
            },
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await request(createServerApp()).post('/api/parse-command').send({ text: '画一片草原' })

    expect(response.status).toBe(200)
    expect(response.body.operations[0]).toMatchObject({
      action: 'create',
      kind: 'asset',
      assetId: 'grassland',
      position: 'bottom',
      size: 'large',
    })
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body as string).messages[0].content).toContain('grassland')
  })
})

describe('ai stroke planner api', () => {
  it('returns 503 when stroke planner credentials are missing', async () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.AI_PARSER_API_URL
    delete process.env.AI_PARSER_API_KEY

    const response = await request(createServerApp()).post('/api/plan-strokes').send({ text: '画一棵树在草原上' })

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      error: 'AI_PARSER_UNAVAILABLE',
      message: 'OPENAI_API_KEY or AI_PARSER_API_KEY is not configured',
    })
  })

  it('calls MiMo as a no-asset human brush stroke planner', async () => {
    delete process.env.OPENAI_API_KEY
    process.env.AI_PARSER_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions'
    process.env.AI_PARSER_API_KEY = 'test-mimo-key'
    process.env.AI_PARSER_MODEL = 'mimo-v2.5-pro'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                operations: [
                  { action: 'create', kind: 'shape', shape: 'line', stroke: 'green', fill: 'green', x: 80, y: 360, width: 700, height: 8, selected: false },
                  { action: 'create', kind: 'shape', shape: 'rectangle', stroke: 'brown', fill: 'brown', x: 420, y: 260, width: 54, height: 160, selected: false },
                  { action: 'create', kind: 'shape', shape: 'ellipse', stroke: 'green', fill: 'green', x: 360, y: 170, width: 160, height: 160, selected: false },
                ],
                normalizedText: '画一棵树在草原上',
                confidence: 0.86,
              }),
            },
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await request(createServerApp()).post('/api/plan-strokes').send({ text: '画一棵树在草原上' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      provider: 'ai-stroke-planner',
      operations: [
        { action: 'create', kind: 'shape', shape: 'line', selected: false },
        { action: 'create', kind: 'shape', shape: 'rectangle', selected: false },
        { action: 'create', kind: 'shape', shape: 'ellipse', selected: false },
      ],
    })
    const [, init] = fetchMock.mock.calls[0]
    const payload = JSON.parse(init.body as string)
    expect(payload.model).toBe('mimo-v2.5-pro')
    expect(payload.messages[0].content).toContain('不要使用 asset')
    expect(payload.messages[0].content).toContain('像人类画画一样按笔顺')
  })

  it('rejects asset operations from the stroke planner', async () => {
    delete process.env.OPENAI_API_KEY
    process.env.AI_PARSER_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions'
    process.env.AI_PARSER_API_KEY = 'test-mimo-key'
    process.env.AI_PARSER_MODEL = 'mimo-v2.5-pro'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  operations: [{ action: 'create', kind: 'asset', assetId: 'grassland', selected: false }],
                  normalizedText: '画草原',
                  confidence: 0.8,
                }),
              },
            },
          ],
        }),
      }),
    )

    const response = await request(createServerApp()).post('/api/plan-strokes').send({ text: '画草原' })

    expect(response.status).toBe(502)
    expect(response.body.error).toBe('AI_PARSER_INVALID_RESPONSE')
  })

  it('normalizes MiMo stroke planner color fields and fractional coordinates', async () => {
    delete process.env.OPENAI_API_KEY
    process.env.AI_PARSER_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions'
    process.env.AI_PARSER_API_KEY = 'test-mimo-key'
    process.env.AI_PARSER_MODEL = 'mimo-v2.5-pro'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  operations: [{ action: 'create', kind: 'shape', shape: 'rectangle', x: 0.45, y: 0.5, width: 0.1, height: 0.4, color: 'brown', selected: false }],
                  normalizedText: '画一棵树',
                  confidence: 0.9,
                }),
              },
            },
          ],
        }),
      }),
    )

    const response = await request(createServerApp()).post('/api/plan-strokes').send({ text: '画一棵树' })

    expect(response.status).toBe(200)
    expect(response.body.operations[0]).toMatchObject({
      fill: 'brown',
      stroke: 'brown',
      x: 405,
      y: 280,
      width: 90,
      height: 224,
    })
  })

  it('normalizes MiMo none colors in stroke planner output', async () => {
    delete process.env.OPENAI_API_KEY
    process.env.AI_PARSER_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions'
    process.env.AI_PARSER_API_KEY = 'test-mimo-key'
    process.env.AI_PARSER_MODEL = 'mimo-v2.5-pro'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  operations: [
                    { action: 'create', kind: 'shape', shape: 'line', x: 430, y: 350, width: 60, height: 0, fill: 'none', stroke: 'brown', selected: false },
                    { action: 'create', kind: 'shape', shape: 'ellipse', x: 400, y: 180, width: 20, height: 20, fill: 'red', stroke: 'none', selected: false },
                  ],
                  normalizedText: '画一棵树',
                  confidence: 0.9,
                }),
              },
            },
          ],
        }),
      }),
    )

    const response = await request(createServerApp()).post('/api/plan-strokes').send({ text: '画一棵树' })

    expect(response.status).toBe(200)
    expect(response.body.operations).toMatchObject([
      { fill: 'brown', stroke: 'brown', height: 4 },
      { fill: 'red', stroke: 'red' },
    ])
  })

  it('accepts freehand path point strokes from the stroke planner', async () => {
    delete process.env.OPENAI_API_KEY
    process.env.AI_PARSER_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions'
    process.env.AI_PARSER_API_KEY = 'test-mimo-key'
    process.env.AI_PARSER_MODEL = 'mimo-v2.5-pro'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  operations: [
                    {
                      action: 'create',
                      kind: 'shape',
                      shape: 'path',
                      points: [
                        [0.1, 0.75],
                        [0.16, 0.68],
                        [0.24, 0.76],
                      ],
                      stroke: 'green',
                      selected: false,
                    },
                  ],
                  normalizedText: '画草地',
                  confidence: 0.9,
                }),
              },
            },
          ],
        }),
      }),
    )

    const response = await request(createServerApp()).post('/api/plan-strokes').send({ text: '画草地' })

    expect(response.status).toBe(200)
    expect(response.body.operations[0]).toMatchObject({
      action: 'create',
      kind: 'shape',
      shape: 'path',
      points: [
        [90, 420],
        [144, 381],
        [216, 426],
      ],
      fill: 'green',
      stroke: 'green',
      selected: false,
    })
  })

  it('recolors black freehand water strokes from the stroke planner', async () => {
    delete process.env.OPENAI_API_KEY
    process.env.AI_PARSER_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions'
    process.env.AI_PARSER_API_KEY = 'test-mimo-key'
    process.env.AI_PARSER_MODEL = 'mimo-v2.5-pro'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  operations: [
                    {
                      action: 'create',
                      kind: 'shape',
                      shape: 'path',
                      points: [
                        [100, 300],
                        [200, 320],
                        [300, 290],
                      ],
                      fill: 'black',
                      stroke: 'black',
                      selected: false,
                    },
                  ],
                  normalizedText: '画一条弯曲的小河',
                  confidence: 0.9,
                }),
              },
            },
          ],
        }),
      }),
    )

    const response = await request(createServerApp()).post('/api/plan-strokes').send({ text: '画一条弯曲的小河' })

    expect(response.status).toBe(200)
    expect(response.body.operations[0]).toMatchObject({
      fill: 'blue',
      stroke: 'blue',
    })
  })
})

describe('realtime ai api', () => {
  it('reports realtime ai missing configuration', async () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_REALTIME_API_KEY

    const response = await request(createServerApp()).get('/api/realtime/status')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      openaiRealtime: {
        available: false,
        reason: 'OPENAI_API_KEY is not configured',
        model: 'gpt-realtime',
      },
      geminiLive: {
        available: Boolean(process.env.GEMINI_API_KEY),
        reason: process.env.GEMINI_API_KEY ? 'Gemini Live is configured' : 'GEMINI_API_KEY is not configured',
        model: 'gemini-3.1-flash-live-preview',
      },
    })
  })

  it('creates an OpenAI Realtime ephemeral session without exposing the standard api key', async () => {
    process.env.OPENAI_API_KEY = 'test-standard-key'
    delete process.env.OPENAI_REALTIME_API_KEY
    process.env.OPENAI_REALTIME_MODEL = 'gpt-realtime'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: 'ek_test_ephemeral',
        expires_at: 1_800_000_000,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await request(createServerApp()).post('/api/realtime/openai/session')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      provider: 'openai-realtime',
      model: 'gpt-realtime',
      clientSecret: {
        value: 'ek_test_ephemeral',
        expiresAt: 1_800_000_000,
      },
    })
    expect(JSON.stringify(response.body)).not.toContain('test-standard-key')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime/client_secrets',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-standard-key',
          'Content-Type': 'application/json',
        }),
      }),
    )
    const [, init] = fetchMock.mock.calls[0]
    const payload = JSON.parse(init.body as string)
    expect(payload.session.model).toBe('gpt-realtime')
    expect(payload.session.tools[0]).toMatchObject({
      type: 'function',
      name: 'emit_draw_operations',
    })
  })

  it('returns 503 when realtime session is requested without an api key', async () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_REALTIME_API_KEY

    const response = await request(createServerApp()).post('/api/realtime/openai/session')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      error: 'REALTIME_UNAVAILABLE',
      message: 'OPENAI_API_KEY is not configured',
    })
  })

  it('rejects router keys for OpenAI Realtime before calling the provider', async () => {
    process.env.OPENAI_API_KEY = 'sk-router-test'
    delete process.env.OPENAI_REALTIME_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const statusResponse = await request(createServerApp()).get('/api/realtime/status')
    const sessionResponse = await request(createServerApp()).post('/api/realtime/openai/session')

    expect(statusResponse.body.openaiRealtime).toEqual({
      available: false,
      reason: 'OpenAI Realtime requires an official OpenAI API key; router keys are not supported',
      model: 'gpt-realtime',
    })
    expect(sessionResponse.status).toBe(503)
    expect(sessionResponse.body).toEqual({
      error: 'REALTIME_UNAVAILABLE',
      message: 'OpenAI Realtime requires an official OpenAI API key; router keys are not supported',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('prefers OPENAI_REALTIME_API_KEY for OpenAI Realtime sessions', async () => {
    process.env.OPENAI_API_KEY = 'sk-router-test'
    process.env.OPENAI_REALTIME_API_KEY = 'sk-official-realtime'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: 'ek_test_ephemeral',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await request(createServerApp()).post('/api/realtime/openai/session')

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime/client_secrets',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-official-realtime',
        }),
      }),
    )
  })

  it('reports gemini live missing configuration', async () => {
    delete process.env.GEMINI_API_KEY

    const response = await request(createServerApp()).get('/api/realtime/status')

    expect(response.body.geminiLive).toEqual({
      available: false,
      reason: 'GEMINI_API_KEY is not configured',
      model: 'gemini-3.1-flash-live-preview',
    })
  })

  it('creates a Gemini Live ephemeral token without exposing the standard api key', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    process.env.GEMINI_LIVE_MODEL = 'gemini-3.1-flash-live-preview'
    const createGeminiLiveToken = vi.fn().mockResolvedValue({
      provider: 'gemini-live',
      model: 'gemini-3.1-flash-live-preview',
      accessToken: { value: 'ephemeral-token' },
      websocketUrl:
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=ephemeral-token',
    })

    const response = await request(
      createServerApp({
        createGeminiLiveToken,
      }),
    ).post('/api/realtime/gemini/token')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      provider: 'gemini-live',
      model: 'gemini-3.1-flash-live-preview',
      accessToken: { value: 'ephemeral-token' },
      websocketUrl:
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=ephemeral-token',
    })
    expect(JSON.stringify(response.body)).not.toContain('test-gemini-key')
    expect(createGeminiLiveToken).toHaveBeenCalledTimes(1)
  })
})
