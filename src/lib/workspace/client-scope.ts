export function getClientWorkspaceScope() {
  if (typeof window === 'undefined') return 'personal'
  try { return sessionStorage.getItem('waoowaoo-workspace-scope') ?? 'personal' } catch { return 'personal' }
}

export function storeClientWorkspaceScope(userId: string, scope: string) {
  sessionStorage.setItem(`waoowaoo-workspace:${userId}`, scope)
  sessionStorage.setItem('waoowaoo-workspace-scope', scope)
}
