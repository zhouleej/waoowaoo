'use client'

import { useCallback } from 'react'
import type { VideoEditorProject } from '../types/editor.types'
import { apiFetch } from '@/lib/api-fetch'
export { assembleEditorProject as createProjectFromPanels } from '../utils/assemble-project'

interface UseEditorActionsProps { projectId: string; episodeId: string }

export function useEditorActions({ projectId, episodeId }: UseEditorActionsProps) {
    /**
     * 保存项目到服务器
     */
    const saveProject = useCallback(async (project: VideoEditorProject) => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ episodeId, projectData: project })
        })

        if (!response.ok) {
            throw new Error('Failed to save project')
        }

        return response.json()
    }, [projectId, episodeId])

    /**
     * 加载项目
     */
    const loadProject = useCallback(async (): Promise<VideoEditorProject | null> => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor?episodeId=${episodeId}`)

        if (!response.ok) {
            if (response.status === 404) return null
            throw new Error('Failed to load project')
        }

        const data = await response.json()
        return data.projectData
    }, [projectId, episodeId])

    /**
     * 发起渲染导出
     */
    const startRender = useCallback(async (editorProjectId: string) => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                editorProjectId,
                format: 'mp4',
                quality: 'high'
            })
        })

        if (!response.ok) {
            throw new Error('Failed to start render')
        }

        return response.json()
    }, [projectId])

    /**
     * 获取渲染状态
     */
    const getRenderStatus = useCallback(async (editorProjectId: string) => {
        const response = await apiFetch(
            `/api/novel-promotion/${projectId}/editor/render?id=${editorProjectId}`
        )

        if (!response.ok) {
            throw new Error('Failed to get render status')
        }

        return response.json()
    }, [projectId])

    return {
        saveProject,
        loadProject,
        startRender,
        getRenderStatus
    }
}
