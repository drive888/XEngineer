import type { DrawOperation } from './types'

export interface AiCommandParseResult {
  readonly operations: DrawOperation[]
  readonly normalizedText: string
  readonly confidence: number
  readonly provider: 'ai-parser'
}

type FetchLike = typeof fetch

export async function parseCommandWithAi(text: string, fetcher: FetchLike = fetch, timeoutMs = 20_000): Promise<AiCommandParseResult> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetcher('/api/parse-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })
    const body = (await response.json()) as Partial<AiCommandParseResult> & { message?: string }
    if (!response.ok) throw new Error(body.message ?? 'AI 解析失败。')
    if (!Array.isArray(body.operations)) throw new Error('AI 解析返回格式无效。')
    return {
      operations: body.operations,
      normalizedText: body.normalizedText ?? text,
      confidence: body.confidence ?? 0.7,
      provider: 'ai-parser',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI 解析超时，请重试。')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
