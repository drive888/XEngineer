import type { CanvasState } from './executor'
import { getVisualAsset } from './visualAssets'

export function createRevealFrames(previous: CanvasState, next: CanvasState): CanvasState[] {
  const previousIds = new Set(previous.items.map((item) => item.id))
  const newItems = next.items.filter((item) => !previousIds.has(item.id))
  if (newItems.length === 0) return [next]

  const frames: CanvasState[] = []
  newItems.forEach((item, index) => {
    const holdFrames = getRevealHoldFrameCount(item)
    const isFinalNewItem = index === newItems.length - 1
    const visibleNewItems = newItems.slice(0, index)
    const frame = {
      ...next,
      items: [...next.items.filter((entry) => previousIds.has(entry.id)), ...visibleNewItems, item],
      selectedItemIds: isFinalNewItem ? next.selectedItemIds : [],
    }
    for (let frameIndex = 0; frameIndex < holdFrames; frameIndex += 1) frames.push(frame)
  })
  return frames
}

export function createTimelineRevealFrames(previous: CanvasState, timeline: CanvasState[]): CanvasState[] {
  const frames: CanvasState[] = []
  let cursor = previous
  timeline.forEach((state) => {
    const stepFrames = createRevealFrames(cursor, state)
    frames.push(...stepFrames)
    cursor = state
  })
  return frames.length > 0 ? frames : [previous]
}

function getRevealHoldFrameCount(item: CanvasState['items'][number]) {
  if (item.kind !== 'asset') return 1
  const strokeCount = item.externalElements?.length ?? getVisualAsset(item.assetId)?.strokes.length ?? 1
  return Math.max(4, Math.ceil((Math.min(Math.max(strokeCount, 1), 24) * 180 + 900) / 320))
}
