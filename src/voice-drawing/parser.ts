import { normalizeCommand } from './normalizer'
import type { DrawOperation, ParseResult, PositionName, ShapeKind, SizeName } from './types'
import { findExternalLibraryAssetId, getExternalCatalogEntry } from './excalidrawLibraryAssets'
import { findVisualAssetId, getVisualAsset } from './visualAssets'

const colorMap: Record<string, string> = {
  红色: 'red',
  蓝色: 'blue',
  绿色: 'green',
  黄色: 'yellow',
  黑色: 'black',
  白色: 'white',
  灰色: 'gray',
  紫色: 'purple',
  橙色: 'orange',
  粉色: 'pink',
}

const shapeMap: Record<string, ShapeKind> = {
  圆形: 'ellipse',
  矩形: 'rectangle',
  圆角矩形: 'rectangle',
  三角形: 'triangle',
  菱形: 'diamond',
  线: 'line',
}

const positionMap: Array<[string, PositionName]> = [
  ['左上角', 'top-left'],
  ['右上角', 'top-right'],
  ['左下角', 'bottom-left'],
  ['右下角', 'bottom-right'],
  ['上方', 'top'],
  ['下方', 'bottom'],
  ['左边', 'left'],
  ['左侧', 'left'],
  ['右边', 'right'],
  ['右侧', 'right'],
  ['中间', 'center'],
  ['中心', 'center'],
]

const sizeMap: Array<[RegExp, SizeName]> = [
  [/大的|大号|放大/, 'large'],
  [/小的|小号/, 'small'],
]

export function parseVoiceCommand(input: string): ParseResult {
  const normalizedText = normalizeCommand(input)
  const operations = splitSteps(normalizedText).flatMap(parseStep)

  return {
    originalText: input,
    normalizedText,
    operations,
    confidence: operations.length > 0 ? 0.92 : 0.2,
    needsConfirmation: operations.length === 0,
    question: operations.length === 0 ? '我还不能确定要画什么，请换一种说法。' : '',
    usedFallback: false,
  }
}

function splitSteps(text: string) {
  return text
    .replace(/(清空|清除|清理|擦掉)画布后/g, '$1画布,')
    .split(/然后|接着|再|,/)
    .map((step) => step.trim())
    .filter(Boolean)
}

function parseStep(text: string): DrawOperation[] {
  if (/^撤销$/.test(text)) return [{ action: 'undo' }]
  if (/^重做$/.test(text)) return [{ action: 'redo' }]
  if (/清空|清除|清理|擦掉/.test(text) && /画布|全部|所有/.test(text)) return [{ action: 'clear' }]
  if (/导出|保存作品|保存图片/.test(text)) return [{ action: 'export' }]
  if (/删除/.test(text)) return [{ action: 'delete', target: { type: 'last' } }]
  if (/太阳/.test(text) && /云/.test(text)) return createSunCloudSceneTemplate()
  if (/流程图/.test(text) && /开始/.test(text) && /结束/.test(text)) return createFlowchartTemplate()
  const visualAsset = findVisualAssetId(text)
  if (visualAsset && /画|来|生成|创建|加/.test(text)) {
    const asset = getVisualAsset(visualAsset)
    return [
      {
        action: 'create',
        kind: 'asset',
        assetId: visualAsset,
        fill: asset?.defaultFill,
        stroke: asset?.defaultStroke,
        position: findPosition(text),
        size: findSize(text, visualAsset),
        selected: false,
      },
    ]
  }
  const externalAssetId = findExternalLibraryAssetId(text)
  if (externalAssetId && /画|来|生成|创建|加/.test(text)) {
    const entry = getExternalCatalogEntry(externalAssetId)
    return [
      {
        action: 'create',
        kind: 'asset',
        assetId: externalAssetId,
        assetLabel: entry?.label,
        externalSource: entry?.source,
        fill: 'white',
        stroke: 'black',
        position: findPosition(text),
        size: findSize(text),
        selected: false,
      },
    ]
  }

  if (/选中|选择/.test(text)) {
    const shape = findShape(text)
    const color = findColor(text)
    const order = /最大/.test(text) ? 'largest' : /最小/.test(text) ? 'smallest' : undefined
    if (shape || color || order) {
      return [{ action: 'select', target: compactQueryTarget(shape, color, order) }]
    }
  }

  const updateColor = findColor(text)
  if (/改成|变成|换成/.test(text) && updateColor) {
    return [{ action: 'update', target: { type: 'last' }, fill: updateColor }]
  }

  if (/向?左/.test(text) && /移动|挪/.test(text)) {
    return [{ action: 'move', target: { type: 'last' }, direction: 'left', dx: -48, dy: 0 }]
  }
  if (/向?右/.test(text) && /移动|挪/.test(text)) {
    return [{ action: 'move', target: { type: 'last' }, direction: 'right', dx: 48, dy: 0 }]
  }
  if (/向?上/.test(text) && /移动|挪/.test(text)) {
    return [{ action: 'move', target: { type: 'last' }, direction: 'up', dx: 0, dy: -48 }]
  }
  if (/向?下/.test(text) && /移动|挪/.test(text)) {
    return [{ action: 'move', target: { type: 'last' }, direction: 'down', dx: 0, dy: 48 }]
  }

  if (/放大|变大/.test(text)) return [{ action: 'resize', target: { type: 'last' }, scale: 1.18 }]
  if (/缩小|变小/.test(text)) return [{ action: 'resize', target: { type: 'last' }, scale: 0.85 }]

  const textContent = parseTextContent(text)
  if (textContent) {
    return [
      {
        action: 'create',
        kind: 'text',
        text: textContent,
        fill: findColor(text) ?? 'black',
        position: findPosition(text),
        size: findSize(text),
      },
    ]
  }

  const shape = findShape(text)
  if (/画|创建|生成/.test(text) && shape) {
    return [
      {
        action: 'create',
        kind: 'shape',
        shape,
        fill: findColor(text) ?? 'gray',
        position: findPosition(text),
        size: findSize(text),
      },
    ]
  }

  return []
}

function compactQueryTarget(shape?: ShapeKind, color?: string, order?: 'largest' | 'smallest') {
  return {
    type: 'query' as const,
    ...(shape ? { shape } : {}),
    ...(color ? { color } : {}),
    ...(order ? { order } : {}),
  }
}

function createFlowchartTemplate(): DrawOperation[] {
  return [
    {
      action: 'create',
      kind: 'shape',
      shape: 'ellipse',
      text: '开始',
      fill: 'green',
      position: 'left',
      size: 'medium',
    },
    {
      action: 'create',
      kind: 'arrow',
      fill: 'black',
      position: 'center',
      size: 'medium',
    },
    {
      action: 'create',
      kind: 'shape',
      shape: 'ellipse',
      text: '结束',
      fill: 'orange',
      position: 'right',
      size: 'medium',
    },
  ]
}

function createSunCloudSceneTemplate(): DrawOperation[] {
  const keepUnselected = { selected: false }
  return [
    ...createSun(170, 128, 124),
    ...createCloud(360, 136, 0.92),
    ...createCloud(540, 96, 0.68),
  ].map((operation) => ({ ...operation, ...keepUnselected }))
}

function createSun(cx: number, cy: number, diameter: number): Extract<DrawOperation, { action: 'create' }>[] {
  const rayLength = 54
  const rayWidth = 14
  const rayDistance = diameter / 2 + 30
  const rays = Array.from({ length: 8 }, (_, index) => {
    const angle = index * 45
    const radians = (angle * Math.PI) / 180
    const x = cx + Math.cos(radians) * rayDistance - rayWidth / 2
    const y = cy + Math.sin(radians) * rayDistance - rayLength / 2
    return {
      action: 'create' as const,
      kind: 'shape' as const,
      shape: 'rectangle' as const,
      fill: 'orange',
      stroke: 'orange',
      x: Math.round(x),
      y: Math.round(y),
      width: rayWidth,
      height: rayLength,
      rotation: angle + 90,
    }
  })

  return [
    ...rays,
    {
      action: 'create',
      kind: 'shape',
      shape: 'ellipse',
      fill: 'yellow',
      stroke: 'orange',
      x: cx - diameter / 2,
      y: cy - diameter / 2,
      width: diameter,
      height: diameter,
    },
  ]
}

function createCloud(x: number, y: number, scale: number): Extract<DrawOperation, { action: 'create' }>[] {
  const part = (shape: ShapeKind, dx: number, dy: number, width: number, height: number) => ({
    action: 'create' as const,
    kind: 'shape' as const,
    shape,
    fill: 'gray',
    stroke: 'gray',
    x: Math.round(x + dx * scale),
    y: Math.round(y + dy * scale),
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  })

  return [
    part('rectangle', 42, 70, 174, 58),
    part('ellipse', 12, 24, 92, 92),
    part('ellipse', 78, 0, 116, 116),
    part('ellipse', 160, 30, 86, 86),
  ]
}

function findColor(text: string) {
  return Object.entries(colorMap).find(([name]) => text.includes(name))?.[1]
}

function findShape(text: string) {
  return Object.entries(shapeMap).find(([name]) => text.includes(name))?.[1]
}

function findPosition(text: string): PositionName {
  return positionMap.find(([name]) => text.includes(name))?.[1] ?? 'center'
}

function findSize(text: string, assetId?: string): SizeName {
  const explicitSize = sizeMap.find(([pattern]) => pattern.test(text))?.[1]
  if (explicitSize) return explicitSize
  return assetId === 'elephant' ? 'large' : 'medium'
}

function parseTextContent(text: string) {
  const match = text.match(/(?:写上|写|添加文字|文字)(.+)$/)
  return match?.[1]?.trim() || ''
}
