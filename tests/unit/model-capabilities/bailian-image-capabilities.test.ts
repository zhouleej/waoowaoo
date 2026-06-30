import { describe, expect, it } from 'vitest'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'

describe('bailian image capabilities catalog', () => {
  it('registers bailian t2i image models with size options', () => {
    const models = [
      'wan2.6-t2i',
      'wan2.5-t2i-preview',
      'wan2.2-t2i-flash',
      'wan2.2-t2i-plus',
      'wanx2.1-t2i-turbo',
      'wanx2.1-t2i-plus',
    ]

    for (const modelId of models) {
      const capabilities = findBuiltinCapabilities('image', 'bailian', modelId)
      expect(capabilities?.image?.resolutionOptions).toEqual(['1024*1024', '1440*1440'])
    }
  })
})
