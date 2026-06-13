# Bolna MiMo ASR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Bolna-compatible `mimo-v2.5-asr` speech recognition provider that uploads recorded audio and feeds recognized text into the drawing command pipeline.

**Architecture:** Server owns provider credentials and forwards multipart audio to `BOLNA_MIMO_API_URL`. Client records with `MediaRecorder`, calls `/api/asr/bolna-mimo`, and reuses `runCommand(text)` so drawing behavior stays unified.

**Tech Stack:** React, Vite, TypeScript, Express, Multer, Vitest, Supertest.

---

### Task 1: Server ASR Provider

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/app.test.ts`

- [ ] Write failing tests for `/api/asr/status` missing config.
- [ ] Write failing tests for `/api/asr/bolna-mimo` successful provider response.
- [ ] Implement env-driven provider adapter.
- [ ] Run `npm test -- --run src/server/app.test.ts`.

### Task 2: Client ASR Helper

**Files:**
- Create: `src/voice-drawing/bolnaMimoAsr.ts`
- Create: `src/voice-drawing/bolnaMimoAsr.test.ts`

- [ ] Write failing tests for status and transcript request.
- [ ] Implement fetch helper with timeout and normalized errors.
- [ ] Run `npm test -- --run src/voice-drawing/bolnaMimoAsr.test.ts`.

### Task 3: UI Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] Add visible `Bolna MiMo` / `结束 MiMo` control.
- [ ] Show ASR provider status panel.
- [ ] Feed returned transcript to `runCommand`.
- [ ] Run `npm test -- --run src/App.test.tsx`.

### Task 4: Verification

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Browser check: button visible, missing-config status shown until URL/key are provided.
