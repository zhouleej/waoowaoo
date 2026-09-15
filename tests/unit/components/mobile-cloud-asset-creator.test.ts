import { describe, expect, it } from 'vitest'
import { defaultMobileCloudAssetName } from '@/app/[locale]/workspace/asset-hub/components/MobileCloudAssetCreator'

describe('Mobile Cloud local asset creator', () => {
  it('uses the uploaded local file name as the default asset name', () => {
    expect(defaultMobileCloudAssetName('产品主图.png')).toBe('产品主图')
    expect(defaultMobileCloudAssetName('没有扩展名')).toBe('没有扩展名')
  })

  it('keeps the generated asset name within the Mobile Cloud 64-character limit', () => {
    expect(defaultMobileCloudAssetName(`${'长'.repeat(80)}.webp`)).toHaveLength(64)
  })
})
