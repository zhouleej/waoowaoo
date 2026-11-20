import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderAdvancedFields } from '@/app/[locale]/profile/components/api-config/provider-card/ProviderAdvancedFields'
import { useProviderCardState } from '@/app/[locale]/profile/components/api-config/provider-card/hooks/useProviderCardState'
import type { CustomModel } from '@/app/[locale]/profile/components/api-config/types'
import type { ProviderCardModelType } from '@/app/[locale]/profile/components/api-config/provider-card/types'

const selection = vi.hoisted(() => ({ type: null as ProviderCardModelType | null }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: <T,>(initial: T | (() => T)) => actual.useState(
      initial === 'llm' && selection.type ? selection.type as T : initial,
    ),
  }
})

const image: CustomModel = {
  modelId: 'saved-image', modelKey: 'ark::saved-image', name: 'My saved image',
  type: 'image', provider: 'ark', price: 0, enabled: true,
}

function Fields({ models = [], adding = false }: { models?: CustomModel[]; adding?: boolean }) {
  const provider = { id: 'ark', name: 'Ark', hasApiKey: true }
  const t = (key: string) => key
  const state = useProviderCardState({
    provider, models, defaultModels: {}, onAddModel: vi.fn(), onUpdateApiKey: vi.fn(),
    onUpdateBaseUrl: undefined, onUpdateModel: undefined, onFlushConfig: undefined, t,
  })
  return createElement(ProviderAdvancedFields, {
    provider, state: { ...state, showAddForm: adding ? selection.type : null }, t,
    onToggleModel: vi.fn(), onDeleteModel: vi.fn(), onUpdateModel: undefined,
  })
}

function expectAllTypeOptions(html: string) {
  for (const label of ['typeText', 'typeImage', 'typeVideo', 'typeAudio']) {
    expect(html).toContain(label)
  }
}

describe('Ark manual model configuration', () => {
  beforeEach(() => {
    selection.type = null
    vi.stubGlobal('React', React)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('offers every model type and an add action before the first model is configured', () => {
    const html = renderToStaticMarkup(createElement(Fields))
    expectAllTypeOptions(html)
    expect(html).toContain('noModelsForType')
    expect(html).toContain('>add</button>')
  })

  it('keeps other types available when the account has only an image model', () => {
    const html = renderToStaticMarkup(createElement(Fields, { models: [image] }))
    expectAllTypeOptions(html)
    expect(html).toContain('noModelsForType')
  })

  it.each(['llm', 'image', 'video', 'audio'] as const)('opens the %s add form without requiring a saved model of that type', (type) => {
    selection.type = type
    const html = renderToStaticMarkup(createElement(Fields, { adding: true }))
    expectAllTypeOptions(html)
    expect(html).toContain('placeholder="modelDisplayName"')
    expect(html).toContain('placeholder="modelActualId"')
    expect(html).toContain('>save</button>')
    expect(html.includes('batchModeHalfPrice')).toBe(type === 'video')
  })

  it('still displays the saved image when the image category is selected', () => {
    selection.type = 'image'
    const html = renderToStaticMarkup(createElement(Fields, { models: [image] }))
    expectAllTypeOptions(html)
    expect(html).toContain('My saved image')
    expect(html).not.toContain('noModelsForType')
  })
})
