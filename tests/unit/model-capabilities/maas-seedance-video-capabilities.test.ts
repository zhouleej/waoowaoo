import { describe, expect, it } from 'vitest'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'

describe('maas-seedance video capabilities catalog', () => {
  it('exposes the three Seedance 2.0 resolutions for configured Mobile Cloud providers', () => {
    const capabilities = findBuiltinCapabilities(
      'video',
      'maas-seedance:tenant-local',
      'doubao-seedance-2.0',
    )

    expect(capabilities?.video?.resolutionOptions).toEqual(['480p', '720p', '1080p'])
  })
})
