import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MOBILE_CLOUD_ASSET_API_DOCS_URL } from '@/lib/mobile-cloud-maas/asset-types'

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('Mobile Cloud asset deletion UI', () => {
  it('links the asset center to the updated official asset API outline', () => {
    expect(MOBILE_CLOUD_ASSET_API_DOCS_URL).toBe(
      'https://ecloud.10086.cn/op-help-center/doc/outline/109811',
    )
  })

  it('requires an explicit confirmation before issuing the irreversible DELETE request', () => {
    const panelSource = readProjectFile(
      'src/app/[locale]/workspace/asset-hub/components/MobileCloudAssetPanel.tsx',
    )
    const cardSource = readProjectFile(
      'src/app/[locale]/workspace/asset-hub/components/MobileCloudAssetCard.tsx',
    )

    expect(cardSource).toContain('onDelete(asset)')
    expect(panelSource).toContain('setPendingDeleteAsset')
    expect(panelSource).toContain('<ConfirmDialog')
    expect(panelSource).toContain('onConfirm={() => void confirmDeleteAsset()}')
    expect(panelSource).toContain("method: 'DELETE'")
    expect(panelSource).toContain("body: JSON.stringify({ resource: 'asset', id: asset.assetId })")
  })
})
