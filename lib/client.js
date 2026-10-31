window.__ModuleLoader__.load({
	id: "dsh-sidebar-flex",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/**
		 * dsh-sidebar-flex - resizable, persisted sidebar geometry for the DSH GUI.
		 *
		 * Two handles were built; only the second one is active.
		 *
		 *   1. vertical edge handle (OPTIONAL, off by default) - took the sidebar width
		 *      away from the layout store (which clamps to 264..420px in computeColumns()
		 *      and actions.setSidebar()). The user asked to leave the right edge alone,
		 *      so ENABLE_WIDTH is false: the shell keeps its own width and its own drag
		 *      handle, and this plugin never touches the first grid track.
		 *   2. horizontal handle under the global panel list - gives the
		 *      workspace/session region the vertical space the navigation rows were
		 *      holding, so long session lists stop being clipped. This is the part the
		 *      plugin exists for.
		 *
		 * The nav height persists in localStorage, survives HMR/reload, and does not
		 * depend on React or on a client service: the plugin polls for the shell, which
		 * makes it safe to apply at boot.
		 */

		var VERSION = "0.2.2";

		/* The right-edge width takeover is off: the shell already owns 264..420px with
		   its own drag handle, and the user did not want that edge changed. Set this to
		   true to re-enable the first track rewrite + the custom vertical handle. */
		var ENABLE_WIDTH = false;
		var STORAGE_WIDTH = "dsh-sidebar-flex:width";
		var STORAGE_NAV = "dsh-sidebar-flex:nav-height";
		var DEFAULT_WIDTH = 320;
		var MIN_WIDTH = 200;
		var MIN_CENTER = 420;
		var MIN_NAV = 54;
		var HANDLE_CLASS = "dsh-sbf-handle";
		var NAV_HANDLE_CLASS = "dsh-sbf-nav-handle";
		var NAV_SHRUNK_CLASS = "dsh-sbf-nav-shrunk";
		var DRAGGING_CLASS = "dsh-sbf-dragging";
		var STYLE_ID = "dsh-sidebar-flex/style.css";
		var ATTRIBUTE = "data-dsh-sidebar-flex";

		var CSS_WIDTH = [
			".dsh-sbf-handle{position:absolute;top:var(--dsh-windows-titlebar-height,0px);bottom:0;width:10px;margin-left:-5px;cursor:col-resize;z-index:30;touch-action:none;background:transparent;outline:none}",
			".dsh-sbf-handle::after{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:2px;height:44px;border-radius:99px;background:var(--dsw-alias-interactive-bg-brand-hover,rgba(122,155,240,.85));opacity:0;transition:opacity .12s ease}",
			".dsh-sbf-handle:hover,.dsh-sbf-handle:focus-visible{background:linear-gradient(to right,transparent,rgba(122,155,240,.16),transparent)}",
			".dsh-sbf-handle:hover::after,.dsh-sbf-handle:focus-visible::after,.dsh-sbf-handle[data-dragging='1']::after{opacity:1}",
			"[class*='_frame']:not([data-sidebar-collapsed])>[class*='_handle'][data-side='sidebar']{display:none!important}"
		];

		var CSS_NAV = [
			".dsh-sbf-nav-handle{position:absolute;left:0;right:0;margin:0 10px;height:10px;cursor:row-resize;z-index:29;touch-action:none;outline:none;background:transparent}",
			".dsh-sbf-nav-handle::after{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:46px;height:2px;border-radius:99px;background:var(--dsw-alias-interactive-bg-brand-hover,rgba(122,155,240,.85));opacity:.3;transition:opacity .12s ease}",
			".dsh-sbf-nav-handle:hover::after,.dsh-sbf-nav-handle:focus-visible::after,.dsh-sbf-nav-handle[data-dragging='1']::after{opacity:1}",
			".dsh-sbf-nav-shrunk{overflow-y:auto!important;overflow-x:hidden!important;min-height:0!important;scrollbar-width:thin}",
			"[class*='_frame'].dsh-sbf-dragging{transition:none!important}"
		];

		var CSS = (ENABLE_WIDTH ? CSS_WIDTH.concat(CSS_NAV) : CSS_NAV).join("\n");

		var state = {
			desired: null,
			frame: null,
			handle: null,
			observer: null,
			timer: 0,
			pending: false,
			disposed: false,
			instance: null
		};

		var nav = {
			root: null,
			list: null,
			handle: null,
			desired: null,
			natural: 0
		};

		function readStored(key, min, max) {
			try {
				var raw = window.localStorage.getItem(key);
				if (!raw) return null;
				var value = Math.round(parseFloat(raw));
				if (!isFinite(value) || value < min || value > max) return null;
				return value;
			} catch (error) {
				return null;
			}
		}

		function saveStored(key, value) {
			try {
				window.localStorage.setItem(key, String(Math.round(value)));
			} catch (error) {
				/* storage may be unavailable; the geometry still works for this session */
			}
		}

		function clearStored(key) {
			try {
				window.localStorage.removeItem(key);
			} catch (error) {}
		}

		function clampWidth(width, max) {
			var value = Math.round(width);
			if (!isFinite(value)) value = DEFAULT_WIDTH;
			if (max && value > max) value = max;
			if (value < MIN_WIDTH) value = MIN_WIDTH;
			return value;
		}

		function rect(node) {
			return node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
		}

		/* ------------------------------------------------------------------ width */

		function readTrack(frame) {
			var template = frame.style.gridTemplateColumns || "";
			var match = /^\s*([0-9]+(?:\.[0-9]+)?)px/.exec(template);
			return match ? parseFloat(match[1]) : null;
		}

		/* Replace the first (sidebar) track, keep the rest of the template intact. */
		function writeTrack(frame, width) {
			var template = frame.style.gridTemplateColumns || "";
			var match = /^\s*([0-9]+(?:\.[0-9]+)?)px/.exec(template);
			if (!match) return null;
			var px = Math.round(width);
			var next = px + "px" + template.slice(match[0].length);
			if (next !== template) frame.style.gridTemplateColumns = next;
			if (document.documentElement.hasAttribute("data-windows-titlebar")) {
				frame.style.setProperty("--dsh-windows-sidebar-width", px + "px");
			}
			return px;
		}

		function maxTrack(frame) {
			var box = rect(frame);
			var total = frame.clientWidth || (box ? box.width : 0);
			return Math.max(MIN_WIDTH, Math.round(total - MIN_CENTER));
		}

		/* Hand the sidebar track back to the shell. The layout store only ever wants
		   264..420px, so anything outside that range was written by us (or by an older
		   instance of this plugin) and has to be clamped before we stop watching. */
		function restoreNativeTrack(frame) {
			var track = readTrack(frame);
			if (track === null) return;
			var native = Math.round(Math.min(420, Math.max(264, track)));
			if (native !== Math.round(track)) writeTrack(frame, native);
		}

		function findFrame() {
			var column = document.querySelector("[class*='sidebarCol']");
			var node = column;
			while (node && node !== document.body) {
				if (node.style && node.style.gridTemplateColumns && node.querySelector("[class*='sidebarCol']")) return node;
				node = node.parentElement;
			}
			return null;
		}

		function injectCss() {
			if (!document.head) return;
			if (document.querySelector("style[data-plugin-css='" + STYLE_ID + "']")) return;
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-sidebar-flex";
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		function detachFrame() {
			if (state.observer) {
				state.observer.disconnect();
				state.observer = null;
			}
			if (state.handle && state.handle.parentNode) state.handle.parentNode.removeChild(state.handle);
			state.handle = null;
			if (state.frame) {
				state.frame.classList.remove(DRAGGING_CLASS);
				state.frame.removeAttribute(ATTRIBUTE);
			}
			state.frame = null;
		}

		function attachFrame(frame) {
			detachFrame();
			state.frame = frame;
			frame.setAttribute(ATTRIBUTE, VERSION);
			if (!ENABLE_WIDTH) {
				/* Width is the shell's business: undo any override still sitting in the DOM
				   (e.g. written by a previous instance) and do not observe the track. */
				restoreNativeTrack(frame);
				return;
			}
			if (typeof MutationObserver === "function") {
				var observer = new MutationObserver(function () {
					schedule();
				});
				observer.observe(frame, { attributes: true, attributeFilter: ["style", "data-sidebar-collapsed"] });
				state.observer = observer;
			}
			var handle = document.createElement("div");
			handle.className = HANDLE_CLASS;
			handle.setAttribute("role", "separator");
			handle.setAttribute("aria-orientation", "vertical");
			handle.setAttribute("aria-label", "Resize sidebar");
			handle.setAttribute("title", "拖动调整侧栏宽度 · 双击恢复默认 · 右键跟随应用默认");
			handle.tabIndex = 0;
			bindWidthHandle(handle);
			frame.appendChild(handle);
			state.handle = handle;
		}

		function positionHandle(width) {
			var handle = state.handle;
			var frame = state.frame;
			if (!handle || !frame) return;
			if (frame.hasAttribute("data-sidebar-collapsed")) {
				handle.style.display = "none";
				return;
			}
			handle.style.display = "";
			if (width !== null && width !== undefined) handle.style.left = Math.round(width) + "px";
		}

		function applyWidth(frame) {
			var collapsed = frame.hasAttribute("data-sidebar-collapsed");
			var track = readTrack(frame);
			if (track === null) return;
			if (!collapsed && state.desired !== null) {
				var want = clampWidth(state.desired, maxTrack(frame));
				if (Math.abs(track - want) >= 1) {
					var written = writeTrack(frame, want);
					if (written !== null) track = written;
				}
			}
			positionHandle(track);
		}

		function setWidthFromUser(frame, width) {
			var clamped = clampWidth(width, maxTrack(frame));
			state.desired = clamped;
			writeTrack(frame, clamped);
			positionHandle(clamped);
			return clamped;
		}

		function bindWidthHandle(handle) {
			handle.addEventListener("pointerdown", function (event) {
				if (event.pointerType === "mouse" && event.button !== 0) return;
				var frame = findFrame();
				if (!frame) return;
				var startTrack = readTrack(frame);
				if (startTrack === null) return;
				var startX = event.clientX;
				var max = maxTrack(frame);
				var last = startTrack;
				try {
					handle.setPointerCapture(event.pointerId);
				} catch (error) {}
				handle.dataset.dragging = "1";
				frame.classList.add(DRAGGING_CLASS);
				var body = document.body;
				var previousCursor = body.style.cursor;
				var previousSelect = body.style.userSelect;
				body.style.cursor = "col-resize";
				body.style.userSelect = "none";

				function onMove(moveEvent) {
					last = clampWidth(startTrack + (moveEvent.clientX - startX), max);
					state.desired = last;
					writeTrack(frame, last);
					handle.style.left = last + "px";
				}

				function onEnd() {
					handle.removeEventListener("pointermove", onMove);
					handle.removeEventListener("pointerup", onEnd);
					handle.removeEventListener("pointercancel", onEnd);
					handle.dataset.dragging = "";
					frame.classList.remove(DRAGGING_CLASS);
					body.style.cursor = previousCursor;
					body.style.userSelect = previousSelect;
					state.desired = last;
					saveStored(STORAGE_WIDTH, last);
					schedule();
				}

				handle.addEventListener("pointermove", onMove);
				handle.addEventListener("pointerup", onEnd);
				handle.addEventListener("pointercancel", onEnd);
				event.preventDefault();
			});

			handle.addEventListener("dblclick", function (event) {
				event.preventDefault();
				var frame = findFrame();
				if (!frame) return;
				var width = setWidthFromUser(frame, DEFAULT_WIDTH);
				saveStored(STORAGE_WIDTH, width);
			});

			handle.addEventListener("contextmenu", function (event) {
				event.preventDefault();
				clearStored(STORAGE_WIDTH);
				state.desired = null;
				schedule();
			});

			handle.addEventListener("keydown", function (event) {
				if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
				var frame = findFrame();
				if (!frame) return;
				var track = readTrack(frame);
				if (track === null) return;
				event.preventDefault();
				var delta = event.key === "ArrowLeft" ? -16 : 16;
				var width = setWidthFromUser(frame, track + delta);
				saveStored(STORAGE_WIDTH, width);
			});
		}

		/* -------------------------------------------------------------------- nav */

		/* The navigation rows and the workspace browser share one flex column: walk up
		   from the panel list until an ancestor also owns the region area. */
		function findNav() {
			var frame = state.frame || findFrame();
			if (!frame) return null;
			var column = frame.querySelector("[class*='sidebarCol']");
			if (!column) return null;
			var list = column.querySelector("[class*='panelList']");
			if (!list) return null;
			var node = list.parentElement;
			while (node && node !== column.parentElement) {
				if (node.querySelector && node.querySelector("[class*='regionArea']")) {
					return { root: node, list: list };
				}
				node = node.parentElement;
			}
			return null;
		}

		function clampNav(height) {
			var natural = nav.list ? nav.list.scrollHeight : 0;
			var max = Math.max(MIN_NAV, natural || nav.natural || MIN_NAV);
			var value = Math.round(height);
			if (!isFinite(value)) value = max;
			if (value < MIN_NAV) value = MIN_NAV;
			if (value > max) value = max;
			return value;
		}

		function styleNav(list, height) {
			list.style.height = Math.round(height) + "px";
			list.style.flex = "0 0 auto";
			list.style.minHeight = "0";
			list.classList.add(NAV_SHRUNK_CLASS);
		}

		function clearNavStyle(list) {
			if (!list) return;
			list.style.removeProperty("height");
			list.style.removeProperty("flex");
			list.style.removeProperty("min-height");
			list.classList.remove(NAV_SHRUNK_CLASS);
		}

		function positionNavHandle() {
			var handle = nav.handle;
			var root = nav.root;
			var list = nav.list;
			if (!handle || !root || !list) return;
			var rootBox = rect(root);
			var listBox = rect(list);
			if (!rootBox || !listBox) return;
			handle.style.top = Math.round(listBox.bottom - rootBox.top - 4) + "px";
		}

		function createNavHandle() {
			var handle = document.createElement("div");
			handle.className = NAV_HANDLE_CLASS;
			handle.setAttribute("role", "separator");
			handle.setAttribute("aria-orientation", "horizontal");
			handle.setAttribute("aria-label", "Resize navigation list");
			handle.setAttribute("title", "拖动调整导航列表高度（腾出会话列表空间） · 双击恢复默认");
			handle.tabIndex = 0;
			bindNavHandle(handle);
			return handle;
		}

		function applyNav() {
			var found = findNav();
			if (!found) return;
			if (nav.root !== found.root || !nav.handle) {
				if (nav.handle && nav.handle.parentNode) nav.handle.parentNode.removeChild(nav.handle);
				nav.root = found.root;
				nav.list = found.list;
				nav.natural = found.list.scrollHeight || 0;
				var computed = window.getComputedStyle ? window.getComputedStyle(found.root).position : "static";
				if (computed === "static") found.root.style.position = "relative";
				nav.handle = createNavHandle();
				found.root.appendChild(nav.handle);
			} else if (nav.list !== found.list) {
				nav.list = found.list;
			}
			if (nav.handle.parentNode !== nav.root) nav.root.appendChild(nav.handle);
			if (nav.desired !== null) {
				var want = clampNav(nav.desired);
				var current = rect(nav.list);
				if (!current || Math.abs(current.height - want) >= 1) styleNav(nav.list, want);
			}
			positionNavHandle();
		}

		function setNavFromUser(height) {
			if (!nav.list) return null;
			var clamped = clampNav(height);
			nav.desired = clamped;
			styleNav(nav.list, clamped);
			positionNavHandle();
			return clamped;
		}

		function resetNav() {
			clearStored(STORAGE_NAV);
			nav.desired = null;
			clearNavStyle(nav.list);
			positionNavHandle();
		}

		function bindNavHandle(handle) {
			handle.addEventListener("pointerdown", function (event) {
				if (event.pointerType === "mouse" && event.button !== 0) return;
				applyNav();
				if (!nav.list) return;
				var startY = event.clientY;
				var startHeight = rect(nav.list) ? rect(nav.list).height : nav.list.scrollHeight;
				var last = startHeight;
				try {
					handle.setPointerCapture(event.pointerId);
				} catch (error) {}
				handle.dataset.dragging = "1";
				var body = document.body;
				var previousCursor = body.style.cursor;
				var previousSelect = body.style.userSelect;
				body.style.cursor = "row-resize";
				body.style.userSelect = "none";

				function onMove(moveEvent) {
					last = setNavFromUser(startHeight + (moveEvent.clientY - startY));
				}

				function onEnd() {
					handle.removeEventListener("pointermove", onMove);
					handle.removeEventListener("pointerup", onEnd);
					handle.removeEventListener("pointercancel", onEnd);
					handle.dataset.dragging = "";
					body.style.cursor = previousCursor;
					body.style.userSelect = previousSelect;
					if (last !== null && last !== undefined) saveStored(STORAGE_NAV, last);
					schedule();
				}

				handle.addEventListener("pointermove", onMove);
				handle.addEventListener("pointerup", onEnd);
				handle.addEventListener("pointercancel", onEnd);
				event.preventDefault();
			});

			handle.addEventListener("dblclick", function (event) {
				event.preventDefault();
				resetNav();
			});

			handle.addEventListener("contextmenu", function (event) {
				event.preventDefault();
				resetNav();
			});

			handle.addEventListener("keydown", function (event) {
				if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
				applyNav();
				if (!nav.list) return;
				var box = rect(nav.list);
				if (!box) return;
				event.preventDefault();
				var delta = event.key === "ArrowUp" ? -24 : 24;
				var height = setNavFromUser(box.height + delta);
				if (height !== null) saveStored(STORAGE_NAV, height);
			});
		}

		/* ------------------------------------------------------------------- boot */

		/* Diagnostics surface: UIA (and any screenshot-to-DOM check) exposes className,
		   so the plugin publishes its live geometry as a class token. Harmless on screen. */
		function diag(text) {
			try {
				var node = document.querySelector(".dsh-sbf-diag");
				if (!node) {
					node = document.createElement("div");
					node.setAttribute("role", "status");
					node.setAttribute("aria-hidden", "true");
					node.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none";
					(document.body || document.documentElement).appendChild(node);
				}
				node.className = "dsh-sbf-diag " + String(text).replace(/[^A-Za-z0-9_.=:-]+/g, "_").slice(0, 180);
			} catch (error) {}
		}

		function setup() {
			if (state.disposed) return;
			try {
				setupInner();
			} catch (error) {
				diag("ERR=" + (error && error.message ? error.message : error));
			}
		}

		function setupInner() {
			var frame = findFrame();
			if (!frame) return diag("noframe");
			if (frame !== state.frame) attachFrame(frame);
			if (ENABLE_WIDTH) {
				if (state.handle && state.handle.parentNode !== frame) frame.appendChild(state.handle);
				applyWidth(frame);
			}
			applyNav();
			var track = readTrack(frame);
			var box = rect(frame);
			var listBox = rect(nav.list);
			diag("ok=1 v=" + VERSION + " track=" + track + " frame=" + (box ? Math.round(box.width) : "?") +
				" navwant=" + nav.desired + " navh=" + (listBox ? Math.round(listBox.height) : "?") +
				" navhandle=" + (nav.handle ? (nav.handle.parentNode ? "in" : "out") : "none") +
				" enabledWidth=" + ENABLE_WIDTH);
		}

		function schedule() {
			if (state.disposed || state.pending) return;
			state.pending = true;
			var run = function () {
				state.pending = false;
				if (!state.disposed) setup();
			};
			if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
			else window.setTimeout(run, 16);
		}

		function start() {
			injectCss();
			state.desired = readStored(STORAGE_WIDTH, MIN_WIDTH, 4000);
			nav.desired = readStored(STORAGE_NAV, MIN_NAV, 4000);
			var boot = function () {
				if (state.disposed) return;
				setup();
				if (!state.timer) state.timer = window.setInterval(setup, 900);
			};
			if (document.body && document.head) boot();
			else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
			else window.setTimeout(boot, 0);
			window.addEventListener("resize", schedule);
		}

		function teardown() {
			window.removeEventListener("resize", schedule);
			state.disposed = true;
			if (state.timer) {
				window.clearInterval(state.timer);
				state.timer = 0;
			}
			if (state.frame) restoreNativeTrack(state.frame);
			detachFrame();
			if (nav.handle && nav.handle.parentNode) nav.handle.parentNode.removeChild(nav.handle);
			nav.handle = null;
			clearNavStyle(nav.list);
			nav.root = null;
			nav.list = null;
			var tag = document.querySelector("style[data-plugin-css='" + STYLE_ID + "']");
			if (tag && tag.parentNode) tag.parentNode.removeChild(tag);
			if (window.__dshSidebarFlexCurrent === state.instance) window.__dshSidebarFlexCurrent = null;
		}

		function apply(ctx) {
			if (typeof document === "undefined" || typeof window === "undefined") return;
			var previous = window.__dshSidebarFlexCurrent;
			if (previous && typeof previous.dispose === "function") {
				try {
					previous.dispose();
				} catch (error) {}
			}
			state.instance = { version: VERSION, dispose: teardown };
			window.__dshSidebarFlexCurrent = state.instance;
			start();
			if (ctx && typeof ctx.effect === "function") {
				ctx.effect(function () {
					return teardown;
				});
			}
		}

		exports.name = "sidebar-flex";
		exports.inject = [];
		exports.apply = apply;

		return module.exports;
	}
});
