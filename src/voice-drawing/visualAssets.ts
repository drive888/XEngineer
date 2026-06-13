export type VisualAssetId = 'elephant' | 'cat' | 'treeDiagram' | 'tree' | 'house' | 'car' | 'rocket'

export type VisualAssetStroke = {
  d: string
  stroke?: string
  fill?: string
  width?: number
  delay?: number
}

export type VisualAsset = {
  id: VisualAssetId
  label: string
  aliases: string[]
  defaultFill: string
  defaultStroke: string
  defaultWidth: number
  defaultHeight: number
  strokes: VisualAssetStroke[]
}

export const visualAssets: Record<VisualAssetId, VisualAsset> = {
  elephant: {
    id: 'elephant',
    label: '大象',
    aliases: ['大象', '象', 'elephant'],
    defaultFill: 'gray',
    defaultStroke: 'black',
    defaultWidth: 480,
    defaultHeight: 320,
    strokes: [
      { d: 'M24 190 C40 112 118 74 224 88 C344 54 438 106 442 206 C444 248 410 276 350 278 C306 280 250 256 224 230 C190 264 124 284 78 258 C42 238 20 218 24 190 Z', fill: 'gray', stroke: 'black', width: 2.6, delay: 0 },
      { d: 'M256 94 C300 48 374 54 414 108 C450 158 434 226 380 250 C326 272 276 236 270 178 C266 142 240 122 256 94 Z', fill: 'gray', stroke: 'black', width: 2.4, delay: 1 },
      { d: 'M304 128 C318 86 378 78 406 116 C428 146 416 196 372 210 C330 220 292 176 304 128 Z', fill: '#b6c0cc', stroke: 'black', width: 2.2, delay: 2 },
      { d: 'M396 154 C446 164 462 204 440 238 C420 268 400 294 418 314 C432 330 456 316 464 296', stroke: 'black', width: 9, delay: 3 },
      { d: 'M414 240 C426 252 448 254 462 244', stroke: 'white', width: 7, delay: 4 },
      { d: 'M346 148 C350 144 356 144 360 148 C356 154 350 154 346 148 Z', fill: 'black', stroke: 'black', width: 2, delay: 5 },
      { d: 'M90 254 L82 310 L130 310 L138 262', fill: 'gray', stroke: 'black', width: 2.2, delay: 6 },
      { d: 'M178 266 L174 314 L220 314 L224 264', fill: 'gray', stroke: 'black', width: 2.2, delay: 7 },
      { d: 'M292 266 L288 314 L334 314 L336 258', fill: 'gray', stroke: 'black', width: 2.2, delay: 8 },
      { d: 'M366 254 L374 310 L420 310 L410 246', fill: 'gray', stroke: 'black', width: 2.2, delay: 9 },
      { d: 'M52 186 C28 174 18 148 30 128', stroke: 'black', width: 3, delay: 10 },
      { d: 'M56 182 C46 198 36 208 22 212', stroke: 'black', width: 2.4, delay: 11 },
      { d: 'M134 114 C174 144 218 146 258 118', stroke: '#6b7280', width: 2, delay: 12 },
    ],
  },
  cat: {
    id: 'cat',
    label: '猫',
    aliases: ['猫', '小猫', '猫咪', 'cat'],
    defaultFill: 'orange',
    defaultStroke: 'black',
    defaultWidth: 360,
    defaultHeight: 280,
    strokes: [
      { d: 'M92 134 C112 72 244 70 268 132 C306 154 306 232 236 250 C154 274 68 232 92 134 Z', fill: 'orange', stroke: 'black', width: 2.4 },
      { d: 'M118 98 L142 36 L174 94', fill: 'orange', stroke: 'black', width: 2.2 },
      { d: 'M206 94 L238 36 L252 104', fill: 'orange', stroke: 'black', width: 2.2 },
      { d: 'M152 142 C156 136 164 136 168 142', stroke: 'black', width: 4 },
      { d: 'M218 142 C222 136 230 136 234 142', stroke: 'black', width: 4 },
      { d: 'M192 166 L182 178 L202 178 Z', fill: 'pink', stroke: 'black', width: 1.8 },
      { d: 'M182 188 C190 198 202 198 210 188', stroke: 'black', width: 2 },
      { d: 'M146 172 L82 156 M146 186 L76 188 M238 172 L306 156 M238 186 L312 188', stroke: 'black', width: 2 },
      { d: 'M264 218 C340 210 340 112 280 126', stroke: 'orange', width: 16 },
    ],
  },
  treeDiagram: {
    id: 'treeDiagram',
    label: '树状图',
    aliases: ['树状图', '层级图', '组织结构图', '树形图'],
    defaultFill: 'white',
    defaultStroke: 'black',
    defaultWidth: 500,
    defaultHeight: 360,
    strokes: [
      { d: 'M200 26 L300 26 L300 78 L200 78 Z', fill: 'white', stroke: 'black', width: 2.3, delay: 0 },
      { d: 'M250 78 L250 120 M128 120 L372 120 M128 120 L128 154 M250 120 L250 154 M372 120 L372 154', stroke: 'black', width: 2.5, delay: 1 },
      { d: 'M78 154 L178 154 L178 206 L78 206 Z', fill: 'cyan', stroke: 'black', width: 2.2, delay: 2 },
      { d: 'M200 154 L300 154 L300 206 L200 206 Z', fill: 'cyan', stroke: 'black', width: 2.2, delay: 3 },
      { d: 'M322 154 L422 154 L422 206 L322 206 Z', fill: 'cyan', stroke: 'black', width: 2.2, delay: 4 },
      { d: 'M128 206 L128 248 M88 248 L168 248 M88 248 L88 280 M168 248 L168 280', stroke: 'black', width: 2.2, delay: 5 },
      { d: 'M54 280 L122 280 L122 326 L54 326 Z M134 280 L202 280 L202 326 L134 326 Z', fill: 'white', stroke: 'black', width: 2, delay: 6 },
      { d: 'M250 206 L250 280 M216 280 L284 280 L284 326 L216 326 Z', fill: 'white', stroke: 'black', width: 2, delay: 7 },
      { d: 'M372 206 L372 280 M338 280 L406 280 L406 326 L338 326 Z', fill: 'white', stroke: 'black', width: 2, delay: 8 },
    ],
  },
  tree: {
    id: 'tree',
    label: '树',
    aliases: ['树', '树木', '大树', 'tree'],
    defaultFill: 'green',
    defaultStroke: 'black',
    defaultWidth: 320,
    defaultHeight: 360,
    strokes: [
      { d: 'M140 184 L122 330 L198 330 L178 184 Z', fill: 'brown', stroke: 'black', width: 2.2 },
      { d: 'M70 160 C34 80 112 18 174 70 C238 22 314 96 274 174 C242 238 102 242 70 160 Z', fill: 'green', stroke: 'black', width: 2.4 },
      { d: 'M154 194 C128 158 114 124 108 90 M164 198 C190 158 216 134 242 116', stroke: 'brown', width: 4 },
    ],
  },
  house: {
    id: 'house',
    label: '房子',
    aliases: ['房子', '房屋', '屋子', 'house'],
    defaultFill: 'white',
    defaultStroke: 'black',
    defaultWidth: 420,
    defaultHeight: 320,
    strokes: [
      { d: 'M80 140 L210 42 L340 140 Z', fill: 'red', stroke: 'black', width: 2.4 },
      { d: 'M102 140 L318 140 L318 292 L102 292 Z', fill: 'white', stroke: 'black', width: 2.4 },
      { d: 'M184 208 L238 208 L238 292 L184 292 Z', fill: 'brown', stroke: 'black', width: 2.2 },
      { d: 'M124 174 L166 174 L166 216 L124 216 Z M260 174 L302 174 L302 216 L260 216 Z', fill: 'cyan', stroke: 'black', width: 2 },
    ],
  },
  car: {
    id: 'car',
    label: '汽车',
    aliases: ['汽车', '小汽车', '车', 'car'],
    defaultFill: 'blue',
    defaultStroke: 'black',
    defaultWidth: 440,
    defaultHeight: 230,
    strokes: [
      { d: 'M54 132 C74 84 134 72 182 76 L244 76 C292 80 332 102 354 134 L392 144 L402 184 L40 184 L48 142 Z', fill: 'blue', stroke: 'black', width: 2.4 },
      { d: 'M146 88 L118 132 L224 132 L214 88 Z M232 88 L244 132 L322 132 C302 104 276 90 232 88 Z', fill: 'cyan', stroke: 'black', width: 2 },
      { d: 'M98 184 C98 154 144 154 144 184 C144 214 98 214 98 184 Z M300 184 C300 154 346 154 346 184 C346 214 300 214 300 184 Z', fill: 'black', stroke: 'black', width: 2 },
    ],
  },
  rocket: {
    id: 'rocket',
    label: '火箭',
    aliases: ['火箭', '飞船', 'rocket'],
    defaultFill: 'red',
    defaultStroke: 'black',
    defaultWidth: 360,
    defaultHeight: 440,
    strokes: [
      { d: 'M180 22 C242 88 258 188 226 282 L134 282 C102 188 118 88 180 22 Z', fill: 'white', stroke: 'black', width: 2.6, delay: 0 },
      { d: 'M142 92 C162 78 198 78 218 92 C210 128 150 128 142 92 Z', fill: 'cyan', stroke: 'black', width: 2.2, delay: 1 },
      { d: 'M134 282 L226 282 L226 344 L134 344 Z', fill: 'gray', stroke: 'black', width: 2.4, delay: 2 },
      { d: 'M134 232 L68 324 L132 312 Z', fill: 'blue', stroke: 'black', width: 2.4, delay: 3 },
      { d: 'M226 232 L292 324 L228 312 Z', fill: 'blue', stroke: 'black', width: 2.4, delay: 4 },
      { d: 'M156 344 C152 374 166 408 180 428 C194 408 208 374 204 344 Z', fill: 'orange', stroke: 'black', width: 2.2, delay: 5 },
      { d: 'M180 350 C174 374 180 398 180 414 C190 390 192 370 180 350 Z', fill: 'yellow', stroke: 'orange', width: 1.8, delay: 6 },
      { d: 'M146 160 C166 176 194 176 214 160', stroke: '#6b7280', width: 2.2, delay: 7 },
      { d: 'M154 204 C170 216 190 216 206 204', stroke: '#6b7280', width: 2.2, delay: 8 },
    ],
  },
}

export function findVisualAssetId(text: string): VisualAssetId | null {
  const matches = Object.values(visualAssets)
    .flatMap((asset) => asset.aliases.map((alias) => ({ id: asset.id, alias })))
    .filter((entry) => text.includes(entry.alias))
    .sort((a, b) => b.alias.length - a.alias.length)
  return matches[0]?.id ?? null
}

export function getVisualAsset(id?: string): VisualAsset | null {
  if (!isVisualAssetId(id)) return null
  return visualAssets[id]
}

export function isVisualAssetId(value: unknown): value is VisualAssetId {
  return value === 'elephant' || value === 'cat' || value === 'treeDiagram' || value === 'tree' || value === 'house' || value === 'car' || value === 'rocket'
}
