import type {IWikiPage, WatchlistAction} from '@inpageedit/core'
import type {Session} from './types'

/**
 * Local lifecycle of the browser tab's editing session.
 *
 * The extension owns the durable session (persistence, drafts, temp files);
 * this machine only guards the tab's view of it and makes the legal
 * transitions explicit. `remoteDirty`, `changed` and `conflict` are data of a
 * live session, not phases.
 */
export type SessionPhase =
  | 'idle'
  | 'starting'
  | 'active'
  /** Submitted; waiting for the extension to hand back the document text. */
  | 'requesting'
  | 'saving'
  | 'saved'

export interface SessionMachineState {
  phase: SessionPhase
  session: Session | null
  /** A page-load auto-edit that is waiting for the socket to come up. */
  autoPending: boolean
}

export const initialSessionState: SessionMachineState = {
  phase: 'idle',
  session: null,
  autoPending: false,
}

export type SessionEvent =
  /** A start was requested; only accepted from `idle`. */
  | {type: 'start'}
  /** The extension session was created or adopted. */
  | {type: 'started'; session: Session}
  | {type: 'start-failed'}
  | {type: 'auto-pending'}
  | {type: 'update'; text: string; previewText?: string}
  | {type: 'preview'; previewText?: string}
  | {type: 'remote-dirty'; dirty: boolean}
  | {type: 'request-save'}
  | {type: 'saving'}
  | {type: 'save-failed'}
  | {type: 'saved'; text: string}
  | {type: 'wiki-page'; wikiPage: IWikiPage}
  | {type: 'conflict'; wikiPage: IWikiPage}
  | {type: 'watchlist'; watchlist: WatchlistAction}
  | {type: 'ended'}

/** Phases where a session exists and server-originated data may still arrive. */
const LIVE: Record<SessionPhase, boolean> = {
  idle: false,
  starting: false,
  active: true,
  requesting: true,
  saving: true,
  saved: false,
}

function withSession(
  state: SessionMachineState,
  change: (session: Session) => Session,
): SessionMachineState {
  return state.session ? {...state, session: change(state.session)} : state
}

export function reduceSession(
  state: SessionMachineState,
  event: SessionEvent,
): SessionMachineState {
  switch (event.type) {
    case 'start':
      if (state.phase !== 'idle') return state
      return {phase: 'starting', session: null, autoPending: false}
    case 'started':
      if (state.phase !== 'starting') return state
      return {...state, phase: 'active', session: event.session}
    case 'start-failed':
      if (state.phase !== 'starting') return state
      return {...state, phase: 'idle', session: null}
    case 'auto-pending':
      return state.phase === 'idle' && !state.autoPending
        ? {...state, autoPending: true}
        : state
    case 'update':
      if (!LIVE[state.phase]) return state
      return withSession(state, session => ({
        ...session,
        text: event.text,
        previewText: event.previewText,
        changed: true,
      }))
    case 'preview':
      if (!LIVE[state.phase]) return state
      return withSession(state, session => ({...session, previewText: event.previewText}))
    case 'remote-dirty':
      if (!LIVE[state.phase]) return state
      return withSession(state, session => ({...session, remoteDirty: event.dirty}))
    case 'request-save':
      return state.phase === 'active' ? {...state, phase: 'requesting'} : state
    case 'saving':
      return state.phase === 'active' || state.phase === 'requesting'
        ? {...state, phase: 'saving'}
        : state
    case 'save-failed':
      return state.phase === 'saving' || state.phase === 'requesting'
        ? {...state, phase: 'active'}
        : state
    case 'saved':
      if (state.phase !== 'saving') return state
      return withSession({...state, phase: 'saved'}, session => ({
        ...session,
        text: event.text,
        changed: false,
        conflict: false,
      }))
    case 'wiki-page':
      if (!LIVE[state.phase]) return state
      return withSession(state, session => ({...session, wikiPage: event.wikiPage}))
    case 'conflict':
      if (!LIVE[state.phase]) return state
      return withSession(state, session => ({
        ...session,
        wikiPage: event.wikiPage,
        conflict: true,
      }))
    case 'watchlist':
      if (!LIVE[state.phase]) return state
      return withSession(state, session => ({...session, watchlist: event.watchlist}))
    case 'ended':
      if (state.phase === 'idle') return state
      return {phase: 'idle', session: null, autoPending: false}
  }
}
