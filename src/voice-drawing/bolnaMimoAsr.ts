export interface BolnaMimoStatus {
  readonly available: boolean
  readonly reason: string
}

export interface BolnaMimoResult {
  readonly text: string
  readonly provider: 'bolna-mimo'
  readonly model: 'mimo-v2.5-asr'
  readonly latencyMs: number
}

type FetchLike = typeof fetch

export async function fetchBolnaMimoStatus(fetcher: FetchLike = fetch): Promise<BolnaMimoStatus> {
  try {
    const response = await fetcher('/api/asr/status')
    if (!response.ok) {
      return {
        available: false,
        reason: 'Bolna MiMo status request failed',
      }
    }

    const body = (await response.json()) as { bolnaMimo?: BolnaMimoStatus }
    return body.bolnaMimo ?? { available: false, reason: 'Bolna MiMo status missing' }
  } catch {
    return {
      available: false,
      reason: 'API 服务未启动，请运行 npm run dev:api',
    }
  }
}

export async function transcribeWithBolnaMimo(
  blob: Blob,
  fetcher: FetchLike = fetch,
  timeoutMs = 25_000,
): Promise<BolnaMimoResult> {
  const formData = new FormData()
  formData.append('audio', blob, 'voice.wav')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetcher('/api/asr/bolna-mimo', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })
    const body = (await response.json()) as Partial<BolnaMimoResult> & { message?: string }
    if (!response.ok) {
      throw new Error(body.message ?? 'Bolna MiMo 识别失败。')
    }
    if (!body.text) throw new Error('Bolna MiMo 返回格式无效。')
    return {
      text: body.text,
      provider: 'bolna-mimo',
      model: 'mimo-v2.5-asr',
      latencyMs: body.latencyMs ?? 0,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Bolna MiMo 识别超时，请重试或缩短语音。')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
