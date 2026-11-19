import * as React from 'react'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderCard } from '@/app/[locale]/profile/components/api-config/ProviderCard'
import type { Provider } from '@/app/[locale]/profile/components/api-config/types'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/app/[locale]/profile/components/api-config/provider-card/hooks/useProviderCardState', () => ({
  useProviderCardState: ({ provider }: { provider: Provider }) => ({ providerKey: provider.id.split(':')[0] }),
}))
vi.mock('@/app/[locale]/profile/components/api-config/provider-card/ProviderCardShell', () => ({
  ProviderCardShell: ({ children }: { children: ReactNode }) => createElement('section', null, children),
}))
vi.mock('@/app/[locale]/profile/components/api-config/provider-card/ProviderBaseFields', () => ({ ProviderBaseFields: () => null }))
vi.mock('@/app/[locale]/profile/components/api-config/provider-card/ProviderAdvancedFields', () => ({ ProviderAdvancedFields: () => null }))

function render(provider: Provider) {
  return renderToStaticMarkup(createElement(ProviderCard, {
    provider, models: [], defaultModels: {}, onToggleModel: vi.fn(), onUpdateApiKey: vi.fn(),
    onDeleteModel: vi.fn(), onAddModel: vi.fn(), onAddModels: vi.fn(async () => true),
  }))
}

describe('Ark discovery entry', () => {
  beforeEach(() => { vi.stubGlobal('React', React) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('offers discovery after saving an Ark key without requiring a custom base URL or preset model', () => {
    const html = render({ id: 'ark', name: 'Ark', hasApiKey: true, apiKey: 'saved-test-key' })
    expect(html).toContain('discoverModels')
    expect(html).toContain('arkDiscoveryHint')
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('saved-test-key')
  })

  it('waits for a saved key before offering Ark discovery', () => {
    expect(render({ id: 'ark', name: 'Ark', hasApiKey: false })).not.toContain('discoverModels')
  })

  it('keeps OpenAI-compatible discovery dependent on its configured base URL', () => {
    expect(render({ id: 'openai-compatible:mine', name: 'Compat', hasApiKey: true })).toContain('disabled=""')
    expect(render({ id: 'openai-compatible:mine', name: 'Compat', hasApiKey: true, baseUrl: 'https://example.com/v1' })).not.toContain('disabled=""')
  })
})
