/** Namespaces with no editable page: Special: (-1) and Media: (-2). Talk
 * namespaces are positive ids (1, 3, 5, …), so they stay editable. */
const NON_PAGE_NAMESPACES: ReadonlySet<number> = new Set([-2, -1])

/** Query keys that show something other than the page's own reading view. */
const NON_READING_QUERY = ['diff', 'oldid', 'veaction', 'redlink'] as const

export interface ViewInfo {
  href: string
  /** `wgAction`, used when the URL carries no explicit `action`. */
  action?: string
  /** `wgNamespaceNumber`. */
  namespace?: number
}

/**
 * True for a page's normal reading view — main, project, template and talk
 * namespaces alike. Diff/history/permalink/revision-preview views, the visual
 * editor, redlinks and special pages never count.
 */
export function isReadingView({href, action, namespace}: ViewInfo): boolean {
  const query = new URL(href).searchParams
  const pageAction = query.get('action') ?? action
  if (pageAction && pageAction !== 'view') return false
  if (NON_READING_QUERY.some(key => query.has(key))) return false
  return typeof namespace !== 'number' || !NON_PAGE_NAMESPACES.has(namespace)
}

/**
 * True for the source-editor view (`action=edit`) of a real page, including the
 * `redlink=1` create form of a page that does not exist yet. That view has no
 * rendered article, so it is never previewable in place; it is only a valid
 * entry point that gets switched to the reading view before editing starts.
 */
export function isSourceEditView({href, action, namespace}: ViewInfo): boolean {
  if (typeof namespace === 'number' && NON_PAGE_NAMESPACES.has(namespace)) return false
  return (new URL(href).searchParams.get('action') ?? action) === 'edit'
}
