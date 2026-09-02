'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { isAbortError } from '@/lib/error-utils'
import { useCopyProjectAssetFromGlobal } from '@/lib/query/hooks'
import { apiFetch } from '@/lib/api-fetch'

type ToastType = 'success' | 'warning' | 'error'

type ShowToast = (message: string, type?: ToastType, duration?: number) => void

export type GlobalCopyTarget = {
  type: 'character' | 'location' | 'prop' | 'voice'
  targetId: string
}

interface UseAssetsCopyFromHubParams {
  projectId: string
  onRefresh: () => void | Promise<void>
  showToast: ShowToast
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export function useAssetsCopyFromHub({ projectId, onRefresh, showToast }: UseAssetsCopyFromHubParams) {
  const t = useTranslations('assets')
  const copyFromGlobalAsset = useCopyProjectAssetFromGlobal(projectId)
  const [copyFromGlobalTarget, setCopyFromGlobalTarget] = useState<GlobalCopyTarget | null>(null)
  const [isGlobalCopyInFlight, setIsGlobalCopyInFlight] = useState(false)

  const handleCopyFromGlobal = useCallback((characterId: string) => {
    setCopyFromGlobalTarget({ type: 'character', targetId: characterId })
  }, [])

  const handleCopyLocationFromGlobal = useCallback((locationId: string) => {
    setCopyFromGlobalTarget({ type: 'location', targetId: locationId })
  }, [])

  const handleCopyPropFromGlobal = useCallback((propId: string) => {
    setCopyFromGlobalTarget({ type: 'prop', targetId: propId })
  }, [])

  const handleVoiceSelectFromHub = useCallback((characterId: string) => {
    setCopyFromGlobalTarget({ type: 'voice', targetId: characterId })
  }, [])

  const handleCloseCopyPicker = useCallback(() => {
    setCopyFromGlobalTarget(null)
  }, [])

  const handleConfirmCopyFromGlobal = useCallback(async (globalAssetId: string) => {
    if (!copyFromGlobalTarget) return

    setIsGlobalCopyInFlight(true)
    try {
      await copyFromGlobalAsset.mutateAsync({
        type: copyFromGlobalTarget.type,
        targetId: copyFromGlobalTarget.targetId,
        globalAssetId,
      })

      const successMsg = copyFromGlobalTarget.type === 'character'
        ? t('assetLibrary.copySuccessCharacter')
        : copyFromGlobalTarget.type === 'location'
          ? t('assetLibrary.copySuccessLocation')
          : copyFromGlobalTarget.type === 'prop'
            ? t('assetLibrary.copySuccessProp')
          : t('assetLibrary.copySuccessVoice')
      showToast(successMsg, 'success')
      setCopyFromGlobalTarget(null)
      await Promise.resolve(onRefresh())
    } catch (error: unknown) {
      if (!isAbortError(error)) {
        showToast(t('assetLibrary.copyFailed', { error: getErrorMessage(error) }), 'error')
      }
    } finally {
      setIsGlobalCopyInFlight(false)
    }
  }, [copyFromGlobalAsset, copyFromGlobalTarget, onRefresh, showToast, t])

  const handleConfirmCopyFromProject = useCallback(async (projectAssetId: string) => {
    if (!copyFromGlobalTarget) return
    setIsGlobalCopyInFlight(true)
    try {
      const publishResponse = await apiFetch(`/api/projects/${projectId}/assets/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: projectAssetId, kind: copyFromGlobalTarget.type }),
      })
      if (!publishResponse.ok) throw new Error('Failed to publish selected project asset')
      const published = await publishResponse.json() as { globalAssetId?: string }
      if (!published.globalAssetId) throw new Error('Selected project asset is not ready for reuse')
      await copyFromGlobalAsset.mutateAsync({ type: copyFromGlobalTarget.type, targetId: copyFromGlobalTarget.targetId, globalAssetId: published.globalAssetId })
      showToast(t('assetLibrary.copySuccessCharacter'), 'success')
      setCopyFromGlobalTarget(null)
      await Promise.resolve(onRefresh())
    } catch (error: unknown) {
      if (!isAbortError(error)) showToast(t('assetLibrary.copyFailed', { error: getErrorMessage(error) }), 'error')
    } finally { setIsGlobalCopyInFlight(false) }
  }, [copyFromGlobalAsset, copyFromGlobalTarget, onRefresh, projectId, showToast, t])

  return {
    copyFromGlobalTarget,
    isGlobalCopyInFlight,
    handleCopyFromGlobal,
    handleCopyLocationFromGlobal,
    handleCopyPropFromGlobal,
    handleVoiceSelectFromHub,
    handleConfirmCopyFromGlobal,
    handleConfirmCopyFromProject,
    handleCloseCopyPicker,
  }
}
