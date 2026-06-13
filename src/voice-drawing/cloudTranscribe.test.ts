import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchVoiceStatus, transcribeAudio } from './cloudTranscribe'

describe('cloud transcription client', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads transcription fallback status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ transcribeAvailable: false, reason: 'OPENAI_API_KEY is not configured' }),
    })

    const status = await fetchVoiceStatus(fetchMock)

    expect(status).toEqual({
      transcribeAvailable: false,
      reason: 'OPENAI_API_KEY is not configured',
    })
  })

  it('reports a local api startup hint when status request cannot connect', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const status = await fetchVoiceStatus(fetchMock)

    expect(status).toEqual({
      transcribeAvailable: false,
      reason: 'API 服务未启动，请运行 npm run dev:api',
    })
  })

  it('posts recorded audio and returns transcript text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '画一个红色圆形' }),
    })

    const text = await transcribeAudio(new Blob(['voice'], { type: 'audio/webm' }), fetchMock)

    expect(text).toBe('画一个红色圆形')
    expect(fetchMock).toHaveBeenCalledWith('/api/transcribe', expect.objectContaining({ method: 'POST' }))
  })

  it('aborts transcription requests after the configured timeout', async () => {
    const fetchMock = vi.fn((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })

    const promise = expect(
      transcribeAudio(new Blob(['voice'], { type: 'audio/webm' }), fetchMock, 1000),
    ).rejects.toThrow('云端转写超时，请重试或缩短语音。')
    await vi.advanceTimersByTimeAsync(1000)

    await promise
  })
})
