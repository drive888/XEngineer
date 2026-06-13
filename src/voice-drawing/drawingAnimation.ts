import type { CanvasState } from './executor'

export function createRevealFrames(previous: CanvasState, next: CanvasState): CanvasState[] {
  const previousIds = new Set(previous.items.map((item) => item.id))
  const newItems = next.items.filter((item) => !previousIds.has(item.id))
  if (newItems.length === 0) return [next]

  return newItems.map((_, index) => ({
    ...next,
    items: next.items.filter((item) => previousIds.has(item.id) || newItems.slice(0, index + 1).some((entry) => entry.id === item.id)),
    selectedItemIds: index === newItems.length - 1 ? next.selectedItemIds : [],
  }))
}
