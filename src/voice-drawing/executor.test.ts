import { describe, expect, it } from 'vitest'
import { createInitialCanvasState, executeOperations } from './executor'
import type { DrawOperation } from './types'

describe('executeOperations', () => {
  it('creates a shape with resolved layout values and semantic metadata', () => {
    const result = executeOperations(createInitialCanvasState(), [
      {
        action: 'create',
        kind: 'shape',
        shape: 'ellipse',
        fill: 'red',
        position: 'top-right',
        size: 'large',
      },
    ])

    expect(result.state.items).toHaveLength(1)
    expect(result.state.items[0]).toMatchObject({
      kind: 'shape',
      shape: 'ellipse',
      fill: 'red',
      x: 680,
      y: 120,
      width: 156,
      height: 156,
    })
    expect(result.state.lastItemId).toBe(result.state.items[0].id)
    expect(result.messages).toEqual(['已创建红色圆形'])
  })

  it('keeps ellipse shapes geometrically round', () => {
    const result = executeOperations(createInitialCanvasState(), [
      {
        action: 'create',
        kind: 'shape',
        shape: 'ellipse',
        fill: 'red',
        size: 'medium',
      },
    ])

    expect(result.state.items[0].width).toBe(result.state.items[0].height)
  })

  it('uses explicit geometry when AI parser provides layout coordinates', () => {
    const result = executeOperations(createInitialCanvasState(), [
      {
        action: 'create',
        kind: 'shape',
        shape: 'rectangle',
        fill: 'white',
        x: 260,
        y: 120,
        width: 380,
        height: 72,
      },
    ])

    expect(result.state.items[0]).toMatchObject({
      x: 260,
      y: 120,
      width: 380,
      height: 72,
    })
  })

  it('keeps explicitly sized ellipse shapes round', () => {
    const result = executeOperations(createInitialCanvasState(), [
      {
        action: 'create',
        kind: 'shape',
        shape: 'ellipse',
        fill: 'yellow',
        x: 120,
        y: 86,
        width: 180,
        height: 80,
      },
    ])

    expect(result.state.items[0]).toMatchObject({
      x: 120,
      y: 86,
      width: 80,
      height: 80,
    })
  })

  it('supports unselected rotated component parts', () => {
    const result = executeOperations(createInitialCanvasState(), [
      {
        action: 'create',
        kind: 'shape',
        shape: 'rectangle',
        fill: 'orange',
        x: 120,
        y: 60,
        width: 14,
        height: 54,
        rotation: 45,
        selected: false,
      },
      { action: 'export' },
    ])

    expect(result.state.items[0]).toMatchObject({ rotation: 45, selected: false })
    expect(result.state.selectedItemIds).toEqual([])
    expect(result.state.exportedSvg).toContain('rotate(45 127 87)')
    expect(result.state.exportedSvg).toContain('<path')
  })

  it('exports shapes as sketchy rough svg paths', () => {
    const result = executeOperations(createInitialCanvasState(), [
      {
        action: 'create',
        kind: 'shape',
        shape: 'ellipse',
        fill: 'yellow',
        stroke: 'orange',
        x: 100,
        y: 80,
        width: 120,
        height: 120,
      },
      { action: 'export' },
    ])

    expect(result.state.exportedSvg).toContain('<path')
    expect(result.state.exportedSvg).not.toContain('<ellipse')
  })

  it('renders line shapes as sketchy line paths instead of rectangles', () => {
    const result = executeOperations(createInitialCanvasState(), [
      {
        action: 'create',
        kind: 'shape',
        shape: 'line',
        fill: 'black',
        x: 100,
        y: 120,
        width: 80,
        height: 24,
      },
      { action: 'export' },
    ])

    expect(result.state.exportedSvg).toContain('<path')
    expect(result.state.exportedSvg).not.toContain('<rect')
  })

  it('exports visual assets as recognizable multi-stroke svg groups', () => {
    const result = executeOperations(createInitialCanvasState(), [
      {
        action: 'create',
        kind: 'asset',
        assetId: 'elephant',
        fill: 'gray',
        x: 210,
        y: 96,
        width: 480,
        height: 320,
        selected: false,
      },
      { action: 'export' },
    ])

    expect(result.state.items[0]).toMatchObject({ kind: 'asset', assetId: 'elephant', selected: false })
    expect(result.messages).toEqual(['已创建大象', '已导出图片'])
    expect(result.state.exportedSvg).toContain('data-asset-id="elephant"')
    expect(result.state.exportedSvg?.match(/<path/g)?.length).toBeGreaterThanOrEqual(10)
  })

  it('exports rocket assets as a single recognizable asset group', () => {
    const result = executeOperations(createInitialCanvasState(), [
      {
        action: 'create',
        kind: 'asset',
        assetId: 'rocket',
        fill: 'red',
        x: 260,
        y: 64,
        width: 360,
        height: 420,
        selected: false,
      },
      { action: 'export' },
    ])

    expect(result.messages[0]).toBe('已创建火箭')
    expect(result.state.exportedSvg).toContain('data-asset-id="rocket"')
    expect(result.state.exportedSvg?.match(/asset-stroke/g)?.length).toBeGreaterThanOrEqual(8)
  })

  it('exports hydrated Excalidraw library assets as svg groups', () => {
    const result = executeOperations(createInitialCanvasState(), [
      {
        action: 'create',
        kind: 'asset',
        assetId: 'excalidraw:kaligule/robots.excalidrawlib:0',
        assetLabel: 'Robots',
        externalSource: 'kaligule/robots.excalidrawlib',
        externalElements: [
          {
            id: 'rect-1',
            type: 'rectangle',
            x: 10,
            y: 20,
            width: 80,
            height: 60,
            strokeColor: '#111111',
            backgroundColor: '#eeeeee',
            opacity: 100,
          },
          {
            id: 'eye-1',
            type: 'ellipse',
            x: 38,
            y: 42,
            width: 12,
            height: 12,
            strokeColor: '#000000',
            backgroundColor: '#000000',
            opacity: 100,
          },
        ],
        x: 250,
        y: 120,
        width: 360,
        height: 260,
        selected: false,
      },
      { action: 'export' },
    ])

    expect(result.messages[0]).toBe('已创建Robots')
    expect(result.state.exportedSvg).toContain('data-asset-id="excalidraw:kaligule/robots.excalidrawlib:0"')
    expect(result.state.exportedSvg).toContain('data-excalidraw-source="kaligule/robots.excalidrawlib"')
    expect(result.state.exportedSvg).toContain('<rect')
    expect(result.state.exportedSvg).toContain('<ellipse')
  })

  it('staggers hydrated Excalidraw asset elements so they draw over time', () => {
    const result = executeOperations(createInitialCanvasState(), [
      {
        action: 'create',
        kind: 'asset',
        assetId: 'excalidraw:test/library.excalidrawlib:0',
        assetLabel: 'Test Library',
        externalSource: 'test/library.excalidrawlib',
        externalElements: [
          { type: 'rectangle', x: 0, y: 0, width: 80, height: 60, strokeColor: '#111111', backgroundColor: '#eeeeee' },
          { type: 'ellipse', x: 100, y: 0, width: 40, height: 40, strokeColor: '#111111', backgroundColor: '#eeeeee' },
          { type: 'line', x: 0, y: 90, points: [[0, 0], [120, 20]], strokeColor: '#111111' },
        ],
        selected: false,
      },
      { action: 'export' },
    ])

    expect(result.state.exportedSvg).toContain('--draw-delay:0ms')
    expect(result.state.exportedSvg).toContain('--draw-delay:140ms')
    expect(result.state.exportedSvg).toContain('--draw-delay:280ms')
    expect(result.state.exportedSvg).toContain('asset-fill')
  })

  it('updates, moves, resizes, and deletes the last item', () => {
    const created = executeOperations(createInitialCanvasState(), [
      { action: 'create', kind: 'shape', shape: 'rectangle', fill: 'blue' },
    ])
    const edited = executeOperations(created.state, [
      { action: 'update', target: { type: 'last' }, fill: 'green' },
      { action: 'move', target: { type: 'last' }, direction: 'right', dx: 48, dy: 0 },
      { action: 'resize', target: { type: 'last' }, scale: 1.18 },
    ])

    expect(edited.state.items[0]).toMatchObject({
      fill: 'green',
      x: 438,
      width: 142,
      height: 94,
    })

    const deleted = executeOperations(edited.state, [{ action: 'delete', target: { type: 'last' } }])
    expect(deleted.state.items).toHaveLength(0)
  })

  it('supports undo, redo, and clear history', () => {
    const ops: DrawOperation[] = [
      { action: 'create', kind: 'shape', shape: 'rectangle', fill: 'blue' },
      { action: 'create', kind: 'text', text: '开始', fill: 'black', position: 'right' },
    ]
    const created = executeOperations(createInitialCanvasState(), ops)
    expect(created.state.items).toHaveLength(2)

    const undone = executeOperations(created.state, [{ action: 'undo' }])
    expect(undone.state.items).toHaveLength(1)

    const redone = executeOperations(undone.state, [{ action: 'redo' }])
    expect(redone.state.items).toHaveLength(2)

    const cleared = executeOperations(redone.state, [{ action: 'clear' }])
    expect(cleared.state.items).toHaveLength(0)
  })

  it('creates arrows and selects objects by semantic query', () => {
    const created = executeOperations(createInitialCanvasState(), [
      { action: 'create', kind: 'shape', shape: 'ellipse', fill: 'red', size: 'small' },
      { action: 'create', kind: 'shape', shape: 'rectangle', fill: 'blue', size: 'large' },
      { action: 'create', kind: 'arrow', position: 'center' },
    ])

    expect(created.state.items[2]).toMatchObject({ kind: 'arrow', width: 180, height: 24 })

    const selected = executeOperations(created.state, [
      { action: 'select', target: { type: 'query', shape: 'ellipse', color: 'red' } },
    ])
    expect(selected.state.selectedItemIds).toEqual([created.state.items[0].id])
  })
})
