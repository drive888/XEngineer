import { describe, expect, it, vi } from 'vitest'
import { connectOpenAIRealtime, createOpenAIRealtimeSession, fetchRealtimeAiStatus, parseRealtimeDrawEvent } from './realtimeAi'

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

describe('parseRealtimeDrawEvent', () => {
  it('extracts draw operations from completed function call arguments', () => {
    const parsed = parseRealtimeDrawEvent({
      type: 'response.function_call_arguments.done',
      name: 'emit_draw_operations',
      arguments: JSON.stringify({
        normalizedText: '画一个红色圆形',
        confidence: 0.91,
        isFinal: true,
        operations: [{ action: 'create', kind: 'shape', shape: 'ellipse', fill: 'red', position: 'center', size: 'medium' }],
      }),
    })

    expect(parsed).toEqual({
      normalizedText: '画一个红色圆形',
      confidence: 0.91,
      isFinal: true,
      operations: [{ action: 'create', kind: 'shape', shape: 'ellipse', fill: 'red', position: 'center', size: 'medium' }],
    })
  })

  it('ignores unrelated or invalid realtime events', () => {
    expect(parseRealtimeDrawEvent({ type: 'response.text.delta', delta: 'hello' })).toBeNull()
    expect(parseRealtimeDrawEvent({ type: 'response.function_call_arguments.done', name: 'other', arguments: '{}' })).toBeNull()
    expect(parseRealtimeDrawEvent({ type: 'response.function_call_arguments.done', name: 'emit_draw_operations', arguments: '{bad' })).toBeNull()
  })
})

describe('connectOpenAIRealtime', () => {
  it('posts browser SDP to the Realtime calls endpoint without a model query', async () => {
    const peerConnection = createFakePeerConnection()
    const fetcher = vi.fn(async () => new Response('v=0 answer', { status: 200 }))

    await connectOpenAIRealtime({
      onDrawCommand: vi.fn(),
      createSession: async () => ({
        provider: 'openai-realtime',
        model: 'gpt-realtime',
        clientSecret: { value: 'ek_test' },
      }),
      getUserMedia: async () => createFakeMediaStream(),
      peerConnectionFactory: () => peerConnection as unknown as RTCPeerConnection,
      fetcher,
    })

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime/calls',
      expect.objectContaining({
        method: 'POST',
        body: 'v=0 offer',
        headers: expect.objectContaining({
          Authorization: 'Bearer ek_test',
          'Content-Type': 'application/sdp',
        }),
      }),
    )
    expect(peerConnection.remoteDescription).toEqual({ type: 'answer', sdp: 'v=0 answer' })
  })

  it('includes provider details when SDP exchange fails', async () => {
    await expect(
      connectOpenAIRealtime({
        onDrawCommand: vi.fn(),
        createSession: async () => ({
          provider: 'openai-realtime',
          model: 'gpt-realtime',
          clientSecret: { value: 'ek_test' },
        }),
        getUserMedia: async () => createFakeMediaStream(),
        peerConnectionFactory: () => createFakePeerConnection() as unknown as RTCPeerConnection,
        fetcher: vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad sdp' } }), { status: 400 })),
      }),
    ).rejects.toThrow('Realtime AI WebRTC 连接失败: 400 bad sdp')
  })
})

function createFakeMediaStream(): MediaStream {
  return {
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream
}

function createFakePeerConnection() {
  return {
    remoteDescription: null as RTCSessionDescriptionInit | null,
    createDataChannel: vi.fn(() => ({ close: vi.fn(), onmessage: null })),
    addTrack: vi.fn(),
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'v=0 offer' })),
    setLocalDescription: vi.fn(),
    setRemoteDescription: vi.fn(async function (this: { remoteDescription: RTCSessionDescriptionInit | null }, description: RTCSessionDescriptionInit) {
      this.remoteDescription = description
    }),
    close: vi.fn(),
  }
}
