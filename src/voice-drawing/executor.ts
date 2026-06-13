import type { DrawOperation, PositionName, ShapeKind, SizeName, TargetRef } from './types'
import { renderItemAsRoughSvg } from './roughSvgRenderer'
import { getVisualAsset } from './visualAssets'

export type CanvasItem = {
  id: string
  kind: 'shape' | 'text' | 'arrow' | 'asset'
  shape?: ShapeKind
  assetId?: string
  assetLabel?: string
  externalSource?: string
  externalElements?: unknown[]
  text?: string
  fill: string
  stroke: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  selected?: boolean
}

export type CanvasSnapshot = {
  items: CanvasItem[]
  lastItemId: string | null
  selectedItemIds: string[]
  recentItemIds: string[]
}

export type CanvasState = CanvasSnapshot & {
  past: CanvasSnapshot[]
  future: CanvasSnapshot[]
  nextId: number
  exportedSvg: string | null
}

export type ExecuteResult = {
  state: CanvasState
  messages: string[]
  errors: string[]
}

const CANVAS = { width: 900, height: 560 }

const colorLabels: Record<string, string> = {
  red: '红色',
  blue: '蓝色',
  green: '绿色',
  yellow: '黄色',
  black: '黑色',
  white: '白色',
  gray: '灰色',
  purple: '紫色',
  orange: '橙色',
  pink: '粉色',
  brown: '棕色',
  cyan: '青色',
}

const shapeLabels: Record<string, string> = {
  ellipse: '圆形',
  rectangle: '矩形',
  triangle: '三角形',
  diamond: '菱形',
  line: '线条',
}

export function createInitialCanvasState(): CanvasState {
  return {
    items: [],
    lastItemId: null,
    selectedItemIds: [],
    recentItemIds: [],
    past: [],
    future: [],
    nextId: 1,
    exportedSvg: null,
  }
}

export function executeOperations(start: CanvasState, operations: DrawOperation[]): ExecuteResult {
  return operations.reduce<ExecuteResult>(
    (result, operation) => {
      const next = executeOne(result.state, operation)
      return {
        state: next.state,
        messages: [...result.messages, ...next.messages],
        errors: [...result.errors, ...next.errors],
      }
    },
    { state: start, messages: [], errors: [] },
  )
}

function executeOne(state: CanvasState, operation: DrawOperation): ExecuteResult {
  if (operation.action === 'undo') return undo(state)
  if (operation.action === 'redo') return redo(state)
  if (operation.action === 'export') {
    return {
      state: { ...state, exportedSvg: serializeSvg(state.items) },
      messages: ['已导出图片'],
      errors: [],
    }
  }

  const before = snapshot(state)
  const base = { ...state, past: [...state.past, before], future: [], exportedSvg: null }

  if (operation.action === 'clear') {
    return {
      state: { ...base, items: [], lastItemId: null, selectedItemIds: [], recentItemIds: [] },
      messages: ['已清空画布'],
      errors: [],
    }
  }

  if (operation.action === 'create') {
    const id = `item-${state.nextId}`
    const geometry = resolveCreateGeometry(operation)
    const item: CanvasItem = {
      id,
      kind: operation.kind,
      shape: operation.shape,
      assetId: operation.assetId,
      assetLabel: operation.assetLabel,
      externalSource: operation.externalSource,
      externalElements: operation.externalElements,
      text: operation.text,
      fill: operation.fill ?? 'gray',
      stroke: operation.stroke ?? '#263241',
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      rotation: operation.rotation,
      selected: true,
    }
    const shouldSelect = operation.selected !== false
    return {
      state: {
        ...base,
        items: [...base.items.map((entry) => ({ ...entry, selected: false })), { ...item, selected: shouldSelect }],
        lastItemId: id,
        selectedItemIds: shouldSelect ? [id] : [],
        recentItemIds: [id, ...base.recentItemIds].slice(0, 12),
        nextId: state.nextId + 1,
      },
      messages: [createdMessage(item)],
      errors: [],
    }
  }

  if (
    operation.action !== 'update' &&
    operation.action !== 'move' &&
    operation.action !== 'resize' &&
    operation.action !== 'delete' &&
    operation.action !== 'select'
  ) {
    return { state, messages: [], errors: ['不支持的操作'] }
  }

  const targetId = resolveTargetId(base, operation.target)
  if (!targetId) {
    return { state, messages: [], errors: ['没有找到目标对象'] }
  }

  if (operation.action === 'delete') {
    return {
      state: {
        ...base,
        items: base.items.filter((item) => item.id !== targetId),
        lastItemId: null,
        selectedItemIds: [],
        recentItemIds: base.recentItemIds.filter((id) => id !== targetId),
      },
      messages: ['已删除目标对象'],
      errors: [],
    }
  }

  if (operation.action === 'select') {
    return {
      state: {
        ...base,
        items: base.items.map((item) => ({ ...item, selected: item.id === targetId })),
        selectedItemIds: [targetId],
        lastItemId: targetId,
      },
      messages: ['已选中目标对象'],
      errors: [],
    }
  }

  const items = base.items.map((item) => {
    if (item.id !== targetId) return item
    if (operation.action === 'update') {
      return {
        ...item,
        fill: operation.fill ?? item.fill,
        stroke: operation.stroke ?? item.stroke,
        text: operation.text ?? item.text,
        selected: true,
      }
    }
    if (operation.action === 'move') {
      return { ...item, x: item.x + (operation.dx ?? 0), y: item.y + (operation.dy ?? 0), selected: true }
    }
    if (operation.action === 'resize') {
      return {
        ...item,
        width: Math.round(item.width * operation.scale),
        height: Math.round(item.height * operation.scale),
        selected: true,
      }
    }
    return item
  })

  return {
    state: { ...base, items, lastItemId: targetId, selectedItemIds: [targetId] },
    messages: [operation.action === 'update' ? '已更新目标对象' : operation.action === 'move' ? '已移动目标对象' : '已调整目标对象大小'],
    errors: [],
  }
}

function snapshot(state: CanvasState): CanvasSnapshot {
  return {
    items: state.items.map((item) => ({ ...item })),
    lastItemId: state.lastItemId,
    selectedItemIds: [...state.selectedItemIds],
    recentItemIds: [...state.recentItemIds],
  }
}

function restore(state: CanvasState, next: CanvasSnapshot): CanvasState {
  return { ...state, ...next, items: next.items.map((item) => ({ ...item })) }
}

function undo(state: CanvasState): ExecuteResult {
  const previous = state.past[state.past.length - 1]
  if (!previous) return { state, messages: ['没有可撤销的操作'], errors: [] }
  return {
    state: { ...restore(state, previous), past: state.past.slice(0, -1), future: [snapshot(state), ...state.future] },
    messages: ['已撤销'],
    errors: [],
  }
}

function redo(state: CanvasState): ExecuteResult {
  const next = state.future[0]
  if (!next) return { state, messages: ['没有可重做的操作'], errors: [] }
  return {
    state: { ...restore(state, next), past: [...state.past, snapshot(state)], future: state.future.slice(1) },
    messages: ['已重做'],
    errors: [],
  }
}

function resolveTargetId(state: CanvasState, target?: TargetRef) {
  if (!target || target.type === 'last') return state.lastItemId
  if (target.type === 'selected') return state.selectedItemIds[0] ?? null
  if (target.type === 'byId') return state.items.some((item) => item.id === target.id) ? target.id : null
  const matches = state.items.filter((item) => {
    const shapeMatches = !target.shape || item.shape === target.shape || (target.shape === 'text' && item.kind === 'text')
    const colorMatches = !target.color || item.fill === target.color
    return shapeMatches && colorMatches
  })
  if (target.order === 'largest') {
    return [...matches].sort((a, b) => b.width * b.height - a.width * a.height)[0]?.id ?? null
  }
  if (target.order === 'smallest') {
    return [...matches].sort((a, b) => a.width * a.height - b.width * b.height)[0]?.id ?? null
  }
  return matches[matches.length - 1]?.id ?? null
}

function resolveSize(size: SizeName = 'medium', shape?: ShapeKind) {
  if (shape === 'ellipse') {
    if (size === 'small') return { width: 80, height: 80 }
    if (size === 'large') return { width: 156, height: 156 }
    return { width: 120, height: 120 }
  }
  if (size === 'small') return { width: 80, height: 56 }
  if (size === 'large') return { width: 156, height: 156 }
  return { width: 120, height: 80 }
}

function resolveAssetSize(assetId: string | undefined, size: SizeName = 'medium') {
  const asset = getVisualAsset(assetId)
  const base = asset ? { width: asset.defaultWidth, height: asset.defaultHeight } : { width: 360, height: 260 }
  const scale = size === 'small' ? 0.72 : size === 'large' ? 1 : 0.84
  return {
    width: Math.round(base.width * scale),
    height: Math.round(base.height * scale),
  }
}

function resolveCreateGeometry(operation: Extract<DrawOperation, { action: 'create' }>) {
  const defaultSize =
    operation.kind === 'arrow'
      ? { width: 180, height: 24 }
      : operation.kind === 'asset'
        ? resolveAssetSize(operation.assetId, operation.size)
        : resolveSize(operation.size, operation.shape)
  const explicitWidth = operation.width !== undefined ? clamp(Math.round(operation.width), 4, 500) : defaultSize.width
  const explicitHeight = operation.height !== undefined ? clamp(Math.round(operation.height), 4, 400) : defaultSize.height
  const size =
    operation.shape === 'ellipse'
      ? { width: Math.min(explicitWidth, explicitHeight), height: Math.min(explicitWidth, explicitHeight) }
      : { width: explicitWidth, height: explicitHeight }
  const defaultPosition = resolvePosition(operation.position ?? 'center', size.width, size.height)
  return {
    x: clamp(Math.round(operation.x ?? defaultPosition.x), 0, CANVAS.width - size.width),
    y: clamp(Math.round(operation.y ?? defaultPosition.y), 0, CANVAS.height - size.height),
    width: size.width,
    height: size.height,
  }
}

function resolvePosition(position: PositionName, width: number, height: number) {
  const xMap: Record<PositionName, number> = {
    'top-left': 96,
    top: (CANVAS.width - width) / 2,
    'top-right': CANVAS.width - width - 64,
    left: 96,
    center: (CANVAS.width - width) / 2,
    right: CANVAS.width - width - 96,
    'bottom-left': 96,
    bottom: (CANVAS.width - width) / 2,
    'bottom-right': CANVAS.width - width - 64,
  }
  const yMap: Record<PositionName, number> = {
    'top-left': 64,
    top: 64,
    'top-right': 120,
    left: (CANVAS.height - height) / 2,
    center: (CANVAS.height - height) / 2,
    right: (CANVAS.height - height) / 2,
    'bottom-left': CANVAS.height - height - 64,
    bottom: CANVAS.height - height - 64,
    'bottom-right': CANVAS.height - height - 64,
  }
  return { x: Math.round(xMap[position]), y: Math.round(yMap[position]) }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function createdMessage(item: CanvasItem) {
  if (item.kind === 'arrow') return '已创建箭头'
  if (item.kind === 'text') return `已创建文字${item.text ?? ''}`
  if (item.kind === 'asset') return `已创建${getVisualAsset(item.assetId)?.label ?? item.assetLabel ?? '对象'}`
  return `已创建${colorLabels[item.fill] ?? ''}${shapeLabels[item.shape ?? 'rectangle'] ?? '图形'}`
}

export function serializeSvg(items: CanvasItem[]) {
  const body = items.map(renderItemAsRoughSvg).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">${body}</svg>`
}
