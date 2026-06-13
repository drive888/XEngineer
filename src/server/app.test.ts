import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServerApp } from './app'

const originalApiKey = process.env.OPENAI_API_KEY
const originalRealtimeModel = process.env.OPENAI_REALTIME_MODEL

afterEach(() => {
  process.env.OPENAI_API_KEY = originalApiKey
  process.env.OPENAI_REALTIME_MODEL = originalRealtimeModel
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
})

describe('realtime ai api', () => {
  it('reports realtime ai missing configuration', async () => {
    delete process.env.OPENAI_API_KEY

    const response = await request(createServerApp()).get('/api/realtime/status')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      openaiRealtime: {
        available: false,
        reason: 'OPENAI_API_KEY is not configured',
        model: 'gpt-realtime',
      },
    })
  })

  it('creates an OpenAI Realtime ephemeral session without exposing the standard api key', async () => {
    process.env.OPENAI_API_KEY = 'test-standard-key'
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

    const response = await request(createServerApp()).post('/api/realtime/openai/session')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      error: 'REALTIME_UNAVAILABLE',
      message: 'OPENAI_API_KEY is not configured',
    })
  })
})
