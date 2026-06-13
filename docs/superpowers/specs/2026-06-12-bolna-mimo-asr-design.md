# Bolna MiMo ASR Design

## Goal

Add a provider slot for `mimo-v2.5-asr` through a Bolna-compatible HTTP ASR endpoint. The provider must not depend on Chrome-only Web Speech API and must feed recognized text into the existing drawing parser/executor.

## Provider Contract

The server exposes:

- `GET /api/asr/status`
- `POST /api/asr/bolna-mimo`

Environment variables:

- `BOLNA_MIMO_API_URL`: required before real requests work.
- `BOLNA_MIMO_API_KEY`: required before real requests work.
- `BOLNA_MIMO_TIMEOUT_MS`: optional, default 25000.

Request shape to provider:

- `multipart/form-data`
- `audio`: recorded audio file.
- `model`: `mimo-v2.5-asr`.
- `language`: `zh`.

Accepted provider response shapes:

- `{ "text": "画一个红色圆形" }`
- `{ "transcript": "画一个红色圆形" }`
- `{ "data": { "text": "画一个红色圆形" } }`

## UI Flow

The UI adds a `Bolna MiMo` button next to current voice controls.

1. User clicks `Bolna MiMo`.
2. Browser records microphone audio with `MediaRecorder`.
3. User clicks `结束 MiMo`.
4. Frontend uploads audio to `/api/asr/bolna-mimo`.
5. Server forwards to `BOLNA_MIMO_API_URL`.
6. Returned text runs through `parseVoiceCommand`.
7. Canvas executes operations and log shows provider `bolna-mimo`.

## Error Handling

- Missing URL/key: status says provider not configured; button remains visible but clicking shows config error.
- Microphone permission denied: show Chinese permission error.
- Provider timeout: show `Bolna MiMo 识别超时，请重试或缩短语音。`
- Provider invalid response: show `Bolna MiMo 返回格式无效。`

## Testing

- Server tests cover missing config, provider response normalization, provider timeout.
- Client helper tests cover status, successful transcript, timeout.
- App test covers visible `Bolna MiMo` button.
