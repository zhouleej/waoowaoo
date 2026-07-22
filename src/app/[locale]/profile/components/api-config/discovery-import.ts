import type { CustomModel } from './types'
import { encodeModelKey } from './types'
import type { DiscoveredModel, DiscoveredModelType } from '@/lib/user-api/model-discovery'

export interface DiscoveryImportSelection {
  model: DiscoveredModel
  type: DiscoveredModelType
}

export interface DiscoveryImportPlan {
  additions: Array<Omit<CustomModel, 'enabled'>>
  existingIds: string[]
  duplicateSelectionIds: string[]
}

export function buildDiscoveryImportPlan(input: {
  providerId: string
  existingModels: CustomModel[]
  selections: DiscoveryImportSelection[]
}): DiscoveryImportPlan {
  const existingKeys = new Set(input.existingModels.map((model) => model.modelKey || encodeModelKey(model.provider, model.modelId)))
  const selectedKeys = new Set<string>()
  const additions: Array<Omit<CustomModel, 'enabled'>> = []
  const existingIds: string[] = []
  const duplicateSelectionIds: string[] = []

  for (const selection of input.selections) {
    const modelId = selection.model.id.trim()
    if (!modelId) continue
    const modelKey = encodeModelKey(input.providerId, modelId)
    if (existingKeys.has(modelKey)) {
      existingIds.push(modelId)
      continue
    }
    if (selectedKeys.has(modelKey)) {
      duplicateSelectionIds.push(modelId)
      continue
    }
    selectedKeys.add(modelKey)
    additions.push({
      modelId,
      modelKey,
      name: selection.model.name?.trim() || modelId,
      type: selection.type,
      provider: input.providerId,
      price: 0,
      ...(selection.type === 'llm' ? { llmProtocol: 'chat-completions' as const } : {}),
    })
  }
  return { additions, existingIds, duplicateSelectionIds }
}
