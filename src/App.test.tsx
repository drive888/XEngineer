import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const aiParserMock = vi.hoisted(() => vi.fn())

vi.mock('tldraw', () => ({
  Tldraw: () => <div data-testid="mock-tldraw" />,
}))

vi.mock('./voice-drawing/aiCommandParser', () => ({
  parseCommandWithAi: aiParserMock,
}))

import { App } from './App'

describe('App speech fallback', () => {
  beforeEach(() => {
    aiParserMock.mockReset()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/asr/status')) {
          return new Response(
            JSON.stringify({
              bolnaMimo: {
                available: true,
                reason: 'Bolna MiMo ASR is configured',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.includes('/api/voice/status')) {
          return new Response(
            JSON.stringify({
              transcribeAvailable: false,
              reason: 'OPENAI_API_KEY is not configured',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.includes('/api/realtime/status')) {
          return new Response(
            JSON.stringify({
              openaiRealtime: {
                available: false,
                reason: 'OPENAI_API_KEY is not configured',
                model: 'gpt-realtime',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/vendor/excalidraw-libraries/libraries.index.json')) {
          return new Response(
            JSON.stringify({
              libraries: [
                {
                  name: 'Snowflake datawarehousing Icons',
                  description: 'Collection of Snowflake datawarehouse icons.',
                  source: 'thijsdev/snowflake.excalidrawlib',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/vendor/excalidraw-libraries/libraries/thijsdev/snowflake.excalidrawlib')) {
          return new Response(
            JSON.stringify({
              type: 'excalidrawlib',
              library: [
                [
                  {
                    type: 'rectangle',
                    x: 0,
                    y: 0,
                    width: 96,
                    height: 72,
                    strokeColor: '#000000',
                    backgroundColor: '#67e8f9',
                    opacity: 100,
                  },
                ],
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response('{}', { status: 404 })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers demo commands and draws when speech recognition is unavailable', async () => {
    const user = userEvent.setup()

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    expect(screen.getByText(/Web Speech: 不可用/)).toBeInTheDocument()
    expect(screen.getByText(/Realtime AI:/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bolna MiMo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gemini Live' })).not.toBeInTheDocument()
    expect(screen.getByText(/Gemini Live: 待完成/)).toBeInTheDocument()
    expect(screen.getByLabelText('tldraw 语音绘图画布')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '画红色圆形' }))

    expect(screen.getAllByText('画一个红色圆形')).toHaveLength(2)
    await waitFor(() => expect(screen.getByLabelText('语音绘图画布').querySelectorAll('.selected-shape')).toHaveLength(1))
    expect(document.querySelectorAll('.log-item')).toHaveLength(1)
  })

  it('keeps command status visible when Web Speech API is unavailable', async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    expect(screen.getByText('待命')).toBeInTheDocument()
    expect(screen.getByText(/Web Speech: 不可用/)).toBeInTheDocument()
  })

  it('starts Bolna MiMo recording without MediaRecorder when AudioContext is available', async () => {
    const user = userEvent.setup()
    const disconnect = vi.fn()
    const stop = vi.fn()
    const stream = {
      getTracks: () => [{ stop }],
    }
    const getUserMedia = vi.fn(async () => stream)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    vi.stubGlobal('MediaRecorder', undefined)
    class FakeAudioContext {
      sampleRate = 16_000
      destination = {}
      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect })
      createScriptProcessor = () => ({ connect: vi.fn(), disconnect, onaudioprocess: null })
      close = vi.fn()
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await screen.findByText(/Bolna MiMo: 可用/)
    await user.click(screen.getByRole('button', { name: 'Bolna MiMo' }))

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(screen.getByText('Bolna MiMo 录音中')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '结束 MiMo' })).toBeInTheDocument()
  })

  it('does not remount existing drawing strokes when Bolna MiMo recording starts', async () => {
    const user = userEvent.setup()
    const disconnect = vi.fn()
    const stop = vi.fn()
    const stream = {
      getTracks: () => [{ stop }],
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    })
    vi.stubGlobal('MediaRecorder', undefined)
    class FakeAudioContext {
      sampleRate = 16_000
      destination = {}
      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect })
      createScriptProcessor = () => ({ connect: vi.fn(), disconnect, onaudioprocess: null })
      close = vi.fn()
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: '画树' }))
    await waitFor(() => expect(screen.getByText('绘制完成')).toBeInTheDocument(), { timeout: 7000 })
    const mirror = screen.getByRole('img', { name: '语音绘图画布' })
    const firstStroke = mirror.querySelector('[data-asset-id="tree"] .asset-stroke')
    expect(firstStroke).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Bolna MiMo' }))

    expect(screen.getByText('Bolna MiMo 录音中')).toBeInTheDocument()
    expect(mirror.querySelector('[data-asset-id="tree"] .asset-stroke')).toBe(firstStroke)
  }, 10_000)

  it('uses AI parser for complex free-form drawing intent', async () => {
    const user = userEvent.setup()
    aiParserMock.mockResolvedValue({
      operations: [
        { action: 'create', kind: 'shape', shape: 'rectangle', fill: 'white', position: 'top', size: 'large' },
        { action: 'create', kind: 'text', text: '登录', fill: 'black', position: 'top', size: 'medium' },
        { action: 'create', kind: 'shape', shape: 'rectangle', fill: 'blue', position: 'bottom', size: 'medium' },
      ],
      normalizedText: '登录页草图',
      confidence: 0.88,
      provider: 'ai-parser',
    })

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: '登录页草图' }))

    expect(aiParserMock).toHaveBeenCalledWith('帮我画一个登录页面草图，有标题、输入框和按钮')
    expect(await screen.findByText('provider: ai-parser')).toBeInTheDocument()
    expect(screen.getAllByText('登录页草图').length).toBeGreaterThanOrEqual(1)
    await waitFor(() => expect(screen.getByLabelText('语音绘图画布').querySelectorAll('.selected-shape')).toHaveLength(1))
  })

  it('uses AI parser for unknown object drawing demos', async () => {
    const user = userEvent.setup()
    aiParserMock.mockResolvedValue({
      operations: [
        { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'orange', x: 350, y: 200, width: 200, height: 160 },
        { action: 'create', kind: 'shape', shape: 'triangle', fill: 'orange', x: 380, y: 80, width: 40, height: 50 },
        { action: 'create', kind: 'shape', shape: 'line', fill: 'black', x: 400, y: 195, width: 80, height: 24 },
      ],
      normalizedText: '画一只猫',
      confidence: 0.9,
      provider: 'ai-parser',
    })

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: '登录页草图' }))

    expect(aiParserMock).toHaveBeenCalledWith('帮我画一个登录页面草图，有标题、输入框和按钮')
    expect(await screen.findByText('provider: ai-parser')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('img', { name: '语音绘图画布' }).querySelectorAll('path').length).toBeGreaterThan(3))
  })

  it('uses the local semantic scene template for sun and cloud commands', async () => {
    const user = userEvent.setup()

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: '太阳和云' }))

    expect(aiParserMock).not.toHaveBeenCalled()
    expect(await screen.findByText('provider: local-rules')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('绘制完成')).toBeInTheDocument(), { timeout: 7000 })
    const mirror = screen.getByRole('img', { name: '语音绘图画布' })
    expect(mirror.querySelectorAll('path').length).toBeGreaterThan(16)
    expect(mirror.querySelectorAll('.selected-shape')).toHaveLength(0)
  }, 10_000)

  it('draws a known object asset locally instead of waiting for AI primitives', async () => {
    const user = userEvent.setup()

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: '画大象' }))

    expect(aiParserMock).not.toHaveBeenCalled()
    expect((await screen.findAllByText('provider: local-asset')).length).toBeGreaterThanOrEqual(1)
    await waitFor(() => expect(screen.getByText('绘制完成')).toBeInTheDocument(), { timeout: 7000 })
    const mirror = screen.getByRole('img', { name: '语音绘图画布' })
    expect(mirror.querySelector('[data-asset-id="elephant"]')).not.toBeNull()
    expect(mirror.querySelectorAll('.asset-stroke').length).toBeGreaterThanOrEqual(10)
  }, 10_000)

  it('draws a tree diagram asset instead of a plant tree for tree-diagram commands', async () => {
    const user = userEvent.setup()

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: '树状图' }))

    expect(aiParserMock).not.toHaveBeenCalled()
    expect((await screen.findAllByText('provider: local-asset')).length).toBeGreaterThanOrEqual(1)
    const mirror = screen.getByRole('img', { name: '语音绘图画布' })
    await waitFor(() => expect(mirror.querySelector('[data-asset-id="treeDiagram"]')).not.toBeNull())
    expect(mirror.querySelector('[data-asset-id="tree"]')).toBeNull()
  })

  it('searches the public Excalidraw library index before using AI for unmatched assets', async () => {
    const user = userEvent.setup()

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: '雪花图标' }))

    expect(aiParserMock).not.toHaveBeenCalled()
    expect((await screen.findAllByText('provider: local-asset')).length).toBeGreaterThanOrEqual(1)
    const mirror = screen.getByRole('img', { name: '语音绘图画布' })
    await waitFor(() => expect(mirror.querySelector('[data-excalidraw-source="thijsdev/snowflake.excalidrawlib"]')).not.toBeNull())
  })

  it('executes clear plus following rocket drawing in one command', async () => {
    const user = userEvent.setup()

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: '画大象' }))
    await waitFor(() => expect(screen.getByRole('img', { name: '语音绘图画布' }).querySelector('[data-asset-id="elephant"]')).not.toBeNull())

    await user.click(screen.getByRole('button', { name: '清空后火箭' }))

    expect(aiParserMock).not.toHaveBeenCalled()
    const mirror = screen.getByRole('img', { name: '语音绘图画布' })
    await waitFor(() => expect(mirror.querySelector('[data-asset-id="rocket"]')).not.toBeNull())
    expect(mirror.querySelector('[data-asset-id="elephant"]')).toBeNull()
    expect((await screen.findAllByText('provider: local-asset')).length).toBeGreaterThanOrEqual(1)
  }, 10_000)
})
