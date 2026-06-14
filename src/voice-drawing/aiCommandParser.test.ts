import { describe, expect, it, vi } from 'vitest'
import { parseCommandWithAi, planStrokesWithAi } from './aiCommandParser'

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

  it('posts text to the experimental stroke planner', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        operations: [{ action: 'create', kind: 'shape', shape: 'line', stroke: 'green', fill: 'green', x: 80, y: 360, width: 700, height: 8, selected: false }],
        normalizedText: '画草原',
        confidence: 0.8,
        provider: 'ai-stroke-planner',
      }),
    })

    const result = await planStrokesWithAi('画草原', fetchMock as never)

    expect(result).toEqual({
      operations: [{ action: 'create', kind: 'shape', shape: 'line', stroke: 'green', fill: 'green', x: 80, y: 360, width: 700, height: 8, selected: false }],
      normalizedText: '画草原',
      confidence: 0.8,
      provider: 'ai-stroke-planner',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plan-strokes',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '画草原' }),
      }),
    )
  })

  it('maps aborts to a clear timeout error', async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException('Aborted', 'AbortError')
    })

    await expect(parseCommandWithAi('画一个太阳', fetchMock as never, 1)).rejects.toThrow('AI 解析超时，请重试。')
  })
})
