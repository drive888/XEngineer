import { describe, expect, it } from 'vitest'
import { createInitialCanvasState } from './executor'
import { buildRealtimePreview } from './realtimePreview'

describe('buildRealtimePreview', () => {
  it('builds a preview canvas for safe interim create commands', () => {
    const preview = buildRealtimePreview(createInitialCanvasState(), '画一头大象')

    expect(preview).toMatchObject({
      key: '画一头大象',
      text: '画一头大象',
    })
    expect(preview?.state.items).toHaveLength(1)
    expect(preview?.state.items[0]).toMatchObject({
      kind: 'asset',
      assetId: 'elephant',
      selected: false,
    })
  })

  it('blocks destructive interim commands', () => {
    const state = createInitialCanvasState()

    expect(buildRealtimePreview(state, '清空画布')).toBeNull()
    expect(buildRealtimePreview(state, '撤销')).toBeNull()
    expect(buildRealtimePreview(state, '删除刚才那个')).toBeNull()
  })

  it('keeps only safe create operations from mixed interim text', () => {
    const preview = buildRealtimePreview(createInitialCanvasState(), '清空画布，然后画一个火箭')

    expect(preview?.state.items).toHaveLength(1)
    expect(preview?.state.items[0]).toMatchObject({
      kind: 'asset',
      assetId: 'rocket',
    })
  })
})
