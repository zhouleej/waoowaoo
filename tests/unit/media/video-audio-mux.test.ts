import { describe, expect, it } from 'vitest'
import { buildVideoAudioMuxArgs } from '@/lib/media/video-audio-mux'

describe('video audio mux', () => {
  it('replaces provider audio with the authoritative dialogue track without re-encoding video', () => {
    const args = buildVideoAudioMuxArgs('lip-sync.mp4', 'dialogue.wav', 'result.mp4', 5000)

    expect(args).toEqual(expect.arrayContaining([
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-af', 'apad',
      '-t', '5.000',
      '-movflags', '+faststart',
    ]))
    expect(args).not.toContain('-shortest')
    expect(args).not.toContain('0:a:0')
    expect(args.at(-1)).toBe('result.mp4')
  })

  it('rejects a missing duration instead of allowing an unbounded padded stream', () => {
    expect(() => buildVideoAudioMuxArgs('video.mp4', 'audio.wav', 'result.mp4', 0))
      .toThrow('VIDEO_AUDIO_MUX_DURATION_INVALID')
  })

  it('concatenates multiple dialogue lines before padding to the video duration', () => {
    const args = buildVideoAudioMuxArgs(
      'video.mp4',
      ['line-1.wav', 'line-2.wav'],
      'result.mp4',
      5000,
    )

    expect(args).toEqual(expect.arrayContaining([
      '-i', 'line-1.wav',
      '-i', 'line-2.wav',
      '-filter_complex', '[1:a:0][2:a:0]concat=n=2:v=0:a=1,apad[dialogue]',
      '-map', '[dialogue]',
      '-t', '5.000',
    ]))
    expect(args).not.toContain('-af')
  })
})
