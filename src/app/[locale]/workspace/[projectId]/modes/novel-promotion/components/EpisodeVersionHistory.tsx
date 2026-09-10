'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { useWorkspaceProvider } from '../WorkspaceProvider'

type Snapshot = { id: string; createdAt: string; name: string; panels: number; voices: number }
export default function EpisodeVersionHistory() {
  const { projectId, episodeId, onRefresh } = useWorkspaceProvider()
  const t = useTranslations('video')
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Snapshot[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!episodeId) return null
  const load = async () => {
    setOpen(true); setBusy(true); setError('')
    try {
      const response = await apiFetch(`/api/novel-promotion/${projectId}/snapshots?episodeId=${episodeId}`)
      if (!response.ok) throw new Error(t('editor.alert.loadFailed'))
      setRows((await response.json()).snapshots)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const restore = async (snapshotId: string) => {
    if (!confirm(t('editor.restoreConfirm'))) return
    setBusy(true); setError('')
    try {
      const response = await apiFetch(`/api/novel-promotion/${projectId}/snapshots`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ episodeId, snapshotId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || t('editor.alert.loadFailed'))
      await onRefresh(); setOpen(false)
      window.location.reload()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  return <div className="px-6 py-2">
    <button className="glass-btn-base glass-btn-secondary px-3 py-1" onClick={() => void load()}>{t('editor.versions')}</button>
    {open && <div className="glass-surface p-4 mt-2">
      <div className="flex justify-between"><p>{t('editor.versionDescription')}</p><button onClick={() => setOpen(false)}>×</button></div>
      {error && <p role="alert">{error}</p>}
      {busy && <p>{t('editor.loading')}</p>}
      {!busy && !rows.length && <p>{t('editor.noVersions')}</p>}
      {rows.map((row) => <div className="flex justify-between py-2" key={row.id}>
        <span>{new Date(row.createdAt).toLocaleString()} · {row.name} · {row.panels} / {row.voices}</span>
        <button disabled={busy} onClick={() => void restore(row.id)}>{t('editor.restore')}</button>
      </div>)}
    </div>}
  </div>
}
