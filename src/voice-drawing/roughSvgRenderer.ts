import rough from 'roughjs/bin/rough'
import type { Drawable, Options } from 'roughjs/bin/core'
import type { CanvasItem } from './executor'
import { getVisualAsset } from './visualAssets'

const generator = rough.generator({
  options: {
    bowing: 1.6,
    fillStyle: 'solid',
    maxRandomnessOffset: 1.4,
    roughness: 1.8,
    strokeWidth: 2.4,
  },
})

const colorMap: Record<string, string> = {
  black: '#1f2937',
  blue: '#2563eb',
  brown: '#8b5a2b',
  cyan: '#67e8f9',
  gray: '#9aa4b0',
  green: '#16a34a',
  orange: '#e56b1f',
  pink: '#ec4899',
  purple: '#7c3aed',
  red: '#dc2626',
  white: '#fff8ed',
  yellow: '#fde68a',
}

export function renderItemAsRoughSvg(item: CanvasItem) {
  if (item.kind === 'text') {
    return `<text x="${item.x}" y="${item.y + 32}" fill="${toColor(item.fill)}" font-size="28" font-weight="700">${escapeXml(item.text ?? '')}</text>`
  }
  if (item.kind === 'asset') return renderVisualAsset(item)
  if (item.shape === 'path') return renderFreehandPath(item)

  const options = roughOptions(item)
  const drawable = createDrawable(item, options)
  const paths = generator.toPaths(drawable)
  const content = paths
    .map((path, index) => {
      const fill = path.fill && path.fill !== 'none' ? path.fill : 'none'
      const className = fill === 'none' ? 'sketch-stroke' : 'sketch-stroke asset-fill'
      return `<path class="${className}" d="${path.d}" stroke="${path.stroke}" stroke-width="${path.strokeWidth}" fill="${fill}" stroke-linecap="round" stroke-linejoin="round" style="--draw-delay:${index * 120}ms;--draw-duration:720ms" />`
    })
    .join('')
  const rotation = item.rotation ? ` transform="rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})"` : ''
  return `<g${rotation}>${content}${item.text ? renderShapeLabel(item) : ''}</g>`
}

function renderFreehandPath(item: CanvasItem) {
  const points = item.points ?? []
  if (points.length < 2) return ''
  const d = smoothPath(points)
  const rotation = item.rotation ? ` transform="rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})"` : ''
  return `<g${rotation}><path class="sketch-stroke freehand-stroke" d="${d}" stroke="${toColor(item.stroke || item.fill)}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="--draw-delay:0ms;--draw-duration:1200ms" /></g>`
}

function smoothPath(points: [number, number][]) {
  if (points.length === 2) return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`
  const [start, ...rest] = points
  const commands = [`M ${start[0]} ${start[1]}`]
  for (let index = 0; index < rest.length - 1; index += 1) {
    const current = rest[index]
    const next = rest[index + 1]
    const midX = Math.round((current[0] + next[0]) / 2)
    const midY = Math.round((current[1] + next[1]) / 2)
    commands.push(`Q ${current[0]} ${current[1]} ${midX} ${midY}`)
  }
  const last = rest[rest.length - 1]
  commands.push(`T ${last[0]} ${last[1]}`)
  return commands.join(' ')
}

function renderVisualAsset(item: CanvasItem) {
  if (item.externalElements?.length) return renderExternalExcalidrawAsset(item)
  const asset = getVisualAsset(item.assetId)
  if (!asset) return ''
  const scaleX = item.width / asset.defaultWidth
  const scaleY = item.height / asset.defaultHeight
  const content = asset.strokes
    .map((stroke, index) => {
      const strokeColor = toColor(stroke.stroke ?? item.stroke ?? asset.defaultStroke)
      const fillColor = stroke.fill ? toColor(stroke.fill) : 'none'
      const strokeWidth = stroke.width ?? 2.4
      const delay = stroke.delay ?? index
      return `<path class="asset-stroke sketch-stroke" d="${stroke.d}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="${fillColor}" stroke-linecap="round" stroke-linejoin="round" style="--draw-delay:${delay * 180}ms;--draw-duration:900ms" />`
    })
    .join('')
  const rotation = item.rotation ? ` rotate(${item.rotation} ${asset.defaultWidth / 2} ${asset.defaultHeight / 2})` : ''
  return `<g data-asset-id="${asset.id}" aria-label="${escapeXml(asset.label)}" transform="translate(${item.x} ${item.y}) scale(${scaleX} ${scaleY})${rotation}">${content}</g>`
}

function renderExternalExcalidrawAsset(item: CanvasItem) {
  const elements = item.externalElements?.filter(isExcalidrawElement) ?? []
  if (elements.length === 0) return ''
  const bounds = getExternalBounds(elements)
  const scale = Math.min(item.width / Math.max(bounds.width, 1), item.height / Math.max(bounds.height, 1))
  const offsetX = item.x + (item.width - bounds.width * scale) / 2
  const offsetY = item.y + (item.height - bounds.height * scale) / 2
  const content = elements.map((element, index) => renderExternalElement(element, index)).join('')
  const source = escapeXml(item.externalSource ?? '')
  const label = escapeXml(item.assetLabel ?? 'Excalidraw asset')
  return `<g data-asset-id="${escapeXml(item.assetId ?? '')}" data-excalidraw-source="${source}" aria-label="${label}" transform="translate(${offsetX} ${offsetY}) scale(${scale}) translate(${-bounds.x} ${-bounds.y})">${content}</g>`
}

type ExcalidrawElement = {
  type: string
  x: number
  y: number
  width?: number
  height?: number
  angle?: number
  points?: unknown
  text?: string
  fontSize?: number
  strokeColor?: string
  backgroundColor?: string
  opacity?: number
}

function renderExternalElement(element: ExcalidrawElement, index = 0) {
  const stroke = normalizeExternalColor(element.strokeColor, '#1f2937')
  const fill = normalizeExternalColor(element.backgroundColor, 'none')
  const opacity = typeof element.opacity === 'number' ? element.opacity / 100 : 1
  const strokeWidth = 2.2
  const delay = index * 180
  const drawStyle = `style="--draw-delay:${delay}ms;--draw-duration:900ms"`
  const common = `stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" ${drawStyle}`
  const transform = element.angle ? ` transform="rotate(${(element.angle * 180) / Math.PI} ${element.x + (element.width ?? 0) / 2} ${element.y + (element.height ?? 0) / 2})"` : ''

  if (element.type === 'rectangle') {
    return `<rect class="asset-stroke sketch-stroke asset-fill" x="${element.x}" y="${element.y}" width="${element.width ?? 1}" height="${element.height ?? 1}" rx="8" ${common}${transform} />`
  }
  if (element.type === 'ellipse') {
    return `<ellipse class="asset-stroke sketch-stroke asset-fill" cx="${element.x + (element.width ?? 1) / 2}" cy="${element.y + (element.height ?? 1) / 2}" rx="${(element.width ?? 1) / 2}" ry="${(element.height ?? 1) / 2}" ${common}${transform} />`
  }
  if (element.type === 'diamond') {
    const w = element.width ?? 1
    const h = element.height ?? 1
    const points = `${element.x + w / 2},${element.y} ${element.x + w},${element.y + h / 2} ${element.x + w / 2},${element.y + h} ${element.x},${element.y + h / 2}`
    return `<polygon class="asset-stroke sketch-stroke asset-fill" points="${points}" ${common}${transform} />`
  }
  if (element.type === 'line' || element.type === 'arrow' || element.type === 'freedraw' || element.type === 'draw') {
    const points = readPoints(element)
    if (points.length < 2) return ''
    const d = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${element.x + x} ${element.y + y}`).join(' ')
    return `<path class="asset-stroke sketch-stroke" d="${d}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="none" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" ${drawStyle}${transform} />`
  }
  if (element.type === 'text') {
    return `<text class="asset-text-stroke" x="${element.x}" y="${element.y + (element.fontSize ?? 24)}" fill="${stroke}" font-size="${element.fontSize ?? 24}" opacity="${opacity}" ${drawStyle}>${escapeXml(element.text ?? '')}</text>`
  }
  return ''
}

function getExternalBounds(elements: ExcalidrawElement[]) {
  const boxes = elements.map((element) => {
    const points = readPoints(element)
    if (points.length > 0) {
      const xs = points.map(([x]) => element.x + x)
      const ys = points.map(([, y]) => element.y + y)
      return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
    }
    return {
      x1: element.x,
      y1: element.y,
      x2: element.x + (element.width ?? 1),
      y2: element.y + (element.height ?? 1),
    }
  })
  const x1 = Math.min(...boxes.map((box) => box.x1))
  const y1 = Math.min(...boxes.map((box) => box.y1))
  const x2 = Math.max(...boxes.map((box) => box.x2))
  const y2 = Math.max(...boxes.map((box) => box.y2))
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

function readPoints(element: ExcalidrawElement): [number, number][] {
  if (!Array.isArray(element.points)) return []
  return element.points.filter((point): point is [number, number] => Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number')
}

function normalizeExternalColor(color: string | undefined, fallback: string) {
  if (!color || color === 'transparent') return fallback
  return color
}

function isExcalidrawElement(value: unknown): value is ExcalidrawElement {
  if (typeof value !== 'object' || value === null) return false
  const element = value as Record<string, unknown>
  return typeof element.type === 'string' && typeof element.x === 'number' && typeof element.y === 'number'
}

function createDrawable(item: CanvasItem, options: Options): Drawable {
  if (item.kind === 'arrow') {
    const y = item.y + item.height / 2
    return generator.linearPath(
      [
        [item.x, y],
        [item.x + item.width, y],
        [item.x + item.width - 14, item.y + 2],
        [item.x + item.width, y],
        [item.x + item.width - 14, item.y + item.height - 2],
      ],
      { ...options, fill: undefined },
    )
  }
  if (item.shape === 'line') {
    return generator.linearPath(
      [
        [item.x, item.y + item.height / 2],
        [item.x + item.width, item.y + item.height / 2],
      ],
      { ...options, fill: undefined },
    )
  }
  if (item.shape === 'ellipse') {
    return generator.ellipse(item.x + item.width / 2, item.y + item.height / 2, item.width, item.height, options)
  }
  if (item.shape === 'triangle') {
    return generator.polygon(
      [
        [item.x + item.width / 2, item.y],
        [item.x + item.width, item.y + item.height],
        [item.x, item.y + item.height],
      ],
      options,
    )
  }
  if (item.shape === 'diamond') {
    return generator.polygon(
      [
        [item.x + item.width / 2, item.y],
        [item.x + item.width, item.y + item.height / 2],
        [item.x + item.width / 2, item.y + item.height],
        [item.x, item.y + item.height / 2],
      ],
      options,
    )
  }
  return generator.rectangle(item.x, item.y, item.width, item.height, options)
}

function roughOptions(item: CanvasItem): Options {
  return {
    fill: toColor(item.fill),
    fillStyle: 'solid',
    seed: seedFromId(item.id),
    stroke: toColor(item.stroke || item.fill),
    strokeWidth: item.kind === 'arrow' ? 3.2 : 2.8,
  }
}

function renderShapeLabel(item: CanvasItem) {
  const text = item.text ?? ''
  const fontSize = Math.max(15, Math.min(24, Math.floor((item.width - 24) / Math.max(text.length, 1))))
  return `<text x="${item.x + item.width / 2}" y="${item.y + item.height / 2 + fontSize / 3}" fill="#ffffff" font-size="${fontSize}" font-weight="700" text-anchor="middle">${escapeXml(text)}</text>`
}

function seedFromId(id: string) {
  return [...id].reduce((total, char) => total + char.charCodeAt(0), 17)
}

function toColor(color: string) {
  return colorMap[color] ?? color
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => {
    const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }
    return entities[char]
  })
}
