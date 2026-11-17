import type {InPageEdit, IWikiPage, WatchlistAction} from '@inpageedit/core'
import {createApi} from './api'
import {BAR_STYLE_ID, createBarUi} from './bar'
import type {SaveForm} from './bar'
import {messages} from './i18n'
import {
  consumeAutoEdit,
  editUrlFor,
  highlightSection,
  highlightTemplate,
  currentView,
  isArticleLink,
  scrollToOccurrence,
  textAtPoint,
} from './locate'
import {apiUrl, getMwConfig, getMwUtil} from './mw'
import {isReadingView, isSourceEditView} from './page-view'
import {createPendingConfirm} from './pending-confirm'
import type {PendingConfirmStorage} from './pending-confirm'
import {createPreview} from './preview'
import {initialSessionState, reduceSession} from './session-machine'
import type {SessionEvent} from './session-machine'
import type {
  EditResult,
  IncomingMessage,
  NavigateEditMessage,
  OutgoingMessage,
  Session,
  SessionInfo,
  SessionQueryResult,
  SessionResultMessage,
  TemplatesUsedService,
  Waiter,
  WikiRegisteredMessage,
} from './types'

const WS_URL = 'ws://127.0.0.1:8927'
const RECONNECT_MS = 5000
const PENDING_CONFIRM_KEY = 'mwe-ipe-pending-save-confirmation'
const NOTICE_MS = 3000

function parseWatchlist(value: string): WatchlistAction {
  switch (value) {
    case 'preferences':
    case 'watch':
    case 'unwatch':
      // WatchlistAction is a string enum and not a runtime export of the core
      // package, so the narrowed literal still needs the enum cast.
      return value as WatchlistAction
    default:
      return 'nochange' as WatchlistAction
  }
}

/** Build a session; transient flags default to a fresh editing state. */
function createSession(
  init: Pick<Session, 'id' | 'title' | 'text' | 'wikiPage'> & Partial<Session>,
): Session {
  return {
    remoteDirty: false,
    changed: false,
    ...init,
  }
}

function sessionStorageOrNull(): PendingConfirmStorage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export default {
  name: 'vscode-editor',
  inject: ['toolbox', 'i18n', 'quickUpload', 'templatesUsed', 'quickDiff'],
  apply(ctx: InPageEdit) {
    // IPE's i18n manager is shared with the whole app, so register our strings
    // under a namespace: bare keys such as "Submit" would override its own.
    const NAMESPACE = 'vscode-editor'
    const i18n = ctx.i18n.manager
    const translate = (message: string, ...args: string[]): string => {
      const text = i18n.translate(`${NAMESPACE}.${message}`, ...args)
      // Untranslated languages resolve to the namespaced key itself.
      return text.startsWith(`${NAMESPACE}.`) ? text.slice(NAMESPACE.length + 1) : text
    }
    for (const language of ['zh', 'zh-cn', 'zh-hans']) {
      i18n.setLanguageData(language, {[NAMESPACE]: messages})
    }

    const api = createApi({apiUrl: apiUrl(), translate})
    const windowId = (() => {
      try {
        const key = 'mwe-ipe-window-id'
        let value = sessionStorage.getItem(key)
        if (!value) {
          value =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`
          sessionStorage.setItem(key, value)
        }
        return value
      } catch {
        return `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }
    })()
    const templatesUsed = (ctx as InPageEdit & {templatesUsed?: TemplatesUsedService}).templatesUsed

    let state = initialSessionState
    let socket: WebSocket | null = null
    let connected = false
    let reconnectTimer: number | undefined
    let disposed = false

    let registeredWiki: unknown = null
    let registeringWiki: Promise<unknown> | null = null
    let registerSeq = 0
    const registerWaiters: Record<string, Waiter<unknown>> = {}
    let sessionQueryPromise: Promise<SessionQueryResult> | null = null
    let sessionQuerySeq = 0
    const sessionWaiters: Record<string, Waiter<SessionQueryResult>> = {}
    const confirmation = createPendingConfirm(
      sessionStorageOrNull(),
      PENDING_CONFIRM_KEY,
      location.origin,
    )

    const getSession = (): Session | null => state.session
    const isBusy = (): boolean =>
      state.phase === 'requesting' || state.phase === 'saving' || state.phase === 'saved'

    /** Apply a lifecycle event and mirror the phase onto the bar's controls. */
    function dispatch(event: SessionEvent): void {
      const previous = state
      state = reduceSession(state, event)
      if (previous.phase !== state.phase) bar.setBusy(isBusy())
      bar.refreshBar()
    }

    const bar = createBarUi({
      translate,
      getSession,
      getBusy: isBusy,
      actions: {
        submit: form => requestSave(form),
        cancel: () => cancelEdit(),
        upload: () => {
          void ctx.quickUpload?.showModal()
        },
        templates: () => showTemplatesUsed(),
        images: () => showImagesUsed(),
        diff: () => showDiff(),
      },
    })
    const {ensureBar, setStatus, syncBarHeight} = bar
    const preview = createPreview({
      translate,
      request: params => api.request(params),
      getSession,
      setStatus,
    })

    function sendPendingConfirm(): void {
      const pending = confirmation.shouldSend()
      if (!pending) return
      if (
        send({
          type: 'save-confirmed',
          sessionId: pending.sessionId,
          revid: pending.revid,
          origin: location.origin,
        })
      ) {
        confirmation.markSent()
      }
    }

    /**
     * IPE's notify options intersect IPEModalOptions with a different position
     * union, so `position` cannot be typed through; its default is already
     * "top right", which is what the notices below want.
     */
    interface NotifyOptions {
      title?: string
      content?: string | Element
      closeAfter?: {time: number; resetOnHover?: boolean}
    }
    function notifyWarning(options: NotifyOptions): void {
      ctx.modal?.notify('warning', options)
    }

    function notifyOffline(message?: string, title?: string): void {
      const text =
        message ||
        translate(
          'VSCode extension is not connected. Open VSCode and make sure the WikiPreviewer extension is installed and enabled.',
        )
      if (ctx.modal) {
        notifyWarning({
          title: title || translate('VSCode not connected'),
          content: text,
          closeAfter: {time: NOTICE_MS, resetOnHover: true},
        })
        return
      }
      const old = document.getElementById('mwe-offline-notice')
      if (old) old.remove()
      const box = document.createElement('div')
      box.id = 'mwe-offline-notice'
      box.style.cssText =
        'position:fixed;top:20px;right:20px;z-index:901;max-width:360px;background:#fff;color:#202122;border:1px solid #a2a9b1;border-left:4px solid #fc3;padding:12px 14px;border-radius:4px;font-size:13px;line-height:1.5;box-shadow:0 2px 12px rgba(0,0,0,.2);'
      box.textContent = text
      document.body.append(box)
      window.setTimeout(() => box.remove(), NOTICE_MS)
    }

    function showOpenLink(url: string): void {
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener'
      link.textContent = translate('Open target page')
      link.style.cssText = 'color:#36c;text-decoration:underline;cursor:pointer;'
      if (ctx.modal) {
        notifyWarning({
          title: translate('Popup blocked'),
          content: link,
          closeAfter: {time: NOTICE_MS, resetOnHover: true},
        })
      } else {
        notifyOffline(
          translate('The popup was blocked; open the target page manually.'),
          translate('Page needs to be opened'),
        )
      }
    }

    function openNavigate(msg: NavigateEditMessage): void {
      let url: URL
      try {
        const util = getMwUtil()
        if (!util?.getUrl) throw new Error(translate('mw.util.getUrl is unavailable'))
        url = new URL(util.getUrl(msg.title), location.href)
      } catch {
        send({type: 'open-result', requestId: msg.requestId, opened: false})
        return
      }
      url.searchParams.set('external-editor', '1')
      if (msg.fragment) url.hash = msg.fragment
      const name = `mwe-edit:${encodeURIComponent(msg.title)}`
      let win: Window | null = null
      try {
        win = window.open(url.href, name)
      } catch {}
      if (!win) {
        showOpenLink(url.href)
        send({type: 'open-result', requestId: msg.requestId, opened: false})
        return
      }
      send({type: 'open-result', requestId: msg.requestId, opened: true})
    }

    function ensureWikiRegistered(): Promise<unknown> {
      if (registeredWiki) return Promise.resolve(registeredWiki)
      if (registeringWiki) return registeringWiki
      registeringWiki = api.fetchSiteInfo()
        .then(query => {
          const requestId = `reg-${Date.now()}-${++registerSeq}`
          const {promise, resolve, reject} = Promise.withResolvers<unknown>()
          const timer = window.setTimeout(() => {
            delete registerWaiters[requestId]
            reject(new Error(translate('Extension did not respond to site registration')))
          }, 15000)
          registerWaiters[requestId] = {resolve, reject, timer, query}
          send({
            type: 'register-wiki',
            requestId,
            origin: location.origin,
            api: apiUrl(),
            name: getMwConfig<string>('wgSiteName') || location.host,
            siteinfo: query,
          })
          return promise
        })
        .then(query => {
          registeredWiki = query
          registeringWiki = null
          return query
        })
        .catch(error => {
          registeringWiki = null
          throw error
        })
      return registeringWiki
    }

    function onWikiRegistered(msg: WikiRegisteredMessage): void {
      const waiter = registerWaiters[msg.requestId]
      if (!waiter) return
      clearTimeout(waiter.timer)
      delete registerWaiters[msg.requestId]
      if (msg.ok) waiter.resolve(waiter.query)
      else waiter.reject(new Error(msg.error || translate('Site registration failed')))
    }

    function startPendingAutoEdit(queued: boolean): void {
      if (!queued || state.phase !== 'idle') return
      void beginPageEdit()
    }

    /**
     * Resolve whether this tab already has a session on the extension. Runs on
     * every socket open: a reloaded page must re-attach, and a live session
     * must notice when the extension dropped it.
     */
    async function resolveOnConnect(): Promise<void> {
      try {
        await ensureWikiRegistered()
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        setStatus(translate('Site registration failed: {{ $1 }}', detail), 'error')
        return
      }
      if (!isReadingView(currentView())) return
      if (state.phase === 'starting') return
      if (state.phase !== 'idle') {
        try {
          const existing = await queryExistingSession()
          if (!existing.session) {
            leave()
            notifyOffline(
              translate('The extension no longer has this session; editing has been closed.'),
              translate('Session ended'),
            )
          }
        } catch {}
        return
      }
      // `start` clears the queued auto-edit, so keep the flag for this attempt.
      const autoQueued = state.autoPending
      dispatch({type: 'start'})
      try {
        const existing = await queryExistingSession()
        if (existing.session) {
          await adoptSession(existing.session)
          return
        }
        if (existing.busy) {
          // The old socket of a refreshing page may not be closed yet.
          window.setTimeout(() => {
            void retryAdopt(autoQueued)
          }, 500)
          return
        }
      } catch (error) {
        dispatch({type: 'start-failed'})
        const detail = error instanceof Error ? error.message : String(error)
        setStatus(translate('Session query failed: {{ $1 }}', detail), 'error')
        startPendingAutoEdit(autoQueued)
        return
      }
      dispatch({type: 'start-failed'})
      startPendingAutoEdit(autoQueued)
    }

    async function retryAdopt(autoQueued: boolean): Promise<void> {
      if (state.phase !== 'starting') return
      let existing: SessionQueryResult
      try {
        existing = await queryExistingSession(true)
      } catch {
        existing = {session: null, busy: false}
      }
      if (existing.session) {
        await adoptSession(existing.session)
        return
      }
      dispatch({type: 'start-failed'})
      startPendingAutoEdit(autoQueued)
    }

    function connect(): void {
      if (disposed) return
      if (socket && socket.readyState <= WebSocket.OPEN) return
      socket = new WebSocket(WS_URL)
      socket.addEventListener('open', () => {
        connected = true
        document.getElementById('mwe-offline-notice')?.remove()
        sendPendingConfirm()
        void resolveOnConnect()
      })
      socket.addEventListener('close', () => {
        connected = false
        sessionQueryPromise = null
        if (!disposed) reconnectTimer = window.setTimeout(connect, RECONNECT_MS)
      })
      socket.addEventListener('error', () => {
        try {
          socket?.close()
        } catch {}
      })
      socket.addEventListener('message', event => {
        let msg: IncomingMessage
        try {
          msg = JSON.parse(event.data) as IncomingMessage
        } catch {
          return
        }
        if (msg.type === 'wiki-registered') {
          onWikiRegistered(msg)
          return
        }
        if (msg.type === 'session-result') {
          onSessionResult(msg)
          return
        }
        if (msg.type === 'navigate-edit') {
          openNavigate(msg)
          return
        }
        if (msg.type === 'save-confirmed-result') {
          if (confirmation.current?.sessionId === msg.sessionId && msg.ok) confirmation.clear()
          return
        }
        if (!state.session || msg.sessionId !== state.session.id) return
        if (msg.type === 'refresh-preview') {
          dispatch({type: 'preview', previewText: msg.previewText})
          preview.schedulePreview()
        } else if (msg.type === 'update') {
          dispatch({type: 'update', text: msg.text, previewText: msg.previewText})
          preview.schedulePreview()
        } else if (msg.type === 'state') {
          dispatch({type: 'remote-dirty', dirty: !!msg.dirty})
        } else if (msg.type === 'scroll') {
          if (msg.kind === 'section') {
            highlightSection(msg.section)
          } else if (msg.kind === 'template') {
            highlightTemplate(msg.template)
          } else {
            const moved = scrollToOccurrence(
              msg.text,
              msg.occurrence,
              msg.section,
              msg.scope,
              msg.label,
              msg.prev,
              msg.next,
              msg.labelOccurrence,
            )
            if (!moved && msg.template) highlightTemplate(msg.template)
          }
        } else if (msg.type === 'save') {
          // Either this tab submitted and now receives the document text
          // (`requesting`), or the extension saved from its side (`active`).
          if (state.phase !== 'active' && state.phase !== 'requesting') return
          setStatus(translate('Submitting…'))
          dispatch({type: 'saving'})
          void saveEdit(msg.text, msg.summary, msg.minor, msg.requestId)
        } else if (msg.type === 'finish') {
          leave(msg.result !== 'saved')
          if (msg.result !== 'closed') closeIfOpenedHere()
        } else if (msg.type === 'editor-closed') {
          leave()
          closeIfOpenedHere()
          notifyOffline(translate('Exited editing mode.'), translate('Editor closed'))
        } else if (msg.type === 'preempted') {
          leave()
          notifyOffline(
            translate('Editing continued in another tab.'),
            translate('Session transferred'),
          )
        }
      })
    }

    function send(msg: OutgoingMessage): boolean {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg))
        return true
      }
      return false
    }

    /**
     * Single teardown path: machine state first, then preview, bar and cache.
     * `restorePreview` stays false when the page is about to reload, so the
     * saved content does not flash back to the pre-edit revision.
     */
    function leave(restorePreview = true): void {
      if (state.phase === 'idle') return
      state = reduceSession(state, {type: 'ended'})
      sessionQueryPromise = null
      preview.cancel()
      if (restorePreview) preview.restorePage()
      else preview.discardOriginal()
      bar.setBusy(false)
      bar.remove()
    }

    /** Only tabs opened by the extension for editing can be closed by script. */
    function closeIfOpenedHere(): void {
      if (window.name.indexOf('mwe-edit:') === 0) {
        window.setTimeout(() => window.close(), 50)
      }
    }

    function queryExistingSession(force = false): Promise<SessionQueryResult> {
      if (!force && sessionQueryPromise) return sessionQueryPromise
      if (!connected) return Promise.resolve({session: null, busy: false})
      const requestId = `session-${Date.now()}-${++sessionQuerySeq}`
      const {promise, resolve, reject} = Promise.withResolvers<SessionQueryResult>()
      const timer = window.setTimeout(() => {
        delete sessionWaiters[requestId]
        reject(new Error(translate('Extension did not respond to the session query')))
      }, 8000)
      sessionWaiters[requestId] = {resolve, reject, timer}
      if (
        !send({
          type: 'session-query',
          requestId,
          origin: location.origin,
          title: getMwConfig<string>('wgPageName'),
          windowId,
        })
      ) {
        clearTimeout(timer)
        delete sessionWaiters[requestId]
        reject(new Error(translate('Extension not connected')))
      }
      const query = promise.catch((error: unknown) => {
        sessionQueryPromise = null
        throw error
      })
      sessionQueryPromise = query
      return query
    }

    function onSessionResult(msg: SessionResultMessage): void {
      const waiter = sessionWaiters[msg.requestId]
      if (!waiter) return
      clearTimeout(waiter.timer)
      delete sessionWaiters[msg.requestId]
      if (!msg.ok) waiter.reject(new Error(msg.error || translate('Session query failed')))
      else waiter.resolve({session: msg.session || null, busy: !!msg.busy})
    }

    async function adoptSession(info: SessionInfo): Promise<void> {
      if (state.phase !== 'starting' || state.session) return
      let wikiPage: IWikiPage
      try {
        wikiPage = info.revid
          ? await ctx.wikiPage.newFromRevision(info.revid)
          : await ctx.wikiPage.newFromTitle(info.title, false)
      } catch (error) {
        dispatch({type: 'start-failed'})
        const detail = error instanceof Error ? error.message : String(error)
        setStatus(translate('Failed to resume the session: {{ $1 }}', detail), 'error')
        return
      }
      dispatch({
        type: 'started',
        session: createSession({
          id: info.sessionId,
          title: info.title,
          text: info.text,
          wikiPage,
          remoteDirty: !!info.dirty,
          previewText: info.previewText,
        }),
      })
      ensureBar()
      document.body.classList.remove('ipe-modal-no-scroll')
      setStatus(translate('Resumed the VSCode editing session'))
      preview.schedulePreview()
    }

    /** Leave the source-editor view for the reading view; `external-editor`
     * makes the reloaded page start editing immediately. */
    function startFromSourceEdit(): void {
      let href = location.href
      try {
        const util = getMwUtil()
        const title = getMwConfig<string>('wgPageName')
        if (!util?.getUrl || !title) throw new Error(translate('mw.util.getUrl is unavailable'))
        href = util.getUrl(title)
      } catch {}
      const url = new URL(href, location.href)
      for (const key of ['action', 'redlink', 'section', 'veaction']) url.searchParams.delete(key)
      url.searchParams.set('external-editor', '1')
      location.assign(url.href)
    }

    async function beginPageEdit(auto = false): Promise<void> {
      if (state.phase !== 'idle') return
      if (isSourceEditView(currentView())) {
        // The source editor has no rendered article to preview into: switch to
        // the reading view and let `external-editor=1` start the session there.
        startFromSourceEdit()
        return
      }
      if (!isReadingView(currentView())) return
      if (!connected) {
        if (auto) dispatch({type: 'auto-pending'})
        else notifyOffline()
        return
      }
      dispatch({type: 'start'})
      try {
        await ensureWikiRegistered()
        const existing = await queryExistingSession(true)
        if (existing.busy) {
          dispatch({type: 'start-failed'})
          notifyOffline(
            translate(
              'This page is already being edited in another browser window or VSCode session. Close that session first.',
            ),
            translate('Page already being edited'),
          )
          return
        }
        if (existing.session) {
          await adoptSession(existing.session)
          return
        }
        const title = getMwConfig<string>('wgPageName')
        if (!title) throw new Error(translate('Unable to read the current page title'))
        const wikiPage = await ctx.wikiPage.newFromTitle(title, false)
        const revision = wikiPage.revisions[0]
        const session = createSession({
          id: `s${Date.now()}`,
          title,
          text: revision?.content || '',
          wikiPage,
        })
        dispatch({type: 'started', session})
        ensureBar()
        document.body.classList.remove('ipe-modal-no-scroll')
        setStatus(translate('Editing in VSCode; save the file to refresh the preview'))
        send({
          type: 'open',
          sessionId: session.id,
          title: session.title,
          text: session.text,
          revid: revision?.revid,
          basetimestamp: revision?.timestamp,
          starttimestamp: new Date().toISOString(),
          windowId,
          wiki: location.origin,
        })
      } catch (error) {
        dispatch({type: 'start-failed'})
        const detail = error instanceof Error ? error.message : String(error)
        const message = translate(
          'Failed to start editing: {{ $1 }}. Make sure the VSCode extension is running and the web plugin is up to date.',
          detail,
        )
        setStatus(message, 'error')
        notifyOffline(message, translate('Failed to start editing'))
      }
    }

    function showTemplatesUsed(): void {
      const session = state.session
      if (!session) return
      void templatesUsed?.showModal({title: session.title})
    }

    function showDiff(): void {
      const session = state.session
      if (!session) return
      const from = session.wikiPage.revisions[0]?.content || ''
      if (from === session.text) return
      ctx.quickDiff?.comparePages({
        fromtitle: session.title,
        fromtext: from,
        totitle: session.title,
        totext: session.text,
        topst: true,
      })
    }

    function showImagesUsed(): void {
      const session = state.session
      if (!session || !ctx.modal) return
      fetch(
        `${apiUrl()}?action=parse&format=json&formatversion=2&prop=images&page=${encodeURIComponent(session.title)}`,
      )
        .then(response => response.json() as Promise<{parse?: {images?: string[]}}>)
        .then(data => {
          const images = data.parse?.images || []
          const box = document.createElement('div')
          if (!images.length) {
            box.textContent = translate('No images are used.')
          } else {
            const list = document.createElement('ol')
            for (const title of images) {
              const name = /^File:/i.test(title) ? title : `File:${title}`
              const item = document.createElement('li')
              const link = document.createElement('a')
              link.href = `/wiki/${encodeURIComponent(name)}`
              link.target = '_blank'
              link.rel = 'noopener'
              link.textContent = name
              item.append(link)
              list.append(item)
            }
            box.append(list)
          }
          ctx.modal?.show({
            title: translate('Images used'),
            content: box,
            sizeClass: 'dialog',
            draggable: true,
            backdrop: false,
          })
        })
    }

    function cancelEdit(): void {
      const session = state.session
      if (state.phase !== 'active' || !session) return
      const pending = session.remoteDirty || session.changed
      if (
        pending &&
        !confirm(
          session.remoteDirty
            ? translate('VSCode still has unsaved changes. Discard them and close the editor?')
            : translate('There are changes not yet saved to the site. Discard them?'),
        )
      ) {
        return
      }
      send({
        type: 'finish',
        sessionId: session.id,
        result: pending ? 'discarded' : 'unchanged',
      })
      leave()
      closeIfOpenedHere()
    }

    function requestSave(form: SaveForm): void {
      const session = state.session
      if (state.phase !== 'active' || !session) return
      if (session.remoteDirty) {
        setStatus(translate('VSCode has unsaved changes; save the file first (Ctrl+S)'), 'error')
        return
      }
      dispatch({type: 'watchlist', watchlist: parseWatchlist(form.watchlist)})
      dispatch({type: 'request-save'})
      setStatus(translate('Saving the file…'))
      send({
        type: 'request-save',
        sessionId: session.id,
        summary: form.summary,
        minor: form.minor,
      })
    }

    function isEditConflict(error: unknown): boolean {
      const value = error as {
        code?: unknown
        message?: unknown
        data?: {error?: {code?: unknown}}
      }
      return (
        value?.code === 'editconflict' ||
        value?.data?.error?.code === 'editconflict' ||
        /editconflict|编辑冲突/i.test(String(value?.message || ''))
      )
    }

    async function latestPageForSession(): Promise<IWikiPage | null> {
      const session = state.session
      if (!session) return null
      return ctx.wikiPage.newFromTitle(session.title, false, undefined, true)
    }

    function reportConflict(latest: IWikiPage, message: string): boolean {
      const session = state.session
      if (!session) return false
      const revision = latest.revisions[0]
      if (!revision) return false
      dispatch({type: 'conflict', wikiPage: latest})
      send({
        type: 'conflict',
        sessionId: session.id,
        remoteText: revision.content || '',
        remoteRevid: revision.revid,
        remoteTimestamp: revision.timestamp,
        message,
      })
      setStatus(
        translate(
          'Edit conflict detected; conflict markers are loaded. Resolve them before submitting.',
        ),
        'error',
      )
      return true
    }

    /** Latest revision check that must pass before editing. */
    async function latestForSave(): Promise<{
      baseRevid: number | undefined
      latest: IWikiPage | null
      changedRemotely: boolean
    }> {
      const baseRevid = state.session?.wikiPage.revisions[0]?.revid
      let latest: IWikiPage | null = null
      try {
        latest = await latestPageForSession()
      } catch {}
      const latestRevid = latest?.revisions[0]?.revid
      return {
        baseRevid,
        latest,
        changedRemotely:
          baseRevid !== undefined &&
          latestRevid !== undefined &&
          latestRevid !== baseRevid &&
          !!latest,
      }
    }

    async function applyEdit(
      text: string,
      summary: string | undefined,
      minor: boolean | undefined,
    ): Promise<EditResult> {
      const session = state.session
      if (!session) return {}
      const result = await session.wikiPage.edit({
        text,
        summary: summary || '',
        minor: !!minor,
        watchlist: session.watchlist || parseWatchlist('nochange'),
      })
      return api.readEditResult(result.data?.edit)
    }

    function completeSave(
      sessionId: string,
      requestId: string | undefined,
      revid: number,
      summary: string | undefined,
      minor: boolean | undefined,
      text: string,
    ): void {
      confirmation.set(sessionId, revid)
      send({type: 'save-result', sessionId, requestId, ok: true})
      send({
        type: 'finish',
        sessionId,
        result: 'saved',
        summary: summary || '',
        minor: !!minor,
      })
      dispatch({type: 'saved', text})
      setStatus(translate('Saved; reloading and waiting for confirmation…'), 'ok')
      window.setTimeout(() => location.reload(), 800)
    }

    function failSave(
      sessionId: string,
      requestId: string | undefined,
      message: string,
    ): void {
      dispatch({type: 'save-failed'})
      send({type: 'save-result', sessionId, requestId, ok: false, error: message})
    }

    async function handleSaveError(
      sessionId: string,
      requestId: string | undefined,
      error: unknown,
    ): Promise<void> {
      const message = error instanceof Error ? error.message : String(error)
      send({type: 'save-result', sessionId, requestId, ok: false, error: message})
      let conflictSent = false
      if (isEditConflict(error)) {
        try {
          const latest = await latestPageForSession()
          if (latest) conflictSent = reportConflict(latest, message)
        } catch {}
      }
      dispatch({type: 'save-failed'})
      if (!conflictSent) {
        setStatus(translate('Save failed: {{ $1 }}', message), 'error')
      }
    }

    async function saveEdit(
      text: string,
      summary: string | undefined,
      minor: boolean | undefined,
      requestId?: string,
    ): Promise<void> {
      const session = state.session
      if (state.phase !== 'saving' || !session) return
      const sessionId = session.id
      const title = session.title
      try {
        const {baseRevid, latest, changedRemotely} = await latestForSave()
        if (changedRemotely) {
          reportConflict(latest!, translate('The page was changed by someone else.'))
          failSave(sessionId, requestId, '编辑冲突')
          return
        }
        if (latest) dispatch({type: 'wiki-page', wikiPage: latest})
        const edit = await applyEdit(text, summary, minor)
        // The temp file may only be cleaned up once a revision id proves the
        // save landed; anything else keeps it for a retry.
        const revid = await api.savedRevid(title, text, edit, baseRevid)
        if (revid === undefined) {
          const message = translate(
            'The save was submitted but no revision id could be confirmed; the temp file was kept',
          )
          failSave(sessionId, requestId, message)
          setStatus(translate('Save unconfirmed: {{ $1 }}', message), 'error')
          return
        }
        completeSave(sessionId, requestId, revid, summary, minor, text)
      } catch (error) {
        await handleSaveError(sessionId, requestId, error)
      }
    }

    function onClick(event: MouseEvent): void {
      const session = state.session
      if (!session) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('#mw-content-text') == null) return
      const anchor = target.closest('a')
      if (anchor instanceof HTMLAnchorElement) {
        if (!isArticleLink(anchor)) return
        event.preventDefault()
        window.open(editUrlFor(anchor.href), '_blank', 'noopener')
        return
      }
      const point = textAtPoint(event.clientX, event.clientY)
      if (point) {
        send({
          type: 'locate',
          sessionId: session.id,
          text: point.text,
          section: point.section,
          occurrence: point.occurrence,
        })
      }
    }

    function createEditIcon(): SVGElement {
      const ns = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(ns, 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('width', '24')
      svg.setAttribute('height', '24')
      svg.setAttribute('fill', 'none')
      svg.setAttribute('stroke', 'currentColor')
      svg.setAttribute('stroke-width', '2')
      svg.setAttribute('stroke-linecap', 'round')
      svg.setAttribute('stroke-linejoin', 'round')
      const path = document.createElementNS(ns, 'path')
      path.setAttribute('d', 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z')
      svg.append(path)
      return svg
    }

    const editButtonId = 'vscode-editor-page'
    connect()

    if (isReadingView(currentView()) || isSourceEditView(currentView())) {
      ctx.toolbox?.addButton({
        id: editButtonId,
        group: 'group1',
        icon: createEditIcon(),
        tooltip: translate('Edit the whole page in VSCode'),
        onClick: () => {
          void beginPageEdit()
        },
      })
    }

    document.addEventListener('click', onClick, true)
    window.addEventListener('resize', syncBarHeight)

    ctx.on('dispose', () => {
      disposed = true
      connected = false
      clearTimeout(reconnectTimer)
      for (const requestId of Object.keys(registerWaiters)) {
        clearTimeout(registerWaiters[requestId].timer)
        delete registerWaiters[requestId]
      }
      for (const requestId of Object.keys(sessionWaiters)) {
        clearTimeout(sessionWaiters[requestId].timer)
        delete sessionWaiters[requestId]
      }
      try {
        socket?.close()
      } catch {}
      socket = null
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('resize', syncBarHeight)
      ctx.toolbox?.removeButton(editButtonId)
      leave()
      document.getElementById(BAR_STYLE_ID)?.remove()
      document.getElementById('mwe-offline-notice')?.remove()
    })

    const autoEdit = consumeAutoEdit()
    if (autoEdit) {
      window.setTimeout(() => {
        if (disposed) return
        void beginPageEdit(true)
      }, 0)
    }
  },
}
