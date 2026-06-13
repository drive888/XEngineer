import { describe, expect, it } from 'vitest'
import { encodeWavBlob } from './wavEncoder'

describe('encodeWavBlob', () => {
  it('encodes mono float samples as an audio/wav blob', async () => {
    const blob = encodeWavBlob([new Float32Array([0, 0.5, -0.5])], 16000)
    const bytes = new Uint8Array(await readBlob(blob))
    const text = new TextDecoder('ascii').decode(bytes.slice(0, 12))

    expect(blob.type).toBe('audio/wav')
    expect(text).toBe('RIFF*\u0000\u0000\u0000WAVE')
    expect(new TextDecoder('ascii').decode(bytes.slice(12, 16))).toBe('fmt ')
    expect(new TextDecoder('ascii').decode(bytes.slice(36, 40))).toBe('data')
  })
})

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}
