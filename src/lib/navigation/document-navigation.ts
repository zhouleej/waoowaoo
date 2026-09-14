export interface DocumentNavigationClick {
  button: number
  defaultPrevented: boolean
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  currentTarget: { href: string }
  preventDefault: () => void
}

export function isPlainPrimaryNavigationClick(event: DocumentNavigationClick): boolean {
  return !event.defaultPrevented
    && event.button === 0
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
}

/**
 * Uses a fresh document for entry points that must not reuse an older App Router
 * runtime after a production deployment. Modifier clicks keep their normal
 * new-tab/new-window behavior.
 */
export function navigateWithDocumentReload(event: DocumentNavigationClick): void {
  if (!isPlainPrimaryNavigationClick(event)) return

  event.preventDefault()
  window.location.assign(event.currentTarget.href)
}
