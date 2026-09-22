'use client'

import { useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import {
  type CustomArtStyleDto,
  useCreateCustomArtStyle,
  useCustomArtStyles,
  useDeleteCustomArtStyle,
  useUpdateCustomArtStyle,
} from '@/lib/art-styles/use-custom-art-styles'

export default function CustomArtStylePanel() {
  const stylesQuery = useCustomArtStyles()
  const createStyle = useCreateCustomArtStyle()
  const updateStyle = useUpdateCustomArtStyle()
  const deleteStyle = useDeleteCustomArtStyle()
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState<CustomArtStyleDto | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState('')

  const openCreate = () => {
    setEditing(null); setName(''); setPrompt(''); setError(''); setCreating(true)
  }
  const openEdit = (style: CustomArtStyleDto) => {
    setEditing(style); setName(style.name); setPrompt(style.prompt); setError(''); setCreating(true)
  }
  const closeEditor = () => { setCreating(false); setEditing(null); setError('') }
  const save = async () => {
    if (!name.trim() || !prompt.trim()) { setError('请输入风格名称和提示词'); return }
    try {
      setError('')
      if (editing) await updateStyle.mutateAsync({ id: editing.id, name: name.trim(), prompt: prompt.trim() })
      else await createStyle.mutateAsync({ name: name.trim(), prompt: prompt.trim() })
      closeEditor()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    }
  }
  const remove = async (style: CustomArtStyleDto) => {
    if (!window.confirm(`确认删除自定义风格“${style.name}”吗？已提交任务不会受影响，但使用该风格的项目下次生成前需要重新选择。`)) return
    await deleteStyle.mutateAsync(style.id)
  }

  return (
    <section className="glass-surface mb-6 overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <button type="button" onClick={() => setExpanded((value) => !value)} className="flex min-w-0 items-center gap-2 text-left">
          <AppIcon name="sparklesAlt" className="h-5 w-5 text-[var(--glass-accent-from)]" />
          <div>
            <h2 className="font-semibold text-[var(--glass-text-primary)]">我的画面风格</h2>
            <p className="text-xs text-[var(--glass-text-tertiary)]">保存自己的提示词，在新建剧本和项目设置中重复使用</p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={openCreate} className="glass-btn-base glass-btn-primary flex items-center gap-1.5 px-3 py-2 text-sm">
            <AppIcon name="plus" className="h-4 w-4" />新建风格
          </button>
          <button type="button" onClick={() => setExpanded((value) => !value)} className="glass-btn-base p-2">
            <AppIcon name="chevronDown" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--glass-stroke-soft)] px-5 py-4">
          {stylesQuery.isLoading ? <p className="text-sm text-[var(--glass-text-secondary)]">正在加载…</p> :
            (stylesQuery.data || []).length === 0 ? <p className="text-sm text-[var(--glass-text-secondary)]">还没有自定义风格，可以在这里或风格选择器中创建。</p> : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(stylesQuery.data || []).map((style) => (
                  <article key={style.id} className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium text-[var(--glass-text-primary)]">{style.name}</h3>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openEdit(style)} className="glass-btn-base px-2 py-1 text-xs">编辑</button>
                        <button type="button" onClick={() => void remove(style)} className="glass-btn-base px-2 py-1 text-xs text-red-500">删除</button>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-[var(--glass-text-secondary)]">{style.prompt}</p>
                  </article>
                ))}
              </div>
            )}
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && closeEditor()}>
          <div className="glass-surface-modal w-full max-w-xl rounded-2xl p-5">
            <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">{editing ? '编辑自定义风格' : '新建自定义风格'}</h3>
            <div className="mt-4 space-y-3">
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="风格名称" className="glass-input-base w-full px-3 py-2" />
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} rows={8} placeholder="风格提示词" className="glass-input-base w-full resize-y px-3 py-2" />
              <div className="flex justify-between text-xs text-[var(--glass-text-tertiary)]"><span>{error && <span className="text-red-500">{error}</span>}</span><span>{prompt.length}/4000</span></div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeEditor} className="glass-btn-base px-4 py-2 text-sm">取消</button>
              <button type="button" onClick={() => void save()} disabled={createStyle.isPending || updateStyle.isPending} className="glass-btn-base glass-btn-primary px-4 py-2 text-sm disabled:opacity-50">保存</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
