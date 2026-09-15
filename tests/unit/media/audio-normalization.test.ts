import { describe, expect, it } from 'vitest'
import { isWavAudioBuffer, normalizeAudioToWav } from '@/lib/media/audio-normalization'

function buildWav(): Buffer {
  const output = Buffer.alloc(46)
  output.write('RIFF', 0, 'ascii')
  output.writeUInt32LE(38, 4)
  output.write('WAVE', 8, 'ascii')
  output.write('fmt ', 12, 'ascii')
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20)
  output.writeUInt16LE(1, 22)
  output.writeUInt32LE(16000, 24)
  output.writeUInt32LE(32000, 28)
  output.writeUInt16LE(2, 32)
  output.writeUInt16LE(16, 34)
  output.write('data', 36, 'ascii')
  output.writeUInt32LE(2, 40)
  return output
}

describe('audio normalization', () => {
  it('recognizes and preserves a real WAV buffer without invoking ffmpeg', async () => {
    const wav = buildWav()
    expect(isWavAudioBuffer(wav)).toBe(true)
    await expect(normalizeAudioToWav(wav)).resolves.toBe(wav)
  })

  it('rejects empty input before invoking ffmpeg', async () => {
    expect(isWavAudioBuffer(Buffer.from('ID3'))).toBe(false)
    await expect(normalizeAudioToWav(Buffer.alloc(0))).rejects.toThrow('AUDIO_NORMALIZATION_INPUT_EMPTY')
  })
})
