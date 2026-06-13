# AI Voice Drawing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser app where drawing operations are driven by voice commands, with parser logs and a final implementation record.

**Architecture:** Client app owns the low-latency path: Web Speech API produces text, local parser turns text into `DrawOperation[]`, and an SVG/tldraw-compatible executor applies operations to canvas state. AI parsing and cloud transcription remain documented stretch work unless time allows.

**Tech Stack:** React, Vite, TypeScript, Vitest, Web Speech API, SpeechSynthesis, SVG canvas.

---

### Task 1: Project Skeleton And Test Harness

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`

- [ ] **Step 1: Create package and Vite config**

Add React, Vite, TypeScript, Vitest scripts. Configure Vitest with jsdom and setup file.

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: dependencies installed and lockfile created.

- [ ] **Step 3: Run baseline test**

Run: `npm test -- --run`
Expected: fail because no tests exist or pass with empty suite depending Vitest version.

### Task 2: Protocol, Normalizer, Rule Parser

**Files:**
- Create: `src/voice-drawing/types.ts`
- Create: `src/voice-drawing/normalizer.ts`
- Create: `src/voice-drawing/parser.ts`
- Test: `src/voice-drawing/parser.test.ts`

- [ ] **Step 1: Write failing tests**

Cover: simple shape creation, position/size/color parsing, text creation, updates to last object, multi-step split, undo/redo/clear/export.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/voice-drawing/parser.test.ts`
Expected: fail because modules do not exist.

- [ ] **Step 3: Implement minimal parser**

Implement deterministic regex parser, Chinese synonym normalization, and structured `DrawOperation[]`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --run src/voice-drawing/parser.test.ts`
Expected: all parser tests pass.

### Task 3: Canvas State Executor

**Files:**
- Create: `src/voice-drawing/executor.ts`
- Test: `src/voice-drawing/executor.test.ts`

- [ ] **Step 1: Write failing executor tests**

Cover: create/update/move/resize/delete/select/undo/redo/clear and semantic target resolution.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/voice-drawing/executor.test.ts`
Expected: fail because executor does not exist.

- [ ] **Step 3: Implement immutable canvas reducer**

Use SVG-friendly shape models and history stacks for undo/redo.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --run src/voice-drawing/executor.test.ts`
Expected: all executor tests pass.

### Task 4: Voice UI And Drawing Surface

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/voice-drawing/useSpeechRecognition.ts`

- [ ] **Step 1: Build UI**

Render voice status, transcript, parsed operations, execution log, confirmation/status panel, command chips, and SVG canvas.

- [ ] **Step 2: Wire speech**

Use Web Speech API when available. Provide a demo command select button set only for development fallback, labeled as non-creation controls; primary creative path remains voice.

- [ ] **Step 3: Wire execution**

On final transcript, normalize, parse, execute sequential operations, speak feedback, and append logs.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: TypeScript and Vite build pass.

### Task 5: Docs And Delivery Verification

**Files:**
- Modify: `docs/design.md`

- [ ] **Step 1: Update final implementation record**

Mark implemented P0/P1/P2 features and document unfinished AI/cloud/tldraw parts with reasons.

- [ ] **Step 2: Run full verification**

Run: `npm test -- --run`
Expected: all tests pass.

Run: `npm run build`
Expected: production build pass.

- [ ] **Step 3: Start dev server**

Run: `npm run dev -- --host 127.0.0.1`
Expected: local URL available for user demo.
