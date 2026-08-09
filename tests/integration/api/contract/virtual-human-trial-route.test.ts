import { describe, expect, it } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'

describe('virtual human trial route contract', () => {
  it('registers the trial endpoint as a direct-submit route', () => {
    const entry = ROUTE_CATALOG.find((item) => item.routeFile === 'src/app/api/asset-hub/virtual-human-trial/route.ts')
    expect(entry).toMatchObject({
      category: 'asset-hub',
      contractGroup: 'direct-submit-routes',
    })
  })
})
