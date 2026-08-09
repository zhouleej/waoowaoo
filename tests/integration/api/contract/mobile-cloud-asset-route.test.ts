import { describe, expect, it } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'

describe('Mobile Cloud asset route contract', () => {
  it('registers the signed asset endpoint as an authenticated asset-hub CRUD route', () => {
    const entry = ROUTE_CATALOG.find((item) => item.routeFile === 'src/app/api/asset-hub/mobile-cloud/route.ts')
    expect(entry).toMatchObject({
      category: 'asset-hub',
      contractGroup: 'crud-asset-hub-routes',
    })
  })
})
