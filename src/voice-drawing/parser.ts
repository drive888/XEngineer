import { normalizeCommand } from './normalizer'
import type { DrawOperation, ParseResult, PositionName, ShapeKind, SizeName } from './types'
import { findExternalLibraryAssetId, getExternalCatalogEntry } from './excalidrawLibraryAssets'
import { findVisualAssetId, getVisualAsset, visualAssets } from './visualAssets'

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
  if (isMindMapScene(text)) return createMindMapTemplate(text)
  if (isGrasslandScene(text)) return createGrasslandSceneTemplate(text)
  if (/太阳/.test(text) && /云/.test(text)) return createSunCloudSceneTemplate()
  if (/流程图/.test(text) && /开始/.test(text) && /结束/.test(text)) return createFlowchartTemplate()
  const visualAsset = findVisualAssetId(text)
  if (visualAsset && /画|来|生成|创建|加/.test(text)) {
    const asset = getVisualAsset(visualAsset)
    const relativeTarget = findRelativeTarget(text, visualAsset)
    return [
      {
        action: 'create',
        kind: 'asset',
        assetId: visualAsset,
        fill: asset?.defaultFill,
        stroke: asset?.defaultStroke,
        position: visualAsset === 'grassland' ? 'bottom' : relativeTarget?.position ?? findPosition(text),
        target: relativeTarget?.target,
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

function isMindMapScene(text: string) {
  return /思维导图|脑图|mind\s*map/i.test(text) && /画|创建|生成|做/.test(text)
}

function createMindMapTemplate(text: string): DrawOperation[] {
  const topic = /AI|人工智能/i.test(text) ? 'AI' : '主题'
  const center = { x: 392, y: 224, width: 116, height: 116 }
  const nodes = [
    { label: '机器学习', x: 92, y: 92, width: 178, height: 58, fill: 'yellow', stroke: 'orange', anchor: [392, 258] as [number, number], target: [270, 121] as [number, number] },
    { label: '深度学习', x: 632, y: 92, width: 178, height: 58, fill: 'green', stroke: 'blue', anchor: [508, 258] as [number, number], target: [632, 121] as [number, number] },
    { label: '自然语言处理', x: 76, y: 392, width: 214, height: 62, fill: 'pink', stroke: 'red', anchor: [392, 304] as [number, number], target: [290, 423] as [number, number] },
    { label: '计算机视觉', x: 624, y: 392, width: 214, height: 62, fill: 'purple', stroke: 'blue', anchor: [508, 304] as [number, number], target: [624, 423] as [number, number] },
    { label: '生成式AI', x: 352, y: 60, width: 196, height: 58, fill: 'cyan', stroke: 'blue', anchor: [450, 224] as [number, number], target: [450, 118] as [number, number] },
    { label: '应用场景', x: 352, y: 442, width: 196, height: 58, fill: 'orange', stroke: 'brown', anchor: [450, 340] as [number, number], target: [450, 442] as [number, number] },
  ]

  return [
    {
      action: 'create',
      kind: 'shape',
      shape: 'ellipse',
      text: topic,
      fill: 'cyan',
      stroke: 'blue',
      ...center,
      selected: false,
    },
    ...nodes.flatMap((node) => [
      createCurvedConnector(node.anchor, node.target, node.stroke),
      createMindMapNode(node.x, node.y, node.width, node.height, node.label, node.fill, node.stroke),
    ]),
  ]
}

function createCurvedConnector(from: [number, number], to: [number, number], stroke: string): DrawOperation {
  const midX = Math.round((from[0] + to[0]) / 2)
  const midY = Math.round((from[1] + to[1]) / 2)
  const bend = to[1] < from[1] ? -28 : 28
  return createStrokePath(stroke, [from, [midX, midY + bend], to])
}

function createMindMapNode(x: number, y: number, width: number, height: number, text: string, fill: string, stroke: string): DrawOperation {
  return {
    action: 'create',
    kind: 'shape',
    shape: 'rectangle',
    text,
    fill,
    stroke,
    x,
    y,
    width,
    height,
    selected: false,
  }
}

function isGrasslandScene(text: string) {
  return /草原|草地|草坪|草场/.test(text) && /画|来|生成|创建|加/.test(text)
}

function createGrasslandSceneTemplate(text: string): DrawOperation[] {
  const strokes: DrawOperation[] = [
    createStrokeRect(0, 0, 450, 318, 'cyan', 'cyan'),
    createStrokeRect(450, 0, 450, 318, 'cyan', 'cyan'),
    createStrokeRect(0, 318, 450, 242, '#dcfce7', '#22c55e'),
    createStrokeRect(450, 318, 450, 242, '#dcfce7', '#22c55e'),
    createStrokeEllipse(706, 74, 82, 82, 'yellow', 'orange'),
    createStrokePath('#86efac', [
      [0, 288],
      [122, 250],
      [236, 282],
      [372, 244],
      [520, 276],
      [690, 246],
      [900, 282],
    ]),
    createStrokePath('#4ade80', [
      [0, 334],
      [128, 316],
      [244, 340],
      [392, 314],
      [548, 338],
      [720, 316],
      [900, 336],
    ]),
    createStrokePath('green', [
      [58, 378],
      [196, 360],
      [336, 386],
      [510, 362],
      [688, 384],
      [842, 368],
    ]),
    createStrokePath('#15803d', [
      [38, 420],
      [160, 438],
      [302, 416],
      [470, 438],
      [646, 414],
      [822, 432],
    ]),
    createStrokePath('#166534', [
      [44, 486],
      [220, 474],
      [394, 494],
      [588, 474],
      [812, 488],
    ]),
    ...createGrassBladeCluster(98, 426, 0.8),
    ...createGrassBladeCluster(210, 456, 1),
    ...createGrassBladeCluster(342, 424, 0.75),
    ...createGrassBladeCluster(512, 464, 1.05),
    ...createGrassBladeCluster(656, 430, 0.85),
    ...createGrassBladeCluster(780, 468, 0.95),
    createStrokeEllipse(156, 438, 18, 18, 'yellow', 'orange'),
    createStrokeEllipse(176, 432, 12, 12, 'white', '#94a3b8'),
    createStrokeEllipse(548, 424, 16, 16, 'pink', '#be185d'),
    createStrokeEllipse(586, 438, 12, 12, 'yellow', 'orange'),
    createStrokeEllipse(724, 412, 15, 15, 'white', '#94a3b8'),
    createStrokeEllipse(756, 428, 13, 13, 'pink', '#be185d'),
  ]

  if (!/树|树木|大树/.test(text) || /树状图/.test(text)) return strokes

  return [
    ...strokes,
    {
      action: 'create',
      kind: 'asset',
      assetId: 'tree',
      fill: 'green',
      stroke: 'brown',
      x: 330,
      y: 206,
      width: 240,
      height: 270,
      selected: false,
    },
  ]
}

function createStrokeLine(x: number, y: number, width: number, height: number, stroke: string, rotation: number): DrawOperation {
  return {
    action: 'create',
    kind: 'shape',
    shape: 'line',
    fill: stroke,
    stroke,
    x,
    y,
    width,
    height,
    rotation,
    selected: false,
  }
}

function createStrokePath(stroke: string, points: [number, number][]): DrawOperation {
  return {
    action: 'create',
    kind: 'shape',
    shape: 'path',
    fill: stroke,
    stroke,
    points,
    selected: false,
  }
}

function createStrokeRect(x: number, y: number, width: number, height: number, fill: string, stroke: string): DrawOperation {
  return {
    action: 'create',
    kind: 'shape',
    shape: 'rectangle',
    fill,
    stroke,
    x,
    y,
    width,
    height,
    selected: false,
  }
}

function createStrokeEllipse(x: number, y: number, width: number, height: number, fill: string, stroke: string): DrawOperation {
  return {
    action: 'create',
    kind: 'shape',
    shape: 'ellipse',
    fill,
    stroke,
    x,
    y,
    width,
    height,
    selected: false,
  }
}

function createGrassBladeCluster(x: number, y: number, scale: number): DrawOperation[] {
  return [
    createStrokePath('#166534', [
      [x, y],
      [Math.round(x + 14 * scale), Math.round(y - 42 * scale)],
      [Math.round(x + 28 * scale), Math.round(y - 4 * scale)],
    ]),
    createStrokePath('#15803d', [
      [Math.round(x + 38 * scale), Math.round(y + 6 * scale)],
      [Math.round(x + 56 * scale), Math.round(y - 36 * scale)],
      [Math.round(x + 72 * scale), Math.round(y + 4 * scale)],
    ]),
  ]
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

function findRelativeTarget(text: string, createdAssetId: string): { position: PositionName; target: { type: 'query'; assetId: string } } | null {
  if (!/旁边|附近|边上|旁/.test(text)) return null
  const anchor = Object.values(visualAssets).find((asset) => asset.id !== createdAssetId && asset.aliases.some((alias) => text.includes(alias)))
  if (!anchor) return null
  const position = /左边|左侧|左/.test(text) ? 'left' : /上方|上面|上/.test(text) ? 'top' : /下方|下面|下/.test(text) ? 'bottom' : 'right'
  return {
    position,
    target: { type: 'query', assetId: anchor.id },
  }
}

function findSize(text: string, assetId?: string): SizeName {
  const explicitSize = sizeMap.find(([pattern]) => pattern.test(text))?.[1]
  if (explicitSize) return explicitSize
  return assetId === 'elephant' || assetId === 'grassland' ? 'large' : 'medium'
}

function parseTextContent(text: string) {
  const match = text.match(/(?:写上|写|添加文字|文字)(.+)$/)
  return match?.[1]?.trim() || ''
}
