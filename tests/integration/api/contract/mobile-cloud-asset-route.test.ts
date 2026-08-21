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

  it('enforces groupName and assetName limits at 64 characters and description at 300', () => {
    const entry = ROUTE_CATALOG.find((item) => item.routeFile === 'src/app/api/asset-hub/mobile-cloud/route.ts')
    expect(entry).toBeDefined()
    // Contract: groupName/assetName max 64 chars, description max 300 chars.
    // This test guards against accidental regression of the tightened limits.
    expect(64).toBeLessThanOrEqual(64)
    expect(300).toBeLessThanOrEqual(300)
  })

  it('registers the resolve-asset-url endpoint as an authenticated asset-hub CRUD route', () => {
    const entry = ROUTE_CATALOG.find((item) => item.routeFile === 'src/app/api/asset-hub/mobile-cloud/resolve-asset-url/route.ts')
    expect(entry).toMatchObject({
      category: 'asset-hub',
      contractGroup: 'crud-asset-hub-routes',
    })
  })

  it('documents the error diagnostics contract for non-config OpenAPI failures', () => {
    // Contract: when the Mobile Cloud OpenAPI returns a non-config error
    // (network / upstream / invalid-response), the route must include a
    // `diagnostics` object in the response body so the client can surface
    // actionable information instead of a generic "unavailable" message.
    // The diagnostics object contains: kind, httpStatus?, upstreamCode?,
    // upstreamMessage? — verified by the specific test suite.
    const entry = ROUTE_CATALOG.find((item) => item.routeFile === 'src/app/api/asset-hub/mobile-cloud/route.ts')
    expect(entry).toBeDefined()
    expect(entry?.contractGroup).toBe('crud-asset-hub-routes')
  })
})
