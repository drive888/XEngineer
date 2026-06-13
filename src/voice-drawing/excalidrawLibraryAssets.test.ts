import { describe, expect, it, vi } from 'vitest'
import {
  findExternalLibraryAssetId,
  findExternalLibraryAssetInIndex,
  hydrateExternalAssetOperations,
  isExternalLibraryAssetId,
  resolveExternalLibraryAssetOperation,
} from './excalidrawLibraryAssets'
import type { DrawOperation } from './types'

describe('excalidraw library assets', () => {
  it('maps Chinese object words to public Excalidraw library asset ids', () => {
    const assetId = findExternalLibraryAssetId('画一个机器人')

    expect(assetId).toBe('excalidraw:kaligule/robots.excalidrawlib:0')
    expect(isExternalLibraryAssetId(assetId)).toBe(true)
  })

  it('hydrates old-format excalidraw library items before execution', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        type: 'excalidrawlib',
        version: 1,
        library: [
          [
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
          ],
        ],
      }),
    })) as unknown as typeof fetch
    const operations: DrawOperation[] = [
      {
        action: 'create',
        kind: 'asset',
        assetId: 'excalidraw:kaligule/robots.excalidrawlib:0',
        position: 'center',
        selected: false,
      },
    ]

    const hydrated = await hydrateExternalAssetOperations(operations, fetcher)

    expect(fetcher).toHaveBeenCalledWith('/vendor/excalidraw-libraries/libraries/kaligule/robots.excalidrawlib')
    expect(hydrated[0]).toMatchObject({
      action: 'create',
      kind: 'asset',
      assetId: 'excalidraw:kaligule/robots.excalidrawlib:0',
      assetLabel: 'Robots',
      externalSource: 'kaligule/robots.excalidrawlib',
      externalElements: [{ type: 'rectangle', x: 10, y: 20, width: 80, height: 60 }],
    })
  })

  it('searches the downloaded Excalidraw library index with Chinese intent words', () => {
    const result = findExternalLibraryAssetInIndex('画一个雪花数据仓库图标', [
      {
        name: 'Snowflake datawarehousing Icons',
        description: 'Collection of Snowflake datawarehouse icons.',
        source: 'thijsdev/snowflake.excalidrawlib',
      },
      {
        name: 'Robots',
        description: 'Collection of robots in different moods.',
        source: 'kaligule/robots.excalidrawlib',
      },
    ])

    expect(result).toMatchObject({
      assetId: 'excalidraw:thijsdev/snowflake.excalidrawlib:0',
      label: 'Snowflake datawarehousing Icons',
      source: 'thijsdev/snowflake.excalidrawlib',
    })
  })

  it('resolves and hydrates an external operation from the public library index', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/libraries.index.json')) {
        return {
          ok: true,
          json: async () => ({
            libraries: [
              {
                name: 'Gadgets',
                description: 'Collection of technical gadgets: Smartphone, MP3-Player, Smartwatch, Tablet, Laptop.',
                source: 'morgemoensch/gadgets.excalidrawlib',
              },
            ],
          }),
        }
      }
      return {
        ok: true,
        json: async () => ({
          type: 'excalidrawlib',
          library: [[{ type: 'rectangle', x: 0, y: 0, width: 100, height: 180, strokeColor: '#000000', backgroundColor: '#ffffff' }]],
        }),
      }
    }) as unknown as typeof fetch

    const operation = await resolveExternalLibraryAssetOperation('画一个手机', fetcher)

    expect(operation).toMatchObject({
      action: 'create',
      kind: 'asset',
      assetId: 'excalidraw:morgemoensch/gadgets.excalidrawlib:0',
      assetLabel: 'Gadgets',
      externalSource: 'morgemoensch/gadgets.excalidrawlib',
      externalElements: [{ type: 'rectangle', width: 100, height: 180 }],
    })
  })
})
