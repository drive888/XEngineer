import { describe, expect, it } from 'vitest'
import { createShapeId, toRichText } from 'tldraw'
import type { CanvasItem } from './executor'
import { projectItemsToTldrawShapes, projectSelectionToTldrawIds } from './tldrawAdapter'

describe('tldraw adapter', () => {
  it('projects ellipse, rectangle, and text items into tldraw shapes', () => {
    const items: CanvasItem[] = [
      {
        id: 'item-1',
        kind: 'shape',
        shape: 'ellipse',
        fill: 'red',
        stroke: '#263241',
        x: 10,
        y: 20,
        width: 80,
        height: 80,
        selected: true,
      },
      {
        id: 'item-2',
        kind: 'shape',
        shape: 'rectangle',
        fill: 'blue',
        stroke: '#263241',
        x: 140,
        y: 20,
        width: 120,
        height: 80,
        rotation: 45,
      },
      {
        id: 'item-3',
        kind: 'text',
        text: '欢迎',
        fill: 'black',
        stroke: '#263241',
        x: 300,
        y: 40,
        width: 120,
        height: 80,
      },
    ]

    const shapes = projectItemsToTldrawShapes(items)

    expect(shapes).toMatchObject([
      {
        id: createShapeId('item-1'),
        type: 'geo',
        x: 10,
        y: 20,
        props: { geo: 'ellipse', w: 80, h: 80, color: 'red' },
      },
      {
        id: createShapeId('item-2'),
        type: 'geo',
        rotation: Math.PI / 4,
        x: 140,
        y: 20,
        props: { geo: 'rectangle', w: 120, h: 80, color: 'blue' },
      },
      {
        id: createShapeId('item-3'),
        type: 'text',
        x: 300,
        y: 40,
        props: { color: 'black' },
      },
    ])
    expect(shapes[2].props?.richText).toEqual(toRichText('欢迎'))
  })

  it('projects selected canvas item ids into tldraw shape ids', () => {
    expect(projectSelectionToTldrawIds(['item-1', 'item-9'])).toEqual([createShapeId('item-1'), createShapeId('item-9')])
  })
})
