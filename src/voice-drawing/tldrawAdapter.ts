import { createShapeId, toRichText, type TLDefaultColorStyle, type TLGeoShapeGeoStyle, type TLShapeId, type TLShapePartial } from 'tldraw'
import type { CanvasItem } from './executor'

const colorMap: Record<string, TLDefaultColorStyle> = {
  black: 'black',
  brown: 'orange',
  blue: 'blue',
  cyan: 'light-blue',
  gray: 'grey',
  green: 'green',
  orange: 'orange',
  pink: 'light-red',
  purple: 'violet',
  red: 'red',
  white: 'light-violet',
  yellow: 'yellow',
}

const geoMap: Record<string, TLGeoShapeGeoStyle> = {
  diamond: 'diamond',
  ellipse: 'ellipse',
  rectangle: 'rectangle',
  triangle: 'triangle',
}

export function projectItemsToTldrawShapes(items: CanvasItem[]): TLShapePartial[] {
  const shapes: TLShapePartial[] = []
  for (const item of items) {
    const id = createShapeId(item.id)
    if (item.kind === 'asset') continue
    if (item.shape === 'path') continue
    if (item.kind === 'text') {
      shapes.push({
        id,
        rotation: toTldrawRotation(item.rotation),
        type: 'text',
        x: item.x,
        y: item.y,
        props: {
          autoSize: false,
          color: toTldrawColor(item.fill),
          richText: toRichText(item.text ?? ''),
          size: 'xl',
          w: item.width,
        },
      })
      continue
    }

    if (item.kind === 'arrow') {
      shapes.push({
        id,
        rotation: toTldrawRotation(item.rotation),
        type: 'arrow',
        x: item.x,
        y: item.y,
        props: {
          color: toTldrawColor(item.fill),
          end: { x: item.width, y: item.height / 2 },
          start: { x: 0, y: item.height / 2 },
          size: 'm',
        },
      })
      continue
    }

    shapes.push({
      id,
      rotation: toTldrawRotation(item.rotation),
      type: 'geo',
      x: item.x,
      y: item.y,
      props: {
        color: toTldrawColor(item.fill),
        fill: 'solid',
        geo: geoMap[item.shape ?? 'rectangle'] ?? 'rectangle',
        h: item.height,
        labelColor: 'white',
        richText: item.text ? toRichText(item.text) : toRichText(''),
        size: 'm',
        w: item.width,
      },
    })
  }
  return shapes
}

export function projectSelectionToTldrawIds(itemIds: string[]): TLShapeId[] {
  return itemIds.map((id) => createShapeId(id))
}

function toTldrawColor(color: string): TLDefaultColorStyle {
  return colorMap[color] ?? 'black'
}

function toTldrawRotation(rotation?: number) {
  return rotation === undefined ? undefined : (rotation * Math.PI) / 180
}
