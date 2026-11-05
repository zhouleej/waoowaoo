import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { WorkspaceError as ApiError } from './errors'
import { encryptApiKey } from '@/lib/crypto-utils'
import { parseCustomModels, parseCustomProviders } from '@/lib/api-config'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { audit, lockTeam, teamMember } from './teams'

export type TeamProvider = { id: string; name: string; baseUrl?: string; apiKey?: string; hasApiKey?: boolean; accessKey?: string; secretKey?: string; hasAccessKey?: boolean; hasSecretKey?: boolean; poolId?: string; apiMode?: string; gatewayRoute?: string }
export type TeamModel = { provider: string; modelId: string; name: string; type: string; budgetPrice: number; [key: string]: unknown }
const defaultKeys = ['analysisModel', 'characterModel', 'locationModel', 'storyboardModel', 'editModel', 'videoModel', 'audioModel', 'lipSyncModel', 'voiceDesignModel']

export async function getTeamModelConfig(organizationId: string, actorId: string) {
  const member = await teamMember(organizationId, actorId)
  const config = member.organization.currentModelConfigId
    ? await prisma.organizationModelConfigVersion.findUnique({ where: { id: member.organization.currentModelConfigId } }) : null
  const providers = config ? JSON.parse(config.providers) as TeamProvider[] : []
  return {
    version: config?.version ?? 0,
    providers: providers.map(({ apiKey, accessKey, secretKey, ...provider }) => ({ ...provider, hasApiKey: Boolean(apiKey), hasAccessKey: Boolean(accessKey), hasSecretKey: Boolean(secretKey) })),
    models: config ? JSON.parse(config.models) as TeamModel[] : [],
    defaults: config?.defaults ?? {},
    canManage: ['owner', 'admin'].includes(member.role),
  }
}

export async function saveTeamModelConfig(organizationId: string, actorId: string, body: {
  version: number; providers: TeamProvider[]; models: TeamModel[]; defaults: Record<string, unknown>
}) {
  if (!Number.isInteger(body.version) || !Array.isArray(body.providers) || !Array.isArray(body.models) || !body.defaults || typeof body.defaults !== 'object') throw new ApiError('INVALID_PARAMS')
  await prisma.$transaction(async tx => {
    await lockTeam(tx, organizationId)
    const member = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: actorId } }, include: { organization: true } })
    if (!member || member.status !== 'active' || member.organization.status !== 'active' || !['owner', 'admin'].includes(member.role)) throw new ApiError('FORBIDDEN')
    const previous = member.organization.currentModelConfigId ? await tx.organizationModelConfigVersion.findUnique({ where: { id: member.organization.currentModelConfigId } }) : null
    if ((previous?.version ?? 0) !== body.version) throw new ApiError('CONFLICT', { message: '配置已更新，请重新加载 / Configuration changed; reload first' })
    const oldProviders = previous ? JSON.parse(previous.providers) as TeamProvider[] : []
    const providers = body.providers.map(provider => {
      if (!provider.id || !provider.name) throw new ApiError('INVALID_PARAMS')
      if (provider.baseUrl) {
        const url = new URL(provider.baseUrl)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new ApiError('INVALID_PARAMS')
      }
      const existing = oldProviders.find(old => old.id === provider.id)
      return {
        id: provider.id, name: provider.name, baseUrl: provider.baseUrl,
        apiMode: provider.apiMode, gatewayRoute: provider.gatewayRoute, poolId: provider.poolId,
        accessKey: provider.accessKey === '' ? undefined : typeof provider.accessKey === 'string' ? encryptApiKey(provider.accessKey) : existing?.accessKey,
        secretKey: provider.secretKey === '' ? undefined : typeof provider.secretKey === 'string' ? encryptApiKey(provider.secretKey) : existing?.secretKey,
        apiKey: provider.apiKey === '' ? undefined : typeof provider.apiKey === 'string' ? encryptApiKey(provider.apiKey) : existing?.apiKey,
      }
    })
    if (new Set(providers.map(p => p.id)).size !== providers.length) throw new ApiError('INVALID_PARAMS')
    const models = body.models.map(model => {
      if (!providers.some(p => p.id === model.provider && p.apiKey) || typeof model.budgetPrice !== 'number' || !Number.isFinite(model.budgetPrice) || model.budgetPrice < 0) throw new ApiError('INVALID_PARAMS', { message: '模型需要有效连接和估算价格 / Models require credentials and a budget price' })
      if (model.type === 'llm' && model.provider.startsWith('openai-compatible') && !['chat-completions', 'responses'].includes(String(model.llmProtocol))) throw new ApiError('INVALID_PARAMS', { message: 'Select a text API protocol' })
      return { ...model, modelKey: `${model.provider}::${model.modelId}`, price: model.budgetPrice }
    })
    parseCustomProviders(JSON.stringify(providers))
    parseCustomModels(JSON.stringify(models))
    const defaults: Record<string, string> = {}
    for (const key of defaultKeys) {
      const selected = body.defaults[key]
      if (selected == null || selected === '') continue
      if (typeof selected !== 'string' || !parseModelKeyStrict(selected) || !models.some(model => model.modelKey === selected && model.type === (key === 'analysisModel' ? 'llm' : key === 'videoModel' ? 'video' : ['audioModel', 'voiceDesignModel'].includes(key) ? 'audio' : key === 'lipSyncModel' ? 'lipsync' : 'image'))) throw new ApiError('INVALID_PARAMS')
      defaults[key] = selected
    }
    for (const key of ['videoRatio', 'videoResolution', 'artStyle', 'ttsRate']) {
      if (typeof body.defaults[key] === 'string') defaults[key] = String(body.defaults[key])
    }
    const config = await tx.organizationModelConfigVersion.create({ data: {
      organizationId, version: body.version + 1, providers: JSON.stringify(providers), models: JSON.stringify(models),
      defaults: defaults as Prisma.InputJsonValue, createdById: actorId,
    } })
    await tx.organization.update({ where: { id: organizationId }, data: { currentModelConfigId: config.id } })
    await audit(tx, organizationId, actorId, 'update_model_config', config.id, { version: config.version })
  })
  return getTeamModelConfig(organizationId, actorId)
}
