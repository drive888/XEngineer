import { describe, expect, it, vi } from 'vitest'
import { buildGeminiLiveCloseStatus, createGeminiLiveToken, fetchGeminiLiveStatus, parseGeminiLiveMessage, buildGeminiLiveSetupMessage } from './geminiLive'

describe('gemini live client', () => {
  it('reads Gemini Live provider status', async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          geminiLive: {
            available: true,
            reason: 'Gemini Live is configured',
            model: 'gemini-3.1-flash-live-preview',
          },
        }),
      ),
    )

    await expect(fetchGeminiLiveStatus(fetcher)).resolves.toEqual({
      available: true,
      reason: 'Gemini Live is configured',
      model: 'gemini-3.1-flash-live-preview',
    })
  })

  it('requests a short-lived Gemini Live access token from the server', async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          provider: 'gemini-live',
          model: 'gemini-3.1-flash-live-preview',
          accessToken: { value: 'ephemeral-token' },
          websocketUrl:
            'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=ephemeral-token',
        }),
      ),
    )

    await expect(createGeminiLiveToken(fetcher)).resolves.toEqual({
      provider: 'gemini-live',
      model: 'gemini-3.1-flash-live-preview',
      accessToken: { value: 'ephemeral-token' },
      websocketUrl:
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=ephemeral-token',
    })
    expect(fetcher).toHaveBeenCalledWith('/api/realtime/gemini/token', { method: 'POST' })
  })

  it('builds a Gemini Live setup message with draw operation function declarations', () => {
    expect(buildGeminiLiveSetupMessage('gemini-3.1-flash-live-preview')).toMatchObject({
      setup: {
        model: 'models/gemini-3.1-flash-live-preview',
        generationConfig: {
          responseModalities: ['TEXT'],
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'emit_draw_operations',
              },
            ],
          },
        ],
      },
    })
  })

  it('shows Gemini Live close code and reason', () => {
    expect(buildGeminiLiveCloseStatus({ code: 1008, reason: 'Your project has been denied access' })).toBe(
      'Gemini Live 已断开: 1008 Your project has been denied access',
    )
    expect(buildGeminiLiveCloseStatus({ code: 1005, reason: '' })).toBe('Gemini Live 已断开')
  })

  it('extracts draw operations from Gemini Live tool calls', () => {
    const parsed = parseGeminiLiveMessage({
      toolCall: {
        functionCalls: [
          {
            id: 'call-1',
            name: 'emit_draw_operations',
            args: {
              normalizedText: '画一个红色圆形',
              confidence: 0.9,
              isFinal: true,
              operations: [{ action: 'create', kind: 'shape', shape: 'ellipse', fill: 'red', position: 'center' }],
            },
          },
        ],
      },
    })

    expect(parsed).toEqual([
      {
        toolCallId: 'call-1',
        command: {
          provider: 'gemini-live',
          normalizedText: '画一个红色圆形',
          confidence: 0.9,
          isFinal: true,
          operations: [{ action: 'create', kind: 'shape', shape: 'ellipse', fill: 'red', position: 'center' }],
        },
      },
    ])
  })
})
