import { describe, expect, it } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'

describe('inspiration video routes contract', () => {
  it('registers the workspace and generation routes in their expected contract groups', () => {
    const inspirationRoutes = ROUTE_CATALOG.filter((item) => item.routeFile.startsWith('src/app/api/inspiration-video/'))
    const workspaceRoute = inspirationRoutes.find((item) => item.routeFile === 'src/app/api/inspiration-video/route.ts')
    const generationRoute = inspirationRoutes.find((item) => item.routeFile === 'src/app/api/inspiration-video/generate/route.ts')

    expect(inspirationRoutes.map((item) => item.routeFile).sort()).toEqual([
      'src/app/api/inspiration-video/generate/route.ts',
      'src/app/api/inspiration-video/route.ts',
    ])

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
