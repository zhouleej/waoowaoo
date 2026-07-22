import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { getModelHealthStatuses } from '@/lib/user-api/model-health'

export const GET = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const providerId = request.nextUrl.searchParams.get('providerId')?.trim() || undefined
  return NextResponse.json({ statuses: await getModelHealthStatuses(auth.session.user.id, providerId) })
})
