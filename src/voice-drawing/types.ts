export type Point = [number, number]
export type ShapeKind = 'rectangle' | 'ellipse' | 'triangle' | 'diamond' | 'line' | 'path'
export type DrawKind = 'shape' | 'text' | 'arrow' | 'asset'
export type PositionName =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'
export type SizeName = 'small' | 'medium' | 'large'
export type Direction = 'left' | 'right' | 'up' | 'down'

export type TargetRef =
  | { type: 'last' }
  | { type: 'selected' }
  | { type: 'byId'; id: string }
  | {
      type: 'query'
      shape?: ShapeKind | 'text'
      assetId?: string
      color?: string
      position?: PositionName
      order?: 'largest' | 'smallest' | 'first' | 'last'
    }

export type DrawOperation =
  | {
      action: 'create'
      kind: DrawKind
      shape?: ShapeKind
      assetId?: string
      assetLabel?: string
      externalSource?: string
      externalElements?: unknown[]
      text?: string
      fill?: string
      stroke?: string
      position?: PositionName
      size?: SizeName
      x?: number
      y?: number
      width?: number
      height?: number
      points?: Point[]
      rotation?: number
      selected?: boolean
      target?: TargetRef
    }
  | {
      action: 'update'
      target: TargetRef
      fill?: string
      stroke?: string
      text?: string
    }
  | {
      action: 'move'
      target: TargetRef
      direction?: Direction
      dx?: number
      dy?: number
    }
  | {
      action: 'resize'
      target: TargetRef
      scale: number
    }
  | {
      action: 'delete' | 'select'
      target: TargetRef
    }
  | {
      action: 'undo' | 'redo' | 'clear' | 'export'
    }

export type ParseResult = {
  originalText: string
  normalizedText: string
  operations: DrawOperation[]
  confidence: number
  needsConfirmation: boolean
  question: string
  usedFallback: boolean
}
