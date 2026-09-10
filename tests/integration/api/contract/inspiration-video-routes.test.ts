import { describe, expect, it } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'

describe('inspiration video routes contract', () => {
  it('registers the workspace and generation routes in their expected contract groups', () => {
    const workspaceRoute = ROUTE_CATALOG.find((item) => item.routeFile === 'src/app/api/inspiration-video/route.ts')
    const generationRoute = ROUTE_CATALOG.find((item) => item.routeFile === 'src/app/api/inspiration-video/generate/route.ts')

    expect(workspaceRoute).toMatchObject({
      category: 'projects',
      contractGroup: 'user-project-routes',
    })
    expect(generationRoute).toMatchObject({
      category: 'projects',
      contractGroup: 'direct-submit-routes',
    })
  })
})
