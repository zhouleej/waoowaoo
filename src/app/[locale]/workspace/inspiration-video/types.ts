import type { ModelCapabilities } from '@/lib/model-config-contract'

export type InspirationVideoModel = {
  value: string
  label: string
  provider?: string
  providerKey?: string
  providerName?: string
  capabilities?: ModelCapabilities
}

export type InspirationMedia = {
  name: string
  url: string
}

export type InspirationVideoCreation = {
  id: string
  taskId?: string | null
  actualMetadata?: { durationMs?: number; width?: number; height?: number; fps?: number } | null
  chargedCost?: number | null
  prompt: string
  modelKey: string
  aspectRatio: string
  resolution: string
  duration: number
  generateAudio: boolean
  createdAt: string
  status: string
  progress: number
  errorCode: string | null
  errorMessage: string | null
  primaryImage: InspirationMedia | null
  referenceImages: InspirationMedia[]
  referenceAudios: InspirationMedia[]
  videoUrl: string | null
}

export type InspirationVideoBootstrap = {
  nextCursor?: string | null
  workspace: { projectId: string }
  defaults: {
    videoModel: string | null
    aspectRatio: string
    resolution: string
  }
  creations: InspirationVideoCreation[]
}

export type InspirationVideoForm = {
  prompt: string
  modelKey: string
  aspectRatio: string
  resolution: string
  duration: number
  generateAudio: boolean
  primaryImage: File | null
  referenceImages: File[]
  referenceAudios: File[]
}
