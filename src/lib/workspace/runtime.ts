import type { AsyncLocalStorage } from 'node:async_hooks'

export type WorkspaceScope = { type: 'personal'; userId: string } | { type: 'team'; organizationId: string }
export type WorkspaceRuntime = {
  hint?: string | null
  actorId?: string
  organizationId?: string | null
  role?: string
  billingSource?: string
  configVersionId?: string | null
  taskId?: string
  projectId?: string
  expectedRevisions?: Record<string, number>
  readRevisions?: Record<string, number>
  createdIds?: Set<string>
  callDepth?: number
}

// Next's route bundles and workers must share the same async-local store.
const globals = globalThis as typeof globalThis & { workspaceRuntime?: AsyncLocalStorage<WorkspaceRuntime> }
function createStorage(): AsyncLocalStorage<WorkspaceRuntime> | undefined {
  if (typeof window !== 'undefined' || process.env.NEXT_RUNTIME === 'edge') return undefined
  const runtimeProcess = process as typeof process & { getBuiltinModule?: (id: string) => unknown }
  const hooks = runtimeProcess.getBuiltinModule?.('async' + '_hooks') as { AsyncLocalStorage: new <T>() => AsyncLocalStorage<T> } | undefined
  if (hooks) return new hooks.AsyncLocalStorage<WorkspaceRuntime>()
  const requireFn = new Function('return typeof require !== "undefined" ? require : null')() as ((id: string) => { AsyncLocalStorage: new <T>() => AsyncLocalStorage<T> }) | null
  return requireFn ? new (requireFn('async' + '_hooks').AsyncLocalStorage)<WorkspaceRuntime>() : undefined
}
const storage = globals.workspaceRuntime ??= createStorage()

export function withWorkspaceRuntime<T>(runtime: WorkspaceRuntime, run: () => T): T {
  if (!storage) throw new Error('Workspace request isolation unavailable')
  return storage.run(runtime, run)
}

export function workspaceRuntime(): WorkspaceRuntime {
  return storage?.getStore() ?? {}
}

export function setWorkspaceRuntime(value: Partial<WorkspaceRuntime>) {
  const runtime = storage?.getStore()
  if (runtime) Object.assign(runtime, value)
}

export function assetScopeWhere(userId: string) {
  const { organizationId } = workspaceRuntime()
  return organizationId ? { organizationId } : { userId, organizationId: null }
}

export function assetScopeData(userId: string) {
  return { userId, organizationId: workspaceRuntime().organizationId ?? null }
}

export function canAccessScopedAsset(asset: { userId: string; organizationId?: string | null }, userId: string) {
  const { organizationId } = workspaceRuntime()
  return organizationId ? asset.organizationId === organizationId : !asset.organizationId && asset.userId === userId
}

export function workspaceScopeKey(userId: string) {
  return workspaceRuntime().organizationId ? `team:${workspaceRuntime().organizationId}` : `personal:${userId}`
}
