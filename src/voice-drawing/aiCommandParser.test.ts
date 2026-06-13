import { describe, expect, it, vi } from 'vitest'
import { parseCommandWithAi } from './aiCommandParser'

describe('ai command parser client', () => {
  it('posts text and returns ai parser operations', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        operations: [{ action: 'create', kind: 'shape', shape: 'ellipse', fill: 'yellow' }],
        normalizedText: '画太阳',
        confidence: 0.84,
        provider: 'ai-parser',
      }),
    })

    const result = await parseCommandWithAi('画一个太阳', fetchMock as never)

    expect(result).toEqual({
      operations: [{ action: 'create', kind: 'shape', shape: 'ellipse', fill: 'yellow' }],
      normalizedText: '画太阳',
      confidence: 0.84,
      provider: 'ai-parser',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/parse-command',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '画一个太阳' }),
      }),
    )
  })

  it('throws server error messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'AI parser unavailable' }),
    })

    await expect(parseCommandWithAi('画一个太阳', fetchMock as never)).rejects.toThrow('AI parser unavailable')
  })

  it('maps aborts to a clear timeout error', async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException('Aborted', 'AbortError')
    })

    await expect(parseCommandWithAi('画一个太阳', fetchMock as never, 1)).rejects.toThrow('AI 解析超时，请重试。')
  })
})
