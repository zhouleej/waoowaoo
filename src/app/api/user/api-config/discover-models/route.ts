import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { decryptApiKey } from '@/lib/crypto-utils'
import { prisma } from '@/lib/prisma'
import { discoverModels, ModelDiscoveryError } from '@/lib/user-api/model-discovery'

interface StoredProvider {
  id?: unknown
  baseUrl?: unknown
  apiKey?: unknown
}

function parseProviders(value: string | null): StoredProvider[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function providerApiType(providerId: string): string {
  const separator = providerId.indexOf(':')
  return separator < 0 ? providerId : providerId.slice(0, separator)
}

function discoveryApiError(error: ModelDiscoveryError): ApiError {
  if (error.code === 'INVALID_URL' || error.code === 'SSRF_BLOCKED') {
    return new ApiError('INVALID_PARAMS', { code: `MODEL_DISCOVERY_${error.code}`, message: error.message })
  }
  if (error.code === 'UPSTREAM_AUTH') {
    return new ApiError('EXTERNAL_ERROR', { code: 'MODEL_DISCOVERY_AUTH_FAILED', upstreamStatus: error.status, message: error.message })
  }
  return new ApiError(error.code === 'NETWORK' ? 'NETWORK_ERROR' : 'EXTERNAL_ERROR', {
    code: `MODEL_DISCOVERY_${error.code}`,
    upstreamStatus: error.status,
    message: error.message,
  })
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'MODEL_DISCOVERY_PAYLOAD_INVALID' })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('INVALID_PARAMS', { code: 'MODEL_DISCOVERY_PAYLOAD_INVALID' })
  }
  const input = body as Record<string, unknown>
  const providerId = typeof input.providerId === 'string' ? input.providerId.trim() : ''
  const forceRefresh = input.forceRefresh === true
  if (!providerId) throw new ApiError('INVALID_PARAMS', { code: 'MODEL_DISCOVERY_PROVIDER_REQUIRED' })
  if (providerApiType(providerId) !== 'openai-compatible') {
    throw new ApiError('INVALID_PARAMS', { code: 'MODEL_DISCOVERY_PROVIDER_UNSUPPORTED' })
  }

  const preference = await prisma.userPreference.findUnique({
    where: { userId },
    select: { customProviders: true },
  })
  const provider = parseProviders(preference?.customProviders ?? null).find((item) => item.id === providerId)
  if (!provider) throw new ApiError('NOT_FOUND', { code: 'MODEL_DISCOVERY_PROVIDER_NOT_FOUND' })
  const baseUrl = typeof provider.baseUrl === 'string' ? provider.baseUrl.trim() : ''
  const encryptedKey = typeof provider.apiKey === 'string' ? provider.apiKey : ''
  if (!baseUrl || !encryptedKey) throw new ApiError('MISSING_CONFIG', { code: 'MODEL_DISCOVERY_CONFIG_MISSING' })

  try {
    const result = await discoverModels({
      userId,
      providerId,
      baseUrl,
      apiKey: decryptApiKey(encryptedKey),
      forceRefresh,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ModelDiscoveryError) throw discoveryApiError(error)
    throw error
  }
})
