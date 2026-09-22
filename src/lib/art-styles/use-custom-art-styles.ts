'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'

export interface CustomArtStyleDto {
  id: string
  value: string
  name: string
  prompt: string
  createdAt: string
  updatedAt: string
}

const queryKey = ['custom-art-styles'] as const

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof data?.message === 'string' ? data.message : '自定义风格操作失败')
  return data
}

export function useCustomArtStyles() {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const data = await readJson(await apiFetch('/api/asset-hub/styles'))
      return (data.styles || []) as CustomArtStyleDto[]
    },
    staleTime: 30_000,
  })
}

export function useCreateCustomArtStyle() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; prompt: string }) => {
      const data = await readJson(await apiFetch('/api/asset-hub/styles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      }))
      return data.style as CustomArtStyleDto
    },
    onSuccess: () => client.invalidateQueries({ queryKey }),
  })
}

export function useUpdateCustomArtStyle() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name: string; prompt: string }) => {
      const data = await readJson(await apiFetch(`/api/asset-hub/styles/${input.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.name, prompt: input.prompt }),
      }))
      return data.style as CustomArtStyleDto
    },
    onSuccess: () => client.invalidateQueries({ queryKey }),
  })
}

export function useDeleteCustomArtStyle() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => readJson(await apiFetch(`/api/asset-hub/styles/${id}`, { method: 'DELETE' })),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  })
}
