'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation } from '@tanstack/react-query'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { apiJson } from '@/lib/api-fetch'

export default function CopyAssetsToTeam({ assets }: { assets: { id: string; kind: string; name: string }[] }) {
  const t = useTranslations('teams'), { scope, memberships } = useWorkspace()
  const [open, setOpen] = useState(false), [target, setTarget] = useState(''), [selected, setSelected] = useState<string[]>([])
  const copy = useMutation({ mutationFn: () => apiJson('/api/asset-hub/copy-to-team', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workspace-Scope': 'personal' }, body: JSON.stringify({ organizationId: target, assets: assets.filter(asset => selected.includes(asset.id)).map(({ id, kind }) => ({ id, kind })) }) }), onSuccess: () => { setOpen(false); setSelected([]) } })
  if (scope !== 'personal' || !memberships.length) return null
  return <><button className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm" onClick={() => { setOpen(true); copy.reset() }}>{t('copy')}</button>{copy.isSuccess && <span role="status" className="text-sm text-emerald-600 ml-3">{t('copySuccess')}</span>}{open && <div className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm grid place-items-center px-4"><div role="dialog" aria-modal="true" aria-labelledby="copy-title" className="glass-surface p-7 max-w-md w-full"><h2 id="copy-title" className="text-xl font-semibold mb-5">{t('copy')}</h2><label className="text-sm">{t('selectTeam')}<select value={target} className="glass-input-base w-full p-2 mt-2" onChange={event => setTarget(event.target.value)}><option value="">{t('unset')}</option>{memberships.map(member => <option key={member.organizationId} value={member.organizationId}>{member.organization.name}</option>)}</select></label><div className="max-h-72 overflow-auto my-5 space-y-3">{assets.map(asset => <label key={asset.id} className="flex gap-3 text-sm"><input type="checkbox" checked={selected.includes(asset.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, asset.id] : previous.filter(id => id !== asset.id))} />{asset.name}</label>)}</div>{copy.error && <p role="alert" className="text-red-600 text-sm my-3">{copy.error.message}</p>}<div className="flex justify-end gap-3"><button className="glass-btn-base glass-btn-secondary px-4 py-2" onClick={() => setOpen(false)}>{t('cancel')}</button><button disabled={!target || !selected.length || selected.length > 50 || copy.isPending} className="glass-btn-base glass-btn-primary px-4 py-2" onClick={() => copy.mutate()}>{t('copy')}</button></div></div></div>}</>
}
