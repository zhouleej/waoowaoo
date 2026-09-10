'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useLocale, useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import { AppIcon } from '@/components/ui/icons'
import { Link, useRouter } from '@/i18n/navigation'
import { apiFetch } from '@/lib/api-fetch'
import { readApiErrorMessage } from '@/lib/api/read-error-message'
import { filterNormalVideoModelOptions } from '@/lib/model-capabilities/video-model-options'
import { useSSE } from '@/lib/query/hooks/useSSE'
import type { SSEEvent } from '@/lib/task/types'
import InspirationComposer from './components/InspirationComposer'
import CreationPreview from './components/CreationPreview'
import CreationHistory from './components/CreationHistory'
import type {
  InspirationVideoBootstrap,
  InspirationVideoForm,
  InspirationVideoModel,
  InspirationVideoCreation,
} from './types'

const EMPTY_FORM: InspirationVideoForm = {
  prompt: '',
  modelKey: '',
  aspectRatio: '16:9',
  resolution: '720p',
  duration: 5,
  generateAudio: true,
  primaryImage: null,
  referenceImages: [],
  referenceAudios: [],
}

function getDurationOptions(model: InspirationVideoModel | undefined): number[] {
  const options = model?.capabilities?.video?.durationOptions
  return Array.isArray(options) && options.length > 0 ? options : [5]
}

function getResolutionOptions(model: InspirationVideoModel | undefined): string[] {
  const options = model?.capabilities?.video?.resolutionOptions
  return Array.isArray(options) && options.length > 0 ? options : ['720p']
}

function getAudioOptions(model: InspirationVideoModel | undefined): boolean[] {
  const options = model?.capabilities?.video?.generateAudioOptions
  if (Array.isArray(options) && options.length > 0) return options
  if (model?.capabilities?.video?.supportGenerateAudio === false) return [false]
  return [true, false]
}

function chooseAllowed<T>(current: T, options: T[]): T {
  return options.includes(current) ? current : options[0]
}

export default function InspirationVideoPage() {
  const t = useTranslations('inspirationVideo')
  const tc = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const { data: session, status } = useSession()
  const [bootstrap, setBootstrap] = useState<InspirationVideoBootstrap | null>(null)
  const [models, setModels] = useState<InspirationVideoModel[]>([])
  const [form, setForm] = useState<InspirationVideoForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const submissionRef = useRef<{ form: InspirationVideoForm; id: string } | null>(null)
  const submitLock = useRef(false)
  const [historyBusy, setHistoryBusy] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace({ pathname: '/auth/signin' })
  }, [router, status])

  const refreshWorkspace = useCallback(async () => {
    const response = await apiFetch('/api/inspiration-video')
    if (!response.ok) throw new Error(await readApiErrorMessage(response, t('errors.loadFailed')))
    const data = await response.json() as InspirationVideoBootstrap
    setBootstrap((current) => current ? { ...data, nextCursor: current.nextCursor,
      creations: [...data.creations, ...current.creations.filter((item) => !data.creations.some((fresh) => fresh.id === item.id))],
    } : data)
    return data
  }, [t])

  useEffect(() => {
    if (status !== 'authenticated' || !session) return
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [workspaceResponse, modelsResponse] = await Promise.all([
          apiFetch('/api/inspiration-video'),
          apiFetch('/api/user/models'),
        ])
        if (!workspaceResponse.ok) {
          throw new Error(await readApiErrorMessage(workspaceResponse, t('errors.loadFailed')))
        }
        if (!modelsResponse.ok) {
          throw new Error(await readApiErrorMessage(modelsResponse, t('errors.modelsFailed')))
        }
        const workspaceData = await workspaceResponse.json() as InspirationVideoBootstrap
        const modelsData = await modelsResponse.json() as { video?: InspirationVideoModel[] }
        const videoModels = filterNormalVideoModelOptions(Array.isArray(modelsData.video) ? modelsData.video : [])
        if (!active) return

        const selected = videoModels.find((model) => model.value === workspaceData.defaults.videoModel) || videoModels[0]
        const durationOptions = getDurationOptions(selected)
        const resolutionOptions = getResolutionOptions(selected)
        const audioOptions = getAudioOptions(selected)
        setBootstrap(workspaceData)
        setModels(videoModels)
        setForm((current) => ({
          ...current,
          modelKey: selected?.value || '',
          aspectRatio: chooseAllowed(workspaceData.defaults.aspectRatio || current.aspectRatio, selected?.capabilities?.video?.aspectRatios || [current.aspectRatio]),
          resolution: chooseAllowed(workspaceData.defaults.resolution, resolutionOptions),
          duration: chooseAllowed(current.duration, durationOptions),
          generateAudio: chooseAllowed(current.generateAudio, audioOptions),
        }))
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : t('errors.loadFailed'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [session, status, t])

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    if (event.targetType !== 'InspirationVideoCreation') return
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = window.setTimeout(() => {
      void refreshWorkspace().catch(() => undefined)
    }, 300)
  }, [refreshWorkspace])

  useEffect(() => () => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
  }, [])

  useSSE({
    projectId: bootstrap?.workspace.projectId,
    enabled: status === 'authenticated' && Boolean(bootstrap?.workspace.projectId),
    onEvent: handleSSEEvent,
  })

  const selectedModel = useMemo(
    () => models.find((model) => model.value === form.modelKey),
    [form.modelKey, models],
  )
  const durationOptions = useMemo(() => getDurationOptions(selectedModel), [selectedModel])
  const resolutionOptions = useMemo(() => getResolutionOptions(selectedModel), [selectedModel])
  const audioOptions = useMemo(() => getAudioOptions(selectedModel), [selectedModel])
  const referencesEnabled = selectedModel?.providerKey?.toLowerCase() === 'maas-seedance'

  const handleModelChange = (modelKey: string) => {
    const nextModel = models.find((model) => model.value === modelKey)
    const nextDurations = getDurationOptions(nextModel)
    const nextResolutions = getResolutionOptions(nextModel)
    const nextAudioOptions = getAudioOptions(nextModel)
    const keepReferences = nextModel?.providerKey?.toLowerCase() === 'maas-seedance'
    setForm((current) => ({
      ...current,
      modelKey,
      aspectRatio: chooseAllowed(current.aspectRatio, nextModel?.capabilities?.video?.aspectRatios || [current.aspectRatio]),
      duration: chooseAllowed(current.duration, nextDurations),
      resolution: chooseAllowed(current.resolution, nextResolutions),
      generateAudio: chooseAllowed(current.generateAudio, nextAudioOptions),
      ...(keepReferences ? {} : { referenceImages: [], referenceAudios: [] }),
    }))
    setNotice(keepReferences || !nextModel ? null : t('materials.modelChangedNotice'))
  }

  const handleSubmit = async () => {
    if (submitLock.current) return
    if ((!form.primaryImage && !selectedModel?.capabilities?.video?.textToVideo) || !form.prompt.trim() || !form.modelKey) return
    setSubmitting(true)
    submitLock.current = true
    if (submissionRef.current?.form !== form) submissionRef.current = { form, id: crypto.randomUUID() }
    setError(null)
    setNotice(null)
    try {
      const payload = new FormData()
      payload.set('submissionId', submissionRef.current.id)
      payload.set('prompt', form.prompt.trim())
      payload.set('modelKey', form.modelKey)
      payload.set('aspectRatio', form.aspectRatio)
      payload.set('resolution', form.resolution)
      payload.set('duration', String(form.duration))
      payload.set('generateAudio', String(form.generateAudio))
      payload.set('locale', locale)
      if (form.primaryImage) payload.set('primaryImage', form.primaryImage)
      form.referenceImages.forEach((file) => payload.append('referenceImages', file))
      form.referenceAudios.forEach((file) => payload.append('referenceAudios', file))

      const response = await apiFetch('/api/inspiration-video/generate', {
        method: 'POST',
        body: payload,
      })
      if (!response.ok) throw new Error(await readApiErrorMessage(response, t('errors.submitFailed')))
      submissionRef.current = null
      setNotice(t('actions.queued'))
      await refreshWorkspace().catch(() => setError(t('errors.refreshAfterSubmit')))
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('errors.submitFailed'))
    } finally {
      setSubmitting(false)
      submitLock.current = false
    }
  }

  const loadMore = async () => {
    if (!bootstrap?.nextCursor || historyBusy) return
    setHistoryBusy(true)
    try {
      const response = await apiFetch(`/api/inspiration-video?cursor=${encodeURIComponent(bootstrap.nextCursor)}`)
      if (!response.ok) throw new Error(await readApiErrorMessage(response, t('errors.loadFailed')))
      const page = await response.json() as InspirationVideoBootstrap
      setBootstrap((current) => current ? { ...current, nextCursor: page.nextCursor,
        creations: [...current.creations, ...page.creations.filter((item) => !current.creations.some((row) => row.id === item.id))],
      } : page)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setHistoryBusy(false) }
  }
  const historyAction = async (creation: InspirationVideoCreation, action: 'retry' | 'cancel' | 'delete' | 'reuse') => {
    if (historyBusy) return
    if (action === 'delete' && !confirm(t('actions.deleteConfirm'))) return
    setHistoryBusy(true); setError(null)
    try {
      if (action === 'reuse') {
        const download = async (media: { url: string; name: string }, image: boolean) => {
          const response = await apiFetch(media.url)
          if (!response.ok) throw new Error(t('errors.loadFailed'))
          const blob = await response.blob()
          return new File([blob], image ? `${media.name.replace(/\.[^.]+$/, '')}.jpg` : media.name, { type: image ? 'image/jpeg' : blob.type })
        }
        const primaryImage = creation.primaryImage ? await download(creation.primaryImage, true) : null
        const referenceImages = await Promise.all(creation.referenceImages.map((item) => download(item, true)))
        const referenceAudios = await Promise.all(creation.referenceAudios.map((item) => download(item, false)))
        setForm({ prompt: creation.prompt, modelKey: creation.modelKey, aspectRatio: creation.aspectRatio, resolution: creation.resolution,
          duration: creation.duration, generateAudio: creation.generateAudio, primaryImage, referenceImages, referenceAudios })
        submissionRef.current = null
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        const response = await apiFetch('/api/inspiration-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: creation.id, action, locale }) })
        if (!response.ok) throw new Error(await readApiErrorMessage(response, t('errors.submitFailed')))
        if (action === 'delete') setBootstrap((current) => current ? { ...current, creations: current.creations.filter((item) => item.id !== creation.id) } : current)
        await refreshWorkspace()
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setHistoryBusy(false) }
  }

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="glass-page min-h-screen">
        <Navbar />
        <div className="flex min-h-[70vh] items-center justify-center text-[var(--glass-text-secondary)]">
          <AppIcon name="loader" className="mr-2 h-5 w-5 animate-spin" />{tc('loading')}
        </div>
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="glass-page min-h-screen">
      <Navbar />
      <main className="mx-auto w-full max-w-[1560px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--glass-tone-info-fg)]">
              <AppIcon name="sparkles" className="h-4 w-4" />{t('eyebrow')}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--glass-text-primary)] sm:text-4xl">{t('title')}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--glass-text-secondary)] sm:text-base">{t('subtitle')}</p>
          </div>
          <Link href={{ pathname: '/profile' }} className="glass-btn-base glass-btn-secondary inline-flex items-center gap-2 self-start rounded-xl px-4 py-2.5 text-sm sm:self-auto">
            <AppIcon name="settingsHex" className="h-4 w-4" />{t('actions.modelSettings')}
          </Link>
        </header>

        {error ? (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[var(--glass-tone-danger-fg)]/20 bg-[var(--glass-tone-danger-bg)] px-4 py-3 text-sm text-[var(--glass-tone-danger-fg)]">
            <AppIcon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)}><AppIcon name="close" className="h-4 w-4" /></button>
          </div>
        ) : null}
        {notice ? (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[var(--glass-tone-info-fg)]/20 bg-[var(--glass-tone-info-bg)] px-4 py-3 text-sm text-[var(--glass-tone-info-fg)]">
            <AppIcon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{notice}</span>
            <button type="button" onClick={() => setNotice(null)}><AppIcon name="close" className="h-4 w-4" /></button>
          </div>
        ) : null}

        {models.length === 0 ? (
          <div className="glass-surface mb-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-[var(--glass-tone-warning-fg)]/20 p-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <AppIcon name="alert" className="mt-0.5 h-5 w-5 text-[var(--glass-tone-warning-fg)]" />
              <div><p className="font-medium text-[var(--glass-text-primary)]">{t('models.emptyTitle')}</p><p className="mt-1 text-sm text-[var(--glass-text-secondary)]">{t('models.emptyHint')}</p></div>
            </div>
            <Link href={{ pathname: '/profile' }} className="glass-btn-base glass-btn-primary rounded-xl px-4 py-2 text-sm">{t('actions.configureNow')}</Link>
          </div>
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
          <InspirationComposer
            form={form}
            models={models}
            durationOptions={durationOptions}
            resolutionOptions={resolutionOptions}
            audioOptions={audioOptions}
            referencesEnabled={referencesEnabled}
            submitting={submitting}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            onModelChange={handleModelChange}
            onSubmit={() => void handleSubmit()}
          />
          <CreationPreview creation={bootstrap?.creations[0] || null} pendingImage={form.primaryImage} />
        </div>

        <CreationHistory creations={bootstrap?.creations || []} models={models} busy={historyBusy} onAction={(creation, action) => void historyAction(creation, action)} />
        {bootstrap?.nextCursor && <button disabled={historyBusy} className="glass-btn-base mt-4 px-4 py-2" onClick={() => void loadMore()}>{t('actions.loadMore')}</button>}
      </main>
    </div>
  )
}
