'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'

type Props = {
  src: string
  fallbackSrc?: string | null
  poster?: string | null
  alt: string
  playLabel: string
  className?: string
}

export default function InspirationVideoPlayer({
  src,
  fallbackSrc,
  poster,
  alt,
  playLabel,
  className = '',
}: Props) {
  const [started, setStarted] = useState(false)
  const [playbackSrc, setPlaybackSrc] = useState(src)

  useEffect(() => {
    setStarted(false)
    setPlaybackSrc(src)
  }, [src])

  const handlePlaybackError = () => {
    if (fallbackSrc && playbackSrc !== fallbackSrc) {
      setPlaybackSrc(fallbackSrc)
      return
    }
    setStarted(false)
  }

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      {started ? (
        <video
          key={playbackSrc}
          src={playbackSrc}
          poster={poster || undefined}
          controls
          autoPlay
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
          onEnded={() => setStarted(false)}
          onError={handlePlaybackError}
        />
      ) : (
        <button
          type="button"
          aria-label={playLabel}
          className="group relative h-full w-full bg-black"
          onClick={() => setStarted(true)}
        >
          {poster ? (
            <Image src={poster} alt={alt} fill unoptimized className="object-contain" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <AppIcon name="video" className="h-10 w-10 text-white/45" />
            </span>
          )}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur-sm transition-transform group-hover:scale-110">
              <AppIcon name="play" className="h-8 w-8" />
            </span>
          </span>
        </button>
      )}
    </div>
  )
}
