'use client'

import { useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useCreateCustomArtStyle } from '@/lib/art-styles/use-custom-art-styles'

export function CustomArtStyleCreator({ onCreated }: { onCreated: (value: string) => void }) {
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState('')
  const createStyle = useCreateCustomArtStyle()

  const handleCreate = async () => {
    if (!name.trim() || !prompt.trim()) {
      setError('请输入风格名称和提示词')
      return
    }
    try {
      setError('')
      const created = await createStyle.mutateAsync({ name: name.trim(), prompt: prompt.trim() })
      onCreated(created.value)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    }
  }

  return (
    <>
      <button type="button" onClick={() => setIsCreating((value) => !value)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--glass-stroke-strong)] px-3 py-2 text-sm text-[var(--glass-accent-from)]">
        <AppIcon name="plus" className="h-4 w-4" />自定义风格
      </button>
      {isCreating && (
        <div className="mt-3 space-y-2 border-t border-[var(--glass-stroke-soft)] pt-3">
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="风格名称，例如：暖色手绘童话" className="glass-input-base w-full px-3 py-2 text-sm" />
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} rows={4} placeholder="输入希望在每次画面生成中使用的风格提示词" className="glass-input-base w-full resize-y px-3 py-2 text-sm" />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button type="button" disabled={createStyle.isPending} onClick={() => void handleCreate()} className="glass-btn-base glass-btn-primary w-full px-3 py-2 text-sm disabled:opacity-50">
            {createStyle.isPending ? '保存中…' : '保存并使用'}
          </button>
        </div>
      )}
    </>
  )
}
