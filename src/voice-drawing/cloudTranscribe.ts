export interface VoiceServiceStatus {
  readonly transcribeAvailable: boolean
  readonly reason: string
}

type FetchLike = typeof fetch

export async function fetchVoiceStatus(fetcher: FetchLike = fetch): Promise<VoiceServiceStatus> {
  try {
    const response = await fetcher('/api/voice/status')
    if (!response.ok) {
      return {
        transcribeAvailable: false,
        reason: 'Voice service status request failed',
      }
    }

    return response.json() as Promise<VoiceServiceStatus>
  } catch {
    return {
      transcribeAvailable: false,
      reason: 'API 服务未启动，请运行 npm run dev:api',
    }
  }
}

export async function transcribeAudio(blob: Blob, fetcher: FetchLike = fetch, timeoutMs = 25_000): Promise<string> {
  const formData = new FormData()
  formData.append('audio', blob, 'voice.webm')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetcher('/api/transcribe', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    const body = (await response.json()) as { text?: string; message?: string }
    if (!response.ok) {
      throw new Error(body.message ?? '云端转写失败')
    }

    return body.text ?? ''
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('云端转写超时，请重试或缩短语音。')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
