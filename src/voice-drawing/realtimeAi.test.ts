import { describe, expect, it, vi } from 'vitest'
import { createOpenAIRealtimeSession, fetchRealtimeAiStatus } from './realtimeAi'

describe('fetchRealtimeAiStatus', () => {
  it('reads OpenAI Realtime provider status', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ openaiRealtime: { available: true, reason: 'configured', model: 'gpt-realtime' } })))

    await expect(fetchRealtimeAiStatus(fetcher)).resolves.toEqual({
      available: true,
      reason: 'configured',
      model: 'gpt-realtime',
    })
  })

  it('returns an offline status when the api server is unreachable', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network down')
    })

    await expect(fetchRealtimeAiStatus(fetcher)).resolves.toEqual({
      available: false,
      reason: 'API 服务未启动，请运行 npm run dev:api',
      model: 'gpt-realtime',
    })
  })
})

describe('createOpenAIRealtimeSession', () => {
  it('requests a short-lived client secret from the server', async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          provider: 'openai-realtime',
          model: 'gpt-realtime',
          clientSecret: { value: 'ek_test', expiresAt: 1_800_000_000 },
        }),
      ),
    )

    await expect(createOpenAIRealtimeSession(fetcher)).resolves.toEqual({
      provider: 'openai-realtime',
      model: 'gpt-realtime',
      clientSecret: { value: 'ek_test', expiresAt: 1_800_000_000 },
    })
    expect(fetcher).toHaveBeenCalledWith('/api/realtime/openai/session', { method: 'POST' })
  })
})
