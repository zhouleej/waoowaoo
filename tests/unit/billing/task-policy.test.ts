import { describe, expect, it } from 'vitest'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo, isBillableTaskType } from '@/lib/billing/task-policy'
import type { TaskBillingInfo } from '@/lib/task/types'

function expectBillableInfo(info: TaskBillingInfo | null): Extract<TaskBillingInfo, { billable: true }> {
  expect(info).toBeTruthy()
  expect(info?.billable).toBe(true)
  if (!info || !info.billable) {
    throw new Error('Expected billable task billing info')
  }
  return info
}

describe('billing/task-policy', () => {
  const billingPayload = {
    analysisModel: 'anthropic/claude-sonnet-4',
    imageModel: 'seedream',
    videoModel: 'doubao-seedance-1-5-pro-251215',
  } as const

  it('builds TaskBillingInfo for every billable task type', () => {
    for (const taskType of Object.values(TASK_TYPE)) {
      if (!isBillableTaskType(taskType)) continue
      const info = expectBillableInfo(buildDefaultTaskBillingInfo(taskType, billingPayload))
      expect(info.taskType).toBe(taskType)
      expect(info.maxFrozenCost).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns null for a non-billable task type', () => {
    const fake = 'not_billable' as unknown as (typeof TASK_TYPE)[keyof typeof TASK_TYPE]
    expect(isBillableTaskType(fake)).toBe(false)
    expect(buildDefaultTaskBillingInfo(fake, {})).toBeNull()
  })

  it('builds text billing info from explicit model payload', () => {
    const info = expectBillableInfo(buildDefaultTaskBillingInfo(TASK_TYPE.ANALYZE_NOVEL, {
      analysisModel: 'anthropic/claude-sonnet-4',
    }))
    expect(info.apiType).toBe('text')
    expect(info.model).toBe('anthropic/claude-sonnet-4')
    expect(info.quantity).toBe(4200)
  })

  it('returns null for missing required models in text/image/video tasks', () => {
    expect(buildDefaultTaskBillingInfo(TASK_TYPE.ANALYZE_NOVEL, {})).toBeNull()
    expect(buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_PANEL, {})).toBeNull()
    expect(buildDefaultTaskBillingInfo(TASK_TYPE.VIDEO_PANEL, {})).toBeNull()
  })

  it('honors candidateCount/count for image tasks', () => {
    const info = expectBillableInfo(buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_PANEL, {
      candidateCount: 4,
      imageModel: 'seedream4',
    }))
    expect(info.apiType).toBe('image')
    expect(info.quantity).toBe(4)
    expect(info.model).toBe('seedream4')
  })

  it('builds video billing info from firstLastFrame.flModel', () => {
    const info = expectBillableInfo(buildDefaultTaskBillingInfo(TASK_TYPE.VIDEO_PANEL, {
      videoModel: 'ark::doubao-seedance-1-5-pro-251215',
      firstLastFrame: {
        flModel: 'doubao-seedance-1-0-pro-250528',
      },
      duration: 8,
    }))
    expect(info.apiType).toBe('video')
    expect(info.model).toBe('doubao-seedance-1-0-pro-250528')
    expect(info.quantity).toBe(1)
  })

  it('derives video input pricing from real reference videos only', () => {
    const cases = [
      {
        name: 'normal image-to-video',
        payload: { imageUrl: 'https://example.com/source.png' },
        expected: false,
      },
      {
        name: 'first/last frame images',
        payload: {
          firstLastFrame: {
            flModel: 'ark::doubao-seedance-2-0-260128',
            lastFrameImageUrl: 'https://example.com/last.png',
          },
          generationOptions: {
            referenceImages: ['https://example.com/reference.png'],
          },
        },
        expected: false,
      },
      {
        name: 'real reference video',
        payload: {
          generationOptions: {
            referenceVideos: ['https://example.com/reference.mp4'],
          },
        },
        expected: true,
      },
    ] as const

    for (const testCase of cases) {
      const payloadGenerationOptions = 'generationOptions' in testCase.payload
        ? testCase.payload.generationOptions
        : {}
      const info = expectBillableInfo(buildDefaultTaskBillingInfo(TASK_TYPE.VIDEO_PANEL, {
        videoModel: 'maas-seedance:tenant-1::doubao-seedance-2.0',
        ...testCase.payload,
        generationOptions: {
          duration: 4,
          generateAudio: true,
          ...payloadGenerationOptions,
        },
      }))
      expect(info.metadata, testCase.name).toMatchObject({
        containsVideoInput: testCase.expected,
      })
    }
  })

  it('keeps Ark Seedance 2 image-to-video billing behavior', () => {
    const info = expectBillableInfo(buildDefaultTaskBillingInfo(TASK_TYPE.VIDEO_PANEL, {
      videoModel: 'ark::doubao-seedance-2-0-260128',
      generationOptions: {
        resolution: '720p',
        duration: 4,
        generateAudio: true,
      },
    }))
    expect(info.metadata).toMatchObject({ containsVideoInput: false })
  })

  it('uses explicit lip sync model from payload', () => {
    const info = expectBillableInfo(buildDefaultTaskBillingInfo(TASK_TYPE.LIP_SYNC, {
      lipSyncModel: 'vidu::vidu-lipsync',
    }))
    expect(info.apiType).toBe('lip-sync')
    expect(info.model).toBe('vidu::vidu-lipsync')
    expect(info.quantity).toBe(1)
  })
})
