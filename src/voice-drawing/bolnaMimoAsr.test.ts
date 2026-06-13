import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBolnaMimoStatus, transcribeWithBolnaMimo } from './bolnaMimoAsr'

describe('bolna mimo asr client', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads bolna mimo provider status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bolnaMimo: { available: false, reason: 'BOLNA_MIMO_API_URL is not configured' } }),
    })

    const status = await fetchBolnaMimoStatus(fetchMock)

    expect(status).toEqual({
      available: false,
      reason: 'BOLNA_MIMO_API_URL is not configured',
    })
  })

  it('reports a local api startup hint when status request cannot connect', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const status = await fetchBolnaMimoStatus(fetchMock)

    expect(status).toEqual({
      available: false,
      reason: 'API 服务未启动，请运行 npm run dev:api',
    })
  })

  it('uploads audio and returns transcript result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: '画一个红色圆形',
        provider: 'bolna-mimo',
        model: 'mimo-v2.5-asr',
        latencyMs: 88,
      }),
    })

    const result = await transcribeWithBolnaMimo(new Blob(['voice'], { type: 'audio/webm' }), fetchMock)

    expect(result).toEqual({
      text: '画一个红色圆形',
      provider: 'bolna-mimo',
      model: 'mimo-v2.5-asr',
      latencyMs: 88,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/asr/bolna-mimo', expect.objectContaining({ method: 'POST' }))
  })

  it('aborts bolna mimo requests after timeout', async () => {
    const fetchMock = vi.fn((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })

    const promise = expect(
      transcribeWithBolnaMimo(new Blob(['voice'], { type: 'audio/webm' }), fetchMock, 1000),
    ).rejects.toThrow('Bolna MiMo 识别超时，请重试或缩短语音。')
    await vi.advanceTimersByTimeAsync(1000)

    await promise
  })
})
