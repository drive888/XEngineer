import { describe, expect, it } from 'vitest'
import type { CanvasItem } from './executor'
import { renderItemAsRoughSvg } from './roughSvgRenderer'

describe('renderItemAsRoughSvg', () => {
  it('draws primitive shape paths with stroke animation classes', () => {
    const item: CanvasItem = {
      id: 'shape-1',
      kind: 'shape',
      shape: 'ellipse',
      fill: 'red',
      stroke: 'black',
      x: 100,
      y: 100,
      width: 120,
      height: 120,
      selected: true,
    }

    const svg = renderItemAsRoughSvg(item)

    expect(svg).toContain('class="sketch-stroke"')
    expect(svg).toContain('--draw-delay:0ms')
    expect(svg).toContain('--draw-duration:720ms')
  })

  it('renders the same primitive shape deterministically to avoid flicker', () => {
    const item: CanvasItem = {
      id: 'shape-stable',
      kind: 'shape',
      shape: 'ellipse',
      fill: 'yellow',
      stroke: 'orange',
      x: 140,
      y: 86,
      width: 120,
      height: 120,
      selected: false,
    }

    expect(renderItemAsRoughSvg(item)).toBe(renderItemAsRoughSvg(item))
  })

  it('renders all visual asset strokes with sequential draw timing', () => {
    const item: CanvasItem = {
      id: 'item-1',
      kind: 'asset',
      assetId: 'rocket',
      fill: 'red',
      stroke: 'black',
      x: 120,
      y: 40,
      width: 360,
      height: 440,
      selected: false,
    }

    const svg = renderItemAsRoughSvg(item)

    expect(svg.match(/class="asset-stroke sketch-stroke"/g)).toHaveLength(9)
    expect(svg).toContain('--draw-delay:0ms')
    expect(svg).toContain('--draw-delay:180ms')
    expect(svg).toContain('--draw-duration:900ms')
    expect(svg).toContain('data-asset-id="rocket"')
  })
})
