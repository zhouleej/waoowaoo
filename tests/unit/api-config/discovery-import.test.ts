import { describe, expect, it } from 'vitest'
import { buildDiscoveryImportPlan } from '@/app/[locale]/profile/components/api-config/discovery-import'
import { encodeModelKey, type CustomModel } from '@/app/[locale]/profile/components/api-config/types'

const existing: CustomModel[] = [{
  modelId: 'existing', modelKey: encodeModelKey('openai-compatible:x', 'existing'), name: 'Existing',
  type: 'llm', provider: 'openai-compatible:x', price: 0, enabled: true,
}]

describe('buildDiscoveryImportPlan', () => {
  it('deduplicates by provider and model ID without overwriting existing models', () => {
    const discovered = { id: 'new-model', suggestedType: 'image' as const, confidence: 'medium' as const }
    const plan = buildDiscoveryImportPlan({
      providerId: 'openai-compatible:x', existingModels: existing,
      selections: [
        { model: { id: 'existing', suggestedType: 'llm', confidence: 'low' }, type: 'video' },
        { model: discovered, type: 'image' },
        { model: discovered, type: 'video' },
      ],
    })
    expect(plan.existingIds).toEqual(['existing'])
    expect(plan.duplicateSelectionIds).toEqual(['new-model'])
    expect(plan.additions).toEqual([expect.objectContaining({
      modelId: 'new-model', modelKey: encodeModelKey('openai-compatible:x', 'new-model'), type: 'image', provider: 'openai-compatible:x',
    })])
  })

  it('uses the compatible default protocol without a protocol probe', () => {
    const plan = buildDiscoveryImportPlan({
      providerId: 'openai-compatible:x', existingModels: [],
      selections: [{ model: { id: 'chat-model', suggestedType: 'llm', confidence: 'low' }, type: 'llm' }],
    })
    expect(plan.additions[0]).toMatchObject({ llmProtocol: 'chat-completions' })
    expect(plan.additions[0]?.llmProtocolCheckedAt).toBeUndefined()
  })
})
