# AI Command Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-backed semantic parser so free-form Chinese voice commands can become safe `DrawOperation[]` drawing actions.

**Architecture:** Keep local rule parsing as the fast path. When local parsing is low-confidence or a command sounds complex, call a server endpoint that asks a chat model for strict JSON operations, validates the result, then returns operations to the same executor. The AI parser never touches canvas state directly.

**Tech Stack:** React, TypeScript, Express, OpenAI SDK, Vitest.

---

### Task 1: Server AI Parser Route

**Files:**
- Modify: `src/server/app.ts`
- Test: `src/server/app.test.ts`

- [ ] Write failing tests for `/api/parse-command` success, missing API key, and invalid AI JSON.
- [ ] Implement `POST /api/parse-command` with request validation.
- [ ] Add operation validation for allowed actions, shapes, colors, positions, and numeric bounds.
- [ ] Run `npm test -- --run src/server/app.test.ts`.

### Task 2: Frontend AI Parser Client

**Files:**
- Create: `src/voice-drawing/aiCommandParser.ts`
- Test: `src/voice-drawing/aiCommandParser.test.ts`

- [ ] Write failing tests for success, server error, timeout.
- [ ] Implement fetch client with abort timeout.
- [ ] Run `npm test -- --run src/voice-drawing/aiCommandParser.test.ts`.

### Task 3: App Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] Convert `runCommand` to async.
- [ ] Execute local parser when confidence is high.
- [ ] Call AI parser when local parser needs confirmation or command contains complex intent words like “页面/草图/旁边/三个/排列/流程/步骤”.
- [ ] Log `provider: ai-parser` when AI parser succeeds.
- [ ] Fall back to local confirmation if AI parser fails.
- [ ] Run `npm test -- --run src/App.test.tsx`.

### Task 4: Verification and Docs

**Files:**
- Modify: `docs/design.md`

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Browser test complex commands through demo/instrumented command path.
- [ ] Document AI parser implemented abilities and remaining limits.
