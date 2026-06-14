import { describe, expect, it } from 'vitest'
import { normalizeCommand } from './normalizer'
import { parseVoiceCommand } from './parser'

describe('normalizeCommand', () => {
  it('normalizes common speech variants', () => {
    expect(normalizeCommand('画一个兰色圆圈，然后删掉它')).toBe('画一个蓝色圆形,然后删除刚才那个')
    expect(normalizeCommand('退回上一步')).toBe('撤销')
    expect(normalizeCommand('恢复上一步')).toBe('重做')
  })
})

describe('parseVoiceCommand', () => {
  it('parses a colored shape creation command', () => {
    expect(parseVoiceCommand('画一个红色圆形')).toMatchObject({
      normalizedText: '画一个红色圆形',
      usedFallback: false,
      operations: [
        {
          action: 'create',
          kind: 'shape',
          shape: 'ellipse',
          fill: 'red',
          position: 'center',
          size: 'medium',
        },
      ],
    })
  })

  it('parses size and nine-grid position', () => {
    expect(parseVoiceCommand('在右上角画一个大的蓝色矩形').operations).toEqual([
      {
        action: 'create',
        kind: 'shape',
        shape: 'rectangle',
        fill: 'blue',
        position: 'top-right',
        size: 'large',
      },
    ])
  })

  it('parses text creation', () => {
    expect(parseVoiceCommand('写上欢迎使用').operations).toEqual([
      {
        action: 'create',
        kind: 'text',
        text: '欢迎使用',
        fill: 'black',
        position: 'center',
        size: 'medium',
      },
    ])
  })

  it('parses edits against the last object', () => {
    expect(parseVoiceCommand('把刚才那个改成绿色').operations).toEqual([
      {
        action: 'update',
        target: { type: 'last' },
        fill: 'green',
      },
    ])
    expect(parseVoiceCommand('向右移动一点').operations).toEqual([
      {
        action: 'move',
        target: { type: 'last' },
        direction: 'right',
        dx: 48,
        dy: 0,
      },
    ])
    expect(parseVoiceCommand('放大一点').operations).toEqual([
      {
        action: 'resize',
        target: { type: 'last' },
        scale: 1.18,
      },
    ])
  })

  it('parses destructive and history commands', () => {
    expect(parseVoiceCommand('删除刚才那个').operations).toEqual([
      { action: 'delete', target: { type: 'last' } },
    ])
    expect(parseVoiceCommand('撤销').operations).toEqual([{ action: 'undo' }])
    expect(parseVoiceCommand('重做').operations).toEqual([{ action: 'redo' }])
    expect(parseVoiceCommand('清空画布').operations).toEqual([{ action: 'clear' }])
    expect(parseVoiceCommand('导出图片').operations).toEqual([{ action: 'export' }])
  })

  it('splits and parses simple multi-step commands', () => {
    expect(parseVoiceCommand('画一个蓝色矩形，然后在右边写开始').operations).toEqual([
      {
        action: 'create',
        kind: 'shape',
        shape: 'rectangle',
        fill: 'blue',
        position: 'center',
        size: 'medium',
      },
      {
        action: 'create',
        kind: 'text',
        text: '开始',
        fill: 'black',
        position: 'right',
        size: 'medium',
      },
    ])
  })

  it('returns a confirmation question for unknown commands', () => {
    expect(parseVoiceCommand('帮我画一个复杂的商业闭环').needsConfirmation).toBe(true)
  })

  it('parses voice selection by color and shape', () => {
    expect(parseVoiceCommand('选中红色圆形').operations).toEqual([
      {
        action: 'select',
        target: { type: 'query', shape: 'ellipse', color: 'red' },
      },
    ])
    expect(parseVoiceCommand('选中最大的矩形').operations).toEqual([
      {
        action: 'select',
        target: { type: 'query', shape: 'rectangle', order: 'largest' },
      },
    ])
  })

  it('parses a simple flowchart template', () => {
    expect(parseVoiceCommand('画一个开始到结束的简单流程图').operations).toMatchObject([
      { action: 'create', kind: 'shape', shape: 'ellipse', text: '开始', position: 'left' },
      { action: 'create', kind: 'arrow', position: 'center' },
      { action: 'create', kind: 'shape', shape: 'ellipse', text: '结束', position: 'right' },
    ])
  })

  it('parses a semantic sun and cloud scene instead of loose circles', () => {
    const operations = parseVoiceCommand('画一个太阳旁边有几朵云').operations
    const yellowCircles = operations.filter((operation) => operation.action === 'create' && operation.shape === 'ellipse' && operation.fill === 'yellow')
    const rayRects = operations.filter((operation) => operation.action === 'create' && operation.shape === 'rectangle' && operation.fill === 'orange' && operation.width === 14)
    const cloudParts = operations.filter((operation) => operation.action === 'create' && operation.fill === 'gray')

    expect(yellowCircles).toHaveLength(1)
    expect(rayRects.length).toBeGreaterThanOrEqual(8)
    expect(cloudParts.length).toBeGreaterThanOrEqual(5)
    expect(operations.every((operation) => operation.action !== 'create' || operation.selected === false)).toBe(true)
  })

  it('routes open-ended object nouns to visual assets without a phrase template', () => {
    expect(parseVoiceCommand('画一头大象').operations).toMatchObject([
      {
        action: 'create',
        kind: 'asset',
        assetId: 'elephant',
        position: 'center',
        size: 'large',
        selected: false,
      },
    ])
    expect(parseVoiceCommand('来只小猫').operations).toMatchObject([
      {
        action: 'create',
        kind: 'asset',
        assetId: 'cat',
      },
    ])
  })

  it('distinguishes tree diagrams from tree objects', () => {
    expect(parseVoiceCommand('画树状图').operations).toMatchObject([
      {
        action: 'create',
        kind: 'asset',
        assetId: 'treeDiagram',
      },
    ])
  })

  it('parses destructive multi-step commands without dropping the following drawing intent', () => {
    expect(parseVoiceCommand('清空画布，然后画一个火箭').operations).toMatchObject([
      { action: 'clear' },
      {
        action: 'create',
        kind: 'asset',
        assetId: 'rocket',
      },
    ])
    expect(parseVoiceCommand('先画一棵树，清除画布后，画一个火箭').operations).toMatchObject([
      {
        action: 'create',
        kind: 'asset',
        assetId: 'tree',
      },
      { action: 'clear' },
      {
        action: 'create',
        kind: 'asset',
        assetId: 'rocket',
      },
    ])
  })

  it('routes unmatched object nouns to public Excalidraw library assets when indexed', () => {
    expect(parseVoiceCommand('画一个机器人').operations).toMatchObject([
      {
        action: 'create',
        kind: 'asset',
        assetId: 'excalidraw:kaligule/robots.excalidrawlib:0',
        selected: false,
      },
    ])
  })
})
