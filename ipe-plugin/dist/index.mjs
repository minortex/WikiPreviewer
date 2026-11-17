// ipe-plugin/src/api.ts
function e({ apiUrl: e, translate: t }) {
	function n(t) {
		return fetch(e, {
			method: "POST",
			credentials: "include",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams(Object.assign({
				format: "json",
				formatversion: "2"
			}, t))
		}).then((e) => e.json());
	}
	async function r(e) {
		let t = {
			action: "query",
			prop: "revisions",
			rvprop: "ids|content",
			rvslots: "main"
		};
		if (e.revid !== void 0) t.revids = String(e.revid);
		else if (e.title !== void 0) t.titles = e.title, t.rvlimit = "1";
		else return;
		let r = await n(t);
		if (r.error) throw Error(`${r.error.code || "error"}: ${r.error.info || ""}`);
		let i = r.query?.pages?.[0]?.revisions?.[0];
		if (i && typeof i.revid == "number") return {
			revid: i.revid,
			parentid: i.parentid,
			content: i.content ?? i.slots?.main?.content
		};
	}
	function i(e) {
		let t = {};
		if (!e || typeof e != "object") return t;
		if ("newrevid" in e) {
			let n = e.newrevid;
			typeof n == "number" && Number.isInteger(n) && n > 0 && (t.newrevid = n);
		}
		return "nochange" in e && (t.nochange = e.nochange === !0), t;
	}
	async function a(e, t, n, i) {
		let a = n.newrevid;
		if (a !== void 0 && a !== i) try {
			if ((await r({ revid: a }))?.revid === a) return a;
		} catch {}
		if (n.nochange) try {
			let n = await r({ title: e });
			if (n && n.content === t) return n.revid;
		} catch {}
	}
	function o() {
		let n = new URLSearchParams({
			action: "query",
			meta: "siteinfo",
			siprop: "general|namespaces|namespacealiases|magicwords|functionhooks|extensiontags|variables|interwikimap",
			format: "json",
			formatversion: "2"
		}), r = typeof AbortController == "function" ? new AbortController() : null, i = r ? window.setTimeout(() => r.abort(), 2e4) : void 0;
		return fetch(`${e}?${n}`, {
			credentials: "include",
			signal: r?.signal
		}).then((e) => {
			if (!e.ok) throw Error(`HTTP ${e.status}`);
			return e.json();
		}).then((e) => {
			if (e.error) throw Error(`${e.error.code}: ${e.error.info}`);
			if (!e.query) throw Error(t("The site did not return siteinfo"));
			return e.query;
		}).finally(() => {
			clearTimeout(i);
		});
	}
	return {
		request: n,
		queryRevision: r,
		readEditResult: i,
		savedRevid: a,
		fetchSiteInfo: o
	};
}
// ipe-plugin/src/bar.ts
var t = "mwe-ipe-bar-style";
function n(e) {
	return {
		summary: e.querySelector(".mwe-ipe-summary-input")?.value || "",
		minor: !!e.querySelector(".mwe-ipe-minor-box")?.checked,
		watchlist: e.querySelector(".mwe-ipe-watchlist")?.value || "nochange"
	};
}
function r({ translate: e, getSession: r, actions: i }) {
	let a = null;
	function o() {
		let e = document.getElementById(t);
		e || (e = document.createElement("style"), e.id = t, document.head.append(e)), e.textContent = ".mwe-ipe-bar{position:fixed;left:0;right:0;bottom:0;z-index:900;display:flex;gap:4px 8px;align-items:center;flex-wrap:wrap;background:#fff;border-top:2px solid #3366cc;padding:6px 12px;box-shadow:0 -2px 12px rgba(0,0,0,.15);font-size:13px;color:#202122;box-sizing:border-box;}\n.mwe-ipe-bar .mwe-ipe-status{flex:1 1 200px;min-width:0;color:#72777d;line-height:1.35;white-space:normal;overflow-wrap:anywhere;}\n.mwe-ipe-bar .mwe-ipe-status.error{color:#d33;}\n.mwe-ipe-bar .mwe-ipe-status.ok{color:#14866d;}\n.mwe-ipe-bar .mwe-ipe-controls{display:flex;flex:2 1 340px;flex-wrap:wrap;align-items:center;gap:6px;min-width:0;}\n.mwe-ipe-bar .mwe-ipe-summary{display:flex;flex:1 1 200px;align-items:center;gap:6px;min-width:0;}\n.mwe-ipe-bar .mwe-ipe-summary input[type=text]{flex:1 1 auto;min-width:0;height:32px;box-sizing:border-box;padding:0 10px;border:1px solid #a2a9b1;border-radius:4px;font-size:14px;}\n.mwe-ipe-bar select{flex:0 0 auto;padding:4px 8px;border:1px solid #a2a9b1;border-radius:4px;background:#fff;font-size:13px;color:#202122;}\n.mwe-ipe-bar button{flex:0 0 auto;height:32px;box-sizing:border-box;padding:0 14px;border-radius:4px;border:1px solid #a2a9b1;background:#f8f9fa;cursor:pointer;font-size:14px;color:#202122;}\n.mwe-ipe-bar button:hover{background:#eaecf0;}\n.mwe-ipe-bar button.is-primary{background:#3366cc;border-color:#3366cc;color:#fff;font-weight:600;}\n.mwe-ipe-bar button.is-primary:hover{background:#2a56a8;}\n.mwe-ipe-bar .mwe-ipe-cancel{margin-left:auto;}\n.mwe-ipe-bar label{display:flex;align-items:center;gap:4px;white-space:nowrap;}\n.mwe-ipe-bar .mwe-ipe-minor{gap:3px;font-size:11px;color:#54595d;}\n.mwe-ipe-bar .mwe-ipe-more-wrap{position:relative;flex:0 0 auto;}\n.mwe-ipe-bar .mwe-ipe-more{padding:0 10px;font-size:16px;line-height:1;letter-spacing:1px;}\n.mwe-ipe-bar .mwe-ipe-menu{position:absolute;bottom:100%;right:0;display:flex;flex-direction:column;gap:2px;min-width:150px;padding:4px;background:#fff;border:1px solid #a2a9b1;border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,.18);}\n.mwe-ipe-bar .mwe-ipe-menu[hidden]{display:none;}\n.mwe-ipe-bar .mwe-ipe-menu select{width:100%;}\n.mwe-ipe-bar .mwe-ipe-menu-item{border:0;background:transparent;text-align:left;padding:6px 8px;border-radius:3px;font-size:13px;}\n.mwe-ipe-bar .mwe-ipe-menu-item:hover{background:#eaecf0;}\n@media (max-width:760px){.mwe-ipe-bar{padding:6px 10px;}.mwe-ipe-bar .mwe-ipe-status,.mwe-ipe-bar .mwe-ipe-controls,.mwe-ipe-bar .mwe-ipe-summary{flex-basis:100%;}}\nbody.mwe-ipe-editing{padding-bottom:calc(var(--mwe-ipe-bar-height, 96px) + 16px);}\nbody.mwe-ipe-editing #ipe-edit-toolbox{bottom:var(--mwe-ipe-bar-height, 96px);transform:none;}";
	}
	function s() {
		let e = document.querySelector(".mwe-ipe-bar");
		document.documentElement.style.setProperty("--mwe-ipe-bar-height", `${e?.offsetHeight ?? 0}px`);
	}
	function c(e, t) {
		let n = document.querySelector(".mwe-ipe-status");
		n && (n.textContent = e || "", n.className = "mwe-ipe-status" + (t ? " " + t : ""), s());
	}
	function l() {
		let t = document.querySelector(".mwe-ipe-bar"), n = r();
		if (!t || !n) return;
		let i = t.querySelector(".mwe-ipe-submit");
		i && (i.disabled = !!n.remoteDirty || !!n.busy), n.remoteDirty && c(e("VSCode has unsaved changes; save the file first (Ctrl+S)"));
	}
	function u(t) {
		let n = r();
		n && (n.busy = !!t);
		let i = document.querySelector(".mwe-ipe-bar");
		i && (i.querySelectorAll("button").forEach((e) => {
			e.disabled = !!t;
		}), t && c(e("Submitting…")));
	}
	function d(e) {
		document.body.classList.add("mwe-ipe-editing"), a?.disconnect(), a = new ResizeObserver(s), a.observe(e), s();
	}
	function f() {
		o();
		let t = document.querySelector(".mwe-ipe-bar");
		if (t) return d(t), t;
		t = document.createElement("div"), t.className = "mwe-ipe-bar", t.innerHTML = `<span class="mwe-ipe-status">${e("Editing in VSCode")}</span><div class="mwe-ipe-controls"><div class="mwe-ipe-summary"><input type="text" class="mwe-ipe-summary-input" placeholder="${e("Edit summary")}"><label class="mwe-ipe-minor"><input type="checkbox" class="mwe-ipe-minor-box"> ${e("Minor edit")}</label></div><button class="mwe-ipe-diff">${e("Diff")}</button><div class="mwe-ipe-more-wrap"><button class="mwe-ipe-more" aria-haspopup="true" aria-expanded="false" aria-label="${e("More")}" title="${e("More")}">⋯</button><div class="mwe-ipe-menu" hidden><select class="mwe-ipe-watchlist" aria-label="${e("Watchlist")}"><option value="preferences">${e("Follow MediaWiki preference")}</option><option value="nochange">${e("Keep current status")}</option><option value="watch">${e("Add to watchlist")}</option><option value="unwatch">${e("Remove from watchlist")}</option></select><button class="mwe-ipe-menu-item mwe-ipe-upload">${e("Quick upload")}</button><button class="mwe-ipe-menu-item mwe-ipe-templates">${e("Templates used")}</button><button class="mwe-ipe-menu-item mwe-ipe-images">${e("Images used")}</button></div></div><button class="mwe-ipe-cancel">${e("Cancel")}</button><button class="mwe-ipe-submit is-primary">${e("Submit")}</button></div>`, document.body.append(t), d(t), t.querySelector(".mwe-ipe-submit")?.addEventListener("click", () => {
			i.submit(n(t));
		}), t.querySelector(".mwe-ipe-cancel")?.addEventListener("click", () => {
			i.cancel();
		}), t.querySelector(".mwe-ipe-upload")?.addEventListener("click", () => {
			i.upload();
		}), t.querySelector(".mwe-ipe-templates")?.addEventListener("click", () => {
			i.templates();
		}), t.querySelector(".mwe-ipe-images")?.addEventListener("click", () => {
			i.images();
		}), t.querySelector(".mwe-ipe-diff")?.addEventListener("click", () => {
			i.diff();
		});
		let r = t.querySelector(".mwe-ipe-more-wrap"), a = t.querySelector(".mwe-ipe-more"), s = t.querySelector(".mwe-ipe-menu"), c, l = (e) => {
			s && (s.hidden = !e, a?.setAttribute("aria-expanded", String(e)));
		};
		return r?.addEventListener("mouseenter", () => {
			window.clearTimeout(c), l(!0);
		}), r?.addEventListener("mouseleave", () => {
			window.clearTimeout(c), c = window.setTimeout(() => l(!1), 120);
		}), a?.addEventListener("click", (e) => {
			e.stopPropagation(), window.clearTimeout(c), l(!!s?.hidden);
		}), s?.addEventListener("click", (e) => {
			e.target instanceof Element && e.target.closest("select") || (window.clearTimeout(c), l(!1));
		}), s?.addEventListener("change", () => {
			window.clearTimeout(c), l(!1);
		}), t.addEventListener("click", (e) => {
			e.target instanceof Element && e.target.closest(".mwe-ipe-more-wrap") || (window.clearTimeout(c), l(!1));
		}), t;
	}
	function p() {
		a?.disconnect(), a = null, document.documentElement.style.removeProperty("--mwe-ipe-bar-height");
	}
	return {
		ensureBar: f,
		refreshBar: l,
		setBusy: u,
		setStatus: c,
		syncBarHeight: s,
		detach: p
	};
}
// ipe-plugin/src/i18n.ts
var i = {
	"VSCode has unsaved changes; save the file first (Ctrl+S)": "VSCode 里有未保存修改，先保存文件（Ctrl+S）",
	"Submitting…": "正在提交…",
	"Editing in VSCode": "VSCode 编辑中",
	"Edit summary": "编辑摘要",
	"Follow MediaWiki preference": "遵循 MW 首选",
	"Keep current status": "保持当前状态",
	"Add to watchlist": "添加到监视列表",
	"Remove from watchlist": "从监视列表移除",
	"Minor edit": "小编辑",
	More: "更多功能",
	Watchlist: "关注状态",
	Submit: "提交",
	Diff: "差异",
	"Quick upload": "快速上传",
	"Templates used": "使用的模板",
	"Images used": "使用的图片",
	Cancel: "取消",
	"The site did not return siteinfo": "站点没有返回 siteinfo",
	"VSCode extension is not connected. Open VSCode and make sure the WikiPreviewer extension is installed and enabled.": "VSCode 扩展未连接。请手动打开 VSCode，并确认已安装并启用 WikiPreviewer 扩展。",
	"VSCode not connected": "VSCode 未连接",
	"Open target page": "打开目标页面",
	"Popup blocked": "弹窗被拦截",
	"The popup was blocked; open the target page manually.": "弹窗被拦截，请手动打开目标页面。",
	"Page needs to be opened": "需要打开页面",
	"mw.util.getUrl is unavailable": "mw.util.getUrl 不可用",
	"Extension did not respond to site registration": "扩展未响应站点注册",
	"Site registration failed": "站点注册失败",
	"Site registration failed: {{ $1 }}": "站点注册失败：{{ $1 }}",
	"The extension no longer has this session; editing has been closed.": "扩展没有该会话，已退出编辑态。",
	"Session ended": "会话已结束",
	"Editing in VSCode; save the file to refresh the preview": "VSCode 编辑中，保存文件即刷新预览",
	"Exited editing mode.": "已退出编辑状态。",
	"Editor closed": "编辑器已关闭",
	"Editing continued in another tab.": "已在另一个标签继续编辑。",
	"Session transferred": "会话已转移",
	"Preview failed: {{ $1 }}": "预览失败：{{ $1 }}",
	"Edit conflict detected; conflict markers are loaded. Resolve them before submitting.": "检测到编辑冲突，已载入冲突标记；处理后再提交",
	"Preview updated at {{ $1 }}": "预览已更新 {{ $1 }}",
	"Extension did not respond to the session query": "扩展未响应会话查询",
	"Extension not connected": "扩展未连接",
	"Session query failed": "会话查询失败",
	"Failed to resume the session: {{ $1 }}": "恢复会话失败：{{ $1 }}",
	"Resumed the VSCode editing session": "已恢复 VSCode 编辑会话",
	"This page is already being edited in another browser window or VSCode session. Close that session first.": "该页面已经在另一个浏览器窗口或 VSCode 编辑会话中。请先关闭那边的编辑会话后再试。",
	"Page already being edited": "页面已在编辑中",
	"Unable to read the current page title": "无法读取当前页面标题",
	"Failed to start editing: {{ $1 }}. Make sure the VSCode extension is running and the web plugin is up to date.": "启动编辑失败：{{ $1 }}。请确认 VSCode 扩展已启动并已更新网页端脚本。",
	"Failed to start editing": "启动编辑失败",
	"No images are used.": "没有使用的图片。",
	"VSCode still has unsaved changes. Discard them and close the editor?": "VSCode 里还有未保存的修改，放弃并关闭编辑器？",
	"There are changes not yet saved to the site. Discard them?": "还有未提交到站点的修改，确定放弃？",
	"Saving the file…": "正在保存文件…",
	"The page was changed by someone else.": "页面已被其他人修改。",
	"Saved; reloading and waiting for confirmation…": "已保存，正在刷新并等待确认…",
	"The save was submitted but no revision id could be confirmed; the temp file was kept": "提交已完成，但未能确认修订版本号；临时文件已保留",
	"Save unconfirmed: {{ $1 }}": "保存未确认：{{ $1 }}",
	"Save failed: {{ $1 }}": "保存失败：{{ $1 }}",
	"Edit the whole page in VSCode": "在 VSCode 中编辑整页"
}, a = () => window.mw, o = (e) => a()?.config?.get(e), s = () => a()?.util, c = () => window.jQuery;
function l() {
	let e = s();
	return e?.wikiScript ? e.wikiScript("api") : new URL("/api.php", location.origin).href;
}
// ipe-plugin/src/locate.ts
function u(e) {
	if (!e || !e.width && !e.height) return !1;
	let t = e.top + window.scrollY, n = e.left + window.scrollX;
	window.scrollTo({
		top: Math.max(0, t - window.innerHeight / 2 + e.height / 2),
		behavior: "auto"
	});
	let r = document.createElement("div");
	return r.style.cssText = `position:absolute;left:${n}px;top:${t}px;width:${e.width}px;height:${e.height}px;pointer-events:none;z-index:899;outline:2px solid #3366cc;background:rgba(51,102,204,.15);border-radius:2px;`, document.body.append(r), window.setTimeout(() => r.remove(), 1600), !0;
}
function d(e) {
	let t = e;
	for (; t && t !== document.body;) {
		if (window.getComputedStyle(t).display === "none") {
			let e = t.querySelector(".mw-collapsible-toggle a");
			return e ? (e.click(), !0) : (t.style.display = "", !0);
		}
		t = t.parentElement;
	}
	return !1;
}
function f(e, t) {
	let n = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), r = [], i = "", a;
	for (; a = n.nextNode();) {
		if (a.parentElement?.closest("script,style,.vc-preview") || t && !t.intersectsNode(a)) continue;
		let e = i.length;
		i += a.nodeValue || "", r.push({
			node: a,
			start: e,
			end: i.length
		});
	}
	let o = "", s = [], c = !1;
	for (let e = 0; e < i.length; e++) /\s/.test(i[e]) ? c ||= (o += " ", s.push(e), !0) : (o += i[e], s.push(e), c = !1);
	return {
		nodes: r,
		norm: o,
		map: s
	};
}
function p(e, t, n) {
	let r = String(t || "").replace(/\s+/g, " ").trim();
	if (!r) return null;
	let i = -1, a = 0;
	for (; (i = e.norm.indexOf(r, i + 1)) >= 0;) {
		if (a++, a < n) continue;
		let t = e.map[i], o = (e.map[Math.min(i + r.length - 1, e.map.length - 1)] || t) + 1, s = e.nodes.find((e) => t >= e.start && t < e.end), c = e.nodes.find((e) => o <= e.end && o > e.start);
		if (!s || !c) continue;
		let l = document.createRange();
		return l.setStart(s.node, t - s.start), l.setEnd(c.node, o - c.start), l;
	}
	return null;
}
function m(e) {
	let t = e.cloneNode(!0);
	return t.querySelectorAll(".mw-editsection").forEach((e) => e.remove()), t.textContent?.replace(/\s+/g, " ").trim() || "";
}
function h(e) {
	let t = document.querySelector("#mw-content-text");
	if (!e || !t) return;
	let n = [...t.querySelectorAll("h2")], r = n.findIndex((t) => m(t) === e);
	if (r < 0) return;
	let i = document.createRange();
	i.setStartBefore(n[r]);
	let a = n[r + 1];
	return a ? i.setEndBefore(a) : i.setEnd(t, t.childNodes.length), i;
}
function g(e) {
	let t = document.querySelector("#mw-content-text");
	if (!t) return !1;
	let n = [...t.querySelectorAll("h2")], r = e ? n.find((t) => m(t) === e) : void 0, i = r?.nextElementSibling || r || t.querySelector("p, .mw-parser-output > *");
	return i ? u(i.getBoundingClientRect()) : !1;
}
function _(e) {
	return e.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
function v(e) {
	return _(e.querySelector(".navbox-title, caption, .infobox-title, .infoBoxTitle, .mbox-text, th")?.textContent || "");
}
var y = {
	entry: 300,
	title: 200,
	text: 80,
	param: 10,
	navbox: 20,
	infobox: 15,
	longText: 5,
	longTextLength: 100,
	maxParams: 8,
	min: 60
};
function b(e, t) {
	let n = _(e.textContent || "");
	if (!n) return null;
	let r = v(e), i = !!(t.name && r.includes(t.name)), a = !!(t.name && n.includes(t.name)), o = !!t.entry && e.matches(".pm-card") && _(e.querySelector(".pm-title, .pm-title-txt")?.textContent || "") === t.entry, s = 0;
	i ? s += y.title : a && (s += y.text), o && (s += y.entry);
	let c = t.params.filter((e) => n.includes(e)).length;
	return s += Math.min(y.maxParams, c) * y.param, e.matches("table.navbox, .navbox") && (s += y.navbox), e.matches(".infobox, .infoBox") && (s += y.infobox), n.length > y.longTextLength && (s += y.longText), s >= y.min ? {
		element: e,
		score: s,
		titleMatch: i,
		textMatch: a,
		entryMatch: o
	} : null;
}
function ee(e) {
	let t = document.querySelector("#mw-content-text");
	if (!t) return !1;
	let n = h(e.section), r = {
		name: _(e.name),
		entry: _(e.params?.条目 || ""),
		params: Object.values(e.params).map(_).filter((e) => e.length >= 2)
	}, i = [], a = [], o = [];
	for (let e of t.querySelectorAll("table,.navbox,.infobox,.infoBox,.hatnote,.dablink,.mbox,.ambox,.cq-quote,[class*=\"quote\"],[class*=\"box\"],.pm-card")) {
		if (n && !n.intersectsNode(e)) continue;
		let t = b(e, r);
		t && (t.entryMatch && i.push(t), t.titleMatch && a.push(t), t.textMatch && o.push(t));
	}
	let s = i.length ? i : a.length ? a : o;
	if (!s.length) return !1;
	s.sort((e, t) => t.score - e.score);
	let c = s[Math.min(e.occurrence - 1, s.length - 1)]?.element;
	return c instanceof HTMLElement && (d(c), u(c.getBoundingClientRect()));
}
function te(e, t, n, r, i, a, o, s) {
	if (!e) return !1;
	let c = document.querySelector("#mw-content-text");
	if (!c) return !1;
	let l = c;
	if (r?.type === "poem") {
		let e = c.querySelectorAll(".poem")[r.index];
		if (!e) return !1;
		l = e;
	}
	let m = Math.max(1, Number(t) || 1), g = [], _ = (e, t) => {
		let n = String(e || "").replace(/\s+/g, " ").trim();
		n.length < 2 || g.some((e) => e.needle === n) || g.push({
			needle: n,
			occurrence: t
		});
	};
	r || (i && (_(`${i} ${e}`, s || 1), _(i + e, s || 1)), o && (_(`${e} ${o}`, 1), _(e + o, 1)), a && (_(`${a} ${e}`, 1), _(a + e, 1))), _(e, m);
	let v = h(n), y = f(l, v);
	for (let e of g) {
		let t = p(y, e.needle, e.occurrence);
		if (!t) continue;
		let n = t.getBoundingClientRect();
		if (n && (n.width || n.height)) {
			if (u(n)) return !0;
			continue;
		}
		let r = t.startContainer.parentElement;
		if (r && d(r)) return window.setTimeout(() => {
			let t = p(y, e.needle, e.occurrence);
			t && u(t.getBoundingClientRect());
		}, 150), !0;
	}
	return !1;
}
function ne(e) {
	try {
		let t = new URL(e, location.href);
		return t.searchParams.set("external-editor", "1"), t.href;
	} catch {
		return e;
	}
}
function re() {
	let e = new URL(location.href);
	if (e.searchParams.get("external-editor") !== "1") return !1;
	e.searchParams.delete("external-editor"), e.searchParams.delete("external-editor-section");
	try {
		history.replaceState(null, "", e.pathname + e.search + e.hash);
	} catch {}
	return !0;
}
function x() {
	let e = new URL(location.href).searchParams, t = e.get("action") ?? o("wgAction");
	if (t && t !== "view" || e.has("diff") || e.has("oldid") || e.has("curid") || e.has("veaction") || e.has("redlink")) return !1;
	let n = o("wgNamespaceNumber");
	return typeof n != "number" || n >= 0;
}
function ie(e) {
	if (e.closest(".mw-editsection") || e.classList.contains("new") || e.classList.contains("external")) return !1;
	let t = new URL(e.href, location.href);
	if (t.origin !== location.origin) return !1;
	let n = t.searchParams;
	return !(n.get("action") || n.get("oldid") || n.get("diff") || n.get("redlink") || t.pathname.includes("/Special:") || t.pathname.includes("特殊:") || t.pathname === location.pathname && t.hash);
}
function S(e) {
	let t = document.querySelector("#mw-content-text");
	if (!t) return "";
	let n = [...t.querySelectorAll("h2")], r = "";
	for (let t of n) t.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING && (r = m(t));
	return r;
}
function ae(e, t) {
	let n = document, r = null;
	if (n.caretRangeFromPoint) r = n.caretRangeFromPoint(e, t);
	else if (document.caretPositionFromPoint) {
		let n = document.caretPositionFromPoint(e, t);
		n && (r = document.createRange(), r.setStart(n.offsetNode, n.offset), r.collapse(!0));
	}
	if (!r || r.startContainer.nodeType !== Node.TEXT_NODE) return null;
	let i = r.startContainer.nodeValue || "", a = r.startOffset || 0, o = i.replace(/\s+/g, " ").trim(), s = o.length >= 2 && o.length <= 60 ? o : i.slice(Math.max(0, a - 40), Math.min(i.length, a + 40)).replace(/\s+/g, " ").trim();
	if (s.length < 2) return null;
	let c = S(r.startContainer), l = 1;
	try {
		let e = document.createRange(), t = document.querySelector("#mw-content-text"), n = [...t?.querySelectorAll("h2") || []].find((e) => m(e) === c);
		n ? e.setStartBefore(n) : t ? e.setStart(t, 0) : e.setStart(r.startContainer, 0), e.setEnd(r.startContainer, a);
		let i = e.toString().replace(/\s+/g, " "), o = 0;
		for (l = 1; (o = i.indexOf(s, o)) >= 0;) l++, o += s.length;
	} catch {}
	return {
		text: s,
		section: c,
		occurrence: l
	};
}
// ipe-plugin/src/preview.ts
function oe({ translate: e, request: t, getSession: n, setStatus: r }) {
	let i, o = 0;
	function s(e) {
		e.querySelectorAll("script").forEach((e) => {
			if (e.dataset.mweExecuted) return;
			let t = document.createElement("script");
			for (let n of Array.from(e.attributes)) t.setAttribute(n.name, n.value);
			t.textContent = e.textContent, t.dataset.mweExecuted = "1", e.replaceWith(t);
		});
	}
	function l(e) {
		let t = document.querySelector("#mw-content-text");
		if (!t) return;
		let r = n();
		r && !r.fullOriginal && (r.fullOriginal = Array.from(t.childNodes));
		let i = document.createElement("div");
		i.innerHTML = e, t.replaceChildren(...Array.from(i.childNodes)), s(t);
		let o = a(), l = c();
		o?.hook && l && o.hook("wikipage.content").fire(l(t));
	}
	function u() {
		let e = document.querySelector("#mw-content-text"), t = n();
		e && t?.fullOriginal && (e.replaceChildren(...t.fullOriginal), t.fullOriginal = void 0);
	}
	function d() {
		clearTimeout(i), i = window.setTimeout(f, 250);
	}
	async function f() {
		let i = n();
		if (!i) return !1;
		let a = ++o, s;
		try {
			s = await t({
				action: "parse",
				contentmodel: "wikitext",
				title: i.title,
				text: i.previewText ?? i.text,
				pst: "1",
				preview: "1",
				disableeditsection: "1",
				disablelimitreport: "1",
				prop: "text"
			});
		} catch (t) {
			return a === o && r(e("Preview failed: {{ $1 }}", t instanceof Error ? t.message : String(t))), !1;
		}
		return a !== o || !s.parse?.text ? !1 : (l(s.parse.text), r(i.conflict ? e("Edit conflict detected; conflict markers are loaded. Resolve them before submitting.") : e("Preview updated at {{ $1 }}", (/* @__PURE__ */ new Date()).toLocaleTimeString()), i.conflict ? "error" : void 0), !0);
	}
	function p() {
		clearTimeout(i), o++;
	}
	return {
		schedulePreview: d,
		renderPreview: f,
		restorePage: u,
		cancel: p
	};
}
// ipe-plugin/src/index.ts
var se = "ws://127.0.0.1:8927", ce = 5e3, C = "mwe-ipe-pending-save-confirmation", w = 3e3;
function T(e) {
	switch (e) {
		case "preferences":
		case "watch":
		case "unwatch": return e;
		default: return "nochange";
	}
}
function E(e) {
	return {
		remoteDirty: !1,
		changed: !1,
		busy: !1,
		conflict: !1,
		...e
	};
}
var D = {
	name: "vscode-editor",
	inject: [
		"toolbox",
		"i18n",
		"quickUpload",
		"templatesUsed",
		"quickDiff"
	],
	apply(n) {
		let a = "vscode-editor", c = n.i18n.manager, u = (e, ...t) => {
			let n = c.translate(`${a}.${e}`, ...t);
			return n.startsWith(`${a}.`) ? n.slice(14) : n;
		};
		for (let e of [
			"zh",
			"zh-cn",
			"zh-hans"
		]) c.setLanguageData(e, { [a]: i });
		let d = e({
			apiUrl: l(),
			translate: u
		}), f = (() => {
			try {
				let e = "mwe-ipe-window-id", t = sessionStorage.getItem(e);
				return t || (t = typeof crypto < "u" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`, sessionStorage.setItem(e, t)), t;
			} catch {
				return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
			}
		})(), p = n.templatesUsed, m = null, h = !1, _ = null, v, y = !1, b = null, S = null, D = 0, O = {}, k = null, le = 0, A = {}, j = null, M = !1, N = !1, P = r({
			translate: u,
			getSession: () => _,
			actions: {
				submit: (e) => Ce(e),
				cancel: () => Se(),
				upload: () => {
					n.quickUpload?.showModal();
				},
				templates: () => ye(),
				images: () => xe(),
				diff: () => be()
			}
		}), { ensureBar: F, refreshBar: ue, setBusy: I, setStatus: L, syncBarHeight: R } = P, z = oe({
			translate: u,
			request: (e) => d.request(e),
			getSession: () => _,
			setStatus: L
		});
		function de() {
			try {
				let e = sessionStorage.getItem(C);
				if (!e) return null;
				let t = JSON.parse(e);
				if (!t || typeof t != "object") return null;
				let n = t;
				if (typeof n.sessionId != "string" || typeof n.revid != "number" || !Number.isInteger(n.revid) || n.revid <= 0) return null;
				let r = typeof n.origin == "string" ? n.origin : location.origin;
				return {
					sessionId: n.sessionId,
					origin: r,
					revid: n.revid
				};
			} catch {
				return null;
			}
		}
		function fe(e, t) {
			j = {
				sessionId: e,
				origin: location.origin,
				revid: t
			}, N = !1;
			try {
				sessionStorage.setItem(C, JSON.stringify(j));
			} catch {}
		}
		function pe() {
			j = null, N = !1;
			try {
				sessionStorage.removeItem(C);
			} catch {}
		}
		function me() {
			j && !N && j.origin === location.origin && W({
				type: "save-confirmed",
				sessionId: j.sessionId,
				revid: j.revid,
				origin: location.origin
			}) && (N = !0);
		}
		function B(e) {
			n.modal?.notify("warning", e);
		}
		function V(e, t) {
			let r = e || u("VSCode extension is not connected. Open VSCode and make sure the WikiPreviewer extension is installed and enabled.");
			if (n.modal) {
				B({
					title: t || u("VSCode not connected"),
					content: r,
					closeAfter: {
						time: w,
						resetOnHover: !0
					}
				});
				return;
			}
			let i = document.getElementById("mwe-offline-notice");
			i && i.remove();
			let a = document.createElement("div");
			a.id = "mwe-offline-notice", a.style.cssText = "position:fixed;top:20px;right:20px;z-index:901;max-width:360px;background:#fff;color:#202122;border:1px solid #a2a9b1;border-left:4px solid #fc3;padding:12px 14px;border-radius:4px;font-size:13px;line-height:1.5;box-shadow:0 2px 12px rgba(0,0,0,.2);", a.textContent = r, document.body.append(a), window.setTimeout(() => a.remove(), w);
		}
		function he(e) {
			let t = document.createElement("a");
			t.href = e, t.target = "_blank", t.rel = "noopener", t.textContent = u("Open target page"), t.style.cssText = "color:#36c;text-decoration:underline;cursor:pointer;", n.modal ? B({
				title: u("Popup blocked"),
				content: t,
				closeAfter: {
					time: w,
					resetOnHover: !0
				}
			}) : V(u("The popup was blocked; open the target page manually."), u("Page needs to be opened"));
		}
		function ge(e) {
			let t;
			try {
				let n = s();
				if (!n?.getUrl) throw Error(u("mw.util.getUrl is unavailable"));
				t = new URL(n.getUrl(e.title), location.href);
			} catch {
				W({
					type: "open-result",
					requestId: e.requestId,
					opened: !1
				});
				return;
			}
			t.searchParams.set("external-editor", "1"), e.fragment && (t.hash = e.fragment);
			let n = `mwe-edit:${encodeURIComponent(e.title)}`, r = null;
			try {
				r = window.open(t.href, n);
			} catch {}
			r ? W({
				type: "open-result",
				requestId: e.requestId,
				opened: !0
			}) : (he(t.href), W({
				type: "open-result",
				requestId: e.requestId,
				opened: !1
			}));
		}
		function H() {
			return b ? Promise.resolve(b) : S || (S = d.fetchSiteInfo().then((e) => {
				let t = `reg-${Date.now()}-${++D}`, { promise: n, resolve: r, reject: i } = Promise.withResolvers(), a = window.setTimeout(() => {
					delete O[t], i(Error(u("Extension did not respond to site registration")));
				}, 15e3);
				return O[t] = {
					resolve: r,
					reject: i,
					timer: a,
					query: e
				}, W({
					type: "register-wiki",
					requestId: t,
					origin: location.origin,
					api: l(),
					name: o("wgSiteName") || location.host,
					siteinfo: e
				}), n;
			}).then((e) => (b = e, S = null, e)).catch((e) => {
				throw S = null, e;
			}), S);
		}
		function _e(e) {
			let t = O[e.requestId];
			t && (clearTimeout(t.timer), delete O[e.requestId], e.ok ? t.resolve(t.query) : t.reject(Error(e.error || u("Site registration failed"))));
		}
		function U() {
			y || m && m.readyState <= WebSocket.OPEN || (m = new WebSocket(se), m.addEventListener("open", () => {
				h = !0, document.getElementById("mwe-offline-notice")?.remove(), me();
				let e = () => {
					let e = M;
					M = !1, e && !_ && Y();
				};
				(async () => {
					try {
						if (await H(), !x()) return;
						let t = await q();
						if (t.session) {
							await J(t.session);
							return;
						}
						if (t.busy) {
							window.setTimeout(async () => {
								try {
									let e = await q(!0);
									if (e.session) {
										await J(e.session);
										return;
									}
								} catch {}
								e();
							}, 500);
							return;
						}
					} catch (e) {
						let t = e instanceof Error ? e.message : String(e);
						L(u("Site registration failed: {{ $1 }}", t), "error");
					}
					_ ? (z.restorePage(), G(), V(u("The extension no longer has this session; editing has been closed."), u("Session ended"))) : e();
				})();
			}), m.addEventListener("close", () => {
				h = !1, k = null, y || (v = window.setTimeout(U, ce));
			}), m.addEventListener("error", () => {
				try {
					m?.close();
				} catch {}
			}), m.addEventListener("message", (e) => {
				let t;
				try {
					t = JSON.parse(e.data);
				} catch {
					return;
				}
				t.type === "wiki-registered" ? _e(t) : t.type === "session-result" ? ve(t) : t.type === "navigate-edit" ? ge(t) : t.type === "save-confirmed-result" ? j && t.sessionId === j.sessionId && t.ok && pe() : _ && t.sessionId === _.id && (t.type === "refresh-preview" ? (_.previewText = t.previewText, z.schedulePreview()) : t.type === "update" ? (_.text = t.text, _.previewText = t.previewText, _.changed = !0, z.schedulePreview()) : t.type === "state" ? (_.remoteDirty = !!t.dirty, ue()) : t.type === "scroll" ? t.kind === "section" ? g(t.section) : (t.kind === "template" || !te(t.text, t.occurrence, t.section, t.scope, t.label, t.prev, t.next, t.labelOccurrence) && t.template) && ee(t.template) : t.type === "save" ? (L(u("Submitting…")), Ae(t.text, t.summary, t.minor, t.requestId)) : t.type === "finish" ? (t.result === "closed" && z.restorePage(), G(), t.result !== "closed" && K()) : t.type === "editor-closed" ? (z.restorePage(), G(), K(), V(u("Exited editing mode."), u("Editor closed"))) : t.type === "preempted" && (z.restorePage(), G(), V(u("Editing continued in another tab."), u("Session transferred"))));
			}));
		}
		function W(e) {
			return m && m.readyState === WebSocket.OPEN ? (m.send(JSON.stringify(e)), !0) : !1;
		}
		function G() {
			_ = null, z.cancel(), P.detach(), document.querySelector(".mwe-ipe-bar")?.remove(), document.body.classList.remove("mwe-ipe-editing");
		}
		function K() {
			window.name.indexOf("mwe-edit:") === 0 && window.setTimeout(() => window.close(), 50);
		}
		function q(e = !1) {
			if (!e && k) return k;
			if (!h) return Promise.resolve({
				session: null,
				busy: !1
			});
			let t = `session-${Date.now()}-${++le}`, { promise: n, resolve: r, reject: i } = Promise.withResolvers(), a = window.setTimeout(() => {
				delete A[t], i(Error(u("Extension did not respond to the session query")));
			}, 8e3);
			A[t] = {
				resolve: r,
				reject: i,
				timer: a
			}, W({
				type: "session-query",
				requestId: t,
				origin: location.origin,
				title: o("wgPageName"),
				windowId: f
			}) || (clearTimeout(a), delete A[t], i(Error(u("Extension not connected"))));
			let s = n.catch((e) => {
				throw k = null, e;
			});
			return k = s, s;
		}
		function ve(e) {
			let t = A[e.requestId];
			t && (clearTimeout(t.timer), delete A[e.requestId], e.ok ? t.resolve({
				session: e.session || null,
				busy: !!e.busy
			}) : t.reject(Error(e.error || u("Session query failed"))));
		}
		async function J(e) {
			if (_) return;
			let t;
			try {
				t = e.revid ? await n.wikiPage.newFromRevision(e.revid) : await n.wikiPage.newFromTitle(e.title, !1);
			} catch (e) {
				let t = e instanceof Error ? e.message : String(e);
				L(u("Failed to resume the session: {{ $1 }}", t), "error");
				return;
			}
			_ = E({
				id: e.sessionId,
				title: e.title,
				text: e.text,
				wikiPage: t,
				remoteDirty: !!e.dirty,
				previewText: e.previewText
			}), F(), document.body.classList.remove("ipe-modal-no-scroll"), L(u("Resumed the VSCode editing session")), z.schedulePreview();
		}
		async function Y(e = !1) {
			if (!_ && x()) {
				if (h) {
					M = !1;
					try {
						await H();
						let e = await q(!0);
						if (e.busy) {
							V(u("This page is already being edited in another browser window or VSCode session. Close that session first."), u("Page already being edited"));
							return;
						}
						if (e.session) {
							await J(e.session);
							return;
						}
						let t = o("wgPageName");
						if (!t) throw Error(u("Unable to read the current page title"));
						let r = await n.wikiPage.newFromTitle(t, !1), i = r.revisions[0];
						_ = E({
							id: `s${Date.now()}`,
							title: t,
							text: i?.content || "",
							wikiPage: r
						}), F(), document.body.classList.remove("ipe-modal-no-scroll"), L(u("Editing in VSCode; save the file to refresh the preview")), W({
							type: "open",
							sessionId: _.id,
							title: _.title,
							text: _.text,
							revid: i?.revid,
							basetimestamp: i?.timestamp,
							starttimestamp: (/* @__PURE__ */ new Date()).toISOString(),
							windowId: f,
							wiki: location.origin
						});
					} catch (e) {
						let t = e instanceof Error ? e.message : String(e), n = u("Failed to start editing: {{ $1 }}. Make sure the VSCode extension is running and the web plugin is up to date.", t);
						L(n, "error"), V(n, u("Failed to start editing"));
					}
				} else {
					if (e) {
						M = !0;
						return;
					}
					V();
				}
			}
		}
		function ye() {
			_ && p?.showModal({ title: _.title });
		}
		function be() {
			if (!_) return;
			let e = _.wikiPage.revisions[0]?.content || "";
			e !== _.text && n.quickDiff?.comparePages({
				fromtitle: _.title,
				fromtext: e,
				totitle: _.title,
				totext: _.text,
				topst: !0
			});
		}
		function xe() {
			_ && n.modal && fetch(`${l()}?action=parse&format=json&formatversion=2&prop=images&page=${encodeURIComponent(_.title)}`).then((e) => e.json()).then((e) => {
				let t = e.parse?.images || [], r = document.createElement("div");
				if (!t.length) r.textContent = u("No images are used.");
				else {
					let e = document.createElement("ol");
					for (let n of t) {
						let t = /^File:/i.test(n) ? n : `File:${n}`, r = document.createElement("li"), i = document.createElement("a");
						i.href = `/wiki/${encodeURIComponent(t)}`, i.target = "_blank", i.rel = "noopener", i.textContent = t, r.append(i), e.append(r);
					}
					r.append(e);
				}
				n.modal?.show({
					title: u("Images used"),
					content: r,
					sizeClass: "dialog",
					draggable: !0,
					backdrop: !1
				});
			});
		}
		function Se() {
			if (!_) return;
			let e = _.remoteDirty || _.changed;
			(!e || confirm(_.remoteDirty ? u("VSCode still has unsaved changes. Discard them and close the editor?") : u("There are changes not yet saved to the site. Discard them?"))) && (W({
				type: "finish",
				sessionId: _.id,
				result: e ? "discarded" : "unchanged"
			}), z.restorePage(), G(), K());
		}
		function Ce(e) {
			_ && (_.remoteDirty ? L(u("VSCode has unsaved changes; save the file first (Ctrl+S)"), "error") : (I(!0), _.watchlist = T(e.watchlist), L(u("Saving the file…")), W({
				type: "request-save",
				sessionId: _.id,
				summary: e.summary,
				minor: e.minor
			})));
		}
		function we(e) {
			let t = e;
			return t?.code === "editconflict" || t?.data?.error?.code === "editconflict" || /editconflict|编辑冲突/i.test(String(t?.message || ""));
		}
		async function X() {
			return _ ? n.wikiPage.newFromTitle(_.title, !1, void 0, !0) : null;
		}
		function Z(e, t) {
			if (!_) return !1;
			let n = e.revisions[0];
			return n ? (_.wikiPage = e, _.conflict = !0, W({
				type: "conflict",
				sessionId: _.id,
				remoteText: n.content || "",
				remoteRevid: n.revid,
				remoteTimestamp: n.timestamp,
				message: t
			}), L(u("Edit conflict detected; conflict markers are loaded. Resolve them before submitting."), "error"), !0) : !1;
		}
		async function Te() {
			let e = _?.wikiPage.revisions[0]?.revid, t = null;
			try {
				t = await X();
			} catch {}
			let n = t?.revisions[0]?.revid;
			return {
				baseRevid: e,
				latest: t,
				changedRemotely: e !== void 0 && n !== void 0 && n !== e && !!t
			};
		}
		async function Ee(e, t, n) {
			if (!_) return {};
			let r = await _.wikiPage.edit({
				text: e,
				summary: t || "",
				minor: !!n,
				watchlist: _.watchlist || T("nochange")
			});
			return d.readEditResult(r.data?.edit);
		}
		function De(e, t, n, r, i) {
			fe(e, n), W({
				type: "save-result",
				sessionId: e,
				requestId: t,
				ok: !0
			}), W({
				type: "finish",
				sessionId: e,
				result: "saved",
				summary: r || "",
				minor: !!i
			}), L(u("Saved; reloading and waiting for confirmation…"), "ok"), I(!1), window.setTimeout(() => location.reload(), 800);
		}
		function Oe(e, t, n) {
			I(!1), W({
				type: "save-result",
				sessionId: e,
				requestId: t,
				ok: !1,
				error: n
			});
		}
		async function ke(e, t, n) {
			let r = n instanceof Error ? n.message : String(n);
			I(!1), W({
				type: "save-result",
				sessionId: e,
				requestId: t,
				ok: !1,
				error: r
			});
			let i = !1;
			if (we(n)) try {
				let e = await X();
				e && (i = Z(e, r));
			} catch {}
			i || L(u("Save failed: {{ $1 }}", r), "error");
		}
		async function Ae(e, t, n, r) {
			if (!_) return;
			let i = _.id;
			try {
				let { baseRevid: a, latest: o, changedRemotely: s } = await Te();
				if (s) {
					I(!1), Z(o, u("The page was changed by someone else.")), W({
						type: "save-result",
						sessionId: i,
						requestId: r,
						ok: !1,
						error: "编辑冲突"
					});
					return;
				}
				o && (_.wikiPage = o);
				let c = await Ee(e, t, n);
				_.text = e, _.changed = !1, _.conflict = !1;
				let l = await d.savedRevid(_.title, e, c, a);
				if (l === void 0) {
					let e = u("The save was submitted but no revision id could be confirmed; the temp file was kept");
					Oe(i, r, e), L(u("Save unconfirmed: {{ $1 }}", e), "error");
					return;
				}
				De(i, r, l, t, n);
			} catch (e) {
				await ke(i, r, e);
			}
		}
		function Q(e) {
			if (!_) return;
			let t = e.target instanceof Element ? e.target : null;
			if (t?.closest("#mw-content-text") == null) return;
			let n = t.closest("a");
			if (n instanceof HTMLAnchorElement) {
				if (!ie(n)) return;
				e.preventDefault(), window.open(ne(n.href), "_blank", "noopener");
				return;
			}
			let r = ae(e.clientX, e.clientY);
			r && W({
				type: "locate",
				sessionId: _.id,
				text: r.text,
				section: r.section,
				occurrence: r.occurrence
			});
		}
		function je() {
			let e = "http://www.w3.org/2000/svg", t = document.createElementNS(e, "svg");
			t.setAttribute("viewBox", "0 0 24 24"), t.setAttribute("width", "24"), t.setAttribute("height", "24"), t.setAttribute("fill", "none"), t.setAttribute("stroke", "currentColor"), t.setAttribute("stroke-width", "2"), t.setAttribute("stroke-linecap", "round"), t.setAttribute("stroke-linejoin", "round");
			let n = document.createElementNS(e, "path");
			return n.setAttribute("d", "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"), t.append(n), t;
		}
		let $ = "vscode-editor-page";
		j = de(), U(), x() && n.toolbox?.addButton({
			id: $,
			group: "group1",
			icon: je(),
			tooltip: u("Edit the whole page in VSCode"),
			onClick: () => {
				Y();
			}
		}), document.addEventListener("click", Q, !0), window.addEventListener("resize", R), n.on("dispose", () => {
			y = !0, h = !1, clearTimeout(v), z.cancel();
			for (let e of Object.keys(O)) clearTimeout(O[e].timer), delete O[e];
			for (let e of Object.keys(A)) clearTimeout(A[e].timer), delete A[e];
			try {
				m?.close();
			} catch {}
			m = null, document.removeEventListener("click", Q, !0), window.removeEventListener("resize", R), n.toolbox?.removeButton($), z.restorePage(), G(), document.getElementById(t)?.remove(), document.getElementById("mwe-offline-notice")?.remove();
		}), re() && window.setTimeout(() => {
			y || Y(!0);
		}, 0);
	}
};
export { D as default };
