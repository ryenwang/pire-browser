"use strict";
{
    const MAX_PAGE_LOG_RECORDS = 200;
    const MAX_PROFILER_TRACE_EVENTS = 2500;
    const dialogs = [];
    const consoleRecords = [];
    const pageErrorRecords = [];
    let nextHandleNumber = 1;
    const handlesByElement = new WeakMap();
    const elementsByHandle = new Map();
    let mouseX = Math.round(window.innerWidth / 2);
    let mouseY = Math.round(window.innerHeight / 2);
    injectDialogShim();
    window.addEventListener("message", (event) => {
        if (event.source !== window)
            return;
        const data = event.data;
        if (!data || data.source !== "pire-browser")
            return;
        if (data.kind === "dialog") {
            pushCapped(dialogs, data.payload, 10);
            return;
        }
        if (data.kind === "console") {
            pushCapped(consoleRecords, data.payload, MAX_PAGE_LOG_RECORDS);
            return;
        }
        if (data.kind === "page_error") {
            pushCapped(pageErrorRecords, data.payload, MAX_PAGE_LOG_RECORDS);
        }
    });
    browser.runtime.onMessage.addListener((message) => {
        if (!message || typeof message.type !== "string")
            return undefined;
        if (message.type === "dialog_status")
            return Promise.resolve(dialogStatus());
        if (message.type === "dialog_control")
            return Promise.resolve(configureNextDialog(message.action, message.text));
        if (message.type === "snapshot")
            return Promise.resolve(snapshotFrame(message.selector, message.depth, Boolean(message.cursorInteractive)));
        if (message.type === "find")
            return Promise.resolve(findElements(message.locator));
        if (message.type === "frame_target")
            return Promise.resolve(frameTargetLocator(message.locator));
        if (message.type === "click")
            return Promise.resolve(clickLocator(message.locator));
        if (message.type === "click_new_tab")
            return Promise.resolve(clickNewTabLocator(message.locator));
        if (message.type === "dblclick")
            return Promise.resolve(doubleClickLocator(message.locator));
        if (message.type === "fill")
            return Promise.resolve(fillLocator(message.locator, message.text ?? ""));
        if (message.type === "upload_files")
            return Promise.resolve(uploadFilesLocator(message.locator, message.files));
        if (message.type === "type")
            return Promise.resolve(typeLocator(message.locator, message.text ?? ""));
        if (message.type === "focus")
            return Promise.resolve(focusLocator(message.locator));
        if (message.type === "hover")
            return Promise.resolve(hoverLocator(message.locator));
        if (message.type === "highlight")
            return Promise.resolve(highlightLocator(message.locator));
        if (message.type === "drag")
            return Promise.resolve(dragLocator(message.sourceLocator, message.targetLocator));
        if (message.type === "select")
            return Promise.resolve(selectLocator(message.locator, message.value ?? ""));
        if (message.type === "check")
            return Promise.resolve(checkLocator(message.locator, true));
        if (message.type === "uncheck")
            return Promise.resolve(checkLocator(message.locator, false));
        if (message.type === "scrollintoview")
            return Promise.resolve(scrollIntoViewLocator(message.locator));
        if (message.type === "get")
            return Promise.resolve(getLocator(message.locator, String(message.property ?? "text"), message.attribute));
        if (message.type === "is")
            return Promise.resolve(isLocator(message.locator, String(message.state ?? "visible")));
        if (message.type === "press")
            return Promise.resolve(pressKey(String(message.key ?? "")));
        if (message.type === "key_edge")
            return Promise.resolve(keyEdge(String(message.action ?? ""), String(message.key ?? "")));
        if (message.type === "keyboard_type")
            return Promise.resolve(typeFocused(String(message.text ?? ""), true));
        if (message.type === "keyboard_inserttext")
            return Promise.resolve(typeFocused(String(message.text ?? ""), false));
        if (message.type === "clipboard_selection")
            return Promise.resolve(clipboardSelection());
        if (message.type === "clipboard_paste")
            return Promise.resolve(clipboardPaste(String(message.text ?? "")));
        if (message.type === "state_export_storage")
            return Promise.resolve(stateExportStorage());
        if (message.type === "state_import_storage")
            return Promise.resolve(stateImportStorage(message.localStorage, message.sessionStorage));
        if (message.type === "viewport_metrics")
            return Promise.resolve(viewportMetrics());
        if (message.type === "screenshot_annotate")
            return Promise.resolve(annotateScreenshot(Boolean(message.fullPage)));
        if (message.type === "screenshot_full_metrics")
            return Promise.resolve(screenshotFullMetrics());
        if (message.type === "screenshot_scroll")
            return screenshotScroll(Number(message.x ?? 0), Number(message.y ?? 0));
        if (message.type === "screenshot_clear_annotations")
            return Promise.resolve(clearScreenshotAnnotationsResult());
        if (message.type === "scroll") {
            return Promise.resolve(scrollPage(String(message.direction ?? "down"), Number(message.pixels ?? 900), message.selector));
        }
        if (message.type === "mouse_event") {
            return Promise.resolve(mouseEvent(String(message.action ?? ""), Number(message.x), Number(message.y), Number(message.button ?? 0), Number(message.dx ?? 0), Number(message.dy ?? 0)));
        }
        if (message.type === "wait_selector") {
            return waitForSelector(String(message.selector), Number(message.timeout ?? 10000), String(message.state ?? "visible"));
        }
        if (message.type === "wait_locator") {
            return waitForLocator(message.locator, Number(message.timeout ?? 10000), String(message.state ?? "visible"));
        }
        if (message.type === "wait_text")
            return waitForText(String(message.text ?? ""), Number(message.timeout ?? 10000), Boolean(message.hidden));
        if (message.type === "wait_fn")
            return waitForFunction(String(message.expression ?? ""), Number(message.timeout ?? 10000));
        if (message.type === "debug_logs")
            return Promise.resolve(debugLogs(String(message.kind ?? "console"), Boolean(message.clear)));
        if (message.type === "vitals")
            return Promise.resolve(pageVitals());
        if (message.type === "profiler_snapshot")
            return Promise.resolve(profilerSnapshot(Number(message.startedAt ?? 0)));
        if (message.type === "react_tree")
            return Promise.resolve(reactTree(message.selector, message.maxDepth));
        if (message.type === "react_inspect")
            return Promise.resolve(reactInspect(String(message.target ?? ""), message.locator));
        if (message.type === "react_renders")
            return Promise.resolve(reactRenders(String(message.action ?? "")));
        if (message.type === "react_suspense")
            return Promise.resolve(reactSuspense(Boolean(message.onlyDynamic)));
        if (message.type === "eval")
            return Promise.resolve(evalScript(String(message.script ?? "")));
        if (message.type === "pushstate")
            return pushStateNavigation(String(message.url ?? ""));
        return undefined;
    });
    function injectDialogShim() {
        try {
            const script = document.createElement("script");
            script.textContent = `
      (() => {
        if (window.__pireBrowserDialogShimInstalled) return;
        const emit = (payload, kind = "dialog") => window.postMessage({ source: "pire-browser", kind, payload }, "*");
        const originalAlert = window.alert.bind(window);
        const originalConfirm = window.confirm.bind(window);
        const originalPrompt = window.prompt.bind(window);
        let nextDialogResponse = null;
        Object.defineProperty(window, "__pireBrowserDialogShimInstalled", {
          value: true,
          configurable: false,
          enumerable: false,
          writable: false,
        });
        Object.defineProperty(window, "__pireBrowserOriginalDialogs", {
          value: { alert: originalAlert, confirm: originalConfirm, prompt: originalPrompt },
          configurable: false,
          enumerable: false,
          writable: false,
        });
        const consumeResponse = () => {
          const response = nextDialogResponse;
          nextDialogResponse = null;
          return response;
        };
        window.addEventListener("message", (event) => {
          if (event.source !== window) return;
          const data = event.data;
          if (!data || data.source !== "pire-browser" || data.kind !== "dialog_control") return;
          nextDialogResponse = {
            action: data.action === "accept" ? "accept" : "dismiss",
            text: typeof data.text === "string" ? data.text : undefined,
          };
        });
        window.alert = (message) => {
          const response = consumeResponse();
          emit({ type: "alert", message: String(message ?? ""), returned: true, configuredAction: response?.action, at: Date.now() });
        };
        window.confirm = (message) => {
          const response = consumeResponse();
          const returned = response?.action === "accept";
          emit({ type: "confirm", message: String(message ?? ""), returned, configuredAction: response?.action, at: Date.now() });
          return returned;
        };
        window.prompt = (message, defaultValue) => {
          const response = consumeResponse();
          const returned = response?.action === "accept" ? (response.text ?? String(defaultValue ?? "")) : null;
          emit({ type: "prompt", message: String(message ?? ""), defaultValue, returned, configuredAction: response?.action, at: Date.now() });
          return returned;
        };
        const truncate = (text, max = 2000) => text.length > max ? text.slice(0, max - 1) + "…" : text;
        const valueText = (value) => {
          try {
            if (value instanceof Error) return value.stack || value.message || String(value);
            if (typeof value === "string") return value;
            if (value === undefined) return "undefined";
            if (typeof value === "function") return value.toString();
            if (typeof value === "symbol") return value.toString();
            if (value && typeof value === "object") return JSON.stringify(value);
            return String(value);
          } catch {
            try {
              return String(value);
            } catch {
              return "[unserializable]";
            }
          }
        };
        const consoleLevels = ["log", "info", "warn", "error", "debug"];
        for (const level of consoleLevels) {
          const original = window.console && typeof window.console[level] === "function"
            ? window.console[level].bind(window.console)
            : undefined;
          if (!original) continue;
          window.console[level] = (...args) => {
            const serialized = args.map((arg) => truncate(valueText(arg)));
            emit({ level, text: serialized.join(" "), args: serialized, at: Date.now(), url: location.href }, "console");
            return original(...args);
          };
        }
        window.addEventListener("error", (event) => {
          const error = event.error;
          emit({
            type: "error",
            message: truncate(String(event.message || error?.message || "")),
            stack: error?.stack ? truncate(String(error.stack), 8000) : undefined,
            source: event.filename || undefined,
            lineno: typeof event.lineno === "number" ? event.lineno : undefined,
            colno: typeof event.colno === "number" ? event.colno : undefined,
            at: Date.now(),
            url: location.href,
          }, "page_error");
        });
        window.addEventListener("unhandledrejection", (event) => {
          const reason = event.reason;
          emit({
            type: "unhandledrejection",
            message: truncate(valueText(reason)),
            stack: reason && reason.stack ? truncate(String(reason.stack), 8000) : undefined,
            at: Date.now(),
            url: location.href,
          }, "page_error");
        });
      })();
    `;
            (document.documentElement || document.head).appendChild(script);
            script.remove();
        }
        catch {
            // Restricted pages can reject script injection; commands will continue without dialog capture.
        }
    }
    function snapshotFrame(selector, depth, includeCursorInteractive = false) {
        const root = snapshotRoot(selector);
        const drained = drainDialogs();
        if ("error" in root) {
            return {
                frameId: 0,
                url: location.href,
                title: document.title,
                elements: [],
                dialogs: drained,
                error: root.error,
            };
        }
        const maxDepth = typeof depth === "number" && Number.isFinite(depth) ? depth : undefined;
        const elements = candidateElements(root.root, includeCursorInteractive)
            .filter((element) => maxDepth === undefined || elementDepthWithinRoot(element, root.root) <= maxDepth)
            .map((element) => toSnapshot(element, root.root, includeCursorInteractive))
            .filter((item) => item.visible);
        return {
            frameId: 0,
            url: location.href,
            title: document.title,
            elements,
            dialogs: drained,
        };
    }
    function elementDepthWithinRoot(element, root) {
        const base = root instanceof Document ? root.body || root.documentElement : root instanceof Element ? root : null;
        if (!base)
            return 0;
        if (element === base)
            return 0;
        let depth = 0;
        let current = element;
        while (current && current !== base) {
            depth += 1;
            current = current.parentElement;
        }
        return current === base ? depth : Number.MAX_SAFE_INTEGER;
    }
    function snapshotRoot(selector) {
        if (selector === undefined || selector === null || selector === "")
            return { root: document };
        try {
            const root = document.querySelector(String(selector));
            if (!root)
                return { error: `No element matched snapshot scope: ${selector}` };
            return { root };
        }
        catch (error) {
            return { error: error instanceof Error ? error.message : `Invalid snapshot scope: ${selector}` };
        }
    }
    function findElements(locator) {
        const matches = resolve(locator).map((element) => toSnapshot(element));
        return {
            matches,
            dialogs: drainDialogs(),
        };
    }
    function frameTargetLocator(locator) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        if (!isFrameElement(element)) {
            return {
                error: { code: "unsupported_element", message: `${describeElement(element)} is not an iframe` },
                dialogs: drainDialogs(),
            };
        }
        return {
            text: `Frame target ${accessibleName(element) || attr(element, "src") || describeElement(element)}`,
            href: frameSourceFor(element),
            frameUrl: currentFrameUrlFor(element),
            title: attr(element, "title"),
            name: attr(element, "name"),
            dialogs: drainDialogs(),
        };
    }
    function clickLocator(locator) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        if (isDisabled(element)) {
            return { error: { code: "not_enabled", message: `${describeElement(element)} is disabled` }, dialogs: drainDialogs() };
        }
        element.scrollIntoView({ block: "center", inline: "center" });
        const hitTest = clickHitTest(element);
        if ("error" in hitTest)
            return { ...hitTest, dialogs: drainDialogs() };
        element.focus({ preventScroll: true });
        element.click();
        return {
            text: `Clicked ${describeElement(element)}`,
            dialogs: drainDialogs(),
        };
    }
    function clickNewTabLocator(locator) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        if (isDisabled(element)) {
            return { error: { code: "not_enabled", message: `${describeElement(element)} is disabled` }, dialogs: drainDialogs() };
        }
        const href = linkHrefFor(element);
        if (!href) {
            return {
                error: {
                    code: "unsupported_element",
                    message: `click --new-tab requires a link with href, got ${describeElement(element)}`,
                },
                dialogs: drainDialogs(),
            };
        }
        element.scrollIntoView({ block: "center", inline: "center" });
        const hitTest = clickHitTest(element);
        if ("error" in hitTest)
            return { ...hitTest, dialogs: drainDialogs() };
        element.focus({ preventScroll: true });
        for (const type of ["mousedown", "mouseup", "click"]) {
            element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ctrlKey: true }));
        }
        return {
            text: `Clicked ${describeElement(element)} for new tab`,
            href,
            value: href,
            dialogs: drainDialogs(),
        };
    }
    function doubleClickLocator(locator) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        if (isDisabled(element)) {
            return { error: { code: "not_enabled", message: `${describeElement(element)} is disabled` }, dialogs: drainDialogs() };
        }
        element.scrollIntoView({ block: "center", inline: "center" });
        const hitTest = clickHitTest(element);
        if ("error" in hitTest)
            return { ...hitTest, dialogs: drainDialogs() };
        element.focus({ preventScroll: true });
        for (const detail of [1, 2]) {
            element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, detail }));
            element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, detail }));
            element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }));
        }
        element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 }));
        return {
            text: `Double-clicked ${describeElement(element)}`,
            dialogs: drainDialogs(),
        };
    }
    function clickHitTest(element) {
        const point = visibleClickPoint(element);
        if ("error" in point)
            return point;
        const hit = document.elementFromPoint(point.x, point.y);
        if (!hit) {
            return {
                error: {
                    code: "click_blocked",
                    message: `${describeElement(element)} is not hit-testable at click point (${point.x}, ${point.y})`,
                    data: { target: describeElement(element), point },
                },
            };
        }
        if (isElementOrShadowDescendant(element, hit))
            return { point, hit };
        return {
            error: {
                code: "click_blocked",
                message: `${describeElement(element)} is covered by ${describeDomElement(hit)} at click point (${point.x}, ${point.y}). Dismiss or interact with the covering element, then run snapshot -i before retrying.`,
                data: {
                    target: describeElement(element),
                    coveredBy: describeDomElement(hit),
                    point,
                },
            },
        };
    }
    function visibleClickPoint(element) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return { error: { code: "not_visible", message: `${describeElement(element)} has no visible click area` } };
        }
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const left = Math.max(0, rect.left);
        const top = Math.max(0, rect.top);
        const right = Math.min(viewportWidth, rect.right);
        const bottom = Math.min(viewportHeight, rect.bottom);
        if (right <= left || bottom <= top) {
            return {
                error: {
                    code: "not_visible",
                    message: `${describeElement(element)} is outside the visible viewport after scrolling`,
                },
            };
        }
        return {
            x: Math.max(0, Math.min(viewportWidth - 1, Math.round((left + right) / 2))),
            y: Math.max(0, Math.min(viewportHeight - 1, Math.round((top + bottom) / 2))),
        };
    }
    function isElementOrShadowDescendant(target, hit) {
        if (target === hit || target.contains(hit))
            return true;
        const root = hit.getRootNode();
        return root instanceof ShadowRoot && (target === root.host || target.contains(root.host));
    }
    function describeDomElement(element) {
        const tag = element.tagName.toLowerCase();
        const id = attr(element, "id");
        const classNames = attr(element, "class")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((name) => `.${name.replace(/[^a-zA-Z0-9_-]/g, "_")}`)
            .join("");
        const role = attr(element, "role");
        const name = accessibleName(element) || clean(element.textContent ?? "").slice(0, 60);
        return `<${tag}${id ? `#${id.replace(/[^a-zA-Z0-9_-]/g, "_")}` : ""}${classNames}>${role ? ` role=${role}` : ""}${name ? ` "${name}"` : ""}`;
    }
    function highlightLocator(locator) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        element.scrollIntoView({ block: "center", inline: "center" });
        const rect = element.getBoundingClientRect();
        clearHighlights();
        const overlay = document.createElement("div");
        overlay.setAttribute("data-pire-browser-highlight", "true");
        overlay.setAttribute("aria-hidden", "true");
        overlay.style.cssText = [
            "position: fixed",
            `left: ${Math.max(0, Math.round(rect.left))}px`,
            `top: ${Math.max(0, Math.round(rect.top))}px`,
            `width: ${Math.max(1, Math.round(rect.width))}px`,
            `height: ${Math.max(1, Math.round(rect.height))}px`,
            "box-sizing: border-box",
            "border: 4px solid #ff2d55",
            "background: rgba(255, 45, 85, 0.16)",
            "box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.08), 0 0 18px rgba(255, 45, 85, 0.75)",
            "border-radius: 6px",
            "pointer-events: none",
            "z-index: 2147483647",
        ].join(";");
        document.documentElement.appendChild(overlay);
        return {
            text: `Highlighted ${describeElement(element)}`,
            highlighted: describeElement(element),
            bounds: rectObject(rect),
            dialogs: drainDialogs(),
        };
    }
    function clearHighlights() {
        document.querySelectorAll("[data-pire-browser-highlight='true']").forEach((node) => node.remove());
    }
    function annotateScreenshot(fullPage = false) {
        clearScreenshotAnnotations();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const metrics = screenshotFullMetrics();
        const scrollX = window.scrollX || 0;
        const scrollY = window.scrollY || 0;
        const items = candidateElements(document)
            .filter((element) => !element.closest?.("[data-pire-browser-screenshot-annotation='true']"))
            .map((element) => ({ element, snapshot: toSnapshot(element) }))
            .filter(({ snapshot }) => isAnnotatableRole(snapshot.role))
            .filter(({ snapshot }) => snapshot.visible && snapshot.bounds.width > 2 && snapshot.bounds.height > 2)
            .filter(({ snapshot }) => fullPage || rectIntersectsViewport(snapshot.bounds, viewportWidth, viewportHeight))
            .sort((left, right) => {
            const leftY = fullPage ? left.snapshot.bounds.y + scrollY : Math.max(0, left.snapshot.bounds.y);
            const rightY = fullPage ? right.snapshot.bounds.y + scrollY : Math.max(0, right.snapshot.bounds.y);
            const y = leftY - rightY;
            if (y)
                return y;
            const leftX = fullPage ? left.snapshot.bounds.x + scrollX : Math.max(0, left.snapshot.bounds.x);
            const rightX = fullPage ? right.snapshot.bounds.x + scrollX : Math.max(0, right.snapshot.bounds.x);
            return leftX - rightX;
        })
            .slice(0, fullPage ? 120 : 80);
        const root = document.documentElement || document.body;
        const container = document.createElement("div");
        container.setAttribute("data-pire-browser-screenshot-annotation", "true");
        container.setAttribute("aria-hidden", "true");
        Object.assign(container.style, {
            position: fullPage ? "absolute" : "fixed",
            left: "0",
            top: "0",
            width: fullPage ? `${metrics.documentWidth}px` : "100vw",
            height: fullPage ? `${metrics.documentHeight}px` : "100vh",
            pointerEvents: "none",
            zIndex: "2147483647",
        });
        const annotations = items.map(({ snapshot }, index) => {
            const label = String(index + 1);
            const bounds = fullPage
                ? {
                    x: Math.max(0, snapshot.bounds.x + scrollX),
                    y: Math.max(0, snapshot.bounds.y + scrollY),
                    width: snapshot.bounds.width,
                    height: snapshot.bounds.height,
                }
                : clipBoundsToViewport(snapshot.bounds, viewportWidth, viewportHeight);
            const box = document.createElement("div");
            box.setAttribute("data-pire-browser-screenshot-annotation", "true");
            Object.assign(box.style, {
                position: "absolute",
                left: `${bounds.x}px`,
                top: `${bounds.y}px`,
                width: `${Math.max(1, bounds.width)}px`,
                height: `${Math.max(1, bounds.height)}px`,
                border: "2px solid #ff2d55",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.9), 0 1px 4px rgba(0,0,0,0.35)",
                boxSizing: "border-box",
                borderRadius: "4px",
            });
            const badge = document.createElement("div");
            badge.textContent = label;
            Object.assign(badge.style, {
                position: "absolute",
                left: "-2px",
                top: "-2px",
                minWidth: "18px",
                height: "18px",
                padding: "0 4px",
                borderRadius: "9px",
                background: "#ff2d55",
                color: "#ffffff",
                font: "700 12px/18px Arial, sans-serif",
                textAlign: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
            });
            box.appendChild(badge);
            container.appendChild(box);
            return {
                label,
                role: snapshot.role,
                name: snapshot.name || snapshot.label || snapshot.placeholder || snapshot.text,
                locator: snapshot.locator,
                bounds: snapshot.bounds,
            };
        });
        root.appendChild(container);
        return {
            text: `Annotated ${annotations.length} ${fullPage ? "document" : "visible"} element(s)`,
            annotated: annotations.length,
            annotations,
            warnings: annotations.length ? [] : ["No visible elements were available to annotate."],
            dialogs: drainDialogs(),
        };
    }
    function clearScreenshotAnnotationsResult() {
        const cleared = clearScreenshotAnnotations();
        return { text: `Cleared ${cleared} screenshot annotation overlay(s)`, cleared, dialogs: drainDialogs() };
    }
    function screenshotFullMetrics() {
        const doc = document.documentElement;
        const body = document.body;
        const viewportWidth = Math.max(1, window.innerWidth || doc.clientWidth || 1);
        const viewportHeight = Math.max(1, window.innerHeight || doc.clientHeight || 1);
        const documentWidth = Math.max(viewportWidth, doc.scrollWidth, body?.scrollWidth ?? 0, doc.offsetWidth, body?.offsetWidth ?? 0);
        const documentHeight = Math.max(viewportHeight, doc.scrollHeight, body?.scrollHeight ?? 0, doc.offsetHeight, body?.offsetHeight ?? 0);
        return {
            text: `${documentWidth}x${documentHeight}`,
            viewportWidth,
            viewportHeight,
            documentWidth,
            documentHeight,
            maxScrollX: Math.max(0, documentWidth - viewportWidth),
            maxScrollY: Math.max(0, documentHeight - viewportHeight),
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            devicePixelRatio: window.devicePixelRatio || 1,
            dialogs: drainDialogs(),
        };
    }
    async function screenshotScroll(x, y) {
        window.scrollTo(Math.max(0, x), Math.max(0, y));
        await nextAnimationFrame();
        await nextAnimationFrame();
        return {
            text: `Scrolled to ${Math.round(window.scrollX)},${Math.round(window.scrollY)}`,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            dialogs: drainDialogs(),
        };
    }
    function nextAnimationFrame() {
        return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    function clearScreenshotAnnotations() {
        const nodes = Array.from(document.querySelectorAll("[data-pire-browser-screenshot-annotation='true']"));
        nodes.forEach((node) => node.remove());
        return nodes.length;
    }
    function isAnnotatableRole(role) {
        return ["button", "link", "textbox", "checkbox", "radio", "combobox", "slider", "iframe"].includes(role);
    }
    function rectIntersectsViewport(bounds, viewportWidth, viewportHeight) {
        return bounds.x + bounds.width > 0 && bounds.y + bounds.height > 0 && bounds.x < viewportWidth && bounds.y < viewportHeight;
    }
    function clipBoundsToViewport(bounds, viewportWidth, viewportHeight) {
        const x = Math.max(0, bounds.x);
        const y = Math.max(0, bounds.y);
        const right = Math.min(viewportWidth, bounds.x + bounds.width);
        const bottom = Math.min(viewportHeight, bounds.y + bounds.height);
        return {
            x,
            y,
            width: Math.max(1, right - x),
            height: Math.max(1, bottom - y),
        };
    }
    function fillLocator(locator, text) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        element.scrollIntoView({ block: "center", inline: "center" });
        element.focus({ preventScroll: true });
        if (element instanceof HTMLInputElement) {
            if (element.type === "checkbox" || element.type === "radio") {
                const checked = ["true", "1", "yes", "on", "checked"].includes(text.toLowerCase());
                element.checked = checked;
                fireInputEvents(element);
            }
            else {
                setNativeValue(element, text);
                fireInputEvents(element);
            }
        }
        else if (element instanceof HTMLTextAreaElement) {
            setNativeValue(element, text);
            fireInputEvents(element);
        }
        else if (element instanceof HTMLSelectElement) {
            element.value = text;
            fireInputEvents(element);
        }
        else if (element.isContentEditable) {
            element.textContent = text;
            fireInputEvents(element);
        }
        else {
            return {
                error: {
                    code: "unsupported_element",
                    message: `Cannot fill ${describeElement(element)}`,
                },
                dialogs: drainDialogs(),
            };
        }
        return {
            text: `Filled ${describeElement(element)}`,
            dialogs: drainDialogs(),
        };
    }
    function uploadFilesLocator(locator, rawFiles) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const input = fileInputForUploadTarget(resolved.element);
        if ("error" in input)
            return input;
        if (input.element.disabled) {
            return { error: { code: "not_enabled", message: `${describeElement(input.element)} is disabled` }, dialogs: drainDialogs() };
        }
        const parsed = parseUploadFiles(rawFiles);
        if ("error" in parsed)
            return parsed;
        if (parsed.files.length > 1 && !input.element.multiple) {
            return {
                error: {
                    code: "InvalidArgumentError",
                    message: `${describeElement(input.element)} does not accept multiple files`,
                },
                dialogs: drainDialogs(),
            };
        }
        const transfer = new DataTransfer();
        for (const file of parsed.files) {
            transfer.items.add(file.file);
        }
        try {
            input.element.files = transfer.files;
        }
        catch (error) {
            return {
                error: {
                    code: "InvalidArgumentError",
                    message: `Firefox did not allow assigning files to ${describeElement(input.element)}: ${error instanceof Error ? error.message : String(error)}`,
                },
                dialogs: drainDialogs(),
            };
        }
        input.element.dispatchEvent(new Event("input", { bubbles: true }));
        input.element.dispatchEvent(new Event("change", { bubbles: true }));
        const totalBytes = parsed.files.reduce((sum, item) => sum + item.size, 0);
        const files = parsed.files.map((item) => ({ name: item.name, size: item.size, type: item.type }));
        return {
            text: `Uploaded ${files.length} file(s) to ${describeElement(input.element)} (${totalBytes} byte(s))`,
            target: describeElement(input.element),
            fileCount: files.length,
            files,
            totalBytes,
            dialogs: drainDialogs(),
        };
    }
    function fileInputForUploadTarget(element) {
        if (element instanceof HTMLInputElement && element.type === "file") {
            return { element };
        }
        if (element instanceof HTMLLabelElement && element.control instanceof HTMLInputElement && element.control.type === "file") {
            return { element: element.control };
        }
        if (element instanceof HTMLElement) {
            const nested = element.querySelector("input[type=file]");
            if (nested instanceof HTMLInputElement)
                return { element: nested };
        }
        return {
            error: {
                code: "InvalidArgumentError",
                message: `Upload target must be an input[type=file] or associated label, got ${describeElement(element)}`,
            },
            dialogs: drainDialogs(),
        };
    }
    function parseUploadFiles(rawFiles) {
        if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
            return { error: { code: "InvalidArgumentError", message: "upload requires file payloads" }, dialogs: drainDialogs() };
        }
        const files = [];
        for (const raw of rawFiles) {
            if (!raw || typeof raw !== "object") {
                return { error: { code: "InvalidArgumentError", message: "upload file payload is malformed" }, dialogs: drainDialogs() };
            }
            const item = raw;
            const name = typeof item.name === "string" ? item.name : "";
            const type = typeof item.mimeType === "string" ? item.mimeType : "application/octet-stream";
            const hasBytesBase64 = typeof item.bytesBase64 === "string";
            const bytesBase64 = hasBytesBase64 ? item.bytesBase64 : "";
            const expectedSize = typeof item.size === "number" ? item.size : -1;
            if (!name || !hasBytesBase64 || expectedSize < 0) {
                return { error: { code: "InvalidArgumentError", message: "upload file payload is missing name, bytes, or size" }, dialogs: drainDialogs() };
            }
            const bytes = decodeBase64Bytes(bytesBase64);
            if ("error" in bytes)
                return bytes;
            if (bytes.bytes.byteLength !== expectedSize) {
                return { error: { code: "InvalidArgumentError", message: `upload file ${name} size did not match payload metadata` }, dialogs: drainDialogs() };
            }
            const arrayBuffer = new ArrayBuffer(bytes.bytes.byteLength);
            new Uint8Array(arrayBuffer).set(bytes.bytes);
            files.push({
                file: new File([arrayBuffer], name, { type }),
                name,
                size: expectedSize,
                type,
            });
        }
        return { files };
    }
    function decodeBase64Bytes(value) {
        try {
            const binary = atob(value);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index++) {
                bytes[index] = binary.charCodeAt(index);
            }
            return { bytes };
        }
        catch (error) {
            return {
                error: {
                    code: "InvalidArgumentError",
                    message: `upload file payload is not valid base64: ${error instanceof Error ? error.message : String(error)}`,
                },
                dialogs: drainDialogs(),
            };
        }
    }
    function typeLocator(locator, text) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        element.scrollIntoView({ block: "center", inline: "center" });
        element.focus({ preventScroll: true });
        for (const char of text) {
            dispatchKey(element, char, "keydown");
            dispatchKey(element, char, "keypress");
            insertText(element, char);
            dispatchKey(element, char, "keyup");
        }
        return { text: `Typed into ${describeElement(element)}`, dialogs: drainDialogs() };
    }
    function focusLocator(locator) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        element.scrollIntoView({ block: "center", inline: "center" });
        element.focus({ preventScroll: true });
        return { text: `Focused ${describeElement(element)}`, dialogs: drainDialogs() };
    }
    function hoverLocator(locator) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        element.scrollIntoView({ block: "center", inline: "center" });
        const rect = element.getBoundingClientRect();
        const clientX = Math.round(rect.left + rect.width / 2);
        const clientY = Math.round(rect.top + rect.height / 2);
        for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter", "mousemove"]) {
            element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }));
        }
        return {
            text: `Hovered ${describeElement(element)}`,
            warnings: [bestEffortWarning("hover", "Firefox WebExtensions can dispatch hover events but cannot force native :hover state.")],
            dialogs: drainDialogs(),
        };
    }
    function dragLocator(sourceLocator, targetLocator) {
        const source = resolveOne(sourceLocator);
        if ("error" in source)
            return source;
        const target = resolveOne(targetLocator);
        if ("error" in target)
            return target;
        const sourceElement = source.element;
        const targetElement = target.element;
        sourceElement.scrollIntoView({ block: "center", inline: "center" });
        targetElement.scrollIntoView({ block: "center", inline: "center" });
        const sourcePoint = elementCenter(sourceElement);
        const targetPoint = elementCenter(targetElement);
        const dataTransfer = new DataTransfer();
        dispatchPointerMouseAt(sourceElement, "pointerover", sourcePoint);
        dispatchPointerMouseAt(sourceElement, "mouseover", sourcePoint);
        dispatchPointerMouseAt(sourceElement, "pointerdown", sourcePoint);
        dispatchPointerMouseAt(sourceElement, "mousedown", sourcePoint);
        dispatchDrag(sourceElement, "dragstart", sourcePoint, dataTransfer);
        dispatchPointerMouseAt(targetElement, "pointermove", targetPoint);
        dispatchPointerMouseAt(targetElement, "mousemove", targetPoint);
        dispatchDrag(targetElement, "dragenter", targetPoint, dataTransfer);
        dispatchDrag(targetElement, "dragover", targetPoint, dataTransfer);
        dispatchDrag(targetElement, "drop", targetPoint, dataTransfer);
        dispatchDrag(sourceElement, "dragend", targetPoint, dataTransfer);
        dispatchPointerMouseAt(targetElement, "pointerup", targetPoint);
        dispatchPointerMouseAt(targetElement, "mouseup", targetPoint);
        return {
            text: `Dragged ${describeElement(sourceElement)} to ${describeElement(targetElement)}`,
            source: describeElement(sourceElement),
            target: describeElement(targetElement),
            dialogs: drainDialogs(),
        };
    }
    function elementCenter(element) {
        const rect = element.getBoundingClientRect();
        return {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
        };
    }
    function dispatchPointerMouseAt(target, type, point) {
        const eventInit = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: point.x,
            clientY: point.y,
            button: 0,
            buttons: type.endsWith("down") ? 1 : 0,
        };
        const EventConstructor = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
        target.dispatchEvent(new EventConstructor(type, eventInit));
    }
    function dispatchDrag(target, type, point, dataTransfer) {
        let event;
        if (typeof DragEvent !== "undefined") {
            event = new DragEvent(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: point.x,
                clientY: point.y,
                dataTransfer,
            });
        }
        else {
            event = new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: point.x,
                clientY: point.y,
            });
            Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
        }
        target.dispatchEvent(event);
    }
    function selectLocator(locator, value) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        if (!(element instanceof HTMLSelectElement)) {
            return { error: { code: "unsupported_element", message: `Cannot select ${describeElement(element)}` }, dialogs: drainDialogs() };
        }
        const option = Array.from(element.options).find((item) => item.value === value || clean(item.textContent ?? "") === value);
        if (!option)
            return { error: { code: "not_found", message: `No option matched ${value}` }, dialogs: drainDialogs() };
        element.value = option.value;
        fireInputEvents(element);
        return { text: `Selected ${value} in ${describeElement(element)}`, dialogs: drainDialogs() };
    }
    function checkLocator(locator, checked) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        if (!(element instanceof HTMLInputElement) || !["checkbox", "radio"].includes(element.type)) {
            return { error: { code: "unsupported_element", message: `Cannot ${checked ? "check" : "uncheck"} ${describeElement(element)}` }, dialogs: drainDialogs() };
        }
        element.checked = checked;
        fireInputEvents(element);
        return { text: `${checked ? "Checked" : "Unchecked"} ${describeElement(element)}`, dialogs: drainDialogs() };
    }
    function scrollIntoViewLocator(locator) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        element.scrollIntoView({ block: "center", inline: "center" });
        return { text: `Scrolled ${describeElement(element)} into view`, dialogs: drainDialogs() };
    }
    function getLocator(locator, property, attribute) {
        const resolved = resolveOne(locator);
        if ("error" in resolved)
            return resolved;
        const element = resolved.element;
        const value = property === "html"
            ? element.innerHTML
            : property === "value"
                ? elementValue(element)
                : property === "attr"
                    ? attr(element, String(attribute ?? ""))
                    : property === "box"
                        ? rectObject(element.getBoundingClientRect())
                        : property === "styles"
                            ? computedStyles(element)
                            : clean(element.textContent ?? "");
        return { text: typeof value === "string" ? value : JSON.stringify(value), value, dialogs: drainDialogs() };
    }
    function isLocator(locator, state) {
        const matches = resolve(locator);
        const element = matches[0];
        const value = state === "visible"
            ? Boolean(element && isVisible(element))
            : state === "enabled"
                ? Boolean(element && !isDisabled(element))
                : state === "checked"
                    ? Boolean(element instanceof HTMLInputElement && element.checked)
                    : false;
        return { text: String(value), value, dialogs: drainDialogs() };
    }
    function pressKey(key) {
        const target = (document.activeElement || document.body);
        const parsed = parseKeyChord(key);
        const normalized = parsed.key.length === 1 ? parsed.key : keyName(parsed.key);
        const keydownAccepted = dispatchKey(target, normalized, "keydown", parsed);
        if (normalized === "Enter" && target instanceof HTMLInputElement && !parsed.ctrlKey && !parsed.metaKey && !parsed.altKey) {
            const keypressAccepted = dispatchKey(target, normalized, "keypress", parsed);
            submitFormForEnter(target, keydownAccepted || keypressAccepted);
        }
        if (normalized.length === 1 && isTextLike(target) && !parsed.ctrlKey && !parsed.metaKey && !parsed.altKey) {
            insertText(target, normalized);
        }
        dispatchKey(target, normalized, "keyup", parsed);
        return {
            text: `Pressed ${normalized}`,
            dialogs: drainDialogs(),
        };
    }
    function keyEdge(action, key) {
        if (action !== "keydown" && action !== "keyup") {
            return { error: { code: "InvalidArgumentError", message: "key_edge requires keydown or keyup" } };
        }
        const target = (document.activeElement || document.body);
        const parsed = parseKeyChord(key);
        const normalized = parsed.key.length === 1 ? parsed.key : keyName(parsed.key);
        dispatchKey(target, normalized, action, parsed);
        return {
            text: action === "keydown" ? `Key down ${normalized}` : `Key up ${normalized}`,
            dialogs: drainDialogs(),
        };
    }
    function typeFocused(text, keyEvents) {
        const target = (document.activeElement || document.body);
        for (const char of text) {
            if (keyEvents)
                dispatchKey(target, char, "keydown");
            if (keyEvents)
                dispatchKey(target, char, "keypress");
            insertText(target, char);
            if (keyEvents)
                dispatchKey(target, char, "keyup");
        }
        return { text: keyEvents ? "Typed at current focus" : "Inserted text at current focus", dialogs: drainDialogs() };
    }
    function clipboardSelection() {
        const text = selectedTextFromEditable(document.activeElement) ?? selectedTextFromDocument();
        return {
            handled: true,
            focused: document.hasFocus(),
            text,
            length: text.length,
            dialogs: drainDialogs(),
        };
    }
    function clipboardPaste(text) {
        const target = document.activeElement;
        if (!target || !isEditableTextTarget(target)) {
            return {
                handled: true,
                focused: document.hasFocus(),
                pasted: false,
                reason: "No focused editable element",
                dialogs: drainDialogs(),
            };
        }
        insertText(target, text);
        return {
            handled: true,
            focused: document.hasFocus(),
            pasted: true,
            text: `Pasted ${text.length} character(s)`,
            length: text.length,
            dialogs: drainDialogs(),
        };
    }
    function stateExportStorage() {
        return {
            localStorage: storageSnapshot(localStorage),
            sessionStorage: storageSnapshot(sessionStorage),
            dialogs: drainDialogs(),
        };
    }
    function stateImportStorage(localValues, sessionValues) {
        const localMap = stringRecord(localValues);
        const sessionMap = stringRecord(sessionValues);
        localStorage.clear();
        for (const [key, value] of Object.entries(localMap)) {
            localStorage.setItem(key, value);
        }
        sessionStorage.clear();
        for (const [key, value] of Object.entries(sessionMap)) {
            sessionStorage.setItem(key, value);
        }
        return {
            text: "Imported active-origin storage",
            localStorageKeys: Object.keys(localMap).length,
            sessionStorageKeys: Object.keys(sessionMap).length,
            dialogs: drainDialogs(),
        };
    }
    function storageSnapshot(storage) {
        const out = {};
        for (let index = 0; index < storage.length; index++) {
            const key = storage.key(index);
            if (key !== null)
                out[key] = storage.getItem(key) ?? "";
        }
        return out;
    }
    function stringRecord(value) {
        if (!value || typeof value !== "object")
            return {};
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === "string" ? item : String(item ?? "")]));
    }
    function scrollPage(direction, pixels, selector) {
        const scroller = selector ? document.querySelector(String(selector)) ?? findScrollContainer() : window;
        const isWindow = scroller === window;
        const element = scroller;
        const horizontal = direction === "left" || direction === "right";
        const before = isWindow ? (horizontal ? window.scrollX : window.scrollY) : (horizontal ? element.scrollLeft : element.scrollTop);
        const delta = direction === "up" || direction === "left" ? -pixels : pixels;
        if (isWindow) {
            window.scrollBy({ top: horizontal ? 0 : delta, left: horizontal ? delta : 0, behavior: "instant" });
        }
        else {
            element.scrollBy({ top: horizontal ? 0 : delta, left: horizontal ? delta : 0, behavior: "instant" });
        }
        const after = isWindow ? (horizontal ? window.scrollX : window.scrollY) : (horizontal ? element.scrollLeft : element.scrollTop);
        return {
            text: `Scrolled ${direction} ${pixels}px (${Math.round(before)} -> ${Math.round(after)})`,
            before,
            after,
            dialogs: drainDialogs(),
        };
    }
    function mouseEvent(action, x, y, button, dx, dy) {
        if (Number.isFinite(x))
            mouseX = Math.round(x);
        if (Number.isFinite(y))
            mouseY = Math.round(y);
        mouseX = clamp(mouseX, 0, Math.max(0, window.innerWidth - 1));
        mouseY = clamp(mouseY, 0, Math.max(0, window.innerHeight - 1));
        const target = mouseTarget(mouseX, mouseY);
        if (action === "move") {
            dispatchPointerMouse(target, "pointermove", button);
            dispatchPointerMouse(target, "mousemove", button);
            return { text: `Moved mouse to ${mouseX},${mouseY}`, x: mouseX, y: mouseY, dialogs: drainDialogs() };
        }
        if (action === "down") {
            dispatchPointerMouse(target, "pointerdown", button);
            dispatchPointerMouse(target, "mousedown", button);
            return { text: `Mouse down at ${mouseX},${mouseY}`, x: mouseX, y: mouseY, button, dialogs: drainDialogs() };
        }
        if (action === "up") {
            dispatchPointerMouse(target, "pointerup", button);
            dispatchPointerMouse(target, "mouseup", button);
            return { text: `Mouse up at ${mouseX},${mouseY}`, x: mouseX, y: mouseY, button, dialogs: drainDialogs() };
        }
        if (action === "wheel") {
            const event = new WheelEvent("wheel", {
                bubbles: true,
                cancelable: true,
                clientX: mouseX,
                clientY: mouseY,
                deltaX: Number.isFinite(dx) ? dx : 0,
                deltaY: Number.isFinite(dy) ? dy : 0,
            });
            const accepted = target.dispatchEvent(event);
            if (accepted)
                window.scrollBy({ left: Number.isFinite(dx) ? dx : 0, top: Number.isFinite(dy) ? dy : 0, behavior: "instant" });
            return { text: `Mouse wheel ${dy},${dx} at ${mouseX},${mouseY}`, x: mouseX, y: mouseY, dx, dy, dialogs: drainDialogs() };
        }
        return { error: { code: "invalid_args", message: "Unsupported mouse action" }, dialogs: drainDialogs() };
    }
    function dispatchPointerMouse(target, type, button) {
        const eventInit = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: mouseX,
            clientY: mouseY,
            button,
            buttons: type.endsWith("down") ? 1 << button : 0,
        };
        const EventConstructor = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
        target.dispatchEvent(new EventConstructor(type, eventInit));
    }
    function mouseTarget(x, y) {
        return document.elementFromPoint(x, y) ?? document.body ?? document.documentElement;
    }
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    function findScrollContainer() {
        const preferred = Array.from(document.querySelectorAll('[role="list"][aria-label^="Messages in"], [data-list-id="chat-messages"]')).find(isScrollable);
        if (preferred)
            return preferred;
        const visibleScrollable = Array.from(document.querySelectorAll("*"))
            .filter((element) => isVisible(element) && isScrollable(element))
            .sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
        return visibleScrollable[0] ?? window;
    }
    function isScrollable(element) {
        const style = getComputedStyle(element);
        return (element.scrollHeight > element.clientHeight + 8 &&
            ["auto", "scroll", "overlay"].includes(style.overflowY));
    }
    function waitForSelector(selector, timeout, state = "visible") {
        const satisfied = () => {
            const element = document.querySelector(selector);
            if (state === "hidden")
                return !element || !isVisible(element);
            return Boolean(element && isVisible(element));
        };
        if (satisfied()) {
            return Promise.resolve({ text: state === "hidden" ? `Selector hidden: ${selector}` : `Selector found: ${selector}`, dialogs: drainDialogs() });
        }
        return new Promise((resolve) => {
            let settled = false;
            let observer;
            let timer;
            const settle = (result) => {
                if (settled)
                    return;
                settled = true;
                if (timer !== undefined)
                    window.clearTimeout(timer);
                observer?.disconnect();
                resolve(result);
            };
            observer = new MutationObserver(() => {
                if (satisfied()) {
                    settle({ text: state === "hidden" ? `Selector hidden: ${selector}` : `Selector found: ${selector}`, dialogs: drainDialogs() });
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
            timer = window.setTimeout(() => {
                settle({
                    error: { code: "timeout", message: `Timed out waiting for selector: ${selector}` },
                    dialogs: drainDialogs(),
                });
            }, timeout);
        });
    }
    function waitForLocator(locator, timeout, state = "visible") {
        const satisfied = () => {
            const matches = resolve(locator).filter(isVisible);
            if (state === "hidden")
                return matches.length === 0;
            return matches.length > 0;
        };
        if (satisfied()) {
            return Promise.resolve({ text: state === "hidden" ? "Locator hidden" : "Locator found", dialogs: drainDialogs() });
        }
        return new Promise((resolve) => {
            let settled = false;
            let observer;
            let timer;
            const settle = (result) => {
                if (settled)
                    return;
                settled = true;
                if (timer !== undefined)
                    window.clearTimeout(timer);
                observer?.disconnect();
                resolve(result);
            };
            observer = new MutationObserver(() => {
                if (satisfied()) {
                    settle({ text: state === "hidden" ? "Locator hidden" : "Locator found", dialogs: drainDialogs() });
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
            timer = window.setTimeout(() => {
                settle({
                    error: { code: "timeout", message: "Timed out waiting for locator" },
                    dialogs: drainDialogs(),
                });
            }, timeout);
        });
    }
    function waitForText(text, timeout, hidden) {
        const satisfied = () => clean(document.body?.innerText ?? "").includes(text) !== hidden;
        if (satisfied())
            return Promise.resolve({ text: hidden ? `Text disappeared: ${text}` : `Text found: ${text}`, dialogs: drainDialogs() });
        return new Promise((resolve) => {
            let settled = false;
            let observer;
            let timer;
            const settle = (result) => {
                if (settled)
                    return;
                settled = true;
                if (timer !== undefined)
                    window.clearTimeout(timer);
                observer?.disconnect();
                resolve(result);
            };
            observer = new MutationObserver(() => {
                if (satisfied()) {
                    settle({ text: hidden ? `Text disappeared: ${text}` : `Text found: ${text}`, dialogs: drainDialogs() });
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
            timer = window.setTimeout(() => {
                settle({ error: { code: "timeout", message: `Timed out waiting for text: ${text}` }, dialogs: drainDialogs() });
            }, timeout);
        });
    }
    function waitForFunction(expression, timeout) {
        const first = evaluatePageExpression(expression);
        if (first.ok && first.truthy) {
            return Promise.resolve({ text: "Function condition satisfied", value: first.value, dialogs: drainDialogs() });
        }
        return new Promise((resolve) => {
            let settled = false;
            const started = Date.now();
            let lastError = first.ok ? "" : first.message;
            let timer;
            const settle = (result) => {
                if (settled)
                    return;
                settled = true;
                if (timer !== undefined)
                    window.clearInterval(timer);
                resolve(result);
            };
            timer = window.setInterval(() => {
                const result = evaluatePageExpression(expression);
                if (result.ok && result.truthy) {
                    settle({ text: "Function condition satisfied", value: result.value, dialogs: drainDialogs() });
                    return;
                }
                if (!result.ok)
                    lastError = result.message;
                if (Date.now() - started > timeout) {
                    const suffix = lastError ? ` (last error: ${lastError})` : "";
                    settle({ error: { code: "timeout", message: `Timed out waiting for function condition${suffix}` }, dialogs: drainDialogs() });
                }
            }, 100);
        });
    }
    function resolveOne(locator) {
        const matches = resolve(locator);
        if (matches.length === 0) {
            return {
                error: { code: "ref_stale", message: "No unique element matches this locator" },
                dialogs: drainDialogs(),
            };
        }
        if (matches.length > 1) {
            return {
                error: { code: "ambiguous_locator", message: `${matches.length} elements match this locator` },
                dialogs: drainDialogs(),
            };
        }
        return { element: matches[0] };
    }
    function resolve(locator) {
        if (locator.kind === "handle") {
            const element = elementsByHandle.get(locator.handle);
            if (element?.isConnected && isVisible(element))
                return [element];
            return resolve(locator.fallback);
        }
        if (locator.kind === "css") {
            return indexed(Array.from(document.querySelectorAll(locator.selector)).filter(isVisible), locator.index);
        }
        if (locator.kind === "xpath") {
            return indexed(resolveXPath(locator.expression).filter(isVisible), locator.index);
        }
        const all = candidateElements().filter((el) => toSnapshot(el).visible);
        const matches = all.filter((element) => matchesLocator(element, locator));
        return indexed(matches, locator.index ?? 0);
    }
    function matchesLocator(element, locator) {
        const role = inferRole(element);
        const name = accessibleName(element);
        const text = clean(element.textContent ?? "");
        const label = labelText(element);
        const placeholder = attr(element, "placeholder");
        const testid = attr(element, "data-testid") || attr(element, "data-test");
        const alt = attr(element, "alt");
        const title = attr(element, "title");
        const textMatches = (haystack, needle, exact) => {
            const normalizedHaystack = clean(haystack).toLowerCase();
            const normalizedNeedle = clean(needle).toLowerCase();
            return exact ? normalizedHaystack === normalizedNeedle : normalizedHaystack.includes(normalizedNeedle);
        };
        switch (locator.kind) {
            case "role":
                return role === locator.role && (!locator.name || textMatches(name, locator.name, locator.exact));
            case "label":
                return textMatches(label || name, locator.text, locator.exact);
            case "text":
                return textMatches(text || name, locator.text, locator.exact);
            case "placeholder":
                return textMatches(placeholder, locator.text, locator.exact);
            case "testid":
                return testid === locator.value;
            case "alt":
                return textMatches(alt, locator.text, locator.exact);
            case "title":
                return textMatches(title, locator.text, locator.exact);
            case "css":
                return safeMatches(element, locator.selector);
            case "xpath":
                return resolveXPath(locator.expression).includes(element);
            case "handle":
                return elementsByHandle.get(locator.handle) === element || matchesLocator(element, locator.fallback);
        }
    }
    function candidateElements(root = document, includeCursorInteractive = false) {
        const selector = [
            "a[href]",
            "button",
            "input",
            "textarea",
            "select",
            "summary",
            "[role]",
            "[contenteditable='true']",
            "[tabindex]:not([tabindex='-1'])",
            "[data-testid]",
            "[data-test]",
            "[aria-label]",
            "img[alt]",
            "iframe",
            "frame",
            "[title]",
        ].join(",");
        const roots = [root];
        const out = [];
        for (const root of roots) {
            if (root instanceof Element && safeMatches(root, selector))
                out.push(root);
            out.push(...Array.from(root.querySelectorAll(selector)));
            if (includeCursorInteractive) {
                out.push(...cursorInteractiveElements(root));
            }
            for (const element of Array.from(root.querySelectorAll("*"))) {
                const shadow = element.shadowRoot;
                if (shadow) {
                    out.push(...Array.from(shadow.querySelectorAll(selector)));
                    if (includeCursorInteractive)
                        out.push(...cursorInteractiveElements(shadow));
                }
            }
        }
        return unique(out);
    }
    function cursorInteractiveElements(root) {
        const candidates = [];
        if (root instanceof Element && isCursorInteractiveElement(root))
            candidates.push(root);
        for (const element of Array.from(root.querySelectorAll("*"))) {
            if (isCursorInteractiveElement(element))
                candidates.push(element);
        }
        return candidates;
    }
    function isCursorInteractiveElement(element) {
        if (!(element instanceof HTMLElement))
            return false;
        if (!isVisible(element))
            return false;
        const explicitHandler = hasInlineClickHandler(element);
        const cursorPointer = getComputedStyle(element).cursor === "pointer";
        if (!explicitHandler && !cursorPointer)
            return false;
        if (!explicitHandler && cursorPointer && hasCursorInteractiveAncestor(element))
            return false;
        const text = clean(element.textContent ?? "");
        return Boolean(accessibleName(element) || text || attr(element, "data-testid") || attr(element, "data-test") || attr(element, "title"));
    }
    function hasInlineClickHandler(element) {
        if (attr(element, "onclick"))
            return true;
        try {
            return typeof pageObject(element).onclick === "function";
        }
        catch {
            return false;
        }
    }
    function hasCursorInteractiveAncestor(element) {
        let parent = element.parentElement;
        while (parent) {
            if (hasInlineClickHandler(parent))
                return true;
            if (parent instanceof HTMLElement && getComputedStyle(parent).cursor === "pointer")
                return true;
            parent = parent.parentElement;
        }
        return false;
    }
    function toSnapshot(element, root = document, includeCursorInteractive = false) {
        const rect = element.getBoundingClientRect();
        const role = inferRole(element);
        const name = accessibleName(element);
        const text = clean(element.textContent ?? "");
        const label = labelText(element);
        const placeholder = attr(element, "placeholder");
        const testid = attr(element, "data-testid") || attr(element, "data-test");
        const href = hrefFor(element);
        return {
            role,
            name,
            text,
            label,
            placeholder,
            testid,
            href,
            frameUrl: isFrameElement(element) ? currentFrameUrlFor(element) : undefined,
            depth: elementDepthWithinRoot(element, root),
            disabled: isDisabled(element),
            visible: isVisible(element),
            cursorInteractive: includeCursorInteractive && isCursorInteractiveElement(element) ? true : undefined,
            bounds: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
            },
            locator: locatorFor(element, role, name, label, text, placeholder, testid),
        };
    }
    function hrefFor(element) {
        if (isFrameElement(element))
            return frameSourceFor(element);
        if (element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement) {
            return element.href || attr(element, "href") || undefined;
        }
        return attr(element, "href") || undefined;
    }
    function linkHrefFor(element) {
        const link = element instanceof HTMLAnchorElement ? element : element.closest?.("a[href]");
        if (link instanceof HTMLAnchorElement)
            return link.href || attr(link, "href") || undefined;
        return hrefFor(element);
    }
    function isFrameElement(element) {
        const tag = element.tagName.toLowerCase();
        return tag === "iframe" || tag === "frame";
    }
    function frameSourceFor(element) {
        if (element instanceof HTMLIFrameElement)
            return element.src || attr(element, "src") || undefined;
        return attr(element, "src") || undefined;
    }
    function currentFrameUrlFor(element) {
        try {
            if (element instanceof HTMLIFrameElement)
                return element.contentWindow?.location.href || frameSourceFor(element);
        }
        catch {
            // Cross-origin frames can hide contentWindow.location; the static src is still useful for matching when available.
        }
        return frameSourceFor(element);
    }
    function locatorFor(element, role, name, label, text, placeholder, testid) {
        const fallback = fallbackLocatorFor(element, role, name, label, text, placeholder, testid);
        const handle = handleFor(element);
        return { kind: "handle", handle, fallback };
    }
    function fallbackLocatorFor(element, role, name, label, text, placeholder, testid) {
        const id = attr(element, "id");
        if (id) {
            const selector = `#${cssEscape(id)}`;
            return { kind: "css", selector, index: indexFor({ kind: "css", selector, index: 0 }, element) };
        }
        if (testid)
            return { kind: "testid", value: testid, index: indexFor({ kind: "testid", value: testid, index: 0 }, element) };
        if (role && name)
            return { kind: "role", role, name, index: indexFor({ kind: "role", role, name, index: 0 }, element) };
        if (label)
            return { kind: "label", text: label, index: indexFor({ kind: "label", text: label, index: 0 }, element) };
        if (placeholder)
            return { kind: "placeholder", text: placeholder, index: indexFor({ kind: "placeholder", text: placeholder, index: 0 }, element) };
        if (attr(element, "alt"))
            return { kind: "alt", text: attr(element, "alt"), index: indexFor({ kind: "alt", text: attr(element, "alt"), index: 0 }, element) };
        if (attr(element, "title"))
            return { kind: "title", text: attr(element, "title"), index: indexFor({ kind: "title", text: attr(element, "title"), index: 0 }, element) };
        if (role)
            return { kind: "role", role, index: indexFor({ kind: "role", role, index: 0 }, element) };
        return { kind: "text", text: text || name, index: indexFor({ kind: "text", text: text || name, index: 0 }, element) };
    }
    function indexFor(locator, target) {
        if (!target)
            return 0;
        const matches = candidateElements().filter((element) => matchesLocator(element, locator));
        return Math.max(0, matches.indexOf(target));
    }
    function inferRole(element) {
        const explicit = attr(element, "role");
        if (explicit)
            return explicit.split(/\s+/)[0];
        const tag = element.tagName.toLowerCase();
        if (tag === "a" && attr(element, "href"))
            return "link";
        if (tag === "button")
            return "button";
        if (tag === "iframe" || tag === "frame")
            return "iframe";
        if (tag === "textarea")
            return "textbox";
        if (tag === "select")
            return "combobox";
        if (tag === "label")
            return "label";
        if (tag === "summary")
            return "button";
        if (tag === "input") {
            const type = attr(element, "type").toLowerCase();
            if (["button", "submit", "reset"].includes(type))
                return "button";
            if (type === "checkbox")
                return "checkbox";
            if (type === "radio")
                return "radio";
            if (type === "range")
                return "slider";
            return "textbox";
        }
        if (element.isContentEditable)
            return "textbox";
        return "generic";
    }
    function accessibleName(element) {
        const aria = attr(element, "aria-label");
        if (aria)
            return aria;
        const labelledBy = attr(element, "aria-labelledby");
        if (labelledBy) {
            const value = labelledBy
                .split(/\s+/)
                .map((id) => clean(document.getElementById(id)?.textContent ?? ""))
                .filter(Boolean)
                .join(" ");
            if (value)
                return value;
        }
        const label = labelText(element);
        if (label)
            return label;
        if (element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type)) {
            return element.value || attr(element, "title");
        }
        return clean(attr(element, "alt") || attr(element, "title") || attr(element, "placeholder") || element.textContent || "");
    }
    function labelText(element) {
        if (!(element instanceof HTMLElement))
            return "";
        if (element.id) {
            const label = document.querySelector(`label[for="${cssEscape(element.id)}"]`);
            if (label)
                return clean(label.textContent ?? "");
        }
        const wrapping = element.closest("label");
        return clean(wrapping?.textContent ?? "");
    }
    function isVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }
    function isDisabled(element) {
        return Boolean(element.disabled || attr(element, "aria-disabled") === "true");
    }
    function attr(element, name) {
        return (element.getAttribute(name) ?? "").trim();
    }
    function clean(value) {
        return value.replace(/\s+/g, " ").trim();
    }
    function unique(items) {
        return Array.from(new Set(items));
    }
    function drainDialogs() {
        return dialogs.splice(0, dialogs.length);
    }
    function pushCapped(items, item, max) {
        items.push(item);
        if (items.length > max)
            items.splice(0, items.length - max);
    }
    function dialogStatus() {
        const drained = drainDialogs();
        const dialog = drained[drained.length - 1] ?? null;
        return {
            text: dialog ? `${dialog.type}: ${dialog.message}` : "No dialog recorded",
            active: Boolean(dialog),
            dialog,
            dialogs: drained,
        };
    }
    function configureNextDialog(action, text) {
        const normalizedAction = action === "accept" ? "accept" : "dismiss";
        const promptText = typeof text === "string" ? text : undefined;
        window.postMessage({
            source: "pire-browser",
            kind: "dialog_control",
            action: normalizedAction,
            text: promptText,
        }, "*");
        return {
            text: normalizedAction === "accept"
                ? `Next shimmed dialog will be accepted${promptText !== undefined ? ` with ${promptText}` : ""}`
                : "Next shimmed dialog will be dismissed",
            action: normalizedAction,
            promptText,
            dialogs: drainDialogs(),
        };
    }
    function debugLogs(kind, clear) {
        if (kind === "errors") {
            const errors = pageErrorRecords.slice();
            if (clear)
                pageErrorRecords.length = 0;
            return {
                text: clear ? `Cleared ${errors.length} page error(s)` : formatPageErrors(errors),
                errors,
                count: errors.length,
                cleared: clear,
                dialogs: drainDialogs(),
            };
        }
        const messages = consoleRecords.slice();
        if (clear)
            consoleRecords.length = 0;
        return {
            text: clear ? `Cleared ${messages.length} console message(s)` : formatConsoleRecords(messages),
            messages,
            count: messages.length,
            cleared: clear,
            dialogs: drainDialogs(),
        };
    }
    function formatConsoleRecords(records) {
        if (!records.length)
            return "No console messages recorded";
        return records.map((record) => `[${record.level}] ${record.text}`).join("\n");
    }
    function formatPageErrors(records) {
        if (!records.length)
            return "No page errors recorded";
        return records
            .map((record) => {
            const location = record.source
                ? ` (${record.source}${record.lineno ? `:${record.lineno}` : ""}${record.colno ? `:${record.colno}` : ""})`
                : "";
            return `[${record.type}] ${record.message}${location}`;
        })
            .join("\n");
    }
    function pageVitals() {
        const metrics = {
            ttfb: timingMetric("TTFB", navigationTimingValue("responseStart"), "ms", "PerformanceNavigationTiming", [800, 1800]),
            fcp: timingMetric("FCP", paintTimingValue("first-contentful-paint"), "ms", "PerformancePaintTiming", [1800, 3000]),
            lcp: timingMetric("LCP", largestContentfulPaintValue(), "ms", "LargestContentfulPaint", [2500, 4000]),
            cls: timingMetric("CLS", cumulativeLayoutShiftValue(), "score", "LayoutShift", [0.1, 0.25]),
            inp: timingMetric("INP", interactionToNextPaintValue(), "ms", "PerformanceEventTiming", [200, 500]),
        };
        const navigation = navigationSummary();
        const hydration = hydrationSummary();
        return {
            text: formatVitalsText(metrics, navigation, hydration),
            url: location.href,
            title: document.title,
            metrics,
            navigation,
            hydration,
            warnings: [
                {
                    code: "BEST_EFFORT_FIREFOX_GAP",
                    feature: "vitals",
                    message: "Web Vitals are collected from browser Performance APIs exposed to Firefox content scripts; some Chrome web-vitals signals may be unavailable.",
                },
            ],
            dialogs: drainDialogs(),
        };
    }
    function profilerSnapshot(startedAt) {
        const capturedAt = Date.now();
        const startMs = Number.isFinite(startedAt) && startedAt > 0 ? startedAt : 0;
        const entries = performanceEntriesSince(startMs);
        const cappedEntries = entries.slice(-MAX_PROFILER_TRACE_EVENTS);
        const traceEvents = [
            ...profilerMetadataEvents(),
            ...cappedEntries.map(profilerTraceEventForEntry),
        ];
        const summary = profilerSummary(entries, traceEvents.length, cappedEntries.length);
        return {
            text: `Collected ${traceEvents.length} Firefox Performance Timeline trace event${traceEvents.length === 1 ? "" : "s"} for ${location.href}`,
            url: location.href,
            title: document.title,
            startedAt: startMs,
            capturedAt,
            timeOrigin: performance.timeOrigin,
            entryCount: entries.length,
            capped: entries.length > cappedEntries.length,
            summary,
            traceEvents,
            warnings: [profilerBestEffortWarning()],
            dialogs: drainDialogs(),
        };
    }
    function performanceEntriesSince(startedAt) {
        return performance
            .getEntries()
            .filter((entry) => entryEndEpochMs(entry) >= startedAt)
            .sort((left, right) => left.startTime - right.startTime);
    }
    function profilerMetadataEvents() {
        return [
            {
                name: "process_name",
                cat: "__metadata",
                ph: "M",
                pid: 1,
                tid: 0,
                args: { name: "Firefox" },
            },
            {
                name: "thread_name",
                cat: "__metadata",
                ph: "M",
                pid: 1,
                tid: 1,
                args: { name: "Performance Timeline" },
            },
        ];
    }
    function profilerTraceEventForEntry(entry) {
        const startEpochMs = performance.timeOrigin + entry.startTime;
        return {
            name: profilerEntryName(entry),
            cat: `firefox.performance.${entry.entryType || "entry"}`,
            ph: "X",
            ts: Math.max(0, Math.round(startEpochMs * 1000)),
            dur: Math.max(0, Math.round((entry.duration || 0) * 1000)),
            pid: 1,
            tid: 1,
            args: profilerEntryArgs(entry),
        };
    }
    function profilerEntryName(entry) {
        const name = entry.name || entry.entryType || "PerformanceEntry";
        if (entry.entryType === "resource") {
            try {
                const url = new URL(name, location.href);
                return url.pathname.split("/").filter(Boolean).pop() || url.hostname || "resource";
            }
            catch {
                return "resource";
            }
        }
        return name;
    }
    function profilerEntryArgs(entry) {
        const record = entry;
        const args = {
            entryType: entry.entryType,
            name: entry.name,
            startTime: roundProfilerNumber(entry.startTime),
            duration: roundProfilerNumber(entry.duration),
        };
        for (const key of [
            "initiatorType",
            "nextHopProtocol",
            "renderBlockingStatus",
            "responseStatus",
            "transferSize",
            "encodedBodySize",
            "decodedBodySize",
            "workerStart",
            "redirectStart",
            "redirectEnd",
            "fetchStart",
            "domainLookupStart",
            "domainLookupEnd",
            "connectStart",
            "connectEnd",
            "requestStart",
            "responseStart",
            "responseEnd",
            "domInteractive",
            "domContentLoadedEventStart",
            "domContentLoadedEventEnd",
            "loadEventStart",
            "loadEventEnd",
            "value",
            "hadRecentInput",
            "interactionId",
        ]) {
            const value = record[key];
            if (typeof value === "number" && Number.isFinite(value)) {
                args[key] = roundProfilerNumber(value);
            }
            else if (typeof value === "string" && value) {
                args[key] = value;
            }
            else if (typeof value === "boolean") {
                args[key] = value;
            }
        }
        return args;
    }
    function profilerSummary(entries, emittedEventCount, includedEntryCount) {
        const byType = {};
        for (const entry of entries)
            byType[entry.entryType] = (byType[entry.entryType] ?? 0) + 1;
        const resources = entries.filter((entry) => entry.entryType === "resource");
        const longEntries = entries.filter((entry) => entry.duration >= 50);
        return {
            entryCount: entries.length,
            includedEntryCount,
            emittedEventCount,
            byType,
            resourceCount: resources.length,
            longEntryCount: longEntries.length,
            longestEntries: longEntries
                .slice()
                .sort((left, right) => right.duration - left.duration)
                .slice(0, 10)
                .map((entry) => ({
                name: entry.name,
                entryType: entry.entryType,
                startTime: roundProfilerNumber(entry.startTime),
                duration: roundProfilerNumber(entry.duration),
            })),
            readyState: document.readyState,
        };
    }
    function entryEndEpochMs(entry) {
        return performance.timeOrigin + entry.startTime + Math.max(0, entry.duration || 0);
    }
    function roundProfilerNumber(value) {
        return Math.round(value * 1000) / 1000;
    }
    function profilerBestEffortWarning() {
        return {
            code: "BEST_EFFORT_FIREFOX_GAP",
            feature: "profiler",
            message: "Firefox profiler data is collected from Performance Timeline entries exposed to WebExtensions. It is Chrome Trace Event-shaped timing evidence, not a Chrome DevTools CPU profile or sampling profiler.",
        };
    }
    function reactTree(selector, maxDepth) {
        const result = collectReactComponents(selector);
        if ("error" in result)
            return { ...result, dialogs: drainDialogs() };
        const limit = typeof maxDepth === "number" && Number.isFinite(maxDepth) ? Math.max(0, Math.floor(maxDepth)) : undefined;
        const visible = result.nodes.filter((node) => limit === undefined || node.depth <= limit);
        const lines = [`React tree for ${location.href} (best effort)`];
        for (const node of visible) {
            const indent = "  ".repeat(Math.min(8, node.depth));
            lines.push(`${indent}${node.id} ${reactNodeSummary(node)}`);
        }
        if (visible.length === 0)
            lines.push("No React components matched the requested depth.");
        return {
            text: lines.join("\n"),
            url: location.href,
            title: document.title,
            components: visible.map(publicReactNode),
            componentCount: result.nodes.length,
            devtoolsHookPresent: result.devtoolsHookPresent,
            warnings: [reactBestEffortWarning()],
            dialogs: drainDialogs(),
        };
    }
    function reactInspect(target, locator) {
        if (!target && !locator) {
            return {
                error: { code: "invalid_args", message: "react inspect requires a fiber id, ref, or CSS selector" },
                dialogs: drainDialogs(),
            };
        }
        const result = collectReactComponents(undefined);
        if ("error" in result)
            return { ...result, dialogs: drainDialogs() };
        let node;
        if (/^r\d+$/i.test(target)) {
            node = result.nodes.find((candidate) => candidate.id.toLowerCase() === target.toLowerCase());
        }
        else {
            const element = locator ? resolveOne(locator) : elementForCssTarget(target);
            if ("error" in element)
                return element;
            const fiber = nearestCompositeReactFiber(reactFiberForElement(element.element));
            if (fiber)
                node = result.nodes.find((candidate) => candidate.fiber === fiber);
        }
        if (!node) {
            return {
                error: {
                    code: "not_found",
                    message: `No React component matched ${target || "target"}. Rerun react tree after DOM changes and use a fresh rN id.`,
                },
                dialogs: drainDialogs(),
            };
        }
        const details = inspectReactNode(node);
        return {
            text: formatReactInspectText(details),
            ...details,
            devtoolsHookPresent: result.devtoolsHookPresent,
            warnings: [reactBestEffortWarning()],
            dialogs: drainDialogs(),
        };
    }
    function reactRenders(action) {
        const recorder = reactRenderRecorder();
        if (!recorder) {
            return {
                error: {
                    code: "ReactDevtoolsHookNotInstalled",
                    message: "React render recording requires the React hook to be installed before page JavaScript runs. Close the managed browser and reopen the app with `pire-browser open --enable react-devtools <url>`.",
                },
                dialogs: drainDialogs(),
            };
        }
        if (action === "start") {
            const profile = callReactRenderRecorder(recorder, "start");
            if ("error" in profile)
                return { ...profile, dialogs: drainDialogs() };
            return {
                text: `Started React render recording for ${location.href}`,
                url: location.href,
                title: document.title,
                profile,
                warnings: [reactBestEffortWarning()],
                dialogs: drainDialogs(),
            };
        }
        if (action === "stop") {
            const profile = callReactRenderRecorder(recorder, "stop");
            if ("error" in profile)
                return { ...profile, dialogs: drainDialogs() };
            return {
                text: formatReactRenderProfile(profile),
                url: location.href,
                title: document.title,
                profile,
                warnings: [reactBestEffortWarning()],
                dialogs: drainDialogs(),
            };
        }
        return {
            error: { code: "invalid_args", message: "react renders requires start or stop" },
            dialogs: drainDialogs(),
        };
    }
    function reactSuspense(onlyDynamic) {
        const result = collectReactSuspenseBoundaries(undefined);
        if ("error" in result)
            return { ...result, dialogs: drainDialogs() };
        const dynamicBoundaryCount = result.boundaries.filter((boundary) => boundary.dynamic).length;
        const visible = onlyDynamic ? result.boundaries.filter((boundary) => boundary.dynamic) : result.boundaries;
        const lines = [`React Suspense boundaries for ${location.href} (best effort)`];
        for (const boundary of visible) {
            const indent = "  ".repeat(Math.min(8, boundary.depth));
            lines.push(`${indent}${boundary.id} ${reactSuspenseBoundarySummary(boundary)}`);
        }
        if (!visible.length) {
            lines.push(onlyDynamic ? "No currently dynamic Suspense boundaries found." : "No Suspense boundaries found.");
        }
        return {
            text: lines.join("\n"),
            url: location.href,
            title: document.title,
            boundaries: visible.map(publicReactSuspenseBoundary),
            boundaryCount: result.boundaries.length,
            dynamicBoundaryCount,
            onlyDynamic,
            devtoolsHookPresent: result.devtoolsHookPresent,
            warnings: [reactBestEffortWarning()],
            dialogs: drainDialogs(),
        };
    }
    function reactRenderRecorder() {
        const pageWindow = pageObject(window);
        const recorder = pageWindow.__PIRE_BROWSER_REACT_RENDER_RECORDER__;
        if (!recorder || typeof recorder !== "object")
            return null;
        return recorder;
    }
    function callReactRenderRecorder(recorder, action) {
        const method = recorder[action];
        if (typeof method !== "function") {
            return {
                error: {
                    code: "ReactDevtoolsHookNotInstalled",
                    message: "The React render recorder is not available in the current page. Reopen with `pire-browser open --enable react-devtools <url>`.",
                },
            };
        }
        try {
            const result = method.call(recorder);
            return cloneReactRenderProfile(result);
        }
        catch (error) {
            return {
                error: {
                    code: "ReactRenderRecordingFailed",
                    message: errorMessage(error),
                },
            };
        }
    }
    function cloneReactRenderProfile(value) {
        try {
            return JSON.parse(JSON.stringify(value ?? {}));
        }
        catch {
            return {
                error: {
                    code: "ReactRenderRecordingFailed",
                    message: "React render profile could not be serialized.",
                },
            };
        }
    }
    function formatReactRenderProfile(profile) {
        const lines = [`React render profile for ${location.href} (best effort)`];
        lines.push(`Commits: ${Number(profile.commitCount ?? 0)} over ${Number(profile.durationMs ?? 0)}ms`);
        lines.push(`Component renders: ${Number(profile.componentRenderCount ?? 0)}`);
        if (profile.capped)
            lines.push("Profile was capped; only the most recent commits are included.");
        const topComponents = Array.isArray(profile.topComponents) ? profile.topComponents : [];
        if (topComponents.length) {
            lines.push("Top components:");
            for (const component of topComponents.slice(0, 10)) {
                const name = typeof component.name === "string" ? component.name : "Anonymous";
                const renders = Number(component.renders ?? 0);
                const duration = Number(component.actualDuration ?? 0).toFixed(2);
                lines.push(`  ${name} renders=${renders} actualDuration=${duration}ms`);
            }
        }
        else {
            lines.push("No component renders were recorded.");
        }
        return lines.join("\n");
    }
    function collectReactComponents(selector) {
        const root = snapshotRoot(selector);
        if ("error" in root)
            return { error: { code: "not_found", message: root.error } };
        const fibers = new Set();
        const fiberOrder = new Map();
        const domByFiber = new Map();
        let order = 0;
        for (const element of reactCandidateElements(root.root)) {
            const fiber = reactFiberForElement(element);
            let current = fiber;
            while (current) {
                if (isReactComponentFiber(current)) {
                    if (!fiberOrder.has(current))
                        fiberOrder.set(current, order++);
                    fibers.add(current);
                    if (!domByFiber.has(current))
                        domByFiber.set(current, element);
                }
                current = current.return ?? null;
            }
        }
        if (fibers.size === 0) {
            return {
                error: {
                    code: "ReactNotFound",
                    message: "No React Fiber data was found in the current page. Open a React app, wait for it to render, then retry. For render recording, reopen with `pire-browser open --enable react-devtools <url>` before page JavaScript runs.",
                },
            };
        }
        const nodes = Array.from(fibers)
            .sort((left, right) => (fiberOrder.get(left) ?? 0) - (fiberOrder.get(right) ?? 0))
            .map((fiber, index) => ({
            id: `r${index + 1}`,
            fiber,
            name: reactFiberDisplayName(fiber),
            children: [],
            domElement: domByFiber.get(fiber),
            order: fiberOrder.get(fiber) ?? index,
            depth: 0,
        }));
        const nodeByFiber = new Map(nodes.map((node) => [node.fiber, node]));
        for (const node of nodes) {
            let parentFiber = node.fiber.return ?? null;
            while (parentFiber && !nodeByFiber.has(parentFiber))
                parentFiber = parentFiber.return ?? null;
            const parent = parentFiber ? nodeByFiber.get(parentFiber) : undefined;
            if (parent && parent !== node) {
                node.parent = parent;
                parent.children.push(node);
            }
        }
        const roots = nodes.filter((node) => !node.parent).sort(compareReactNodes);
        const ordered = [];
        const visit = (node, depth) => {
            node.depth = depth;
            ordered.push(node);
            node.children.sort(compareReactNodes).forEach((child) => visit(child, depth + 1));
        };
        roots.forEach((node) => visit(node, 0));
        ordered.forEach((node, index) => (node.id = `r${index + 1}`));
        return { nodes: ordered, devtoolsHookPresent: reactDevtoolsHookPresent() };
    }
    function collectReactSuspenseBoundaries(selector) {
        const root = snapshotRoot(selector);
        if ("error" in root)
            return { error: { code: "not_found", message: root.error } };
        const fibers = new Set();
        const fiberOrder = new Map();
        const domByFiber = new Map();
        let sawReactFiber = false;
        let order = 0;
        for (const element of reactCandidateElements(root.root)) {
            const fiber = reactFiberForElement(element);
            let current = fiber;
            while (current) {
                sawReactFiber = true;
                if (isReactSuspenseFiber(current)) {
                    if (!fiberOrder.has(current))
                        fiberOrder.set(current, order++);
                    fibers.add(current);
                    if (!domByFiber.has(current))
                        domByFiber.set(current, element);
                }
                current = current.return ?? null;
            }
        }
        if (!sawReactFiber) {
            return {
                error: {
                    code: "ReactNotFound",
                    message: "No React Fiber data was found in the current page. Open a React app, wait for it to render, then retry. For render recording, reopen with `pire-browser open --enable react-devtools <url>` before page JavaScript runs.",
                },
            };
        }
        const boundaries = Array.from(fibers)
            .sort((left, right) => (fiberOrder.get(left) ?? 0) - (fiberOrder.get(right) ?? 0))
            .map((fiber, index) => {
            const state = reactSuspenseState(fiber);
            return {
                id: `s${index + 1}`,
                fiber,
                name: reactSuspenseFiberName(fiber),
                children: [],
                domElement: domByFiber.get(fiber),
                order: fiberOrder.get(fiber) ?? index,
                depth: 0,
                state,
                dynamic: state !== "primary",
                fallback: reactSuspenseFallback(fiber),
            };
        });
        const boundaryByFiber = new Map(boundaries.map((boundary) => [boundary.fiber, boundary]));
        for (const boundary of boundaries) {
            let parentFiber = boundary.fiber.return ?? null;
            while (parentFiber && !boundaryByFiber.has(parentFiber))
                parentFiber = parentFiber.return ?? null;
            const parent = parentFiber ? boundaryByFiber.get(parentFiber) : undefined;
            if (parent && parent !== boundary) {
                boundary.parent = parent;
                parent.children.push(boundary);
            }
        }
        const roots = boundaries.filter((boundary) => !boundary.parent).sort(compareReactSuspenseBoundaries);
        const ordered = [];
        const visit = (boundary, depth) => {
            boundary.depth = depth;
            ordered.push(boundary);
            boundary.children.sort(compareReactSuspenseBoundaries).forEach((child) => visit(child, depth + 1));
        };
        roots.forEach((boundary) => visit(boundary, 0));
        ordered.forEach((boundary, index) => (boundary.id = `s${index + 1}`));
        return { boundaries: ordered, devtoolsHookPresent: reactDevtoolsHookPresent() };
    }
    function reactCandidateElements(root) {
        const base = root instanceof Document ? root.documentElement : root instanceof Element ? root : null;
        if (!base)
            return [];
        return [base, ...Array.from(root.querySelectorAll("*"))];
    }
    function reactFiberForElement(element) {
        let current = element;
        while (current) {
            const pageNode = pageObject(current);
            const keys = safeObjectKeys(pageNode);
            const key = keys.find((candidate) => candidate.startsWith("__reactFiber$") || candidate.startsWith("__reactInternalInstance$"));
            if (key) {
                try {
                    const fiber = pageNode[key];
                    if (fiber && typeof fiber === "object")
                        return fiber;
                }
                catch {
                    // Cross-compartment wrappers can reject property reads.
                }
            }
            current = current.parentElement;
        }
        return null;
    }
    function nearestCompositeReactFiber(fiber) {
        let current = fiber;
        while (current) {
            if (isReactComponentFiber(current))
                return current;
            current = current.return ?? null;
        }
        return null;
    }
    function isReactComponentFiber(fiber) {
        const type = fiber.elementType ?? fiber.type;
        if (!type || typeof type === "string")
            return false;
        if (typeof type === "function")
            return true;
        if (typeof type === "object")
            return Boolean(type.displayName || type.render || type.type);
        return false;
    }
    function isReactSuspenseFiber(fiber) {
        if (fiber.tag === 13 || fiber.tag === 19)
            return true;
        const typeText = reactTypeName(fiber.elementType ?? fiber.type) || reactTypeName(fiber.type);
        if (typeText === "Suspense" || typeText === "SuspenseList")
            return true;
        const rawType = String(fiber.elementType ?? fiber.type ?? "");
        return /react\.suspense_list|react\.suspenselist|react\.suspense/i.test(rawType);
    }
    function reactFiberDisplayName(fiber) {
        return reactTypeName(fiber.elementType ?? fiber.type) || reactTypeName(fiber.type) || "Anonymous";
    }
    function reactSuspenseFiberName(fiber) {
        if (fiber.tag === 13)
            return "Suspense";
        if (fiber.tag === 19)
            return "SuspenseList";
        const typeText = reactTypeName(fiber.elementType ?? fiber.type) || reactTypeName(fiber.type);
        if (typeText)
            return typeText;
        const rawType = String(fiber.elementType ?? fiber.type ?? "");
        if (/react\.suspense_list|react\.suspenselist/i.test(rawType))
            return "SuspenseList";
        if (/react\.suspense/i.test(rawType))
            return "Suspense";
        return "Suspense";
    }
    function reactSuspenseState(fiber) {
        const state = fiber.memoizedState;
        if (!state)
            return "primary";
        if (typeof state === "object" && state.dehydrated)
            return "dehydrated";
        return "fallback";
    }
    function reactSuspenseFallback(fiber) {
        const props = fiber.memoizedProps;
        if (!props || typeof props !== "object" || !("fallback" in props))
            return null;
        try {
            return previewReactValue(props.fallback);
        }
        catch {
            return "[unreadable]";
        }
    }
    function reactTypeName(type) {
        if (!type)
            return "";
        if (typeof type === "string")
            return type;
        if (typeof type === "function")
            return type.displayName || type.name || "Anonymous";
        if (typeof type === "object") {
            if (typeof type.displayName === "string" && type.displayName)
                return type.displayName;
            if (type.render)
                return reactTypeName(type.render) || "ForwardRef";
            if (type.type)
                return reactTypeName(type.type);
        }
        return "";
    }
    function compareReactNodes(left, right) {
        return left.order - right.order || left.name.localeCompare(right.name);
    }
    function compareReactSuspenseBoundaries(left, right) {
        return left.order - right.order || left.name.localeCompare(right.name);
    }
    function reactNodeSummary(node) {
        const props = objectKeysPreview(node.fiber.memoizedProps);
        const state = reactHooks(node.fiber).length ? " hooks" : node.fiber.memoizedState != null ? " state" : "";
        const propsText = props ? ` props{${props}}` : "";
        return `${node.name}${propsText}${state}`;
    }
    function publicReactNode(node) {
        return {
            id: node.id,
            name: node.name,
            parentId: node.parent?.id ?? null,
            depth: node.depth,
            props: objectKeysPreview(node.fiber.memoizedProps),
            hasState: node.fiber.memoizedState != null,
            hookCount: reactHooks(node.fiber).length,
            selector: node.domElement ? shortSelectorFor(node.domElement) : null,
        };
    }
    function reactSuspenseBoundarySummary(boundary) {
        const status = boundary.dynamic ? "dynamic" : "static";
        const selector = boundary.domElement ? ` selector=${shortSelectorFor(boundary.domElement)}` : "";
        const fallback = boundary.fallback !== null ? ` fallback=${truncateText(valueToText(boundary.fallback), 80)}` : "";
        return `${boundary.name} ${status} state=${boundary.state}${selector}${fallback}`;
    }
    function publicReactSuspenseBoundary(boundary) {
        return {
            id: boundary.id,
            name: boundary.name,
            parentId: boundary.parent?.id ?? null,
            depth: boundary.depth,
            state: boundary.state,
            dynamic: boundary.dynamic,
            fallback: boundary.fallback,
            selector: boundary.domElement ? shortSelectorFor(boundary.domElement) : null,
        };
    }
    function inspectReactNode(node) {
        return {
            id: node.id,
            name: node.name,
            parentId: node.parent?.id ?? null,
            children: node.children.map((child) => ({ id: child.id, name: child.name })),
            props: previewReactValue(node.fiber.memoizedProps),
            state: previewReactValue(node.fiber.memoizedState),
            hooks: reactHooks(node.fiber),
            source: reactSource(node.fiber),
            selector: node.domElement ? shortSelectorFor(node.domElement) : null,
        };
    }
    function formatReactInspectText(details) {
        const lines = [`${details.id} ${details.name}`];
        if (details.parentId)
            lines.push(`Parent: ${details.parentId}`);
        if (details.children.length)
            lines.push(`Children: ${details.children.map((child) => `${child.id} ${child.name}`).join(", ")}`);
        if (details.selector)
            lines.push(`Nearest DOM: ${details.selector}`);
        lines.push(`Props: ${valueToText(details.props)}`);
        lines.push(`State: ${valueToText(details.state)}`);
        lines.push(`Hooks: ${details.hooks.length ? valueToText(details.hooks) : "[]"}`);
        if (details.source)
            lines.push(`Source: ${valueToText(details.source)}`);
        return lines.join("\n");
    }
    function reactHooks(fiber) {
        const hooks = [];
        let current = fiber.memoizedState;
        let index = 0;
        const seen = new WeakSet();
        while (current && typeof current === "object" && index < 20 && !seen.has(current)) {
            seen.add(current);
            hooks.push({
                index,
                state: previewReactValue(current.memoizedState),
            });
            current = current.next;
            index += 1;
        }
        return hooks;
    }
    function reactSource(fiber) {
        const source = fiber._debugSource;
        if (!source || typeof source !== "object")
            return null;
        const record = source;
        return {
            fileName: typeof record.fileName === "string" ? record.fileName : undefined,
            lineNumber: typeof record.lineNumber === "number" ? record.lineNumber : undefined,
            columnNumber: typeof record.columnNumber === "number" ? record.columnNumber : undefined,
        };
    }
    function elementForCssTarget(target) {
        try {
            const element = document.querySelector(target);
            if (!element)
                return { error: { code: "not_found", message: `No element matched selector: ${target}` }, dialogs: drainDialogs() };
            return { element };
        }
        catch (error) {
            return {
                error: {
                    code: "invalid_args",
                    message: error instanceof Error ? error.message : `Invalid selector: ${target}`,
                },
                dialogs: drainDialogs(),
            };
        }
    }
    function objectKeysPreview(value) {
        if (!value || typeof value !== "object")
            return "";
        return safeObjectKeys(value)
            .filter((key) => key !== "children")
            .slice(0, 8)
            .join(", ");
    }
    function previewReactValue(value, depth = 0, seen = new WeakSet()) {
        if (value === undefined)
            return null;
        if (value === null || ["string", "number", "boolean"].includes(typeof value))
            return value;
        if (typeof value === "bigint")
            return value.toString();
        if (typeof value === "function")
            return `[Function ${value.name || "anonymous"}]`;
        if (value instanceof Node)
            return `[DOM ${value.nodeName.toLowerCase()}]`;
        if (typeof value !== "object")
            return String(value);
        if (seen.has(value))
            return "[Circular]";
        if (depth >= 3)
            return Array.isArray(value) ? `[Array(${value.length})]` : "[Object]";
        seen.add(value);
        if (Array.isArray(value))
            return value.slice(0, 20).map((item) => previewReactValue(item, depth + 1, seen));
        const out = {};
        for (const key of safeObjectKeys(value).slice(0, 20)) {
            try {
                out[key] = previewReactValue(value[key], depth + 1, seen);
            }
            catch {
                out[key] = "[unreadable]";
            }
        }
        return out;
    }
    function shortSelectorFor(element) {
        const id = attr(element, "id");
        if (id)
            return `#${cssEscape(id)}`;
        const testid = attr(element, "data-testid") || attr(element, "data-test");
        if (testid)
            return `[data-testid="${cssEscape(testid)}"]`;
        const tag = element.tagName.toLowerCase();
        const className = typeof element.className === "string" ? element.className.split(/\s+/).filter(Boolean)[0] : "";
        return className ? `${tag}.${cssEscape(className)}` : tag;
    }
    function reactDevtoolsHookPresent() {
        const pageWindow = pageObject(window);
        return Boolean(pageWindow.__REACT_DEVTOOLS_GLOBAL_HOOK__);
    }
    function reactBestEffortWarning() {
        return bestEffortWarning("react", "React commands use best-effort Firefox Fiber introspection. Render recording requires `open --enable react-devtools` before page JavaScript runs and is limited to commit data visible through the lightweight Firefox hook.");
    }
    function truncateText(value, max) {
        return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
    }
    function pageObject(value) {
        return (value.wrappedJSObject ?? value);
    }
    function safeObjectKeys(value) {
        try {
            return Object.keys(value);
        }
        catch {
            return [];
        }
    }
    function timingMetric(name, value, unit, source, thresholds) {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            return { name, value: null, unit, rating: "unknown", available: false, source };
        }
        return {
            name,
            value,
            unit,
            rating: rateMetric(value, thresholds),
            available: true,
            source,
        };
    }
    function rateMetric(value, [good, needsImprovement]) {
        if (value <= good)
            return "good";
        if (value <= needsImprovement)
            return "needs-improvement";
        return "poor";
    }
    function navigationTimingValue(field) {
        const nav = navigationEntry();
        const value = nav && typeof nav[field] === "number" ? nav[field] : null;
        if (typeof value === "number" && value > 0)
            return value;
        const legacy = legacyNavigationTimingValue(field);
        return legacy;
    }
    function legacyNavigationTimingValue(field) {
        const timing = performance.timing;
        if (!timing || typeof timing.navigationStart !== "number")
            return null;
        const value = timing[field];
        if (typeof value !== "number" || value <= 0)
            return null;
        return value - timing.navigationStart;
    }
    function paintTimingValue(name) {
        const entry = performance.getEntriesByName(name)[0];
        return typeof entry?.startTime === "number" ? entry.startTime : null;
    }
    function largestContentfulPaintValue() {
        const entries = performance.getEntriesByType("largest-contentful-paint");
        const entry = entries[entries.length - 1];
        return typeof entry?.startTime === "number" ? entry.startTime : null;
    }
    function cumulativeLayoutShiftValue() {
        const entries = performance.getEntriesByType("layout-shift");
        if (!entries.length)
            return null;
        return entries
            .filter((entry) => !entry.hadRecentInput)
            .reduce((sum, entry) => sum + (typeof entry.value === "number" ? entry.value : 0), 0);
    }
    function interactionToNextPaintValue() {
        const entries = performance.getEntriesByType("event");
        const interactionEntries = entries.filter((entry) => Number(entry.interactionId) > 0 && typeof entry.duration === "number");
        if (!interactionEntries.length)
            return null;
        return Math.max(...interactionEntries.map((entry) => entry.duration));
    }
    function navigationSummary() {
        return {
            domContentLoaded: timingMetric("DOMContentLoaded", navigationTimingValue("domContentLoadedEventEnd"), "ms", "PerformanceNavigationTiming", [2000, 4000]),
            load: timingMetric("Load", navigationTimingValue("loadEventEnd"), "ms", "PerformanceNavigationTiming", [2500, 5000]),
            readyState: document.readyState,
        };
    }
    function navigationEntry() {
        return performance.getEntriesByType("navigation")[0] ?? null;
    }
    function hydrationSummary() {
        const hydrationRecords = [...consoleRecords, ...pageErrorRecords].filter((record) => /hydrat/i.test(logRecordMessage(record)));
        const frameworks = {
            next: Boolean(document.getElementById("__NEXT_DATA__") || document.querySelector("[data-nextjs-router]")),
            react: Boolean(window.__REACT_DEVTOOLS_GLOBAL_HOOK__) ||
                Boolean(document.querySelector("#root, #__next, [data-reactroot], [data-reactid]")),
        };
        return {
            warnings: hydrationRecords.map((record) => ({
                type: "level" in record ? record.level : record.type,
                message: "text" in record ? record.text : record.message,
                at: record.at,
            })),
            warningCount: hydrationRecords.length,
            frameworks,
        };
    }
    function logRecordMessage(record) {
        return "text" in record ? record.text : record.message;
    }
    function formatVitalsText(metrics, navigation, hydration) {
        const lines = [`Web Vitals for ${location.href}`];
        for (const key of ["ttfb", "fcp", "lcp", "cls", "inp"]) {
            lines.push(formatVitalMetric(metrics[key]));
        }
        lines.push(formatVitalMetric(navigation.domContentLoaded));
        lines.push(formatVitalMetric(navigation.load));
        lines.push(`Ready state: ${navigation.readyState}`);
        lines.push(`Hydration warnings: ${hydration.warningCount}`);
        return lines.join("\n");
    }
    function formatVitalMetric(metric) {
        if (!metric.available || metric.value === null)
            return `${metric.name}: unavailable`;
        const value = metric.unit === "ms" ? `${Math.round(metric.value)}ms` : metric.value.toFixed(3);
        return `${metric.name}: ${value} (${metric.rating})`;
    }
    function fireInputEvents(element) {
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function setNativeValue(element, value) {
        const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        descriptor?.set?.call(element, value);
    }
    function keyName(key) {
        const map = {
            enter: "Enter",
            tab: "Tab",
            escape: "Escape",
            esc: "Escape",
            backspace: "Backspace",
            arrowleft: "ArrowLeft",
            arrowright: "ArrowRight",
            arrowup: "ArrowUp",
            arrowdown: "ArrowDown",
        };
        return map[key.toLowerCase()] ?? key;
    }
    function isTextLike(element) {
        return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element.isContentEditable;
    }
    function isEditableTextTarget(element) {
        if (element instanceof HTMLTextAreaElement)
            return !element.disabled && !element.readOnly;
        if (element instanceof HTMLInputElement) {
            const nonTextTypes = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);
            return !element.disabled && !element.readOnly && !nonTextTypes.has(element.type);
        }
        return element.isContentEditable;
    }
    function selectedTextFromEditable(element) {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement))
            return null;
        try {
            const start = element.selectionStart;
            const end = element.selectionEnd;
            if (typeof start !== "number" || typeof end !== "number" || start === end)
                return "";
            return element.value.slice(start, end);
        }
        catch {
            return null;
        }
    }
    function selectedTextFromDocument() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
            return "";
        return selection.toString();
    }
    function insertText(element, text) {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            const start = element.selectionStart ?? element.value.length;
            const end = element.selectionEnd ?? element.value.length;
            setNativeValue(element, element.value.slice(0, start) + text + element.value.slice(end));
            element.setSelectionRange(start + text.length, start + text.length);
            fireInputEvents(element);
        }
        else if (element.isContentEditable) {
            document.execCommand("insertText", false, text);
        }
    }
    function submitFormForEnter(element, keyAccepted) {
        if (!keyAccepted || !element.form || ["button", "checkbox", "file", "hidden", "radio", "reset", "submit"].includes(element.type)) {
            return;
        }
        if (typeof element.form.requestSubmit === "function") {
            element.form.requestSubmit();
        }
        else {
            element.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }
    }
    function handleFor(element) {
        const existing = handlesByElement.get(element);
        if (existing)
            return existing;
        const handle = `h${nextHandleNumber++}`;
        handlesByElement.set(element, handle);
        elementsByHandle.set(handle, element);
        return handle;
    }
    function indexed(elements, index) {
        if (index < 0)
            return elements;
        const selected = index === Number.MAX_SAFE_INTEGER ? elements[elements.length - 1] : elements[Math.max(0, index ?? 0)];
        return selected ? [selected] : [];
    }
    function resolveXPath(expression) {
        const out = [];
        try {
            const result = document.evaluate(expression, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
            let node = result.iterateNext();
            while (node) {
                if (node instanceof Element)
                    out.push(node);
                node = result.iterateNext();
            }
        }
        catch {
            return [];
        }
        return out;
    }
    function safeMatches(element, selector) {
        try {
            return element.matches(selector);
        }
        catch {
            return false;
        }
    }
    function elementValue(element) {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
            return element.value;
        }
        return clean(element.textContent ?? "");
    }
    function computedStyles(element) {
        const style = getComputedStyle(element);
        return {
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            color: style.color,
            backgroundColor: style.backgroundColor,
            position: style.position,
        };
    }
    function rectObject(rect) {
        return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
        };
    }
    function dispatchKey(target, key, type, chord = {}) {
        return target.dispatchEvent(new KeyboardEvent(type, {
            key,
            code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
            bubbles: true,
            cancelable: true,
            ctrlKey: Boolean(chord.ctrlKey),
            altKey: Boolean(chord.altKey),
            shiftKey: Boolean(chord.shiftKey),
            metaKey: Boolean(chord.metaKey),
        }));
    }
    function parseKeyChord(value) {
        const parts = value.split("+").filter(Boolean);
        const key = parts.pop() ?? value;
        const modifiers = new Set(parts.map((part) => part.toLowerCase()));
        return {
            key,
            ctrlKey: modifiers.has("control") || modifiers.has("ctrl"),
            altKey: modifiers.has("alt"),
            shiftKey: modifiers.has("shift"),
            metaKey: modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("command"),
        };
    }
    function evalScript(script) {
        const result = evaluatePageExpression(script);
        if (result.ok) {
            return {
                text: result.text,
                value: result.value,
                dialogs: drainDialogs(),
            };
        }
        return {
            error: {
                code: "EvaluationFailed",
                message: result.message,
            },
            dialogs: drainDialogs(),
        };
    }
    async function pushStateNavigation(input) {
        const previousUrl = location.href;
        let target;
        try {
            target = new URL(input, location.href);
        }
        catch {
            return { error: { code: "invalid_args", message: `Invalid pushstate URL: ${input}` }, dialogs: drainDialogs() };
        }
        if (target.origin !== location.origin) {
            return {
                error: {
                    code: "invalid_args",
                    message: `pushstate requires same-origin URL; current origin is ${location.origin}`,
                },
                dialogs: drainDialogs(),
            };
        }
        const pageWindow = (window.wrappedJSObject ?? window);
        const nextRouter = pageWindow.next?.router;
        const route = `${target.pathname}${target.search}${target.hash}`;
        if (nextRouter && typeof nextRouter.push === "function") {
            try {
                await Promise.race([Promise.resolve(nextRouter.push(route)), delay(5000)]);
                await delay(50);
                return {
                    text: `Pushed SPA route ${location.href}`,
                    previousUrl,
                    url: location.href,
                    requestedUrl: target.href,
                    method: "next.router.push",
                    dialogs: drainDialogs(),
                };
            }
            catch {
                // Fall back to history.pushState below. Some frameworks expose a router
                // object before it is ready for imperative navigation.
            }
        }
        history.pushState(null, "", target.href);
        dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
        if (hashWithoutUrl(previousUrl) !== target.hash) {
            dispatchEvent(new HashChangeEvent("hashchange", { oldURL: previousUrl, newURL: target.href }));
        }
        dispatchEvent(new Event("locationchange"));
        return {
            text: `Pushed SPA route ${location.href}`,
            previousUrl,
            url: location.href,
            requestedUrl: target.href,
            method: "history.pushState",
            dialogs: drainDialogs(),
        };
    }
    function evaluatePageExpression(expression) {
        const pageWindow = (window.wrappedJSObject ?? window);
        const pageFunction = typeof pageWindow.Function === "function" ? pageWindow.Function : Function;
        try {
            const value = pageFunction(`return (${expression});`).call(pageWindow);
            return successfulPageEvaluation(value);
        }
        catch (error) {
            if (!isSyntaxError(error))
                return failedPageEvaluation(error);
            try {
                const pageEval = typeof pageWindow.eval === "function" ? pageWindow.eval : eval;
                const value = pageEval.call(pageWindow, expression);
                return successfulPageEvaluation(value);
            }
            catch (fallbackError) {
                return failedPageEvaluation(fallbackError);
            }
        }
    }
    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    function hashWithoutUrl(url) {
        try {
            return new URL(url).hash;
        }
        catch {
            return "";
        }
    }
    function successfulPageEvaluation(value) {
        const serialized = serializePageValue(value);
        return {
            ok: true,
            value: serialized,
            text: valueToText(serialized),
            truthy: Boolean(value),
        };
    }
    function failedPageEvaluation(error) {
        return {
            ok: false,
            message: errorMessage(error),
        };
    }
    function isSyntaxError(error) {
        if (error instanceof SyntaxError)
            return true;
        return Boolean(error && typeof error === "object" && "name" in error && String(error.name) === "SyntaxError");
    }
    function errorMessage(error) {
        if (error && typeof error === "object" && "message" in error)
            return String(error.message);
        return String(error);
    }
    function serializePageValue(value) {
        if (value === undefined)
            return null;
        if (value === null || ["string", "number", "boolean"].includes(typeof value))
            return value;
        if (typeof value === "bigint")
            return value.toString();
        try {
            const json = JSON.stringify(value);
            if (json !== undefined)
                return JSON.parse(json);
        }
        catch {
            // Fall through to a string representation for non-cloneable page objects.
        }
        try {
            return String(value);
        }
        catch {
            return "[unserializable]";
        }
    }
    function valueToText(value) {
        if (typeof value === "string")
            return value;
        const json = JSON.stringify(value);
        return json === undefined ? String(value) : json;
    }
    function viewportMetrics() {
        const root = document.documentElement;
        return {
            text: `${window.innerWidth}x${window.innerHeight}`,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
            clientWidth: root?.clientWidth ?? null,
            clientHeight: root?.clientHeight ?? null,
            visualViewport: window.visualViewport
                ? {
                    width: Math.round(window.visualViewport.width),
                    height: Math.round(window.visualViewport.height),
                    scale: window.visualViewport.scale,
                }
                : null,
            dialogs: drainDialogs(),
        };
    }
    function bestEffortWarning(feature, message) {
        return { code: "BEST_EFFORT_FIREFOX_GAP", feature, message };
    }
    function describeElement(element) {
        const snap = toSnapshot(element);
        return `${snap.role}${snap.name ? ` "${snap.name}"` : ""}`;
    }
    function cssEscape(value) {
        if ("CSS" in window && typeof CSS.escape === "function")
            return CSS.escape(value);
        return value.replace(/["\\]/g, "\\$&");
    }
}
