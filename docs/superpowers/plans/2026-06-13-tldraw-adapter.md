# tldraw Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tldraw Editor API as the next canvas backend while keeping the existing SVG executor as the stable baseline.

**Architecture:** Keep voice parsing and `DrawOperation` unchanged. Extract shared canvas item metadata from the existing executor, then add a tldraw projection adapter that maps current `CanvasItem` objects to tldraw shapes. The first UI version renders tldraw alongside the existing command pipeline and keeps SVG export/log behavior intact.

**Tech Stack:** React, TypeScript, Vitest, Vite, `tldraw`.

---

### Task 1: Install tldraw-Compatible React Stack

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install react@19.2.1 react-dom@19.2.1 @types/react@latest @types/react-dom@latest tldraw@5.1.1
```

Expected: install completes without peer dependency errors.

- [ ] **Step 2: Verify current test/build baseline**

Run:

```bash
npm test -- --run
npm run build
```

Expected: all tests pass and production build succeeds.

### Task 2: Add tldraw Shape Projection

**Files:**
- Create: `src/voice-drawing/tldrawAdapter.ts`
- Test: `src/voice-drawing/tldrawAdapter.test.ts`

- [ ] **Step 1: Write failing tests**

Test expected mapping:

```ts
import { describe, expect, it } from 'vitest'
import { projectItemsToTldrawShapes } from './tldrawAdapter'
import type { CanvasItem } from './executor'

describe('projectItemsToTldrawShapes', () => {
  it('projects ellipse, rectangle, and text items into tldraw shapes', () => {
    const items: CanvasItem[] = [
      { id: 'item-1', kind: 'shape', shape: 'ellipse', fill: 'red', stroke: '#263241', x: 10, y: 20, width: 80, height: 80, selected: true },
      { id: 'item-2', kind: 'shape', shape: 'rectangle', fill: 'blue', stroke: '#263241', x: 140, y: 20, width: 120, height: 80 },
      { id: 'item-3', kind: 'text', text: '欢迎', fill: 'black', stroke: '#263241', x: 300, y: 40, width: 120, height: 80 },
    ]

    expect(projectItemsToTldrawShapes(items)).toMatchObject([
      { id: 'shape:item-1', type: 'geo', x: 10, y: 20, props: { geo: 'ellipse', w: 80, h: 80, color: 'red' } },
      { id: 'shape:item-2', type: 'geo', x: 140, y: 20, props: { geo: 'rectangle', w: 120, h: 80, color: 'blue' } },
      { id: 'shape:item-3', type: 'text', x: 300, y: 40, props: { text: '欢迎', color: 'black' } },
    ])
  })
})
```

- [ ] **Step 2: Implement minimal projection**

Create deterministic shape IDs with `createShapeId(item.id)`. Map ellipse/rectangle/triangle/diamond to tldraw `geo` shapes, and text to `text`.

- [ ] **Step 3: Run projection tests**

Run:

```bash
npm test -- --run src/voice-drawing/tldrawAdapter.test.ts
```

Expected: test passes.

### Task 3: Render tldraw Canvas From Existing State

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Add component smoke test**

Assert page still renders controls and demo drawing after tldraw is mounted.

- [ ] **Step 2: Add `TldrawCanvasView`**

Use `<Tldraw />` with hidden default UI and `onMount` synchronization. On every `canvasState.items` change, replace projected shapes in the editor and select `selectedItemIds`.

- [ ] **Step 3: Keep SVG export**

Keep existing `serializeSvg` export link unchanged for this version.

- [ ] **Step 4: Verify app tests**

Run:

```bash
npm test -- --run src/App.test.tsx
```

Expected: app tests pass.

### Task 4: End-to-End Verification

**Files:**
- Modify: `docs/design.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test -- --run
npm run build
```

Expected: all tests pass and build succeeds.

- [ ] **Step 2: Browser test**

Open `http://127.0.0.1:5174/`, click “画红色圆形”, verify tldraw renders a round red ellipse and logs still update.

- [ ] **Step 3: Update design document**

Mark tldraw adapter as partially implemented: create/select projection works; arrows/export/history remain SVG-backed in this step.
