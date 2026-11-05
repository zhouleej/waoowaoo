import { getClientWorkspaceScope } from './client-scope'
const scopes = new Map<string, Map<string, number>>()
function current() {
  const scope = getClientWorkspaceScope()
  if (!scopes.has(scope)) scopes.set(scope, new Map())
  return scopes.get(scope)!
}
export function revisionRequestHeaders(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (getClientWorkspaceScope() === 'personal' || !init?.method || ['GET', 'HEAD'].includes(init.method.toUpperCase())) return headers
  const cache = current()
  const candidates = `${String(input)} ${typeof init.body === 'string' ? init.body : init.body instanceof FormData ? Array.from(init.body.values()).filter(value => typeof value === 'string').join(' ') : ''}`
  const prioritized = [...cache].filter(([id]) => candidates.includes(id))
  const others = [...cache].filter(([id]) => !candidates.includes(id)).slice(-140)
  headers.set('X-Resource-Revisions', JSON.stringify(Object.fromEntries([...others, ...prioritized].slice(-220))))
  return headers
}
export function rememberResponseRevisions(response: Response) {
  const value = response.headers?.get('X-Resource-Revisions')
  if (!value) return
  try {
    const cache = current()
    for (const [id, revision] of Object.entries(JSON.parse(value))) {
      if (typeof revision !== 'number') continue
      const newest = Math.max(cache.get(id) ?? 0, revision)
      cache.delete(id); cache.set(id, newest)
    }
    while (cache.size > 3000) cache.delete(cache.keys().next().value!)
  } catch { /* A malformed response must not discard an editor's draft. */ }
}
