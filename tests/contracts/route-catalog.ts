export type RouteCategory =
  | 'assets'
  | 'asset-hub'
  | 'novel-promotion'
  | 'projects'
  | 'tasks'
  | 'user'
  | 'organization'
  | 'auth'
  | 'infra'
  | 'system'

export type RouteContractGroup =
  | 'llm-observe-routes'
  | 'direct-submit-routes'
  | 'crud-assets-routes'
  | 'crud-asset-hub-routes'
  | 'crud-novel-promotion-routes'
  | 'task-infra-routes'
  | 'user-project-routes'
  | 'organization-routes'
  | 'auth-routes'
  | 'infra-routes'

export type RouteCatalogEntry = {
  routeFile: string
  category: RouteCategory
  contractGroup: RouteContractGroup
}

const ROUTE_FILES = [
  'src/app/api/novel-promotion/[projectId]/snapshots/route.ts',
  'src/app/api/novel-promotion/[projectId]/editor/render/route.ts',
  'src/app/api/admin/download-logs/route.ts',
  'src/app/api/asset-hub/ai-design-character/route.ts',
  'src/app/api/asset-hub/ai-design-location/route.ts',
  'src/app/api/asset-hub/ai-modify-character/route.ts',
  'src/app/api/asset-hub/ai-modify-location/route.ts',
  'src/app/api/asset-hub/ai-modify-prop/route.ts',
  'src/app/api/asset-hub/appearances/route.ts',
  'src/app/api/asset-hub/character-voice/route.ts',
  'src/app/api/asset-hub/characters/[characterId]/appearances/[appearanceIndex]/route.ts',
  'src/app/api/asset-hub/characters/[characterId]/route.ts',
  'src/app/api/asset-hub/characters/route.ts',
  'src/app/api/asset-hub/folders/[folderId]/route.ts',
  'src/app/api/asset-hub/folders/route.ts',
  'src/app/api/asset-hub/generate-image/route.ts',
  'src/app/api/asset-hub/locations/[locationId]/route.ts',
  'src/app/api/asset-hub/locations/route.ts',
  'src/app/api/asset-hub/modify-image/route.ts',
  'src/app/api/asset-hub/picker/route.ts',
  'src/app/api/asset-hub/reference-to-character/route.ts',
  'src/app/api/asset-hub/select-image/route.ts',
  'src/app/api/asset-hub/undo-image/route.ts',
  'src/app/api/asset-hub/update-asset-label/route.ts',
  'src/app/api/asset-hub/upload-image/route.ts',
  'src/app/api/asset-hub/upload-temp/route.ts',
  'src/app/api/asset-hub/mobile-cloud/resolve-asset-url/route.ts',
  'src/app/api/asset-hub/mobile-cloud/route.ts',
  'src/app/api/asset-hub/virtual-human-trial/route.ts',
  'src/app/api/asset-hub/voice-design/route.ts',
  'src/app/api/asset-hub/voices/[id]/route.ts',
  'src/app/api/asset-hub/voices/route.ts',
  'src/app/api/asset-hub/voices/upload/route.ts',
  'src/app/api/assets/[assetId]/copy/route.ts',
  'src/app/api/assets/[assetId]/generate/route.ts',
  'src/app/api/assets/[assetId]/modify-render/route.ts',
  'src/app/api/assets/[assetId]/revert-render/route.ts',
  'src/app/api/assets/[assetId]/route.ts',
  'src/app/api/assets/[assetId]/select-render/route.ts',
  'src/app/api/assets/[assetId]/update-label/route.ts',
  'src/app/api/assets/[assetId]/variants/[variantId]/route.ts',
  'src/app/api/assets/route.ts',
  'src/app/api/auth/[...nextauth]/route.ts',
  'src/app/api/auth/register/route.ts',
  'src/app/api/cos/image/route.ts',
  'src/app/api/files/[...path]/route.ts',
  'src/app/api/inspiration-video/generate/route.ts',
  'src/app/api/inspiration-video/route.ts',
  'src/app/api/storage/sign/route.ts',
  'src/app/api/novel-promotion/[projectId]/ai-create-character/route.ts',
  'src/app/api/novel-promotion/[projectId]/ai-create-location/route.ts',
  'src/app/api/novel-promotion/[projectId]/ai-modify-appearance/route.ts',
  'src/app/api/novel-promotion/[projectId]/ai-modify-location/route.ts',
  'src/app/api/novel-promotion/[projectId]/ai-modify-prop/route.ts',
  'src/app/api/novel-promotion/[projectId]/ai-modify-shot-prompt/route.ts',
  'src/app/api/novel-promotion/[projectId]/analyze-global/route.ts',
  'src/app/api/novel-promotion/[projectId]/analyze-shot-variants/route.ts',
  'src/app/api/novel-promotion/[projectId]/analyze/route.ts',
  'src/app/api/novel-promotion/[projectId]/assets/route.ts',
  'src/app/api/novel-promotion/[projectId]/character-profile/batch-confirm/route.ts',
  'src/app/api/novel-promotion/[projectId]/character-profile/confirm/route.ts',
  'src/app/api/novel-promotion/[projectId]/character-voice/route.ts',
  'src/app/api/novel-promotion/[projectId]/character/appearance/route.ts',
  'src/app/api/novel-promotion/[projectId]/character/confirm-selection/route.ts',
  'src/app/api/novel-promotion/[projectId]/character/route.ts',
  'src/app/api/novel-promotion/[projectId]/cleanup-unselected-images/route.ts',
  'src/app/api/novel-promotion/[projectId]/clips/[clipId]/route.ts',
  'src/app/api/novel-promotion/[projectId]/clips/route.ts',
  'src/app/api/novel-promotion/[projectId]/copy-from-global/route.ts',
  'src/app/api/novel-promotion/[projectId]/download-images/route.ts',
  'src/app/api/novel-promotion/[projectId]/download-videos/route.ts',
  'src/app/api/novel-promotion/[projectId]/download-voices/route.ts',
  'src/app/api/novel-promotion/[projectId]/editor/route.ts',
  'src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts',
  'src/app/api/novel-promotion/[projectId]/episodes/batch/route.ts',
  'src/app/api/novel-promotion/[projectId]/episodes/route.ts',
  'src/app/api/novel-promotion/[projectId]/episodes/split-by-markers/route.ts',
  'src/app/api/novel-promotion/[projectId]/episodes/split/route.ts',
  'src/app/api/novel-promotion/[projectId]/generate-character-image/route.ts',
  'src/app/api/novel-promotion/[projectId]/generate-image/route.ts',
  'src/app/api/novel-promotion/[projectId]/generate-video/route.ts',
  'src/app/api/novel-promotion/[projectId]/insert-panel/route.ts',
  'src/app/api/novel-promotion/[projectId]/lip-sync/route.ts',
  'src/app/api/novel-promotion/[projectId]/location/confirm-selection/route.ts',
  'src/app/api/novel-promotion/[projectId]/location/route.ts',
  'src/app/api/novel-promotion/[projectId]/modify-asset-image/route.ts',
  'src/app/api/novel-promotion/[projectId]/modify-storyboard-image/route.ts',
  'src/app/api/novel-promotion/[projectId]/panel-link/route.ts',
  'src/app/api/novel-promotion/[projectId]/panel-variant/route.ts',
  'src/app/api/novel-promotion/[projectId]/panel/route.ts',
  'src/app/api/novel-promotion/[projectId]/panel/select-candidate/route.ts',
  'src/app/api/novel-promotion/[projectId]/photography-plan/route.ts',
  'src/app/api/novel-promotion/[projectId]/reference-to-character/route.ts',
  'src/app/api/novel-promotion/[projectId]/regenerate-group/route.ts',
  'src/app/api/novel-promotion/[projectId]/regenerate-panel-image/route.ts',
  'src/app/api/novel-promotion/[projectId]/regenerate-single-image/route.ts',
  'src/app/api/novel-promotion/[projectId]/regenerate-storyboard-text/route.ts',
  'src/app/api/novel-promotion/[projectId]/route.ts',
  'src/app/api/novel-promotion/[projectId]/screenplay-conversion/route.ts',
  'src/app/api/novel-promotion/[projectId]/script-to-storyboard-stream/route.ts',
  'src/app/api/novel-promotion/[projectId]/select-character-image/route.ts',
  'src/app/api/novel-promotion/[projectId]/select-location-image/route.ts',
  'src/app/api/novel-promotion/[projectId]/speaker-voice/route.ts',
  'src/app/api/novel-promotion/[projectId]/story-to-script-stream/route.ts',
  'src/app/api/novel-promotion/[projectId]/storyboard-group/route.ts',
  'src/app/api/novel-promotion/[projectId]/storyboards/route.ts',
  'src/app/api/novel-promotion/[projectId]/undo-regenerate/route.ts',
  'src/app/api/novel-promotion/[projectId]/update-appearance/route.ts',
  'src/app/api/novel-promotion/[projectId]/update-asset-label/route.ts',
  'src/app/api/novel-promotion/[projectId]/update-location/route.ts',
  'src/app/api/novel-promotion/[projectId]/update-prompt/route.ts',
  'src/app/api/novel-promotion/[projectId]/upload-asset-image/route.ts',
  'src/app/api/novel-promotion/[projectId]/video-proxy/route.ts',
  'src/app/api/novel-promotion/[projectId]/video-urls/route.ts',
  'src/app/api/novel-promotion/[projectId]/voice-analyze/route.ts',
  'src/app/api/novel-promotion/[projectId]/voice-design/route.ts',
  'src/app/api/novel-promotion/[projectId]/voice-generate/route.ts',
  'src/app/api/novel-promotion/[projectId]/voice-lines/route.ts',
  'src/app/api/projects/[projectId]/assets/route.ts',
  'src/app/api/projects/[projectId]/assets/publish/route.ts',
  'src/app/api/projects/[projectId]/costs/route.ts',
  'src/app/api/projects/[projectId]/data/route.ts',
  'src/app/api/projects/[projectId]/route.ts',
  'src/app/api/projects/route.ts',
  'src/app/api/runs/[runId]/cancel/route.ts',
  'src/app/api/runs/[runId]/events/route.ts',
  'src/app/api/runs/[runId]/route.ts',
  'src/app/api/runs/[runId]/steps/[stepKey]/retry/route.ts',
  'src/app/api/runs/route.ts',
  'src/app/api/sse/route.ts',
  'src/app/api/system/boot-id/route.ts',
  'src/app/api/task-target-states/route.ts',
  'src/app/api/tasks/[taskId]/route.ts',
  'src/app/api/tasks/dismiss/route.ts',
  'src/app/api/tasks/route.ts',
  'src/app/api/user-preference/route.ts',
  'src/app/api/user/api-config/route.ts',
  'src/app/api/user/api-config/discover-models/route.ts',
  'src/app/api/user/api-config/model-health/check-provider/route.ts',
  'src/app/api/user/api-config/model-health/check/route.ts',
  'src/app/api/user/api-config/model-health/route.ts',
  'src/app/api/user/assistant/chat/route.ts',
  'src/app/api/user/api-config/assistant/validate-media-template/route.ts',
  'src/app/api/user/api-config/assistant/probe-media-template/route.ts',
  'src/app/api/user/api-config/probe-model-llm-protocol/route.ts',
  'src/app/api/user/api-config/test-connection/route.ts',
  'src/app/api/user/api-config/test-provider/route.ts',
  'src/app/api/user/balance/route.ts',
  'src/app/api/user/costs/details/route.ts',
  'src/app/api/user/costs/route.ts',
  'src/app/api/user/ai-story-expand/route.ts',
  'src/app/api/user/models/route.ts',
  'src/app/api/user/mobile-cloud-usage/route.ts',
  'src/app/api/user/mobile-cloud-usage/export/route.ts',
  'src/app/api/user/mobile-cloud-usage/export/status/route.ts',
  'src/app/api/user/mobile-cloud-usage/export/query/route.ts',
  'src/app/api/user/transactions/route.ts',
  'src/app/api/organizations/route.ts',
  'src/app/api/organizations/current/route.ts',
  'src/app/api/organizations/[id]/route.ts',
  'src/app/api/organizations/[id]/billing/route.ts',
  'src/app/api/organizations/[id]/invitations/route.ts',
  'src/app/api/organizations/[id]/invitations/[invitationId]/route.ts',
  'src/app/api/organizations/[id]/members/route.ts',
  'src/app/api/organizations/[id]/members/[userId]/route.ts',
  'src/app/api/organizations/[id]/balance/route.ts',
  'src/app/api/organizations/[id]/usage/route.ts',
  'src/app/api/organizations/[id]/members/[userId]/usage/route.ts',
  'src/app/api/platform/admin/check/route.ts',
  'src/app/api/platform/organizations/route.ts',
  'src/app/api/platform/organizations/[id]/route.ts',
  'src/app/api/platform/organizations/[id]/balance/route.ts',
  'src/app/api/platform/organizations/[id]/members/route.ts',
  'src/app/api/platform/organizations/[id]/disable/route.ts',
  'src/app/api/platform/organizations/[id]/enable/route.ts',
  'src/app/api/platform/users/route.ts',
  'src/app/api/platform/users/[id]/route.ts',
  'src/app/api/platform/users/[id]/organizations/route.ts',
  'src/app/api/platform/stats/route.ts',
  'src/app/api/platform/config/route.ts',
  'src/app/api/platform/config/[id]/route.ts',
  'src/app/api/platform/audit-logs/route.ts',
  'src/app/api/platform/plans/route.ts',
  'src/app/api/platform/plans/[id]/route.ts',
  'src/app/api/platform/subscriptions/route.ts',
  'src/app/api/platform/subscriptions/[id]/route.ts',
  'src/app/api/platform/orders/route.ts',
  'src/app/api/platform/orders/[id]/route.ts',
  'src/app/api/platform/invoices/route.ts',
  'src/app/api/platform/invoices/[id]/route.ts',
] as const

function resolveCategory(routeFile: string): RouteCategory {
  if (routeFile.startsWith('src/app/api/assets/')) return 'assets'
  if (routeFile.startsWith('src/app/api/asset-hub/')) return 'asset-hub'
  if (routeFile.startsWith('src/app/api/novel-promotion/')) return 'novel-promotion'
  if (routeFile.startsWith('src/app/api/inspiration-video/')) return 'projects'
  if (routeFile.startsWith('src/app/api/projects/')) return 'projects'
  if (
    routeFile.startsWith('src/app/api/tasks/')
    || routeFile.startsWith('src/app/api/runs/')
    || routeFile === 'src/app/api/task-target-states/route.ts'
  ) {
    return 'tasks'
  }
  if (routeFile.startsWith('src/app/api/organizations/')) return 'organization'
  if (routeFile.startsWith('src/app/api/platform/')) return 'system'
  if (routeFile.startsWith('src/app/api/user/') || routeFile === 'src/app/api/user-preference/route.ts') return 'user'
  if (routeFile.startsWith('src/app/api/auth/')) return 'auth'
  if (routeFile.startsWith('src/app/api/system/')) return 'system'
  return 'infra'
}

function resolveContractGroup(routeFile: string): RouteContractGroup {
  if (
    routeFile.includes('/ai-')
    || routeFile.includes('/analyze')
    || routeFile.includes('/story-to-script-stream/')
    || routeFile.includes('/script-to-storyboard-stream/')
    || routeFile.includes('/screenplay-conversion/')
    || routeFile.includes('/reference-to-character/')
    || routeFile.includes('/character-profile/')
    || routeFile.endsWith('/clips/route.ts')
    || routeFile.endsWith('/episodes/split/route.ts')
    || routeFile.endsWith('/voice-analyze/route.ts')
  ) {
    return 'llm-observe-routes'
  }
  if (
    routeFile.endsWith('/generate-image/route.ts')
    || routeFile.endsWith('/generate-video/route.ts')
    || routeFile.endsWith('/generate/route.ts')
    || routeFile.endsWith('/modify-image/route.ts')
    || routeFile.endsWith('/modify-render/route.ts')
    || routeFile.endsWith('/voice-design/route.ts')
    || routeFile.endsWith('/insert-panel/route.ts')
    || routeFile.endsWith('/lip-sync/route.ts')
    || routeFile.endsWith('/modify-asset-image/route.ts')
    || routeFile.endsWith('/modify-storyboard-image/route.ts')
    || routeFile.endsWith('/panel-variant/route.ts')
    || routeFile.endsWith('/regenerate-group/route.ts')
    || routeFile.endsWith('/regenerate-panel-image/route.ts')
    || routeFile.endsWith('/regenerate-single-image/route.ts')
    || routeFile.endsWith('/regenerate-storyboard-text/route.ts')
    || routeFile.endsWith('/voice-generate/route.ts')
    || routeFile.endsWith('/virtual-human-trial/route.ts')
  ) {
    return 'direct-submit-routes'
  }
  if (routeFile.startsWith('src/app/api/assets/')) return 'crud-assets-routes'
  if (routeFile.startsWith('src/app/api/asset-hub/')) return 'crud-asset-hub-routes'
  if (routeFile.startsWith('src/app/api/novel-promotion/')) return 'crud-novel-promotion-routes'
  if (routeFile.startsWith('src/app/api/inspiration-video/')) return 'user-project-routes'
  if (
    routeFile.startsWith('src/app/api/tasks/')
    || routeFile.startsWith('src/app/api/runs/')
    || routeFile === 'src/app/api/task-target-states/route.ts'
    || routeFile === 'src/app/api/sse/route.ts'
  ) {
    return 'task-infra-routes'
  }
  if (routeFile.startsWith('src/app/api/projects/') || routeFile.startsWith('src/app/api/user/')) {
    return 'user-project-routes'
  }
  if (routeFile.startsWith('src/app/api/organizations/')) {
    return 'organization-routes'
  }
  if (routeFile.startsWith('src/app/api/platform/')) {
    return 'organization-routes'
  }
  if (routeFile.startsWith('src/app/api/auth/')) return 'auth-routes'
  return 'infra-routes'
}

export const ROUTE_CATALOG: ReadonlyArray<RouteCatalogEntry> = ROUTE_FILES.map((routeFile) => ({
  routeFile,
  category: resolveCategory(routeFile),
  contractGroup: resolveContractGroup(routeFile),
}))

export const ROUTE_COUNT = ROUTE_CATALOG.length
