// Speech-to-text. The G2 mic sends PCM s16le, 16 kHz, mono. We wrap it in a
// WAV header and post it to an OpenAI-compatible transcription endpoint.
import { config } from './config.js'

export function pcmToWav(pcm: Buffer, sampleRate = 16_000): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // PCM chunk size
  header.writeUInt16LE(1, 20) // PCM format
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28) // byte rate
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export async function transcribe(pcm: Buffer): Promise<string> {
  if (pcm.length < 16_000) return '' // under half a second: treat as an accidental press
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(pcmToWav(pcm))], { type: 'audio/wav' }), 'note.wav')
  form.append('model', config.stt.model)
  form.append('language', 'en')
  form.append('response_format', 'json')
  const res = await fetch(`${config.stt.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.stt.apiKey}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Speech-to-text ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { text?: string }
  return (data.text ?? '').trim()
}
