import { describe, expect, it } from 'vitest'
import { createInitialCanvasState, type CanvasState } from './executor'
import { createRevealFrames, createTimelineRevealFrames } from './drawingAnimation'

function withItems(ids: string[]): CanvasState {
  return {
    ...createInitialCanvasState(),
    items: ids.map((id, index) => ({
      id,
      kind: 'shape',
      shape: 'rectangle',
      fill: 'blue',
      stroke: '#263241',
      x: index * 40,
      y: 0,
      width: 40,
      height: 40,
      selected: index === ids.length - 1,
    })),
    lastItemId: ids.at(-1) ?? null,
    selectedItemIds: ids.length ? [ids[ids.length - 1]] : [],
  }
}

function withAsset(id: string): CanvasState {
  return {
    ...createInitialCanvasState(),
    items: [
      {
        id,
        kind: 'asset',
        assetId: 'rocket',
        fill: 'red',
        stroke: 'black',
        x: 120,
        y: 40,
        width: 360,
        height: 440,
        selected: false,
      },
    ],
    lastItemId: id,
    selectedItemIds: [],
  }
}

describe('createRevealFrames', () => {
  it('reveals newly created items one frame at a time', () => {
    const previous = withItems(['item-1'])
    const next = withItems(['item-1', 'item-2', 'item-3'])

    const frames = createRevealFrames(previous, next)

    expect(frames.map((frame) => frame.items.map((item) => item.id))).toEqual([
      ['item-1', 'item-2'],
      ['item-1', 'item-2', 'item-3'],
    ])
    expect(frames[1].selectedItemIds).toEqual(['item-3'])
  })

  it('returns the final state when no new items were created', () => {
    const previous = withItems(['item-1'])
    const next = withItems(['item-1'])

    expect(createRevealFrames(previous, next)).toEqual([next])
  })

  it('keeps visual assets mounted while CSS draws their strokes sequentially', () => {
    const previous = withItems([])
    const next = withAsset('item-asset')

    const frames = createRevealFrames(previous, next)

    expect(frames.length).toBeGreaterThan(3)
    expect(frames.every((frame) => frame.items[0]?.id === 'item-asset')).toBe(true)
    expect(frames.every((frame) => !('revealStrokeCount' in frame.items[0]))).toBe(true)
  })

  it('keeps clear operations visible between multi-step drawing states', () => {
    const previous = withItems([])
    const treeState = withAsset('item-tree')
    treeState.items[0].assetId = 'tree'
    const clearState = { ...treeState, items: [], lastItemId: null, selectedItemIds: [] }
    const rocketState = withAsset('item-rocket')

    const frames = createTimelineRevealFrames(previous, [treeState, clearState, rocketState])

    expect(frames.some((frame) => frame.items.some((item) => item.assetId === 'tree'))).toBe(true)
    expect(frames.some((frame) => frame.items.length === 0)).toBe(true)
    expect(frames.at(-1)?.items.map((item) => item.assetId)).toEqual(['rocket'])
  })
})
