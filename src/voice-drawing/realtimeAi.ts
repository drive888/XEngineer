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
