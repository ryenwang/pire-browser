"use strict";
{
    const HOST_NAME = "dev.pi.pire_browser";
    const CHUNK_SIZE = 700000;
    const CLOSE_TEARDOWN_DELAY_MS = 0;
    let port;
    let profileId = "";
    let nextTabNumber = 1;
    let controlledCloseScheduled = false;
    let nativeReconnectEnabled = true;
    const tabsByBrowserId = new Map();
    const tabsByAgentId = new Map();
    const labels = new Map();
    const refs = new Map();
    connectNative();
    registerBrowserListeners();
    function connectNative() {
        if (!nativeReconnectEnabled)
            return;
        console.log("[pire-browser] connecting native host", HOST_NAME);
        try {
            port = browser.runtime.connectNative(HOST_NAME);
        }
        catch (error) {
            console.error("[pire-browser] connectNative threw", error);
            setTimeout(connectNative, 1000);
            return;
        }
        port.onMessage.addListener((message) => void handleNativeMessage(message));
        port.onDisconnect.addListener(() => {
            const lastError = browser.runtime.lastError;
            if (lastError)
                console.error("[pire-browser] native host disconnected", lastError.message);
            if (!nativeReconnectEnabled)
                return;
            setTimeout(connectNative, 1000);
        });
        void ensureProfileId().then(() => {
            console.log("[pire-browser] native host port opened", profileId);
            postNative({
                type: "hello",
                profile_id: profileId,
                extension_id: browser.runtime.id,
                extension_version: browser.runtime.getManifest().version,
            });
            void postSessionEvent("focused", {});
            setInterval(() => void postSessionEvent("heartbeat", {}), 5000);
        });
    }
    async function ensureProfileId() {
        const stored = await browser.storage.local.get("profileId");
        if (stored.profileId) {
            profileId = stored.profileId;
        }
        else {
            profileId = crypto.randomUUID();
            await browser.storage.local.set({ profileId });
        }
    }
    function postNative(message) {
        try {
            port?.postMessage(message);
        }
        catch {
            // Firefox will restart the native host on reconnect.
        }
    }
    function postEvent(name, data) {
        const event = {
            type: "event",
            name,
            data: { ...data, profileId },
        };
        postNative(event);
    }
    async function postSessionEvent(name, data) {
        postEvent(name, { ...data, activePage: await activePageSummary() });
    }
    async function activePageSummary() {
        const active = await activeTab().catch(() => undefined);
        if (typeof active?.id !== "number" || typeof active.windowId !== "number")
            return null;
        const record = rememberTab(active);
        return {
            agentId: record.agentId,
            label: record.label,
            title: record.title,
            url: record.url,
            tabId: record.tabId,
            windowId: record.windowId,
            updatedAt: Date.now(),
        };
    }
    async function handleNativeMessage(message) {
        if (message.type === "request") {
            const request = message;
            const response = await executeRequest(request);
            postNative(response);
        }
    }
    async function executeRequest(request) {
        try {
            if (request.method !== "command") {
                return errorResponse(request.id, "unsupported_method", `Unsupported method: ${request.method}`);
            }
            const args = Array.isArray(request.params?.args) ? request.params?.args : [];
            const domainPolicy = domainPolicyFromParams(request.params?.domainPolicy);
            const actionPolicy = actionPolicyFromParams(request.params?.actionPolicy);
            const result = await executeCommandWithPolicies(args, domainPolicy, actionPolicy);
            if ("error" in result) {
                return {
                    type: "response",
                    id: request.id,
                    ok: false,
                    error: result.error,
                };
            }
            return {
                type: "response",
                id: request.id,
                ok: true,
                result,
            };
        }
        catch (error) {
            return errorResponse(request.id, "command_failed", error instanceof Error ? error.message : String(error));
        }
    }
    function errorResponse(id, code, message) {
        return { type: "response", id, ok: false, error: { code, message } };
    }
    async function executeCommandWithPolicies(args, domainPolicy, actionPolicy) {
        const domainError = await domainPolicyErrorForCommand(args, domainPolicy);
        if (domainError)
            return { error: domainError };
        const actionError = actionPolicyErrorForCommand(args, actionPolicy);
        if (actionError)
            return { error: actionError };
        return prepareLargeResult(await executeCommand(args, domainPolicy, actionPolicy));
    }
    function domainPolicyFromParams(value) {
        if (!value || typeof value !== "object")
            return null;
        const candidate = value;
        if (candidate.enabled !== true)
            return null;
        const patterns = Array.isArray(candidate.patterns)
            ? candidate.patterns.filter((pattern) => typeof pattern === "string")
            : [];
        if (patterns.length === 0)
            return null;
        return { enabled: true, patterns };
    }
    function actionPolicyFromParams(value) {
        if (!value || typeof value !== "object")
            return null;
        const candidate = value;
        if (candidate.enabled !== true)
            return null;
        const defaultValue = candidate.default === "deny" ? "deny" : "allow";
        const allow = Array.isArray(candidate.allow)
            ? candidate.allow.filter((category) => typeof category === "string")
            : [];
        const deny = Array.isArray(candidate.deny)
            ? candidate.deny.filter((category) => typeof category === "string")
            : [];
        return { enabled: true, default: defaultValue, allow, deny };
    }
    async function domainPolicyErrorForCommand(args, policy) {
        if (!policy?.enabled || !policy.patterns?.length)
            return null;
        const [command] = args;
        const destinationUrl = domainPolicyDestinationUrl(args);
        if (destinationUrl)
            return domainPolicyErrorForUrl(destinationUrl, policy);
        if (!commandNeedsActivePageDomainCheck(args))
            return null;
        const tab = await targetTab().catch(() => undefined);
        const url = tab?.url;
        if (!url) {
            return {
                code: "DomainPolicyError",
                data: { phase: "policy" },
                message: `domain allowlist requires an active http(s) page for ${command || "command"}`,
            };
        }
        return domainPolicyErrorForUrl(url, policy);
    }
    function actionPolicyErrorForCommand(args, policy) {
        if (!policy?.enabled)
            return null;
        const verdict = actionPolicyVerdictForCommand(args, policy);
        if (verdict.decision !== "deny")
            return null;
        return {
            code: "ActionPolicyError",
            data: { phase: "policy" },
            message: `action category \`${verdict.category ?? "unknown"}\` is denied by the active action policy`,
        };
    }
    function actionPolicyVerdictForCommand(args, policy) {
        const resolution = actionPolicyCategoryForCommand(args);
        if (resolution.kind !== "category") {
            return { category: null, decision: resolution.kind };
        }
        const category = resolution.category;
        if (policy.deny?.includes(category))
            return { category, decision: "deny" };
        if (policy.allow?.includes(category))
            return { category, decision: "allow" };
        return { category, decision: policy.default === "deny" ? "deny" : "allow" };
    }
    function actionPolicyCategoryForCommand(args) {
        const [command, subcommand] = args;
        if (!command)
            return { kind: "unsupported" };
        if (["status", "doctor", "install-status", "help", "setup", "session", "sessions", "close", "quit", "exit"].includes(command)) {
            return { kind: "meta" };
        }
        if (command === "launch" && !args.includes("--url"))
            return { kind: "meta" };
        if (command === "state" && subcommand === "inspect")
            return { kind: "meta" };
        if ((command === "tab" || command === "tabs") && subcommand === "label")
            return { kind: "meta" };
        if (command === "batch")
            return { kind: "allow" };
        if (notAvailableActionPolicyRoot(command))
            return { kind: "not_available" };
        const category = actionPolicyCategoryName(args);
        return category ? { kind: "category", category } : { kind: "unsupported" };
    }
    function actionPolicyCategoryName(args) {
        const [command, subcommand] = args;
        switch (command) {
            case "open":
            case "goto":
            case "navigate":
            case "launch":
            case "back":
            case "forward":
            case "reload":
                return "navigate";
            case "tab":
            case "tabs":
                if (!subcommand || subcommand === "list")
                    return "get";
                if (["new", "select", "close"].includes(subcommand))
                    return "navigate";
                return null;
            case "window":
                return subcommand === "new" ? "navigate" : null;
            case "click":
            case "dblclick":
                return "click";
            case "fill":
            case "type":
            case "select":
            case "check":
            case "uncheck":
                return "fill";
            case "keyboard":
                return subcommand === "type" || subcommand === "inserttext" ? "fill" : null;
            case "eval":
                return "eval";
            case "snapshot":
            case "screenshot":
                return "snapshot";
            case "scroll":
            case "scrollintoview":
                return "scroll";
            case "wait":
                return "wait";
            case "find":
                return findActionPolicyCategory(args);
            case "get":
            case "is":
            case "frame":
                return "get";
            case "cookies":
                return subcommand === "set" || subcommand === "clear" ? "state" : "get";
            case "storage":
                return (subcommand === "local" || subcommand === "session") && ["set", "clear"].includes(args[2] ?? "")
                    ? "state"
                    : "get";
            case "dialog":
                return subcommand === "accept" || subcommand === "dismiss" ? "interact" : "get";
            case "hover":
            case "focus":
            case "press":
            case "key":
            case "keydown":
            case "keyup":
                return "interact";
            case "clipboard":
                if (subcommand === "paste")
                    return "fill";
                if (subcommand === "read")
                    return "get";
                if (subcommand === "write" || subcommand === "copy")
                    return "state";
                return null;
            case "state":
                if (subcommand === "save" || subcommand === "load")
                    return "state";
                return null;
            default:
                return null;
        }
    }
    function findActionPolicyCategory(args) {
        const parsed = parseFind(args.slice(1));
        if ("error" in parsed || !parsed.action)
            return "get";
        const action = parsed.action;
        if (action === "click" || action === "dblclick")
            return "click";
        if (["fill", "type", "select", "check", "uncheck"].includes(action))
            return "fill";
        if (["text", "html", "value", "attr", "box", "styles"].includes(action))
            return "get";
        if (action === "scroll" || action === "scrollintoview")
            return "scroll";
        if (["press", "key", "hover", "focus"].includes(action))
            return "interact";
        if (action === "eval")
            return "eval";
        return "interact";
    }
    function notAvailableActionPolicyRoot(command) {
        return [
            "addinitscript",
            "auth",
            "confirm",
            "connect",
            "console",
            "dashboard",
            "deny",
            "device",
            "diff",
            "download",
            "drag",
            "errors",
            "highlight",
            "install",
            "mouse",
            "network",
            "pdf",
            "profiler",
            "profiles",
            "pushstate",
            "react",
            "record",
            "removeinitscript",
            "set",
            "skill",
            "skills",
            "stream",
            "swipe",
            "tap",
            "trace",
            "upgrade",
            "upload",
            "vitals",
        ].includes(command);
    }
    function domainPolicyDestinationUrl(args) {
        const [command, subcommand, ...rest] = args;
        if (["open", "goto", "navigate"].includes(command ?? "")) {
            return firstPositionalArg(args.slice(1), ["--label"]);
        }
        if ((command === "tab" || command === "tabs") && subcommand === "new") {
            return firstPositionalArg(rest, ["--label"]);
        }
        return undefined;
    }
    function domainPolicyErrorForUrl(input, policy) {
        const parsed = parsePolicyUrl(input);
        if (!parsed.ok) {
            return { code: "DomainPolicyError", data: { phase: "policy" }, message: parsed.message };
        }
        if (parsed.scheme !== "http" && parsed.scheme !== "https") {
            return {
                code: "DomainPolicyError",
                data: { phase: "policy" },
                message: `${parsed.scheme}: URLs are not allowed when a domain allowlist is active`,
            };
        }
        if (policy.patterns?.some((pattern) => domainPatternMatches(pattern, parsed.host)))
            return null;
        return {
            code: "DomainPolicyError",
            data: { phase: "policy" },
            message: `host \`${parsed.host}\` is outside the active domain allowlist (${policy.patterns?.join(", ")})`,
        };
    }
    function parsePolicyUrl(input) {
        const trimmed = input.trim();
        if (!trimmed)
            return { ok: false, message: "empty URL cannot be checked against domain allowlist" };
        const explicitScheme = explicitNonHttpScheme(trimmed);
        if (explicitScheme)
            return { ok: true, scheme: explicitScheme, host: "" };
        const normalized = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
        try {
            const url = new URL(normalized);
            return { ok: true, scheme: url.protocol.replace(":", "").toLowerCase(), host: normalizePolicyHost(url.hostname) };
        }
        catch {
            return { ok: false, message: `invalid URL \`${trimmed}\` for domain allowlist` };
        }
    }
    function explicitNonHttpScheme(input) {
        const lower = input.toLowerCase();
        const match = lower.match(/^([a-z][a-z0-9+.-]*):/);
        if (!match || lower.includes("://"))
            return "";
        const scheme = match[1];
        return ["about", "blob", "chrome", "data", "file", "javascript", "mailto", "moz-extension", "resource"].includes(scheme) ? scheme : "";
    }
    function normalizePolicyHost(host) {
        return host.toLowerCase().replace(/\.+$/, "");
    }
    function domainPatternMatches(pattern, host) {
        const normalizedPattern = normalizePolicyHost(pattern);
        const normalizedHost = normalizePolicyHost(host);
        if (normalizedPattern.startsWith("*.")) {
            const suffix = normalizedPattern.slice(2);
            return normalizedHost !== suffix && normalizedHost.endsWith(`.${suffix}`);
        }
        return normalizedHost === normalizedPattern;
    }
    // Maintainer note: update this list whenever a command reads, mutates, captures,
    // navigates within, or otherwise acts on the active page. Destination-bearing
    // commands such as open/goto/navigate and tabs new are handled separately by
    // domainPolicyDestinationUrl.
    function commandNeedsActivePageDomainCheck(args) {
        const [command, subcommand] = args;
        if ([
            "snapshot",
            "find",
            "click",
            "dblclick",
            "fill",
            "type",
            "press",
            "key",
            "keyboard",
            "keydown",
            "keyup",
            "hover",
            "focus",
            "select",
            "check",
            "uncheck",
            "scroll",
            "scrollintoview",
            "screenshot",
            "get",
            "is",
            "eval",
            "back",
            "forward",
            "reload",
            "cookies",
            "storage",
        ].includes(command ?? "")) {
            return true;
        }
        if (command === "wait")
            return waitCommandTouchesActivePage(args.slice(1));
        if (command === "clipboard")
            return subcommand === "copy" || subcommand === "paste";
        if (command === "state")
            return subcommand === "export" || subcommand === "import";
        return false;
    }
    function waitCommandTouchesActivePage(args) {
        if (args.some((arg) => ["--load", "--selector", "--text", "--url", "--fn"].includes(arg)))
            return true;
        const first = args.find((arg) => !arg.startsWith("--"));
        return Boolean(first && Number.isNaN(Number(first)));
    }
    async function executeCommand(args, domainPolicy = null, actionPolicy = null) {
        const [command, ...rest] = args;
        switch (command) {
            case "status":
                return statusResult();
            case "open":
            case "goto":
            case "navigate":
                return openCommand(rest, command || "open");
            case "snapshot":
                return snapshotCommand(rest);
            case "find":
                return findCommand(rest);
            case "click":
                return clickCommand(rest);
            case "dblclick":
                return targetActionCommand("dblclick", rest);
            case "fill":
                return fillCommand(rest);
            case "type":
                return targetActionCommand("type", rest);
            case "press":
            case "key":
                return pressCommand(rest);
            case "keyboard":
                return keyboardCommand(rest);
            case "keydown":
            case "keyup":
                return keyEdgeCommand(command, rest);
            case "hover":
            case "focus":
            case "scrollintoview":
                return targetActionCommand(command, rest);
            case "select":
                return targetActionCommand("select", rest);
            case "check":
            case "uncheck":
                return targetActionCommand(command, rest);
            case "scroll":
                return scrollCommand(rest);
            case "wait":
                return waitCommand(rest);
            case "screenshot":
                return screenshotCommand(rest);
            case "get":
                return getCommand(rest);
            case "is":
                return isCommand(rest);
            case "eval":
                return evalCommand(rest);
            case "tab":
            case "tabs":
                return tabsCommand(rest);
            case "back":
            case "forward":
            case "reload":
                return navigationCommand(command);
            case "window":
                return windowCommand(rest);
            case "frame":
                return frameCommand(rest);
            case "dialog":
                return dialogCommand(rest);
            case "batch":
                return batchCommand(rest, domainPolicy, actionPolicy);
            case "cookies":
                return cookiesCommand(rest);
            case "storage":
                return storageCommand(rest);
            case "state":
                return stateCommand(rest);
            case "clipboard":
                return clipboardCommand(rest);
            case "install":
            case "upgrade":
            case "download":
            case "drag":
            case "upload":
            case "mouse":
            case "set":
            case "network":
            case "stream":
            case "dashboard":
            case "trace":
            case "profiler":
            case "record":
            case "console":
            case "errors":
            case "highlight":
            case "auth":
            case "confirm":
            case "deny":
            case "session":
            case "profiles":
            case "react":
            case "vitals":
            case "addinitscript":
            case "removeinitscript":
            case "pdf":
            case "connect":
            case "pushstate":
            case "diff":
            case "device":
            case "tap":
            case "swipe":
            case "skills":
            case "skill":
                return notAvailable(command, "This agent-browser command is parsed by pire-browser but is not implemented on the Firefox WebExtension backend yet.");
            case "close":
            case "quit":
            case "exit":
                scheduleControlledClose();
                return { text: "pire-browser extension close requested" };
            default:
                return {
                    error: {
                        code: "unsupported_command",
                        message: `Unsupported command: ${command || "(missing)"}`,
                    },
                };
        }
    }
    async function openCommand(args, command = "open") {
        const url = firstPositionalArg(args, ["--label"]);
        if (!url) {
            if (command !== "open") {
                return { error: { code: "invalid_args", message: `${command} requires <url>` } };
            }
            const tab = await targetTab();
            return { text: openTabText(tab), tab };
        }
        const label = valueAfter(args, "--label");
        const newTab = args.includes("--new");
        const active = await activeTab();
        const previousUrl = active?.url;
        const tab = newTab || !active?.id
            ? await browser.tabs.create({ url, active: true })
            : await browser.tabs.update(active.id, { url, active: true });
        await waitForTabReady(tab.id, url, previousUrl, 10000);
        const loadedTab = await browser.tabs.get(tab.id);
        const record = rememberTab(loadedTab);
        if (label)
            setLabel(record, label);
        await activatePage(record);
        return { text: `Opened ${url} in ${record.agentId}${label ? ` (${label})` : ""}`, tab: record };
    }
    async function snapshotCommand(_args) {
        const tab = await targetTab();
        const frames = await snapshotTab(tab.tabId);
        refs.clear();
        let refNumber = 1;
        const lines = [`${tab.agentId} ${tab.title || tab.url || ""}`.trim()];
        for (const frame of frames) {
            if (frame.opaque) {
                lines.push(`  frame ${frame.frameId}: opaque ${frame.url ?? ""}`.trim());
                continue;
            }
            for (const element of frame.elements) {
                const ref = `@e${refNumber++}`;
                element.ref = ref;
                refs.set(ref, {
                    tabId: tab.tabId,
                    frameId: frame.frameId,
                    locator: element.locator,
                    summary: summarizeElement(element),
                });
                lines.push(`  ${ref} ${summarizeElement(element)}`);
            }
        }
        return withDialogs({ text: lines.join("\n"), frames, refs: Array.from(refs.keys()) }, frames);
    }
    async function findCommand(args) {
        const parsed = parseFind(args);
        if ("error" in parsed)
            return parsed;
        if (parsed.action)
            return actOnFind(parsed.locator, parsed.action, parsed.text ?? "");
        const tab = await targetTab();
        const frames = await findInTab(tab.tabId, parsed.locator);
        const matches = frames.flatMap((frame) => frame.elements.map((element) => ({ frameId: frame.frameId, element })));
        if (matches.length === 0) {
            return { error: { code: "not_found", message: "No element matched locator" } };
        }
        const lines = matches.map(({ frameId, element }, index) => {
            const ref = `@e${index + 1}`;
            refs.set(ref, {
                tabId: tab.tabId,
                frameId,
                locator: element.locator,
                summary: summarizeElement(element),
            });
            return `${ref} ${summarizeElement(element)}`;
        });
        return withDialogs({ text: lines.join("\n"), frames }, frames);
    }
    async function clickCommand(args) {
        const locator = locatorFromTarget(args[0]);
        if ("error" in locator)
            return locator;
        return clickLocator(locator.locator, locator.frameId);
    }
    async function fillCommand(args) {
        const locator = locatorFromTarget(args[0]);
        if ("error" in locator)
            return locator;
        const text = args.slice(1).join(" ");
        return fillLocator(locator.locator, text, locator.frameId);
    }
    async function targetActionCommand(action, args) {
        const locator = locatorFromTarget(args[0]);
        if ("error" in locator)
            return locator;
        const text = args.slice(1).join(" ");
        const tab = await targetTab();
        const payload = { type: action, locator: locator.locator };
        if (action === "type")
            payload.text = text;
        if (action === "select")
            payload.value = text;
        const response = await sendFrame(tab.tabId, locator.frameId, payload, { staleOnFrameRoutingError: true });
        return normalizeContentResponse(response);
    }
    async function actOnFind(locator, action, text = "") {
        const tab = await targetTab();
        const frames = await findInTab(tab.tabId, locator);
        const matches = frames.flatMap((frame) => frame.elements.map(() => frame.frameId));
        if (matches.length === 0)
            return { error: { code: "not_found", message: "No element matched locator" } };
        if (matches.length > 1)
            return { error: { code: "ambiguous_locator", message: `${matches.length} elements matched locator` } };
        if (action === "click")
            return clickLocator(locator, matches[0]);
        if (action === "fill")
            return fillLocator(locator, text, matches[0]);
        if (["text", "html", "value", "attr", "box", "styles"].includes(action)) {
            const response = await sendFrame(tab.tabId, matches[0], { type: "get", locator, property: action, attribute: text }, { staleOnFrameRoutingError: true });
            return normalizeContentResponse(response);
        }
        const response = await sendFrame(tab.tabId, matches[0], { type: action, locator, text, value: text, property: action }, { staleOnFrameRoutingError: true });
        return normalizeContentResponse(response);
    }
    async function clickLocator(locator, frameId) {
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, frameId, { type: "click", locator }, { staleOnFrameRoutingError: true });
        return normalizeContentResponse(response);
    }
    async function fillLocator(locator, text, frameId) {
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, frameId, { type: "fill", locator, text }, { staleOnFrameRoutingError: true });
        return normalizeContentResponse(response);
    }
    async function pressCommand(args) {
        const key = args[0];
        if (!key)
            return { error: { code: "invalid_args", message: "press requires <key>" } };
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, undefined, { type: "press", key });
        return normalizeContentResponse(response);
    }
    async function keyboardCommand(args) {
        const [subcommand, ...rest] = args;
        if (subcommand !== "type" && subcommand !== "inserttext") {
            return { error: { code: "InvalidArgumentError", message: "keyboard requires type|inserttext <text>" } };
        }
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, undefined, {
            type: subcommand === "type" ? "keyboard_type" : "keyboard_inserttext",
            text: rest.join(" "),
        });
        return normalizeContentResponse(response);
    }
    async function keyEdgeCommand(command, args) {
        const key = args[0];
        if (!key)
            return { error: { code: "InvalidArgumentError", message: `${command} requires <key>` } };
        return bestEffortResult(`Dispatched ${command} as a press-compatible keyboard event for ${key}`, command, "Firefox WebExtensions cannot hold OS-level key state; this is a page-dispatched keyboard event approximation.");
    }
    async function scrollCommand(args) {
        const direction = args[0] ?? "down";
        const pixels = Number(firstPositionalArg(args.slice(1), ["--selector"]) ?? "900");
        const selector = valueAfter(args, "--selector");
        if (!["up", "down", "left", "right"].includes(direction) || !Number.isFinite(pixels) || pixels <= 0) {
            return { error: { code: "InvalidArgumentError", message: "scroll requires up|down|left|right [positive_pixels]" } };
        }
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, undefined, { type: "scroll", direction, pixels, selector });
        return normalizeContentResponse(response);
    }
    async function waitCommand(args) {
        const timeoutResult = parseTimeoutOption(args, 10000);
        if ("error" in timeoutResult)
            return timeoutResult;
        const timeout = timeoutResult.ms;
        const selector = valueAfter(args, "--selector");
        if (args.includes("--load")) {
            await waitForTabComplete((await targetTab()).tabId, timeout);
            return { text: "Page load complete" };
        }
        if (selector) {
            const tab = await targetTab();
            const response = await sendFrame(tab.tabId, undefined, { type: "wait_selector", selector, timeout, state: valueAfter(args, "--state") ?? "visible" });
            return normalizeContentResponse(response);
        }
        const text = valueAfter(args, "--text");
        if (text) {
            const tab = await targetTab();
            const response = await sendFrame(tab.tabId, undefined, { type: "wait_text", text, timeout, hidden: false });
            return normalizeContentResponse(response);
        }
        const urlPattern = valueAfter(args, "--url");
        if (urlPattern)
            return waitForUrl(urlPattern, timeout);
        const fn = valueAfter(args, "--fn");
        if (fn) {
            const tab = await targetTab();
            const response = await sendFrame(tab.tabId, undefined, { type: "wait_fn", expression: fn, timeout });
            return normalizeContentResponse(response);
        }
        if (args[0] && !args[0].startsWith("--") && Number.isNaN(Number(args[0]))) {
            const tab = await targetTab();
            const response = await sendFrame(tab.tabId, undefined, { type: "wait_selector", selector: args[0], timeout, state: valueAfter(args, "--state") ?? "visible" });
            return normalizeContentResponse(response);
        }
        const waitResult = parsePlainWaitMs(args);
        if ("error" in waitResult)
            return waitResult;
        await delay(waitResult.ms);
        return { text: `Waited ${waitResult.ms}ms` };
    }
    async function getCommand(args) {
        const [property, target, attribute] = args;
        if (property === "title") {
            const tab = await targetTab();
            return { text: tab.title ?? "", value: tab.title ?? "" };
        }
        if (property === "url") {
            const tab = await targetTab();
            return { text: tab.url ?? "", value: tab.url ?? "" };
        }
        if (property === "count") {
            const locator = locatorFromTarget(target);
            if ("error" in locator)
                return locator;
            const tab = await targetTab();
            const frames = await findInTab(tab.tabId, locator.locator);
            const count = frames.reduce((sum, frame) => sum + frame.elements.length, 0);
            return { text: String(count), value: count };
        }
        if (!target)
            return { error: { code: "InvalidArgumentError", message: "get requires <property> <selector>" } };
        const locator = locatorFromTarget(target);
        if ("error" in locator)
            return locator;
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, locator.frameId, { type: "get", locator: locator.locator, property, attribute }, { staleOnFrameRoutingError: true });
        return normalizeContentResponse(response);
    }
    async function isCommand(args) {
        const [state, target] = args;
        if (!state || !target)
            return { error: { code: "InvalidArgumentError", message: "is requires visible|enabled|checked <selector>" } };
        const locator = locatorFromTarget(target);
        if ("error" in locator)
            return locator;
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, locator.frameId, { type: "is", locator: locator.locator, state }, { staleOnFrameRoutingError: true });
        return normalizeContentResponse(response);
    }
    async function evalCommand(args) {
        const script = args.join(" ");
        if (!script)
            return { error: { code: "InvalidArgumentError", message: "eval requires <js>" } };
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, undefined, { type: "eval", script });
        return normalizeContentResponse(response);
    }
    async function screenshotCommand(args) {
        const dir = valueAfter(args, "--screenshot-dir");
        const format = valueAfter(args, "--screenshot-format") === "jpeg" ? "jpeg" : "png";
        const quality = Number(valueAfter(args, "--screenshot-quality") ?? "92");
        const positional = firstPositionalArg(args, ["--screenshot-dir", "--screenshot-format", "--screenshot-quality"]);
        const path = dir && positional && !/[\\/]/.test(positional) ? `${dir.replace(/[\\/]$/, "")}/${positional}` : positional ?? `pire-browser-screenshot-${Date.now()}.${format === "jpeg" ? "jpg" : "png"}`;
        const tab = await targetTab();
        await activatePage(tab);
        const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format, quality });
        const meta = await sendScreenshotChunks(dataUrl);
        return {
            text: `Screenshot captured for ${path}`,
            screenshot: meta,
            screenshotPath: path,
            warnings: args.includes("--full") || args.includes("--annotate")
                ? [bestEffortWarning("screenshot", "Full-page and annotated screenshots are not implemented yet; captured the visible viewport.")]
                : [],
        };
    }
    async function navigationCommand(command) {
        const tab = await targetTab();
        if (command === "back")
            await browser.tabs.goBack(tab.tabId);
        if (command === "forward")
            await browser.tabs.goForward(tab.tabId);
        if (command === "reload")
            await browser.tabs.reload(tab.tabId);
        return { text: `${command} requested` };
    }
    async function windowCommand(args) {
        if (args[0] !== "new")
            return { error: { code: "InvalidArgumentError", message: "window requires new" } };
        const created = await browser.windows.create({ focused: true });
        return { text: `Opened window ${created.id ?? ""}`.trim(), window: created };
    }
    async function frameCommand(args) {
        if (args[0] === "main")
            return bestEffortResult("Frame targeting reset to main", "frame", "pire-browser currently scopes frame targeting per command rather than storing a persistent frame selection.");
        return bestEffortResult("Frame command accepted", "frame", "pire-browser searches across frames for selectors and refs instead of switching persistent frame context.");
    }
    async function dialogCommand(args) {
        return bestEffortResult(`Dialog ${args[0] ?? "status"} requested`, "dialog", "Dialogs are captured by the page shim when injection is allowed; active modal control is best-effort in Firefox WebExtensions.");
    }
    async function batchCommand(args, domainPolicy, actionPolicy) {
        const bailOnError = args.includes("--bail");
        const commands = args.filter((arg) => arg !== "--bail");
        const results = [];
        for (const commandText of commands) {
            const result = await executeCommandWithPolicies(splitCommand(commandText), domainPolicy, actionPolicy);
            results.push(result);
            const errorCode = result.error?.code;
            if ("error" in result && (errorCode === "DomainPolicyError" || errorCode === "ActionPolicyError")) {
                return { error: result.error, text: `Ran ${results.length} batch command(s)`, results };
            }
            if (bailOnError && "error" in result)
                break;
        }
        return { text: `Ran ${results.length} batch command(s)`, results };
    }
    async function cookiesCommand(args) {
        const tab = await targetTab();
        if (args[0] === "clear") {
            const cookies = await browser.cookies.getAll({ url: tab.url });
            await Promise.all(cookies.map((cookie) => browser.cookies.remove({ url: cookieUrl(cookie), name: cookie.name })));
            return { text: `Cleared ${cookies.length} cookie(s)` };
        }
        if (args[0] === "set") {
            const [, name, value] = args;
            if (!name)
                return { error: { code: "InvalidArgumentError", message: "cookies set requires <name> <value>" } };
            await browser.cookies.set({ url: tab.url, name, value: value ?? "" });
            return { text: `Set cookie ${name}` };
        }
        const cookies = await browser.cookies.getAll({ url: tab.url });
        return { text: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("\n"), cookies };
    }
    async function storageCommand(args) {
        const area = args[0] === "session" ? "sessionStorage" : "localStorage";
        const op = args[1];
        const key = args[2];
        const value = args.slice(3).join(" ");
        const expression = op === "set"
            ? `${area}.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)}); true`
            : op === "clear"
                ? `${area}.clear(); true`
                : key
                    ? `${area}.getItem(${JSON.stringify(key)})`
                    : `Object.fromEntries(Array.from({length:${area}.length},(_,i)=>{const k=${area}.key(i);return [k,${area}.getItem(k)]}))`;
        const result = await evalCommand([expression]);
        return { ...result, warnings: mergeWarnings(result.warnings, [bestEffortWarning("storage", "Storage commands execute in the page context for the active origin.")]) };
    }
    async function stateCommand(args) {
        const [subcommand, ...rest] = args;
        if (subcommand === "export")
            return stateExportCommand();
        if (subcommand === "import")
            return stateImportCommand(rest.join(" "));
        return notAvailable("state", "Only `state save` and `state load` are implemented by the pire-browser CLI; other state commands are not available on the Firefox WebExtension backend yet.");
    }
    async function stateExportCommand() {
        const tab = await targetTab();
        const context = activeOriginContext(tab);
        if ("error" in context)
            return context;
        await waitForTabComplete(tab.tabId, 10000).catch(() => undefined);
        const cookies = await browser.cookies.getAll({ url: context.url });
        const storage = await stateStorageForTab(tab.tabId);
        if ("error" in storage)
            return storage;
        return {
            text: `Exported active-origin state for ${context.origin}`,
            source: context,
            cookies,
            localStorage: storage.localStorage,
            sessionStorage: storage.sessionStorage,
        };
    }
    async function stateImportCommand(payload) {
        const parsed = parseStatePayload(payload);
        if ("error" in parsed)
            return parsed;
        const state = parsed.state;
        const tab = await targetTab();
        const context = activeOriginContext(tab);
        if ("error" in context)
            return context;
        if (context.origin !== state.source.origin) {
            const displayUrl = displayUrlWithoutQueryOrFragment(state.source.url) || state.source.origin;
            return {
                error: {
                    code: "InvalidArgumentError",
                    message: `state load origin mismatch: active page is ${context.origin} but state file is for ${state.source.origin}; open ${displayUrl} first or load into a non-live --session-name profile`,
                },
            };
        }
        await waitForTabComplete(tab.tabId, 10000).catch(() => undefined);
        const existingCookies = await browser.cookies.getAll({ url: context.url });
        await Promise.all(existingCookies.map((cookie) => browser.cookies.remove({ url: cookieUrl(cookie), name: cookie.name })));
        let cookiesSet = 0;
        let cookiesSkipped = 0;
        for (const cookie of state.cookies ?? []) {
            if (await restoreCookie(context.url, cookie))
                cookiesSet += 1;
            else
                cookiesSkipped += 1;
        }
        const storage = await importStateStorage(tab.tabId, state.localStorage ?? {}, state.sessionStorage ?? {});
        if ("error" in storage)
            return storage;
        await browser.tabs.reload(tab.tabId);
        await waitForTabComplete(tab.tabId, 10000);
        const warnings = cookiesSkipped > 0
            ? [bestEffortWarning("state load", `Skipped ${cookiesSkipped} cookie(s) whose metadata Firefox would not restore for the active origin.`)]
            : [];
        return {
            text: `Imported active-origin state for ${context.origin}`,
            source: context,
            cookiesSet,
            localStorageKeys: storage.localStorageKeys,
            sessionStorageKeys: storage.sessionStorageKeys,
            reloaded: true,
            warnings,
        };
    }
    function activeOriginContext(tab) {
        try {
            const url = new URL(tab.url ?? "");
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                return { error: { code: "InvalidArgumentError", message: "state save/load requires an active http(s) page" } };
            }
            return { url: tab.url ?? url.href, origin: url.origin };
        }
        catch {
            return { error: { code: "InvalidArgumentError", message: "state save/load requires an active page with a valid URL" } };
        }
    }
    function parseStatePayload(payload) {
        let state;
        try {
            state = JSON.parse(payload);
        }
        catch {
            return { error: { code: "InvalidArgumentError", message: "state load requires a valid JSON state file" } };
        }
        if (state.schemaVersion !== 1 || state.tool !== "pire-browser" || state.kind !== "active-origin-state") {
            return { error: { code: "InvalidArgumentError", message: "state load requires a pire-browser active-origin-state schemaVersion 1 file" } };
        }
        if (!state.source?.url || !state.source?.origin) {
            return { error: { code: "InvalidArgumentError", message: "state load requires source.url and source.origin" } };
        }
        if (!/^https?:\/\//.test(state.source.url) || !/^https?:\/\//.test(state.source.origin)) {
            return { error: { code: "InvalidArgumentError", message: "state load requires an http(s) source URL and origin" } };
        }
        return { state };
    }
    function displayUrlWithoutQueryOrFragment(url) {
        const index = url.search(/[?#]/);
        return index >= 0 ? url.slice(0, index) : url;
    }
    async function stateStorageForTab(tabId) {
        try {
            const response = await sendFrame(tabId, 0, { type: "state_export_storage" });
            return {
                localStorage: response.localStorage ?? {},
                sessionStorage: response.sessionStorage ?? {},
            };
        }
        catch (error) {
            return { error: { code: "command_failed", message: `Failed to read active-origin storage: ${error instanceof Error ? error.message : String(error)}` } };
        }
    }
    async function importStateStorage(tabId, localStorage, sessionStorage) {
        try {
            const response = await sendFrame(tabId, 0, {
                type: "state_import_storage",
                localStorage,
                sessionStorage,
            });
            if (response?.error)
                return { error: response.error };
            return {
                localStorageKeys: response.localStorageKeys ?? Object.keys(localStorage).length,
                sessionStorageKeys: response.sessionStorageKeys ?? Object.keys(sessionStorage).length,
            };
        }
        catch (error) {
            return { error: { code: "command_failed", message: `Failed to write active-origin storage: ${error instanceof Error ? error.message : String(error)}` } };
        }
    }
    async function restoreCookie(url, cookie) {
        if (!cookie || typeof cookie.name !== "string")
            return false;
        const base = {
            url,
            name: cookie.name,
            value: typeof cookie.value === "string" ? cookie.value : "",
        };
        const withMetadata = { ...base };
        if (typeof cookie.path === "string")
            withMetadata.path = cookie.path;
        if (typeof cookie.secure === "boolean")
            withMetadata.secure = cookie.secure;
        if (typeof cookie.httpOnly === "boolean")
            withMetadata.httpOnly = cookie.httpOnly;
        if (typeof cookie.sameSite === "string" && cookie.sameSite !== "unspecified")
            withMetadata.sameSite = cookie.sameSite;
        if (typeof cookie.expirationDate === "number")
            withMetadata.expirationDate = cookie.expirationDate;
        if (typeof cookie.storeId === "string")
            withMetadata.storeId = cookie.storeId;
        if (cookie.hostOnly === false && typeof cookie.domain === "string")
            withMetadata.domain = cookie.domain;
        for (const details of [withMetadata, base]) {
            try {
                await browser.cookies.set(details);
                return true;
            }
            catch {
                // Retry with less metadata; some cookie attributes are Firefox/profile dependent.
            }
        }
        return false;
    }
    async function clipboardCommand(args) {
        const [subcommand, ...rest] = args;
        if (subcommand === "read") {
            const read = await readClipboardText();
            if ("error" in read)
                return read;
            return { text: read.text, value: read.text, length: read.text.length };
        }
        if (subcommand === "write") {
            if (rest.length === 0) {
                return { error: { code: "InvalidArgumentError", message: "clipboard write requires <text>" } };
            }
            const text = rest.join(" ");
            const written = await writeClipboardText(text);
            if ("error" in written)
                return written;
            return { text: `Wrote ${text.length} character(s) to clipboard`, length: text.length };
        }
        if (subcommand === "copy") {
            const selection = await selectedTextFromActiveTab();
            if (!selection?.text) {
                return { error: { code: "InvalidArgumentError", message: "clipboard copy requires a non-empty current selection" } };
            }
            const written = await writeClipboardText(selection.text);
            if ("error" in written)
                return written;
            return {
                text: `Copied ${selection.text.length} character(s) from selection`,
                length: selection.text.length,
                warnings: [
                    bestEffortWarning("clipboard copy", "Copied the current page selection through the Firefox extension clipboard API; native Ctrl+C and custom page clipboard handlers were not invoked."),
                ],
                dialogs: selection.dialogs ?? [],
            };
        }
        if (subcommand === "paste") {
            const read = await readClipboardText();
            if ("error" in read)
                return read;
            const pasted = await pasteTextIntoFocusedFrame(read.text);
            if (!pasted) {
                return {
                    error: {
                        code: "InvalidArgumentError",
                        message: "clipboard paste requires a focused editable element; click or focus an input, textarea, or contenteditable target first",
                    },
                };
            }
            return {
                text: `Pasted ${read.text.length} character(s) into focused element`,
                length: read.text.length,
                warnings: [
                    bestEffortWarning("clipboard paste", "Inserted clipboard text through the Firefox extension; native Ctrl+V and custom page clipboard handlers were not invoked."),
                ],
                dialogs: pasted.dialogs ?? [],
            };
        }
        return { error: { code: "InvalidArgumentError", message: "clipboard requires read|write|copy|paste" } };
    }
    async function readClipboardText() {
        if (!navigator.clipboard?.readText) {
            return notAvailable("clipboard read", "Firefox did not expose navigator.clipboard.readText to the extension context.");
        }
        try {
            return { text: await navigator.clipboard.readText() };
        }
        catch (error) {
            return {
                error: {
                    code: "ClipboardError",
                    message: `Failed to read clipboard text: ${error instanceof Error ? error.message : String(error)}`,
                },
            };
        }
    }
    async function writeClipboardText(text) {
        if (!navigator.clipboard?.writeText) {
            return notAvailable("clipboard write", "Firefox did not expose navigator.clipboard.writeText to the extension context.");
        }
        try {
            await navigator.clipboard.writeText(text);
            return { ok: true };
        }
        catch (error) {
            return {
                error: {
                    code: "ClipboardError",
                    message: `Failed to write clipboard text: ${error instanceof Error ? error.message : String(error)}`,
                },
            };
        }
    }
    async function selectedTextFromActiveTab() {
        const tab = await targetTab();
        const responses = await clipboardFrameResponses(tab.tabId, { type: "clipboard_selection" });
        const withText = responses.filter((response) => typeof response.text === "string" && response.text.length > 0);
        return withText.find((response) => response.focused) ?? withText[0] ?? null;
    }
    async function pasteTextIntoFocusedFrame(text) {
        const tab = await targetTab();
        const responses = await clipboardFrameResponses(tab.tabId, { type: "clipboard_paste", text });
        return responses.find((response) => response.pasted) ?? null;
    }
    async function clipboardFrameResponses(tabId, message) {
        const frames = await frameIdsForTab(tabId);
        const responses = [];
        for (const frameId of frames) {
            try {
                const response = (await sendFrame(tabId, frameId, message));
                if (response?.handled || response?.pasted || response?.text)
                    responses.push(response);
            }
            catch {
                // Cross-origin or restricted frames can reject extension messages.
            }
        }
        return responses;
    }
    async function frameIdsForTab(tabId) {
        const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => [{ frameId: 0 }]);
        return frames.map((frame) => frame.frameId).filter((frameId) => typeof frameId === "number");
    }
    async function tabsCommand(args) {
        const [subcommand, target, value] = args;
        await reconcileTabs();
        if (subcommand === "list" || !subcommand) {
            const rows = Array.from(tabsByAgentId.values())
                .filter((tab) => !tab.closed)
                .map((tab) => `${tab.agentId}${tab.label ? ` ${tab.label}` : ""} ${tab.active ? "*" : ""} ${tab.title || tab.url || ""}`.trim());
            return { text: rows.join("\n") || "No tabs tracked", tabs: Array.from(tabsByAgentId.values()) };
        }
        if (subcommand === "new") {
            const label = valueAfter(args, "--label");
            const url = firstPositionalArg(args.slice(1), ["--label"]);
            const created = await browser.tabs.create({ url: url || "about:blank", active: true });
            const record = markControlledPage(rememberTab(created));
            if (label)
                setLabel(record, label);
            return { text: `Opened ${record.agentId}${label ? ` (${label})` : ""}`, tab: record };
        }
        if (subcommand === "select" || findTab(subcommand)) {
            const tab = findTab(subcommand === "select" ? target : subcommand);
            if (!tab)
                return { error: { code: "tab_closed", message: `No live tab found: ${target}` } };
            await activatePage(tab);
            return { text: `Selected ${tab.agentId}` };
        }
        if (subcommand === "close") {
            const tab = target ? findTab(target) : await targetTab();
            if (!tab)
                return { error: { code: "tab_closed", message: `No live tab found: ${target}` } };
            await browser.tabs.remove(tab.tabId);
            tab.closed = true;
            return { text: `Closed ${tab.agentId}` };
        }
        if (subcommand === "label") {
            const tab = findTab(target);
            if (!tab || !value)
                return { error: { code: "invalid_args", message: "tabs label requires <tN> <label>" } };
            setLabel(tab, value);
            return { text: `Labeled ${tab.agentId} as ${value}` };
        }
        return { error: { code: "unsupported_command", message: `Unsupported tabs command: ${subcommand}` } };
    }
    function statusResult() {
        return {
            text: `pire-browser extension connected (${tabsByAgentId.size} tracked tab(s))`,
            profileId,
            tabs: Array.from(tabsByAgentId.values()),
        };
    }
    async function snapshotTab(tabId) {
        const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => [{ frameId: 0 }]);
        const out = [];
        for (const frame of frames) {
            try {
                const snapshot = await sendFrame(tabId, frame.frameId, { type: "snapshot" });
                out.push({ ...snapshot, frameId: frame.frameId });
            }
            catch (error) {
                out.push({
                    frameId: frame.frameId,
                    url: frame.url,
                    opaque: true,
                    elements: [],
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return out;
    }
    async function findInTab(tabId, locator) {
        const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => [{ frameId: 0 }]);
        const out = [];
        for (const frame of frames) {
            try {
                const response = await sendFrame(tabId, frame.frameId, { type: "find", locator });
                out.push({ frameId: frame.frameId, elements: response.matches ?? [], dialogs: response.dialogs ?? [] });
            }
            catch {
                out.push({ frameId: frame.frameId, opaque: true, elements: [] });
            }
        }
        return out;
    }
    async function sendFrame(tabId, frameId, message, behavior = {}) {
        const target = typeof frameId === "number" ? { frameId } : undefined;
        try {
            return await browser.tabs.sendMessage(tabId, message, target);
        }
        catch (error) {
            if (behavior.staleOnFrameRoutingError && typeof frameId === "number" && isFrameRoutingError(error)) {
                return {
                    error: {
                        code: "ref_stale",
                        message: `Frame ${frameId} is not available; run snapshot or find again`,
                    },
                    dialogs: [],
                };
            }
            throw error;
        }
    }
    function isFrameRoutingError(error) {
        const message = error instanceof Error ? error.message : String(error);
        return /frame.*not found|receiving end does not exist|could not establish connection|no matching message handler/i.test(message);
    }
    function parseFind(args) {
        const [kind, ...rest] = args;
        let locator;
        const index = Number(valueAfter(rest, "--index") ?? "0");
        if (kind === "role") {
            const role = rest[0];
            if (!role)
                return { error: { code: "invalid_args", message: "find role requires <role>" } };
            locator = { kind: "role", role, name: valueAfter(rest, "--name"), index };
            const tail = actionTail(rest.slice(1), ["--name", "--index"], ["--exact"]);
            if (tail[0])
                return { locator, action: tail[0], text: tail.slice(1).join(" ") };
        }
        else if (kind === "label" || kind === "text" || kind === "placeholder" || kind === "alt" || kind === "title") {
            const text = rest[0];
            if (!text)
                return { error: { code: "invalid_args", message: `find ${kind} requires <text>` } };
            locator = { kind, text, index };
            const tail = actionTail(rest.slice(1), ["--index"], ["--exact"]);
            if (tail[0])
                return { locator, action: tail[0], text: tail.slice(1).join(" ") };
        }
        else if (kind === "testid") {
            const value = rest[0];
            if (!value)
                return { error: { code: "invalid_args", message: "find testid requires <value>" } };
            locator = { kind: "testid", value, index };
            const tail = actionTail(rest.slice(1), ["--index"], ["--exact"]);
            if (tail[0])
                return { locator, action: tail[0], text: tail.slice(1).join(" ") };
        }
        else if (kind === "first" || kind === "last" || kind === "nth") {
            const nthIndex = kind === "nth" ? Number(rest[0] ?? "0") : 0;
            const selector = kind === "nth" ? rest[1] : rest[0];
            if (!selector)
                return { error: { code: "invalid_args", message: `find ${kind} requires <selector>` } };
            locator = selectorToLocator(selector);
            if ("index" in locator) {
                locator.index = kind === "last" ? Number.MAX_SAFE_INTEGER : nthIndex;
            }
            const tail = actionTail(rest.slice(kind === "nth" ? 2 : 1), [], ["--exact"]);
            if (tail[0])
                return { locator, action: tail[0], text: tail.slice(1).join(" ") };
        }
        else {
            return { error: { code: "invalid_args", message: "find requires role|label|text|placeholder|testid|alt|title|first|last|nth" } };
        }
        return { locator };
    }
    function locatorFromTarget(target) {
        if (!target)
            return { error: { code: "invalid_args", message: "target is required" } };
        if (target.startsWith("@")) {
            const ref = refs.get(target);
            if (!ref)
                return { error: { code: "ref_stale", message: `${target} is not available; run snapshot or find again` } };
            return { locator: ref.locator, frameId: ref.frameId };
        }
        return { locator: selectorToLocator(target) };
    }
    function selectorToLocator(target) {
        if (target.startsWith("text="))
            return { kind: "text", text: target.slice("text=".length), index: 0 };
        if (target.startsWith("xpath="))
            return { kind: "xpath", expression: target.slice("xpath=".length), index: -1 };
        return { kind: "css", selector: target, index: -1 };
    }
    function normalizeContentResponse(response) {
        if (response?.error)
            return { error: response.error, dialogs: response.dialogs ?? [] };
        return {
            text: response?.text ?? "ok",
            value: response?.value,
            warnings: response?.warnings ?? [],
            dialogs: response?.dialogs ?? [],
        };
    }
    async function waitForUrl(pattern, timeout) {
        const tab = await targetTab();
        const matches = (url) => Boolean(url && globToRegExp(pattern).test(url));
        if (matches(tab.url))
            return { text: `URL matched ${pattern}` };
        return new Promise((resolve) => {
            let settled = false;
            const cleanup = () => {
                clearTimeout(timer);
                clearInterval(poll);
                browser.tabs.onUpdated.removeListener(listener);
            };
            const settle = (result) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                resolve(result);
            };
            const checkCurrent = async () => {
                const current = await browser.tabs.get(tab.tabId).catch(() => null);
                if (matches(current?.url))
                    settle({ text: `URL matched ${pattern}` });
            };
            const listener = (tabId, changeInfo, updatedTab) => {
                if (tabId === tab.tabId && matches(changeInfo.url ?? updatedTab.url)) {
                    settle({ text: `URL matched ${pattern}` });
                }
            };
            const timer = setTimeout(() => {
                settle({ error: { code: "timeout", message: `Timed out waiting for URL: ${pattern}` } });
            }, timeout);
            const poll = setInterval(() => void checkCurrent(), 100);
            browser.tabs.onUpdated.addListener(listener);
            void checkCurrent();
        });
    }
    function notAvailable(feature, message) {
        return {
            error: {
                code: "NotAvailableError",
                message,
                data: { feature, compatibility: "not_available" },
            },
        };
    }
    function bestEffortResult(text, feature, message) {
        return {
            text,
            warnings: [bestEffortWarning(feature, message)],
        };
    }
    function bestEffortWarning(feature, message) {
        return { code: "BEST_EFFORT_FIREFOX_GAP", feature, message };
    }
    function mergeWarnings(...groups) {
        return groups.flatMap((group) => (Array.isArray(group) ? group : group ? [group] : []));
    }
    async function prepareLargeResult(result) {
        const encoded = new TextEncoder().encode(JSON.stringify(result));
        if (encoded.byteLength < CHUNK_SIZE)
            return result;
        const base64 = bytesToBase64(encoded);
        const digest = await crypto.subtle.digest("SHA-256", encoded);
        const sha256 = Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
        const transferId = crypto.randomUUID();
        const total = Math.ceil(base64.length / CHUNK_SIZE);
        for (let index = 0; index < total; index++) {
            postNative({
                type: "result_chunk",
                transfer_id: transferId,
                index,
                total,
                byte_length: encoded.byteLength,
                sha256,
                data: base64.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
            });
            await delay(5);
        }
        return {
            text: result.text ?? "Large result transferred",
            largeResult: {
                transferId,
                mimeType: "application/json",
                byteLength: encoded.byteLength,
                sha256,
            },
        };
    }
    async function activeTab() {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        return tabs[0];
    }
    async function targetTab() {
        await reconcileTabs();
        const active = await activeTab();
        if (active?.id)
            return markControlledPage(rememberTab(active));
        const first = Array.from(tabsByAgentId.values()).find((tab) => !tab.closed);
        if (first)
            return markControlledPage(first);
        throw new Error("tab_closed: no active tab available");
    }
    function rememberTab(tab) {
        if (typeof tab.id !== "number" || typeof tab.windowId !== "number") {
            throw new Error("tab_missing_id: Firefox tab is missing tabId or windowId");
        }
        let record = tabsByBrowserId.get(tab.id);
        if (!record) {
            record = {
                tabId: tab.id,
                windowId: tab.windowId,
                agentId: `t${nextTabNumber++}`,
                label: labels.get(String(tab.id)),
            };
            tabsByBrowserId.set(tab.id, record);
            tabsByAgentId.set(record.agentId, record);
        }
        record.url = tab.url;
        record.title = tab.title;
        record.active = tab.active;
        record.windowId = tab.windowId;
        record.closed = false;
        return record;
    }
    async function activatePage(page) {
        markControlledPage(page);
        await browser.windows.update(page.windowId, { focused: true });
        await browser.tabs.update(page.tabId, { active: true });
    }
    function markControlledPage(page) {
        page.controlled = true;
        return page;
    }
    function scheduleControlledClose() {
        if (controlledCloseScheduled)
            return;
        controlledCloseScheduled = true;
        setTimeout(() => {
            controlledCloseScheduled = false;
            void closeControlledSurfaces().catch((error) => {
                console.error("[pire-browser] controlled close failed", error);
            });
        }, CLOSE_TEARDOWN_DELAY_MS);
    }
    async function closeControlledSurfaces() {
        await reconcileTabs();
        const liveTabs = await browser.tabs.query({});
        const controlledTabIds = new Set(Array.from(tabsByBrowserId.values())
            .filter((tab) => tab.controlled && !tab.closed)
            .map((tab) => tab.tabId));
        const active = await activeTab();
        const fallbackTabId = typeof active?.id === "number" ? active.id : undefined;
        const plan = planControlledClose(liveTabs, controlledTabIds, fallbackTabId);
        if (plan.windowIds.length > 0) {
            disconnectNativeForControlledClose();
        }
        for (const windowId of plan.windowIds) {
            await browser.windows.remove(windowId);
        }
        if (plan.tabIds.length > 0) {
            await browser.tabs.remove(plan.tabIds);
        }
        for (const tabId of [...plan.tabIds, ...tabsInWindows(liveTabs, plan.windowIds)]) {
            const record = tabsByBrowserId.get(tabId);
            if (record)
                record.closed = true;
        }
    }
    function planControlledClose(liveTabs, controlledTabIds, fallbackTabId) {
        const tabsByWindow = new Map();
        for (const tab of liveTabs) {
            if (typeof tab.id !== "number" || typeof tab.windowId !== "number")
                continue;
            const tabs = tabsByWindow.get(tab.windowId) ?? [];
            tabs.push(tab);
            tabsByWindow.set(tab.windowId, tabs);
        }
        const windowIds = [];
        const tabIds = [];
        for (const [windowId, windowTabs] of tabsByWindow) {
            const controlledTabs = windowTabs.filter((tab) => controlledTabIds.has(tab.id));
            if (controlledTabs.length === 0)
                continue;
            if (windowTabs.every((tab) => controlledTabIds.has(tab.id))) {
                windowIds.push(windowId);
            }
            else {
                tabIds.push(...controlledTabs.map((tab) => tab.id));
            }
        }
        if (windowIds.length === 0 && tabIds.length === 0 && typeof fallbackTabId === "number") {
            tabIds.push(fallbackTabId);
        }
        return { windowIds, tabIds };
    }
    function disconnectNativeForControlledClose() {
        nativeReconnectEnabled = false;
        try {
            port?.disconnect?.();
        }
        catch {
            // The browser may already be tearing down the native messaging port.
        }
    }
    function tabsInWindows(liveTabs, windowIds) {
        const windowIdSet = new Set(windowIds);
        return liveTabs
            .filter((tab) => typeof tab.id === "number" && typeof tab.windowId === "number" && windowIdSet.has(tab.windowId))
            .map((tab) => tab.id);
    }
    function findTab(target) {
        if (!target)
            return undefined;
        const normalized = /^\d+$/.test(target) ? `t${target}` : target;
        return tabsByAgentId.get(normalized) || Array.from(tabsByAgentId.values()).find((tab) => tab.label === target);
    }
    function setLabel(tab, label) {
        tab.label = label;
        labels.set(String(tab.tabId), label);
    }
    async function reconcileTabs() {
        const liveTabs = await browser.tabs.query({});
        const liveIds = new Set();
        for (const tab of liveTabs) {
            if (tab.id) {
                liveIds.add(tab.id);
                rememberTab(tab);
            }
        }
        for (const tab of tabsByAgentId.values()) {
            if (!liveIds.has(tab.tabId))
                tab.closed = true;
        }
    }
    function registerBrowserListeners() {
        browser.tabs.onCreated.addListener((tab) => {
            if (typeof tab.id === "number" && typeof tab.windowId === "number")
                rememberTab(tab);
            void postSessionEvent("tabs_changed", {});
        });
        browser.tabs.onRemoved.addListener((tabId) => {
            const record = tabsByBrowserId.get(tabId);
            if (record)
                record.closed = true;
            void postSessionEvent("tabs_changed", {});
        });
        browser.tabs.onUpdated.addListener((_tabId, _change, tab) => {
            if (typeof tab.id === "number" && typeof tab.windowId === "number")
                rememberTab(tab);
            void postSessionEvent("tabs_changed", {});
        });
        browser.tabs.onActivated.addListener(() => void postSessionEvent("focused", {}));
        browser.windows.onFocusChanged.addListener(() => void postSessionEvent("focused", {}));
    }
    async function waitForTabComplete(tabId, timeout) {
        const tab = await browser.tabs.get(tabId);
        if (tab.status === "complete")
            return;
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                browser.tabs.onUpdated.removeListener(listener);
                reject(new Error("timeout waiting for page load"));
            }, timeout);
            const listener = (updatedTabId, changeInfo) => {
                if (updatedTabId === tabId && changeInfo.status === "complete") {
                    clearTimeout(timer);
                    browser.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            browser.tabs.onUpdated.addListener(listener);
        });
    }
    async function waitForTabReady(tabId, expectedUrl, previousUrl, timeout) {
        const isReady = (tab) => {
            if (tab.status !== "complete" || !tab.url || tab.url === "about:blank" || tab.url === "about:newtab")
                return false;
            if (tab.url === expectedUrl || tab.url.startsWith(`${expectedUrl}#`))
                return true;
            return previousUrl ? tab.url !== previousUrl : true;
        };
        const tab = await browser.tabs.get(tabId);
        if (isReady(tab))
            return;
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                browser.tabs.onUpdated.removeListener(listener);
                reject(new Error("timeout waiting for page load"));
            }, timeout);
            const listener = (updatedTabId, _changeInfo, updatedTab) => {
                if (updatedTabId === tabId && isReady(updatedTab)) {
                    clearTimeout(timer);
                    browser.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            browser.tabs.onUpdated.addListener(listener);
        });
    }
    async function sendScreenshotChunks(dataUrl) {
        const [header, base64] = dataUrl.split(",", 2);
        const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? "image/png";
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const sha256 = Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
        const transferId = crypto.randomUUID();
        const total = Math.ceil(base64.length / CHUNK_SIZE);
        for (let index = 0; index < total; index++) {
            const chunk = base64.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
            postNative({
                type: "screenshot_chunk",
                transfer_id: transferId,
                index,
                total,
                byte_length: bytes.length,
                sha256,
                data: chunk,
            });
            await delay(5);
        }
        return { transferId, mimeType, byteLength: bytes.length, sha256 };
    }
    function summarizeElement(element) {
        const name = element.name || element.label || element.placeholder || element.text;
        const disabled = element.disabled ? " disabled" : "";
        return `${element.role}${name ? ` "${truncate(name, 80)}"` : ""}${disabled}`;
    }
    function withDialogs(result, frames) {
        const dialogs = frames.flatMap((frame) => frame.dialogs ?? []);
        if (dialogs.length) {
            result.dialogs = dialogs;
            result.warnings = dialogs.map((dialog) => `${dialog.type}: ${dialog.message}`);
        }
        return result;
    }
    function valueAfter(args, flag) {
        const index = args.indexOf(flag);
        return index >= 0 ? args[index + 1] : undefined;
    }
    function firstPositionalArg(args, valueFlags) {
        let skipNext = false;
        for (const arg of args) {
            if (skipNext) {
                skipNext = false;
                continue;
            }
            if (valueFlags.includes(arg)) {
                skipNext = true;
                continue;
            }
            if (arg.startsWith("--"))
                continue;
            return arg;
        }
        return undefined;
    }
    function parsePlainWaitMs(args) {
        const positional = firstPositionalArg(args, ["--selector", "--timeout"]);
        if (positional !== undefined)
            return parsePositiveInteger(positional, "wait");
        return parseTimeoutOption(args, 1000);
    }
    function parseTimeoutOption(args, defaultMs) {
        const index = args.indexOf("--timeout");
        if (index < 0)
            return { ms: defaultMs };
        const value = args[index + 1];
        if (!value || value.startsWith("--")) {
            return { error: { code: "invalid_args", message: "--timeout requires a positive integer" } };
        }
        return parsePositiveInteger(value, "--timeout");
    }
    function parsePositiveInteger(value, label) {
        const ms = Number(value);
        if (!Number.isInteger(ms) || ms <= 0) {
            return { error: { code: "invalid_args", message: `${label} requires a positive integer` } };
        }
        return { ms };
    }
    function openTabText(tab) {
        const suffix = tab.title || tab.url || "";
        return `Browser open in ${tab.agentId}${suffix ? ` ${suffix}` : ""}`;
    }
    function actionTail(args, valueFlags, boolFlags) {
        const tail = [];
        for (let index = 0; index < args.length; index++) {
            const arg = args[index];
            if (valueFlags.includes(arg)) {
                index += 1;
                continue;
            }
            if (boolFlags.includes(arg))
                continue;
            tail.push(arg);
        }
        return tail;
    }
    function truncate(value, max) {
        return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
    }
    function splitCommand(command) {
        const parts = [];
        let current = "";
        let quote;
        let escaping = false;
        for (const char of command) {
            if (escaping) {
                current += char;
                escaping = false;
                continue;
            }
            if (char === "\\") {
                escaping = true;
                continue;
            }
            if (quote) {
                if (char === quote)
                    quote = undefined;
                else
                    current += char;
                continue;
            }
            if (char === '"' || char === "'") {
                quote = char;
                continue;
            }
            if (/\s/.test(char)) {
                if (current) {
                    parts.push(current);
                    current = "";
                }
                continue;
            }
            current += char;
        }
        if (current)
            parts.push(current);
        return parts;
    }
    function globToRegExp(pattern) {
        const doubleStar = "\u0000";
        const escaped = pattern
            .replace(/\*\*/g, doubleStar)
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, "[^/]*")
            .split(doubleStar)
            .join(".*");
        return new RegExp(`^${escaped}$`);
    }
    function bytesToBase64(bytes) {
        let binary = "";
        for (const byte of bytes)
            binary += String.fromCharCode(byte);
        return btoa(binary);
    }
    function cookieUrl(cookie) {
        const protocol = cookie.secure ? "https://" : "http://";
        return `${protocol}${String(cookie.domain).replace(/^\./, "")}${cookie.path ?? "/"}`;
    }
    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
