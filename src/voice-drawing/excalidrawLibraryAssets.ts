import type { DrawOperation } from './types'

export type ExternalLibraryIndexEntry = {
  name: string
  description?: string
  source: string
}

type ExternalCatalogEntry = {
  assetId: string
  label: string
  source: string
  itemIndex: number
  aliases: string[]
}

const externalCatalog: ExternalCatalogEntry[] = [
  {
    assetId: 'excalidraw:kaligule/robots.excalidrawlib:0',
    label: 'Robots',
    source: 'kaligule/robots.excalidrawlib',
    itemIndex: 0,
    aliases: ['机器人', '机械人', 'robot', 'robots'],
  },
  {
    assetId: 'excalidraw:morgemoensch/gadgets.excalidrawlib:0',
    label: 'Gadgets',
    source: 'morgemoensch/gadgets.excalidrawlib',
    itemIndex: 0,
    aliases: ['手机', '智能手机', '平板', '电脑', '笔记本', 'smartphone', 'tablet', 'laptop'],
  },
  {
    assetId: 'excalidraw:g-script/charts.excalidrawlib:0',
    label: 'Charts',
    source: 'g-script/charts.excalidrawlib',
    itemIndex: 0,
    aliases: ['图表', '柱状图', '折线图', '饼图', 'chart', 'charts'],
  },
  {
    assetId: 'excalidraw:dhtoran/stick-people.excalidrawlib:0',
    label: 'Stick People',
    source: 'dhtoran/stick-people.excalidrawlib',
    itemIndex: 0,
    aliases: ['火柴人', '人物', '小人', 'stick person', 'stick people'],
  },
]

const queryExpansion: Array<[RegExp, string[]]> = [
  [/雪花|snowflake/i, ['snowflake']],
  [/数据仓库|数仓|warehouse|data/i, ['datawarehouse', 'datawarehousing', 'warehouse', 'data']],
  [/图标|icon/i, ['icon', 'icons']],
  [/机器人|机械人|robot/i, ['robot', 'robots']],
  [/手机|智能手机|电话|phone/i, ['smartphone', 'phone', 'mobile', 'gadget', 'gadgets']],
  [/电脑|笔记本|平板|laptop|tablet/i, ['laptop', 'tablet', 'computer', 'gadget', 'gadgets']],
  [/图表|柱状图|折线图|饼图|chart/i, ['chart', 'charts', 'bar', 'line', 'pie']],
  [/人物|小人|火柴人|person|people/i, ['person', 'people', 'stick']],
  [/流程|flow/i, ['flow', 'workflow', 'process']],
  [/云|cloud/i, ['cloud']],
  [/数据库|database/i, ['database', 'db']],
  [/地图|map/i, ['map']],
  [/表单|输入框|按钮|form/i, ['form', 'forms', 'button', 'input']],
]

export function findExternalLibraryAssetId(text: string) {
  const match = externalCatalog
    .flatMap((entry) => entry.aliases.map((alias) => ({ entry, alias })))
    .filter(({ alias }) => text.toLowerCase().includes(alias.toLowerCase()))
    .sort((a, b) => b.alias.length - a.alias.length)[0]
  return match?.entry.assetId ?? null
}

export function findExternalLibraryAssetInIndex(text: string, libraries: ExternalLibraryIndexEntry[]) {
  const queryTokens = expandQueryTokens(text)
  const scored = libraries
    .map((library) => ({
      library,
      score: scoreLibrary(library, queryTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.library.name.localeCompare(b.library.name))

  const best = scored[0]?.library
  if (!best) return null
  return {
    assetId: `excalidraw:${best.source}:0`,
    label: best.name,
    source: best.source,
    itemIndex: 0,
  }
}

export function isExternalLibraryAssetId(assetId: string | null | undefined): assetId is string {
  return typeof assetId === 'string' && assetId.startsWith('excalidraw:')
}

export function getExternalCatalogEntry(assetId: string | null | undefined) {
  if (!isExternalLibraryAssetId(assetId)) return null
  return externalCatalog.find((entry) => entry.assetId === assetId) ?? parseExternalAssetId(assetId)
}

export async function hydrateExternalAssetOperations(operations: DrawOperation[], fetcher: typeof fetch = fetch): Promise<DrawOperation[]> {
  return Promise.all(
    operations.map(async (operation) => {
      if (operation.action !== 'create' || operation.kind !== 'asset' || !isExternalLibraryAssetId(operation.assetId) || operation.externalElements) {
        return operation
      }
      const entry = getExternalCatalogEntry(operation.assetId)
      if (!entry) return operation
      const response = await fetcher(`/vendor/excalidraw-libraries/libraries/${entry.source}`)
      if (!response.ok) throw new Error(`素材库加载失败: ${entry.source}`)
      const library = await response.json()
      const item = readLibraryItem(library, entry.itemIndex)
      return {
        ...operation,
        assetLabel: entry.label,
        externalSource: entry.source,
        externalElements: item,
        fill: operation.fill ?? 'white',
        stroke: operation.stroke ?? 'black',
        selected: operation.selected ?? false,
      }
    }),
  )
}

export async function resolveExternalLibraryAssetOperation(text: string, fetcher: typeof fetch = fetch): Promise<DrawOperation | null> {
  const response = await fetcher('/vendor/excalidraw-libraries/libraries.index.json')
  if (!response.ok) return null
  const index = await response.json()
  const libraries = isRecord(index) && Array.isArray(index.libraries) ? index.libraries.filter(isExternalLibraryIndexEntry) : []
  const match = findExternalLibraryAssetInIndex(text, libraries)
  if (!match) return null
  const [operation] = await hydrateExternalAssetOperations(
    [
      {
        action: 'create',
        kind: 'asset',
        assetId: match.assetId,
        assetLabel: match.label,
        externalSource: match.source,
        fill: 'white',
        stroke: 'black',
        position: 'center',
        size: 'medium',
        selected: false,
      },
    ],
    fetcher,
  )
  return operation
}

function readLibraryItem(library: unknown, index: number): unknown[] {
  if (!isRecord(library)) return []
  const items = Array.isArray(library.libraryItems) ? library.libraryItems : Array.isArray(library.library) ? library.library : []
  const item = items[index]
  if (Array.isArray(item)) return item
  if (isRecord(item) && Array.isArray(item.elements)) return item.elements
  return []
}

function expandQueryTokens(text: string) {
  const normalized = text.toLowerCase()
  const directTokens = normalized
    .replace(/[，。,.!?！？]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1)
  const expanded = queryExpansion.flatMap(([pattern, tokens]) => (pattern.test(text) ? tokens : []))
  return [...new Set([...directTokens, ...expanded])]
}

function scoreLibrary(library: ExternalLibraryIndexEntry, queryTokens: string[]) {
  const name = library.name.toLowerCase()
  const description = (library.description ?? '').toLowerCase()
  const source = library.source.toLowerCase()
  return queryTokens.reduce((score, token) => {
    if (name.includes(token)) score += 8
    if (description.includes(token)) score += 4
    if (source.includes(token)) score += 2
    return score
  }, 0)
}

function isExternalLibraryIndexEntry(value: unknown): value is ExternalLibraryIndexEntry {
  return isRecord(value) && typeof value.name === 'string' && typeof value.source === 'string'
}

function parseExternalAssetId(assetId: string): ExternalCatalogEntry | null {
  const match = /^excalidraw:(.+):(\d+)$/.exec(assetId)
  if (!match) return null
  return {
    assetId,
    label: match[1].split('/').at(-1)?.replace(/\.excalidrawlib$/, '') ?? 'Excalidraw asset',
    source: match[1],
    itemIndex: Number(match[2]),
    aliases: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
