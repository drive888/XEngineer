import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const aiParserMock = vi.hoisted(() => vi.fn())
const strokePlannerMock = vi.hoisted(() => vi.fn())

vi.mock('tldraw', () => ({
  Tldraw: () => <div data-testid="mock-tldraw" />,
}))

vi.mock('./voice-drawing/aiCommandParser', () => ({
  parseCommandWithAi: aiParserMock,
  planStrokesWithAi: strokePlannerMock,
}))

import { App } from './App'

describe('App speech fallback', () => {
  beforeEach(() => {
    aiParserMock.mockReset()
    strokePlannerMock.mockReset()
    strokePlannerMock.mockRejectedValue(new Error('stroke planner unavailable'))
    window.history.pushState({}, '', '/workspace')
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
    window.history.pushState({}, '', '/')
  })

  it('shows a modern product landing page and enters the drawing workspace', async () => {
    const user = userEvent.setup()
    window.history.pushState({}, '', '/')

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    expect(screen.getByText('DrawLess')).toBeInTheDocument()
    expect(screen.queryByText('VoiceDraw')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '说话时，画布跟着动起来' })).toBeInTheDocument()
    expect(screen.getByText(/点击话筒或按空格开始录音/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '功能' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '示例' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '使用方法' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: '产品导航' })).getByRole('button', { name: '进入工作区' })).toBeInTheDocument()
    expect(screen.getAllByText('实时语音').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('AI 解析').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('逐笔绘制').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('示例演示')).toBeInTheDocument()
    expect(screen.getByLabelText('语音绘图操作动图演示')).toBeInTheDocument()
    expect(screen.getAllByText(/按空格开始录音/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/再按一次结束录音/)).toBeInTheDocument()
    expect(screen.queryByText(/七牛云暑期实训营参赛作品/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Day 1/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Day 2/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Day 3/)).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: '开始语音绘图' })[0])

    expect(window.location.pathname).toBe('/workspace')
    expect(screen.getByLabelText('全屏画布区域')).toBeInTheDocument()
    expect(screen.getByLabelText('底部绘图对话框')).toBeInTheDocument()
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

  it('does not read successful drawing messages aloud', async () => {
    const user = userEvent.setup()
    const speak = vi.fn()
    const cancel = vi.fn()
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(function SpeechSynthesisUtterance(this: { text: string }, text: string) {
      this.text = text
    }))
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel, speak },
    })

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await user.type(screen.getByLabelText('输入绘图指令'), '画一个红色圆形')
    await user.click(screen.getByRole('button', { name: '发送指令' }))

    await screen.findByText('已创建红色圆形')
    expect(speak).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
  }, 10_000)

  it('uses a full-canvas workspace with a centered floating command box', async () => {
    const user = userEvent.setup()

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    expect(screen.queryByLabelText('对话工作台')).not.toBeInTheDocument()
    expect(screen.getByLabelText('全屏画布区域')).toBeInTheDocument()
    expect(screen.getByLabelText('底部绘图对话框')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看对话历史' })).toBeInTheDocument()
    expect(screen.queryByLabelText('对话历史记录')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '话筒对话' })).toBeInTheDocument()
    expect(screen.getByLabelText('输入绘图指令')).toHaveAttribute('rows', '1')
    expect(screen.getByLabelText('输入绘图指令')).toHaveAttribute('data-auto-grow', 'true')
    expect(screen.getByLabelText('tldraw 语音绘图画布')).toBeInTheDocument()

    await user.type(screen.getByLabelText('输入绘图指令'), '画一个很长很长的产品流程图，左边是用户输入，中间是 AI 理解，右边是可编辑画布，然后继续添加说明文字')
    expect(screen.getByLabelText('底部绘图对话框')).toHaveClass('is-expanded')
    expect(screen.getByLabelText('输入绘图指令')).toHaveAttribute('rows', '2')
    await user.clear(screen.getByLabelText('输入绘图指令'))

    await user.type(screen.getByLabelText('输入绘图指令'), '画一个红色圆形')
    await user.click(screen.getByRole('button', { name: '发送指令' }))

    expect(screen.getAllByText('画一个红色圆形')).toHaveLength(2)
    await waitFor(() => expect(screen.getByLabelText('语音绘图画布').querySelectorAll('.selected-shape')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: '查看对话历史' }))

    const historyPanel = screen.getByLabelText('对话历史记录')
    expect(historyPanel).toBeInTheDocument()
    expect(screen.getByText('历史记录')).toBeInTheDocument()
    expect(within(historyPanel).getByText('已创建红色圆形')).toBeInTheDocument()
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

  it('uses the visible conversation button to start Bolna MiMo first', async () => {
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
    await user.click(screen.getByRole('button', { name: '话筒对话' }))

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(screen.getByText('Bolna MiMo 录音中')).toBeInTheDocument()
  })

  it('falls back to Web Speech from the visible conversation button when MiMo is unavailable', async () => {
    const user = userEvent.setup()
    const start = vi.fn(function start(this: { onstart: (() => void) | null }) {
      this.onstart?.()
    })
    const stop = vi.fn()
    class FakeSpeechRecognition {
      lang = ''
      continuous = false
      interimResults = false
      onstart: (() => void) | null = null
      onend: (() => void) | null = null
      onerror = null
      onresult = null
      start = start
      stop = stop
    }
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/asr/status')) {
          return new Response(JSON.stringify({ bolnaMimo: { available: false, reason: 'MiMo disabled in test' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('/api/voice/status')) {
          return new Response(JSON.stringify({ transcribeAvailable: false, reason: 'OPENAI_API_KEY is not configured' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('/api/realtime/status')) {
          return new Response(
            JSON.stringify({ openaiRealtime: { available: false, reason: 'OPENAI_API_KEY is not configured', model: 'gpt-realtime' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response('{}', { status: 404 })
      }),
    )

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await screen.findByText(/Bolna MiMo: MiMo disabled in test/)
    await user.click(screen.getByRole('button', { name: '话筒对话' }))

    expect(start).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Web Speech 录音中')).toBeInTheDocument()
  })

  it('toggles voice recording with Space without repeating while held', async () => {
    const start = vi.fn(function start(this: { onstart: (() => void) | null }) {
      this.onstart?.()
    })
    const stop = vi.fn(function stop(this: { onend: (() => void) | null }) {
      this.onend?.()
    })
    class FakeSpeechRecognition {
      lang = ''
      continuous = false
      interimResults = false
      onstart: (() => void) | null = null
      onend: (() => void) | null = null
      onerror = null
      onresult = null
      start = start
      stop = stop
    }
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/asr/status')) {
          return new Response(JSON.stringify({ bolnaMimo: { available: false, reason: 'MiMo disabled in test' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('/api/voice/status')) {
          return new Response(JSON.stringify({ transcribeAvailable: false, reason: 'OPENAI_API_KEY is not configured' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('/api/realtime/status')) {
          return new Response(
            JSON.stringify({ openaiRealtime: { available: false, reason: 'OPENAI_API_KEY is not configured', model: 'gpt-realtime' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response('{}', { status: 404 })
      }),
    )

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await screen.findByText(/Bolna MiMo: MiMo disabled in test/)
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })

    expect(start).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Web Speech 录音中')).toBeInTheDocument()

    fireEvent.keyDown(window, { code: 'Space', key: ' ', repeat: true })

    expect(start).toHaveBeenCalledTimes(1)
    expect(stop).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { code: 'Space', key: ' ' })

    expect(stop).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Web Speech 已停止')).toBeInTheDocument()
  })

  it('stops Bolna MiMo recording with Space after it was started with Space', async () => {
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
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }))
    expect(screen.getByText('Bolna MiMo 录音中')).toBeInTheDocument()

    fireEvent.keyDown(window, { code: 'Space', key: ' ' })

    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1))
    expect(disconnect).toHaveBeenCalled()
    expect(screen.queryByText('Bolna MiMo 录音中')).not.toBeInTheDocument()
  })

  it('does not toggle voice recording when Space is typed in the command box', async () => {
    const start = vi.fn()
    class FakeSpeechRecognition {
      lang = ''
      continuous = false
      interimResults = false
      onstart = null
      onend = null
      onerror = null
      onresult = null
      start = start
      stop = vi.fn()
    }
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/asr/status')) {
          return new Response(JSON.stringify({ bolnaMimo: { available: false, reason: 'MiMo disabled in test' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('/api/voice/status')) {
          return new Response(JSON.stringify({ transcribeAvailable: false, reason: 'OPENAI_API_KEY is not configured' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('/api/realtime/status')) {
          return new Response(
            JSON.stringify({ openaiRealtime: { available: false, reason: 'OPENAI_API_KEY is not configured', model: 'gpt-realtime' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response('{}', { status: 404 })
      }),
    )

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await screen.findByText(/Bolna MiMo: MiMo disabled in test/)
    screen.getByLabelText('输入绘图指令').focus()
    fireEvent.keyDown(screen.getByLabelText('输入绘图指令'), { code: 'Space', key: ' ' })

    expect(start).not.toHaveBeenCalled()
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

  it('uses experimental stroke planner for open-ended scenery when available', async () => {
    const user = userEvent.setup()
    strokePlannerMock.mockResolvedValue({
      operations: [
        { action: 'create', kind: 'shape', shape: 'line', fill: 'green', stroke: 'green', x: 80, y: 360, width: 700, height: 8, selected: false },
        { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'yellow', stroke: 'orange', x: 140, y: 96, width: 90, height: 90, selected: false },
      ],
      normalizedText: '画一片森林风景',
      confidence: 0.84,
      provider: 'ai-stroke-planner',
    })

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await user.type(screen.getByLabelText('输入绘图指令'), '画一片森林风景')
    await user.click(screen.getByRole('button', { name: '发送指令' }))

    expect(strokePlannerMock).toHaveBeenCalledWith('画一片森林风景')
    expect(aiParserMock).not.toHaveBeenCalled()
    expect(await screen.findByText('provider: ai-stroke-planner')).toBeInTheDocument()
  })

  it('falls back to local strokes instead of assets when experimental scenery planning fails', async () => {
    const user = userEvent.setup()
    strokePlannerMock.mockRejectedValue(new Error('AI parser request timed out'))

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await user.type(screen.getByLabelText('输入绘图指令'), '画一片森林风景')
    await user.click(screen.getByRole('button', { name: '发送指令' }))

    expect(strokePlannerMock).toHaveBeenCalledWith('画一片森林风景')
    expect(aiParserMock).not.toHaveBeenCalled()
    expect(await screen.findByText('provider: local-stroke-fallback')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('绘制完成')).toBeInTheDocument(), { timeout: 7000 })
    const mirror = screen.getByRole('img', { name: '语音绘图画布' })
    expect(mirror.querySelector('[data-asset-id]')).toBeNull()
    expect(mirror.querySelectorAll('path').length).toBeGreaterThanOrEqual(10)
  }, 10_000)

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

  it('draws grassland as separate scene strokes instead of a pasted asset', async () => {
    const user = userEvent.setup()

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await user.type(screen.getByLabelText('输入绘图指令'), '画一片草原')
    await user.click(screen.getByRole('button', { name: '发送指令' }))

    expect(aiParserMock).not.toHaveBeenCalled()
    expect((await screen.findAllByText('provider: local-rules')).length).toBeGreaterThanOrEqual(1)
    await waitFor(() => expect(screen.getByText('绘制完成')).toBeInTheDocument(), { timeout: 7000 })
    const mirror = screen.getByRole('img', { name: '语音绘图画布' })
    expect(mirror.querySelector('[data-asset-id="grassland"]')).toBeNull()
    expect(mirror.querySelectorAll('path').length).toBeGreaterThanOrEqual(16)
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
