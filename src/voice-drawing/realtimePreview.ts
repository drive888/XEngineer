import { createInitialCanvasState, executeOperations, type CanvasState } from './executor'
import { parseVoiceCommand } from './parser'
import type { DrawOperation } from './types'

export type RealtimePreview = {
  key: string
  text: string
  state: CanvasState
}

const destructiveActions = new Set<DrawOperation['action']>(['clear', 'delete', 'undo', 'redo', 'export'])

export function buildRealtimePreview(baseState: CanvasState, text: string): RealtimePreview | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const parsed = parseVoiceCommand(trimmed)
  const safeOperations = parsed.operations.filter(isPreviewSafeOperation).map((operation) => ({
    ...operation,
    selected: operation.action === 'create' ? false : undefined,
  }))
  if (safeOperations.length === 0) return null

  const previewBase = cloneCanvasState(baseState)
  const result = executeOperations(previewBase, safeOperations)
  if (result.errors.length > 0 || result.state.items.length === baseState.items.length) return null

  return {
    key: parsed.normalizedText,
    text: trimmed,
    state: result.state,
  }
}

function isPreviewSafeOperation(operation: DrawOperation): operation is Extract<DrawOperation, { action: 'create' }> {
  if (destructiveActions.has(operation.action)) return false
  if (operation.action !== 'create' || operation.kind === 'text') return false
  if (operation.kind === 'asset' && operation.assetId?.startsWith('excalidraw:')) return false
  return true
}

function cloneCanvasState(state: CanvasState): CanvasState {
  return {
    ...createInitialCanvasState(),
    ...state,
    items: state.items.map((item) => ({ ...item })),
    selectedItemIds: [...state.selectedItemIds],
    recentItemIds: [...state.recentItemIds],
    past: state.past.map((snapshot) => ({
      ...snapshot,
      items: snapshot.items.map((item) => ({ ...item })),
      selectedItemIds: [...snapshot.selectedItemIds],
      recentItemIds: [...snapshot.recentItemIds],
    })),
    future: state.future.map((snapshot) => ({
      ...snapshot,
      items: snapshot.items.map((item) => ({ ...item })),
      selectedItemIds: [...snapshot.selectedItemIds],
      recentItemIds: [...snapshot.recentItemIds],
    })),
  }
}
