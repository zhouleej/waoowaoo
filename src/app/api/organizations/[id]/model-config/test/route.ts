import { NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { teamMember } from '@/lib/workspace/teams'
import { bindTeamWorkspace } from '@/lib/workspace/access'
import { getProviderConfig, getProviderKey } from '@/lib/api-config'
import { testProviderConnection } from '@/lib/user-api/provider-test'

export const POST = apiHandler(async (req, ctx) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  await teamMember(String(id), auth.session.user.id, ['owner', 'admin'])
  await bindTeamWorkspace(String(id), auth.session.user.id)
  const { providerId } = await req.json()
  if (typeof providerId !== 'string') throw new ApiError('INVALID_PARAMS')
  if (providerId === 'mobile-cloud') {
    const { createMobileCloudMaasAssetClient } = await import('@/lib/mobile-cloud-maas/asset-client')
    await createMobileCloudMaasAssetClient().listGroups({ pageSize: 1 })
    return NextResponse.json({ success: true, steps: [{ name: 'models', status: 'pass', message: 'Connection verified' }] })
  }
  const provider = await getProviderConfig(auth.session.user.id, providerId)
  const apiType = getProviderKey(providerId) as Parameters<typeof testProviderConnection>[0]['apiType']
  const result = await testProviderConnection({ readOnly: true, apiType, baseUrl: provider.baseUrl, apiKey: provider.apiKey })
  if (!result.success) throw new ApiError('INVALID_PARAMS', { message: result.steps.filter(step => step.status === 'fail').map(step => step.message).join('; ') })
  return NextResponse.json({ success: true, steps: result.steps.map(({ name, status, message }) => ({ name, status, message })) })
})
