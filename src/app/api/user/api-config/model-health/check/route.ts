import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { checkModelHealth } from '@/lib/user-api/model-health'

function stringField(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === 'string' ? body[key].trim() : ''
}

export const POST = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  let body: unknown
  try { body = await request.json() } catch { throw new ApiError('INVALID_PARAMS', { code: 'MODEL_HEALTH_PAYLOAD_INVALID' }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('INVALID_PARAMS', { code: 'MODEL_HEALTH_PAYLOAD_INVALID' })
  const input = body as Record<string, unknown>
  const providerId = stringField(input, 'providerId')
  const modelKey = stringField(input, 'modelKey')
  if (!providerId || !modelKey) throw new ApiError('INVALID_PARAMS', { code: 'MODEL_HEALTH_TARGET_REQUIRED' })
  if (Object.keys(input).some((key) => !['providerId', 'modelKey'].includes(key))) throw new ApiError('INVALID_PARAMS', { code: 'MODEL_HEALTH_FIELDS_FORBIDDEN' })
  try {
    return NextResponse.json(await checkModelHealth({ userId: auth.session.user.id, providerId, modelKey }))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('MODEL_HEALTH_MODEL_NOT_FOUND')) throw new ApiError('NOT_FOUND', { code: 'MODEL_HEALTH_MODEL_NOT_FOUND' })
    if (message.startsWith('PROVIDER_NOT_FOUND')) throw new ApiError('NOT_FOUND', { code: 'MODEL_HEALTH_PROVIDER_NOT_FOUND' })
    if (message.startsWith('PROVIDER_API_KEY_MISSING')) throw new ApiError('MISSING_CONFIG', { code: 'MODEL_HEALTH_CONFIG_MISSING' })
    throw error
  }
})
