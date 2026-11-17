import type {PendingConfirm} from './types'

/** The subset of `sessionStorage` the tracker needs; injectable for tests. */
export interface PendingConfirmStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface PendingConfirmTracker {
  readonly current: PendingConfirm | null
  set(sessionId: string, revid: number): void
  clear(): void
  /** The confirmation to send now, or null when absent/already sent/foreign origin. */
  shouldSend(): PendingConfirm | null
  markSent(): void
}

/**
 * A save can only be confirmed after the page reloads, so the proof of the
 * new revision outlives the session in sessionStorage. The extension removes
 * the temp file only for a confirmation carrying that revision id.
 */
export function createPendingConfirm(
  storage: PendingConfirmStorage | null,
  key: string,
  origin: string,
): PendingConfirmTracker {
  let pending = read()
  let sent = false

  function read(): PendingConfirm | null {
    if (!storage) return null
    try {
      const raw = storage.getItem(key)
      if (!raw) return null
      const value: unknown = JSON.parse(raw)
      if (!value || typeof value !== 'object') return null
      const record = value as {sessionId?: unknown; origin?: unknown; revid?: unknown}
      if (typeof record.sessionId !== 'string') return null
      if (
        typeof record.revid !== 'number' ||
        !Number.isInteger(record.revid) ||
        record.revid <= 0
      ) {
        return null
      }
      return {
        sessionId: record.sessionId,
        origin: typeof record.origin === 'string' ? record.origin : origin,
        revid: record.revid,
      }
    } catch {
      return null
    }
  }

  function remove(): void {
    if (!storage) return
    try {
      storage.removeItem(key)
    } catch {}
  }

  return {
    get current() {
      return pending
    },
    set(sessionId: string, revid: number): void {
      pending = {sessionId, origin, revid}
      sent = false
      if (!storage) return
      try {
        storage.setItem(key, JSON.stringify(pending))
      } catch {}
    },
    clear(): void {
      pending = null
      sent = false
      remove()
    },
    shouldSend(): PendingConfirm | null {
      if (!pending || sent || pending.origin !== origin) return null
      return pending
    },
    markSent(): void {
      sent = true
    },
  }
}
