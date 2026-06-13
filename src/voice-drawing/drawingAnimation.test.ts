import { describe, expect, it } from 'vitest'
import { createInitialCanvasState, type CanvasState } from './executor'
import { createRevealFrames } from './drawingAnimation'

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
})
