'use client'

import { useTranslations } from 'next-intl'
import { ProviderAdvancedFields } from './provider-card/ProviderAdvancedFields'
import { ProviderBaseFields } from './provider-card/ProviderBaseFields'
import { ProviderCardShell } from './provider-card/ProviderCardShell'
import { ModelDiscoveryPanel } from './provider-card/ModelDiscoveryPanel'
import { useProviderCardState } from './provider-card/hooks/useProviderCardState'
import type { ProviderCardProps } from './provider-card/types'

export function ProviderCard({
  provider,
  dragHandle,
  models,
  allModels,
  defaultModels,
  onToggleModel,
  onUpdateApiKey,
  onUpdateBaseUrl,
  onDeleteModel,
  onUpdateModel,
  onDeleteProvider,
  onToggleProviderHidden,
  onAddModel,
  onAddModels,
  onFlushConfig,
  hideProviderLabel,
  showProviderLabel,
  healthStatuses,
  checkingModelKeys,
  checkingProvider,
  onCheckModelHealth,
  onCheckProviderHealth,
}: ProviderCardProps) {
  const t = useTranslations('apiConfig')

  const state = useProviderCardState({
    provider,
    models,
    allModels,
    defaultModels,
    onUpdateApiKey,
    onUpdateBaseUrl,
    onUpdateModel,
    onAddModel,
    onFlushConfig,
    t,
  })

  return (
    <ProviderCardShell
      provider={provider}
      dragHandle={dragHandle}
      onDeleteProvider={onDeleteProvider}
      onToggleProviderHidden={onToggleProviderHidden}
      hideProviderLabel={hideProviderLabel}
      showProviderLabel={showProviderLabel}
      t={t}
      state={state}
    >
      <ProviderBaseFields provider={provider} t={t} state={state} />
      {state.providerKey === 'openai-compatible' && provider.hasApiKey && onAddModels && (
        <ModelDiscoveryPanel provider={provider} allModels={allModels || models} onAddModels={onAddModels} t={t} />
      )}
      <ProviderAdvancedFields
        provider={provider}
        onToggleModel={onToggleModel}
        onDeleteModel={onDeleteModel}
        onUpdateModel={onUpdateModel}
        healthStatuses={healthStatuses}
        checkingModelKeys={checkingModelKeys}
        checkingProvider={checkingProvider}
        onCheckModelHealth={onCheckModelHealth}
        onCheckProviderHealth={onCheckProviderHealth}
        t={t}
        state={state}
      />
    </ProviderCardShell>
  )
}

export default ProviderCard
