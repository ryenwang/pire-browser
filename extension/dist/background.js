"use strict";
{
    const HOST_NAME = "dev.pi.pire_browser";
    const CHUNK_SIZE = 700000;
    const CLOSE_TEARDOWN_DELAY_MS = 0;
    const TAB_READY_POLL_INTERVAL_MS = 100;
    const NETWORK_IDLE_QUIET_MS = 500;
    const NETWORK_IDLE_POLL_INTERVAL_MS = 50;
    const MAX_NETWORK_RECORDS_PER_TAB = 300;
    const DOWNLOAD_TIMEOUT_MS = 60000;
    const DOWNLOAD_RECENT_MS = 60000;
    const DOWNLOAD_POLL_INTERVAL_MS = 200;
    const AUTH_STORAGE_KEY = "pireBrowserAuthProfiles";
    const DEFAULT_AUTH_SELECTORS = {
        username: 'input[autocomplete="username"], input[type="email"], input[name="username"], input[name="email"], #username, #email, input[type="text"]',
        password: 'input[autocomplete="current-password"], input[type="password"], input[name="password"], #password',
        submit: 'button[type="submit"], input[type="submit"], button',
    };
    let port;
    let profileId = "";
    let nextTabNumber = 1;
    let controlledCloseScheduled = false;
    let nativeReconnectEnabled = true;
    const tabsByBrowserId = new Map();
    const tabsByAgentId = new Map();
    const labels = new Map();
    const refs = new Map();
    const selectedFramesByTabId = new Map();
    const recentDialogsByTabId = new Map();
    const lastSnapshotTextByTabId = new Map();
    const runtimeInitScripts = new Map();
    const headersByOrigin = new Map();
    const networkRequestsById = new Map();
    const networkRequestIdsByTabId = new Map();
    const networkRequestLogIdsByTabId = new Map();
    const lastNetworkActivityAtByTabId = new Map();
    const networkHarRecordingStartedAtByTabId = new Map();
    const networkRoutes = new Map();
    const networkRouteMatchesByRequestId = new Map();
    let offlineModeEnabled = false;
    let nextRuntimeInitScriptNumber = 1;
    let nextNetworkRouteNumber = 1;
    const DEVICE_PROFILES = [
        {
            name: "iPhone 14",
            aliases: ["iphone 14", "iphone14"],
            width: 390,
            height: 844,
            scale: 3,
            userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
            isMobile: true,
            hasTouch: true,
        },
        {
            name: "iPhone 15 Pro",
            aliases: ["iphone 15 pro", "iphone15pro"],
            width: 393,
            height: 852,
            scale: 3,
            userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            isMobile: true,
            hasTouch: true,
        },
        {
            name: "Pixel 7",
            aliases: ["pixel 7", "pixel7", "google pixel 7"],
            width: 412,
            height: 915,
            scale: 2.625,
            userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Mobile Safari/537.36",
            isMobile: true,
            hasTouch: true,
        },
        {
            name: "Galaxy S22",
            aliases: ["galaxy s22", "samsung galaxy s22", "galaxys22"],
            width: 360,
            height: 780,
            scale: 3,
            userAgent: "Mozilla/5.0 (Linux; Android 12; SAMSUNG SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/16.0 Chrome/96.0.4664.45 Mobile Safari/537.36",
            isMobile: true,
            hasTouch: true,
        },
        {
            name: "iPad",
            aliases: ["ipad"],
            width: 768,
            height: 1024,
            scale: 2,
            userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
            isMobile: true,
            hasTouch: true,
        },
    ];
    connectNative();
    void applyContentColorScheme("auto").catch(() => undefined);
    registerBrowserListeners();
    registerHeaderListener();
    registerNetworkRouteListener();
    registerNetworkActivityListeners();
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
            const confirmationPolicy = confirmationPolicyFromParams(request.params?.confirmationPolicy);
            const result = await executeCommandWithPolicies(args, domainPolicy, actionPolicy, confirmationPolicy, request.params ?? {});
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
    async function executeCommandWithPolicies(args, domainPolicy, actionPolicy, confirmationPolicy, params = {}) {
        const domainError = await domainPolicyErrorForCommand(args, domainPolicy);
        if (domainError)
            return { error: domainError };
        const actionError = actionPolicyErrorForCommand(args, actionPolicy);
        if (actionError)
            return { error: actionError };
        const confirmationError = confirmationPolicyErrorForCommand(args, actionPolicy, confirmationPolicy);
        if (confirmationError)
            return { error: confirmationError };
        return prepareLargeResult(await executeCommand(args, domainPolicy, actionPolicy, confirmationPolicy, params));
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
    function confirmationPolicyFromParams(value) {
        if (!value || typeof value !== "object")
            return null;
        const candidate = value;
        if (candidate.enabled !== true)
            return null;
        const categories = Array.isArray(candidate.categories)
            ? candidate.categories.filter((category) => typeof category === "string")
            : [];
        if (categories.length === 0)
            return null;
        const approvedConfirmationId = typeof candidate.approvedConfirmationId === "string" ? candidate.approvedConfirmationId : undefined;
        return { enabled: true, categories, approvedConfirmationId };
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
    function confirmationPolicyErrorForCommand(args, actionPolicy, policy) {
        if (!policy?.enabled || !policy.categories?.length || policy.approvedConfirmationId)
            return null;
        const verdict = actionPolicyVerdictForCommand(args, actionPolicy ?? { enabled: false });
        if (!verdict.category || !policy.categories.includes(verdict.category))
            return null;
        return {
            code: "ConfirmationRequired",
            data: { phase: "policy", category: verdict.category },
            message: `action category \`${verdict.category}\` requires confirmation`,
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
        if (["status", "doctor", "install-status", "help", "setup", "session", "sessions", "confirm", "deny", "close", "quit", "exit"].includes(command)) {
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
                if (args.includes("--headers"))
                    return "network";
                return "navigate";
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
            case "pushstate":
                return "navigate";
            case "console":
            case "errors":
                return args.includes("--clear") || subcommand === "clear" ? "state" : "get";
            case "highlight":
                return "snapshot";
            case "vitals":
                return firstPositionalArg(args.slice(1), []) ? "navigate" : "get";
            case "network":
                if (subcommand === "requests")
                    return args.includes("--clear") ? "state" : "get";
                if (subcommand === "request")
                    return "get";
                if (!subcommand)
                    return "get";
                return "network";
            case "snapshot":
            case "screenshot":
            case "pdf":
                return "snapshot";
            case "diff":
                if (subcommand === "snapshot" || subcommand === "screenshot")
                    return "snapshot";
                if (subcommand === "url")
                    return "navigate";
                return null;
            case "addinitscript":
            case "removeinitscript":
                return "eval";
            case "scroll":
            case "scrollintoview":
                return "scroll";
            case "mouse":
                return subcommand === "wheel" ? "scroll" : "interact";
            case "drag":
                return "interact";
            case "wait":
                return args.includes("--download") ? "download" : "wait";
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
            case "auth":
                if (subcommand === "save" || subcommand === "delete")
                    return "state";
                if (subcommand === "list" || subcommand === "show")
                    return "get";
                if (subcommand === "login")
                    return "fill";
                return null;
            case "state":
                if (subcommand === "save" || subcommand === "load")
                    return "state";
                return null;
            case "set":
                if (subcommand === "headers" || subcommand === "offline")
                    return "network";
                return "state";
            case "download":
                return "download";
            case "upload":
                return "upload";
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
            "connect",
            "dashboard",
            "device",
            "install",
            "profiler",
            "profiles",
            "react",
            "record",
            "stream",
            "swipe",
            "tap",
            "trace",
            "upgrade",
        ].includes(command);
    }
    function domainPolicyDestinationUrl(args) {
        const [command, subcommand, ...rest] = args;
        if (["open", "goto", "navigate"].includes(command ?? "")) {
            return firstPositionalArg(args.slice(1), ["--label", "--init-script", "--headers"]);
        }
        if ((command === "tab" || command === "tabs") && subcommand === "new") {
            return firstPositionalArg(rest, ["--label"]);
        }
        if (command === "vitals") {
            return firstPositionalArg(rest, []);
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
            "mouse",
            "drag",
            "screenshot",
            "get",
            "is",
            "eval",
            "console",
            "errors",
            "highlight",
            "pushstate",
            "back",
            "forward",
            "reload",
            "cookies",
            "storage",
            "download",
            "upload",
            "set",
            "vitals",
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
        if (args.includes("--download"))
            return true;
        if (args.some((arg) => ["--load", "--selector", "--text", "--url", "--fn"].includes(arg)))
            return true;
        const first = args.find((arg) => !arg.startsWith("--"));
        return Boolean(first && Number.isNaN(Number(first)));
    }
    async function executeCommand(args, domainPolicy = null, actionPolicy = null, confirmationPolicy = null, params = {}) {
        const [command, ...rest] = args;
        const requestedColorScheme = normalizeContentColorScheme(params.colorScheme);
        if ("error" in requestedColorScheme)
            return requestedColorScheme;
        if (requestedColorScheme.scheme) {
            const applied = await applyContentColorScheme(requestedColorScheme.scheme);
            if ("error" in applied)
                return applied;
            params.appliedColorScheme = applied.media;
        }
        switch (command) {
            case "status":
                return statusResult();
            case "open":
            case "goto":
            case "navigate":
                return openCommand(rest, command || "open", params);
            case "snapshot":
                return snapshotCommand(rest);
            case "diff":
                return diffCommand(rest, params);
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
            case "highlight":
            case "scrollintoview":
                return targetActionCommand(command, rest);
            case "select":
                return targetActionCommand("select", rest);
            case "check":
            case "uncheck":
                return targetActionCommand(command, rest);
            case "scroll":
                return scrollCommand(rest);
            case "mouse":
                return mouseCommand(rest);
            case "drag":
                return dragCommand(rest);
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
            case "pushstate":
                return pushStateCommand(rest, domainPolicy);
            case "console":
                return debugLogCommand("console", rest);
            case "errors":
                return debugLogCommand("errors", rest);
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
                return batchCommand(rest, domainPolicy, actionPolicy, confirmationPolicy);
            case "cookies":
                return cookiesCommand(rest);
            case "storage":
                return storageCommand(rest);
            case "state":
                return stateCommand(rest);
            case "clipboard":
                return clipboardCommand(rest);
            case "download":
                return downloadCommand(rest);
            case "upload":
                return uploadCommand(rest, params.uploadFiles);
            case "auth":
                return authCommand(rest, domainPolicy);
            case "network":
                return networkCommand(rest);
            case "vitals":
                return vitalsCommand(rest, domainPolicy);
            case "addinitscript":
                return addInitScriptCommand(rest);
            case "removeinitscript":
                return removeInitScriptCommand(rest);
            case "set":
                return setCommand(rest);
            case "install":
            case "upgrade":
            case "stream":
            case "dashboard":
            case "trace":
            case "profiler":
            case "record":
            case "confirm":
            case "deny":
            case "session":
            case "profiles":
            case "react":
            case "pdf":
            case "connect":
            case "device":
            case "tap":
            case "swipe":
                return notAvailable(command, "This command is not supported by the Firefox WebExtension backend yet.");
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
    async function openCommand(args, command = "open", params = {}) {
        const url = firstPositionalArg(args, ["--label", "--init-script", "--headers"]);
        const initScripts = parseInitScripts(params.initScripts);
        if ("error" in initScripts)
            return initScripts;
        if (initScripts.scripts.length > 0 && !url) {
            return { error: { code: "invalid_args", message: "--init-script requires <url>" } };
        }
        const parsedHeaders = parseHeadersOption(valueAfter(args, "--headers"), "open --headers");
        if ("error" in parsedHeaders)
            return parsedHeaders;
        if (parsedHeaders.provided && !url) {
            return { error: { code: "invalid_args", message: "open --headers requires <url>" } };
        }
        if (!url) {
            if (command !== "open") {
                return { error: { code: "invalid_args", message: `${command} requires <url>` } };
            }
            const tab = await targetTab();
            return { text: openTabText(tab), tab };
        }
        const label = valueAfter(args, "--label");
        const newTab = args.includes("--new") || args.includes("--new-tab");
        const registered = await registerInitScripts(initScripts.scripts);
        if ("error" in registered)
            return registered;
        const headerScope = parsedHeaders.provided ? setHeadersForUrl(url, parsedHeaders.headers) : null;
        if (headerScope && "error" in headerScope)
            return headerScope;
        const active = await activeTab();
        const previousUrl = active?.url;
        let tab;
        const warnings = [...registered.warnings];
        try {
            const existingFileTab = isFileUrl(url) ? await existingTabForUrl(url, active) : null;
            tab = existingFileTab
                ? await browser.tabs.update(existingFileTab.id, { active: true })
                : newTab || !active?.id
                    ? await browser.tabs.create({ url, active: true })
                    : await browser.tabs.update(active.id, { url, active: true });
            await waitForTabReady(tab.id, url, previousUrl, 10000);
        }
        catch (error) {
            const existingFileTab = isFileUrl(url) ? await existingTabForUrl(url, active) : null;
            if (existingFileTab) {
                tab = await browser.tabs.update(existingFileTab.id, { active: true });
                warnings.push(structuredWarning("NAVIGATION_RECOVERED", "open", "Firefox blocked extension navigation to a file URL, but the managed tab is already inspectable."));
            }
            else {
                const current = tab?.id ? await browser.tabs.get(tab.id).catch(() => null) : null;
                if (!isInspectableTab(current))
                    throw error;
                warnings.push(structuredWarning("NAVIGATION_RECOVERED", "open", "Page readiness timed out, but the tab is inspectable. Continue with `pire-browser snapshot -i` or an explicit wait."));
            }
        }
        finally {
            await unregisterInitScripts(registered.registrations);
        }
        const loadedTab = await browser.tabs.get(tab.id);
        const record = rememberTab(loadedTab);
        selectedFramesByTabId.delete(record.tabId);
        recentDialogsByTabId.delete(record.tabId);
        if (label)
            setLabel(record, label);
        await activatePage(record);
        return {
            text: [`Opened ${url} in ${record.agentId}${label ? ` (${label})` : ""}`, ...warnings.map(formatWarningLine)].join("\n"),
            tab: record,
            headers: headerScope ? headerScope.headers : undefined,
            media: params.appliedColorScheme,
            warnings,
        };
    }
    async function existingTabForUrl(url, preferred) {
        if (sameNavigationUrl(preferred?.url, url) && typeof preferred?.id === "number")
            return preferred;
        const tabs = await browser.tabs.query({}).catch(() => []);
        return tabs.find((tab) => sameNavigationUrl(tab?.url, url) && typeof tab?.id === "number") ?? null;
    }
    function isFileUrl(url) {
        return /^file:/i.test(url.trim());
    }
    function sameNavigationUrl(left, right) {
        if (typeof left !== "string" || typeof right !== "string")
            return false;
        try {
            return new URL(left).href === new URL(right).href;
        }
        catch {
            return left === right;
        }
    }
    function parseInitScripts(value) {
        if (value == null)
            return { scripts: [] };
        if (!Array.isArray(value)) {
            return { error: { code: "invalid_args", message: "initScripts payload must be an array" } };
        }
        const scripts = [];
        for (const item of value) {
            if (!item || typeof item !== "object") {
                return { error: { code: "invalid_args", message: "initScripts payload entry must be an object" } };
            }
            const candidate = item;
            if (typeof candidate.path !== "string" || typeof candidate.code !== "string") {
                return { error: { code: "invalid_args", message: "initScripts payload entry requires path and code" } };
            }
            scripts.push({ path: candidate.path, code: candidate.code });
        }
        return { scripts };
    }
    async function registerInitScripts(scripts) {
        if (scripts.length === 0)
            return { registrations: [], warnings: [] };
        if (typeof browser.contentScripts?.register !== "function") {
            return {
                error: {
                    code: "not_available",
                    message: "open --init-script requires Firefox contentScripts.register support.",
                },
            };
        }
        const registrations = [];
        try {
            for (const script of scripts) {
                registrations.push(await browser.contentScripts.register({
                    matches: ["<all_urls>"],
                    js: [{ code: initScriptContentScript(script) }],
                    runAt: "document_start",
                    allFrames: true,
                    matchAboutBlank: true,
                }));
            }
        }
        catch (error) {
            await unregisterInitScripts(registrations);
            throw error;
        }
        return {
            registrations,
            warnings: [
                bestEffortWarning("open --init-script", "Registered init script(s) for this navigation. Firefox WebExtension init scripts are best effort and can be limited by page CSP or browser injection timing."),
            ],
        };
    }
    async function addInitScriptCommand(args) {
        const code = args.join(" ").trim();
        if (!code) {
            return { error: { code: "invalid_args", message: "addinitscript requires <js>" } };
        }
        if (typeof browser.contentScripts?.register !== "function") {
            return {
                error: {
                    code: "not_available",
                    message: "addinitscript requires Firefox contentScripts.register support.",
                },
            };
        }
        const id = `init${nextRuntimeInitScriptNumber++}`;
        const registration = await browser.contentScripts.register({
            matches: ["<all_urls>"],
            js: [{ code: initScriptContentScript({ path: id, code }) }],
            runAt: "document_start",
            allFrames: true,
            matchAboutBlank: true,
        });
        runtimeInitScripts.set(id, { id, registration, code });
        return {
            text: `Registered init script ${id}`,
            id,
            warnings: [
                bestEffortWarning("addinitscript", "Registered runtime init script. Firefox WebExtension init scripts are best effort and can be limited by page CSP or browser injection timing."),
            ],
        };
    }
    async function removeInitScriptCommand(args) {
        const id = args[0];
        if (!id) {
            return { error: { code: "invalid_args", message: "removeinitscript requires <identifier>" } };
        }
        const record = runtimeInitScripts.get(id);
        if (!record) {
            return { error: { code: "not_found", message: `No init script registered as ${id}` } };
        }
        await unregisterInitScripts([record.registration]);
        runtimeInitScripts.delete(id);
        return {
            text: `Removed init script ${id}`,
            id,
            warnings: [
                bestEffortWarning("removeinitscript", "Removed runtime init script registration. Pages already loaded before removal are not retroactively changed."),
            ],
        };
    }
    async function unregisterInitScripts(registrations) {
        for (const registration of registrations) {
            try {
                await registration.unregister();
            }
            catch {
                // Registration cleanup is best effort; the browser may already have unloaded.
            }
        }
    }
    function initScriptContentScript(script) {
        const sourceUrl = `pire-browser-init-script-${script.path.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(-80)}.js`;
        const source = `${script.code}\n//# sourceURL=${sourceUrl}`;
        return `(() => {
  const script = document.createElement("script");
  script.textContent = ${JSON.stringify(source)};
  const target = document.documentElement || document.head || document.body;
  if (!target) return;
  target.appendChild(script);
  script.remove();
})();`;
    }
    function formatWarningLine(warning) {
        if (warning && typeof warning === "object") {
            const candidate = warning;
            if (typeof candidate.message === "string") {
                const code = typeof candidate.code === "string" ? ` [${candidate.code}]` : "";
                return `Warning${code}: ${candidate.message}`;
            }
        }
        return `Warning: ${String(warning)}`;
    }
    async function snapshotCommand(args) {
        const tab = await targetTab();
        const options = parseSnapshotOptions(args);
        if ("error" in options)
            return options;
        const frames = await snapshotTab(tab.tabId, options.selector, options.depth, selectedFrameIdForTab(tab.tabId));
        if (options.selector && !frames.some((frame) => frame.elements.length > 0)) {
            return { error: { code: "not_found", message: `No element matched snapshot scope: ${options.selector}` } };
        }
        const interactiveFrames = options.interactive ? interactiveSnapshotFrames(frames) : frames;
        const printableFrames = options.compact ? compactSnapshotFrames(interactiveFrames) : interactiveFrames;
        refs.clear();
        let refNumber = 1;
        const treeOutput = !options.interactive;
        const lines = treeOutput ? [] : [`${tab.agentId} ${tab.title || tab.url || ""}`.trim()];
        for (const frame of printableFrames) {
            if (frame.opaque) {
                lines.push(treeOutput ? `- frame ${frame.frameId}: opaque ${frame.url ?? ""}`.trim() : `  frame ${frame.frameId}: opaque ${frame.url ?? ""}`.trim());
                continue;
            }
            if (treeOutput)
                lines.push(snapshotFrameHeader(frame));
            const baseDepth = snapshotBaseDepth(frame.elements);
            for (const element of frame.elements) {
                const ref = `@e${refNumber++}`;
                element.ref = ref;
                refs.set(ref, {
                    tabId: tab.tabId,
                    frameId: frame.frameId,
                    locator: element.locator,
                    summary: summarizeElement(element, options),
                });
                lines.push(treeOutput
                    ? snapshotTreeLine(element, ref, options, baseDepth)
                    : `  ${ref} ${summarizeElement(element, options)}`);
            }
        }
        const text = lines.join("\n");
        lastSnapshotTextByTabId.set(tab.tabId, text);
        return withDialogs({ text, frames: printableFrames, refs: Array.from(refs.keys()) }, printableFrames);
    }
    async function diffCommand(args, params = {}) {
        const [subcommand, ...rest] = args;
        if (subcommand !== "snapshot") {
            return {
                error: {
                    code: "invalid_args",
                    message: "diff requires snapshot in extension batch mode. Run `pire-browser diff screenshot --baseline <path>` or `pire-browser diff url <url1> <url2>` as top-level CLI commands for visual and URL diff workflows.",
                },
            };
        }
        return diffSnapshotCommand(rest, params);
    }
    async function diffSnapshotCommand(args, params) {
        const invalid = invalidDiffSnapshotArgs(args);
        if (invalid)
            return invalid;
        const tab = await targetTab();
        const baselineText = typeof params.diffBaselineText === "string"
            ? params.diffBaselineText
            : lastSnapshotTextByTabId.get(tab.tabId);
        const baselinePath = typeof params.diffBaselinePath === "string" ? params.diffBaselinePath : undefined;
        if (baselineText === undefined) {
            return {
                error: {
                    code: "invalid_state",
                    message: "No previous snapshot is available. Run `snapshot -i` first or pass `diff snapshot --baseline <path>`.",
                },
            };
        }
        const snapshotArgs = diffSnapshotArgs(args);
        const current = await snapshotCommand(snapshotArgs);
        if ("error" in current)
            return current;
        const currentText = typeof current.text === "string" ? current.text : "";
        const diff = unifiedTextDiff(baselineText, currentText, baselinePath ?? "previous snapshot", "current snapshot");
        const added = diff.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
        const removed = diff.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
        const changed = added > 0 || removed > 0;
        return {
            ...current,
            text: changed ? diff.join("\n") : "No snapshot differences",
            diff: diff.join("\n"),
            changed,
            added,
            removed,
            baseline: {
                source: baselinePath ? "file" : "previous",
                path: baselinePath,
            },
            currentSnapshot: currentText,
        };
    }
    function invalidDiffSnapshotArgs(args) {
        const valueFlags = new Set(["--baseline", "--selector", "--scope", "-s", "--depth", "-d"]);
        const boolFlags = new Set(["-i", "--interactive", "-c", "--compact", "-u", "--urls", "--json"]);
        for (let index = 0; index < args.length; index++) {
            const arg = args[index];
            if (valueFlags.has(arg)) {
                const value = args[index + 1];
                if (!value || value.startsWith("-")) {
                    return { error: { code: "invalid_args", message: `diff snapshot ${arg} requires a value` } };
                }
                index += 1;
                continue;
            }
            if (boolFlags.has(arg))
                continue;
            if (arg.startsWith("--depth="))
                continue;
            return { error: { code: "invalid_args", message: `diff snapshot does not support argument: ${arg}` } };
        }
        return null;
    }
    function diffSnapshotArgs(args) {
        const snapshotArgs = [];
        for (let index = 0; index < args.length; index++) {
            const arg = args[index];
            if (arg === "--baseline") {
                index += 1;
                continue;
            }
            if (arg === "--selector") {
                snapshotArgs.push("--scope", args[index + 1]);
                index += 1;
                continue;
            }
            snapshotArgs.push(arg);
        }
        return snapshotArgs;
    }
    function unifiedTextDiff(before, after, beforeName, afterName) {
        if (before === after)
            return [];
        const beforeLines = before.split(/\r?\n/);
        const afterLines = after.split(/\r?\n/);
        return [`--- ${beforeName}`, `+++ ${afterName}`, ...diffLines(beforeLines, afterLines)];
    }
    function diffLines(before, after) {
        const table = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
        for (let i = before.length - 1; i >= 0; i--) {
            for (let j = after.length - 1; j >= 0; j--) {
                table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
            }
        }
        const lines = [];
        let i = 0;
        let j = 0;
        while (i < before.length && j < after.length) {
            if (before[i] === after[j]) {
                lines.push(` ${before[i]}`);
                i += 1;
                j += 1;
            }
            else if (table[i + 1][j] >= table[i][j + 1]) {
                lines.push(`-${before[i]}`);
                i += 1;
            }
            else {
                lines.push(`+${after[j]}`);
                j += 1;
            }
        }
        while (i < before.length)
            lines.push(`-${before[i++]}`);
        while (j < after.length)
            lines.push(`+${after[j++]}`);
        return compactDiffContext(lines, 3);
    }
    function compactDiffContext(lines, contextSize) {
        const changed = lines.map((line, index) => ({ line, index })).filter((item) => item.line.startsWith("+") || item.line.startsWith("-"));
        if (!changed.length)
            return [];
        const keep = new Set();
        for (const item of changed) {
            for (let index = Math.max(0, item.index - contextSize); index <= Math.min(lines.length - 1, item.index + contextSize); index++) {
                keep.add(index);
            }
        }
        const compacted = [];
        let previous = -1;
        for (const index of Array.from(keep).sort((left, right) => left - right)) {
            if (previous >= 0 && index > previous + 1)
                compacted.push("...");
            compacted.push(lines[index]);
            previous = index;
        }
        return compacted;
    }
    function parseSnapshotOptions(args) {
        let selector;
        let depth;
        for (let index = 0; index < args.length; index++) {
            const arg = args[index];
            if (arg === "-s" || arg === "--scope") {
                selector = args[index + 1];
                if (!selector || selector.startsWith("-")) {
                    return { error: { code: "invalid_args", message: `${arg} requires a CSS selector` } };
                }
                index += 1;
                continue;
            }
            if (arg === "-d" || arg === "--depth") {
                const parsed = parseSnapshotDepth(args[index + 1], arg);
                if ("error" in parsed)
                    return parsed;
                depth = parsed.depth;
                index += 1;
                continue;
            }
            if (arg.startsWith("--depth=")) {
                const parsed = parseSnapshotDepth(arg.slice("--depth=".length), "--depth");
                if ("error" in parsed)
                    return parsed;
                depth = parsed.depth;
                continue;
            }
            if (["-i", "--interactive", "-c", "--compact", "-u", "--urls", "--json"].includes(arg))
                continue;
            if (arg.startsWith("-")) {
                return { error: { code: "invalid_args", message: `Unsupported snapshot option: ${arg}` } };
            }
        }
        return {
            interactive: args.includes("-i") || args.includes("--interactive"),
            compact: args.includes("-c") || args.includes("--compact"),
            urls: args.includes("-u") || args.includes("--urls"),
            selector,
            depth,
        };
    }
    function parseSnapshotDepth(value, flag) {
        if (!value || value.startsWith("-")) {
            return { error: { code: "invalid_args", message: `${flag} requires a non-negative integer depth` } };
        }
        const depth = Number(value);
        if (!Number.isInteger(depth) || depth < 0) {
            return { error: { code: "invalid_args", message: `${flag} requires a non-negative integer depth` } };
        }
        return { depth };
    }
    function interactiveSnapshotFrames(frames) {
        return frames.map((frame) => ({
            ...frame,
            elements: frame.elements.filter(isInteractiveSnapshotElement),
        }));
    }
    function compactSnapshotFrames(frames) {
        return frames.map((frame) => ({
            ...frame,
            elements: frame.elements.filter(isCompactSnapshotElement).sort(compareSnapshotElements),
        }));
    }
    function isInteractiveSnapshotElement(element) {
        if (isActionableRole(element.role))
            return true;
        if (["heading", "iframe", "tab", "menuitem"].includes(element.role))
            return Boolean(element.name || element.text);
        if (element.testid || element.label || element.placeholder)
            return element.role !== "generic";
        return false;
    }
    function isCompactSnapshotElement(element) {
        if (element.disabled)
            return false;
        if (isActionableRole(element.role))
            return true;
        if (element.testid || element.label || element.placeholder)
            return true;
        if (element.role === "generic")
            return false;
        return Boolean(element.name || element.text);
    }
    function compareSnapshotElements(left, right) {
        const roleScore = snapshotRoleScore(left) - snapshotRoleScore(right);
        if (roleScore !== 0)
            return roleScore;
        const topScore = Math.max(0, left.bounds.y) - Math.max(0, right.bounds.y);
        if (topScore !== 0)
            return topScore;
        return Math.max(0, left.bounds.x) - Math.max(0, right.bounds.x);
    }
    function snapshotRoleScore(element) {
        if (isActionableRole(element.role))
            return 0;
        if (element.testid || element.label || element.placeholder)
            return 1;
        if (["heading", "img", "tab", "menuitem"].includes(element.role))
            return 2;
        return 3;
    }
    function snapshotFrameHeader(frame) {
        if (frame.frameId === 0)
            return "- main";
        const suffix = frame.title || frame.url || "";
        return `- frame ${frame.frameId}${suffix ? ` ${truncate(suffix, 100)}` : ""}`;
    }
    function snapshotBaseDepth(elements) {
        const depths = elements
            .map((element) => element.depth)
            .filter((depth) => typeof depth === "number" && Number.isFinite(depth));
        return depths.length ? Math.min(...depths) : 0;
    }
    function snapshotTreeLine(element, ref, options, baseDepth) {
        const depth = typeof element.depth === "number" && Number.isFinite(element.depth) ? element.depth : baseDepth;
        const indentLevel = Math.max(1, Math.min(8, depth - baseDepth + 1));
        const indent = "  ".repeat(indentLevel);
        return `${indent}- ${summarizeTreeElement(element, ref, options)}`;
    }
    function summarizeTreeElement(element, ref, options) {
        const name = element.name || element.label || element.placeholder || element.text;
        const url = options.urls && element.href ? ` ${truncate(element.href, 120)}` : "";
        const attrs = [element.disabled ? "disabled" : "", `ref=${ref}`].filter(Boolean).join(", ");
        return `${element.role}${name ? ` "${truncate(name, 80)}"` : ""}${url} [${attrs}]`;
    }
    function isActionableRole(role) {
        return [
            "button",
            "link",
            "textbox",
            "search",
            "combobox",
            "checkbox",
            "radio",
            "switch",
            "slider",
            "spinbutton",
            "option",
            "tab",
            "menuitem",
        ].includes(role);
    }
    async function findCommand(args) {
        const parsed = parseFind(args);
        if ("error" in parsed)
            return parsed;
        if (parsed.action)
            return actOnFind(parsed.locator, parsed.action, parsed.text ?? "");
        const tab = await targetTab();
        const frames = await findInTab(tab.tabId, parsed.locator, selectedFrameIdForTab(tab.tabId));
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
        const target = firstPositionalArg(args, []);
        const locator = locatorFromTarget(target);
        if ("error" in locator)
            return locator;
        const tab = await targetTab();
        const frameId = targetFrameIdForTab(tab.tabId, locator.frameId);
        if (args.includes("--new-tab"))
            return clickNewTab(locator.locator, frameId);
        return clickLocator(locator.locator, frameId);
    }
    async function fillCommand(args) {
        const locator = locatorFromTarget(args[0]);
        if ("error" in locator)
            return locator;
        const text = args.slice(1).join(" ");
        const tab = await targetTab();
        return fillLocator(locator.locator, text, targetFrameIdForTab(tab.tabId, locator.frameId));
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
        const response = await sendFrame(tab.tabId, targetFrameIdForTab(tab.tabId, locator.frameId), payload, { staleOnFrameRoutingError: true });
        return normalizeContentResponse(response);
    }
    async function actOnFind(locator, action, text = "") {
        const tab = await targetTab();
        const frames = await findInTab(tab.tabId, locator, selectedFrameIdForTab(tab.tabId));
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
    async function clickNewTab(locator, frameId) {
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, frameId, { type: "click_new_tab", locator }, { staleOnFrameRoutingError: true });
        const result = normalizeContentResponse(response);
        if ("error" in result)
            return result;
        const href = typeof result.href === "string" ? result.href : typeof result.value === "string" ? result.value : "";
        if (!href) {
            return { error: { code: "unsupported_element", message: "click --new-tab requires a link with href" } };
        }
        let url;
        try {
            url = new URL(href, tab.url || undefined);
        }
        catch {
            return { error: { code: "invalid_args", message: `click --new-tab could not resolve link URL: ${href}` } };
        }
        const created = await browser.tabs.create({ url: url.href, active: true });
        await waitForTabReady(created.id, url.href, undefined, 10000);
        const loadedTab = await browser.tabs.get(created.id);
        const record = markControlledPage(rememberTab(loadedTab));
        selectedFramesByTabId.delete(record.tabId);
        await activatePage(record);
        return {
            ...result,
            text: `Opened ${url.href} in ${record.agentId}`,
            tab: record,
            url: url.href,
        };
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
        const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "press", key });
        return normalizeContentResponse(response);
    }
    async function keyboardCommand(args) {
        const [subcommand, ...rest] = args;
        if (subcommand !== "type" && subcommand !== "inserttext") {
            return { error: { code: "InvalidArgumentError", message: "keyboard requires type|inserttext <text>" } };
        }
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), {
            type: subcommand === "type" ? "keyboard_type" : "keyboard_inserttext",
            text: rest.join(" "),
        });
        return normalizeContentResponse(response);
    }
    async function keyEdgeCommand(command, args) {
        const key = args[0];
        if (!key)
            return { error: { code: "InvalidArgumentError", message: `${command} requires <key>` } };
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "key_edge", action: command, key });
        return normalizeContentResponse(response);
    }
    async function scrollCommand(args) {
        const direction = args[0] ?? "down";
        const pixels = Number(firstPositionalArg(args.slice(1), ["--selector"]) ?? "900");
        const selector = valueAfter(args, "--selector");
        if (!["up", "down", "left", "right"].includes(direction) || !Number.isFinite(pixels) || pixels <= 0) {
            return { error: { code: "InvalidArgumentError", message: "scroll requires up|down|left|right [positive_pixels]" } };
        }
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "scroll", direction, pixels, selector });
        return normalizeContentResponse(response);
    }
    async function mouseCommand(args) {
        const [subcommand = "", ...rest] = args;
        if (!["move", "down", "up", "wheel"].includes(subcommand)) {
            return { error: { code: "invalid_args", message: "mouse requires move <x> <y>, down [button], up [button], or wheel <dy> [dx]" } };
        }
        let payload;
        if (subcommand === "move") {
            const parsed = parseMouseCoordinates(rest);
            if ("error" in parsed)
                return parsed;
            payload = { type: "mouse_event", action: "move", x: parsed.x, y: parsed.y };
        }
        else if (subcommand === "wheel") {
            const dy = Number(rest[0]);
            const dx = rest[1] === undefined ? 0 : Number(rest[1]);
            if (!Number.isFinite(dy) || !Number.isFinite(dx)) {
                return { error: { code: "invalid_args", message: "mouse wheel requires numeric <dy> [dx]" } };
            }
            payload = { type: "mouse_event", action: "wheel", dy, dx };
        }
        else {
            payload = { type: "mouse_event", action: subcommand, button: mouseButton(rest[0]) };
        }
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), payload);
        const result = normalizeContentResponse(response);
        if ("error" in result)
            return result;
        return {
            ...result,
            warnings: mergeWarnings(result.warnings, bestEffortWarning("mouse", "Firefox WebExtensions dispatch page mouse events but cannot hold native OS mouse state or control browser chrome.")),
        };
    }
    function parseMouseCoordinates(args) {
        const x = Number(args[0]);
        const y = Number(args[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return { error: { code: "invalid_args", message: "mouse move requires numeric <x> <y>" } };
        }
        return { x, y };
    }
    function mouseButton(value) {
        if (value === "right")
            return 2;
        if (value === "middle")
            return 1;
        return 0;
    }
    async function dragCommand(args) {
        const [sourceTarget, destinationTarget] = args;
        if (!sourceTarget || !destinationTarget) {
            return { error: { code: "invalid_args", message: "drag requires <src> <dst>" } };
        }
        const source = locatorFromTarget(sourceTarget);
        if ("error" in source)
            return source;
        const destination = locatorFromTarget(destinationTarget);
        if ("error" in destination)
            return destination;
        if (typeof source.frameId === "number" &&
            typeof destination.frameId === "number" &&
            source.frameId !== destination.frameId) {
            return {
                error: {
                    code: "NotAvailableError",
                    message: "drag across different frames is not available on the Firefox WebExtension backend.",
                    data: { feature: "drag", status: "not_supported" },
                },
            };
        }
        const frameId = typeof source.frameId === "number" ? source.frameId : destination.frameId;
        const tab = await targetTab();
        const selectedFrameId = selectedFrameIdForTab(tab.tabId);
        const response = await sendFrame(tab.tabId, frameId ?? selectedFrameId, {
            type: "drag",
            sourceLocator: source.locator,
            targetLocator: destination.locator,
        }, { staleOnFrameRoutingError: true });
        const result = normalizeContentResponse(response);
        if ("error" in result)
            return result;
        return {
            ...result,
            warnings: mergeWarnings(result.warnings, bestEffortWarning("drag", "Firefox WebExtensions dispatch page drag/drop events but cannot hold native OS mouse state or drag across browser chrome.")),
        };
    }
    async function waitCommand(args) {
        if (args.includes("--download"))
            return waitDownloadCommand(args);
        const timeoutResult = parseTimeoutOption(args, 10000);
        if ("error" in timeoutResult)
            return timeoutResult;
        const timeout = timeoutResult.ms;
        const selector = valueAfter(args, "--selector");
        if (args.includes("--load")) {
            const tab = await targetTab();
            const loadState = valueAfter(args, "--load") ?? "load";
            await waitForTabComplete(tab.tabId, timeout);
            if (loadState === "networkidle" || loadState === "network-idle") {
                return waitForNetworkIdle(tab.tabId, timeout, NETWORK_IDLE_QUIET_MS);
            }
            return { text: "Page load complete", loadState };
        }
        if (selector) {
            const tab = await targetTab();
            const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "wait_selector", selector, timeout, state: valueAfter(args, "--state") ?? "visible" });
            return normalizeContentResponse(response);
        }
        const text = valueAfter(args, "--text");
        if (text) {
            const tab = await targetTab();
            const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "wait_text", text, timeout, hidden: false });
            return normalizeContentResponse(response);
        }
        const urlPattern = valueAfter(args, "--url");
        if (urlPattern)
            return waitForUrl(urlPattern, timeout);
        const fn = valueAfter(args, "--fn");
        if (fn) {
            const tab = await targetTab();
            const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "wait_fn", expression: fn, timeout });
            return normalizeContentResponse(response);
        }
        const target = firstPositionalArg(args, ["--selector", "--text", "--url", "--fn", "--download", "--timeout", "--state", "--load"]);
        if (target && Number.isNaN(Number(target))) {
            const locator = locatorFromTarget(target);
            if ("error" in locator)
                return locator;
            const tab = await targetTab();
            const response = await sendFrame(tab.tabId, targetFrameIdForTab(tab.tabId, locator.frameId), { type: "wait_locator", locator: locator.locator, timeout, state: valueAfter(args, "--state") ?? "visible" }, { staleOnFrameRoutingError: true });
            return normalizeContentResponse(response);
        }
        const waitResult = parsePlainWaitMs(args);
        if ("error" in waitResult)
            return waitResult;
        await delay(waitResult.ms);
        return { text: `Waited ${waitResult.ms}ms` };
    }
    async function downloadCommand(args) {
        const parsed = parseDownloadCommand(args);
        if ("error" in parsed)
            return parsed;
        const tab = await targetTab();
        await activatePage(tab);
        const watcher = createDownloadWatcher({
            timeout: parsed.timeout,
            startedAfter: Date.now(),
            activeUrl: tab.url,
        });
        const click = await clickCommand([parsed.target]);
        if ("error" in click) {
            watcher.cancel();
            return click;
        }
        return watcher.promise;
    }
    async function uploadCommand(args, filesValue) {
        const target = args[0];
        if (!target)
            return { error: { code: "InvalidArgumentError", message: "upload requires <target> <files...>" } };
        const files = uploadFilesFromParams(filesValue);
        if ("error" in files)
            return files;
        const locator = locatorFromTarget(target);
        if ("error" in locator)
            return locator;
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, locator.frameId, { type: "upload_files", locator: locator.locator, files: files.files }, { staleOnFrameRoutingError: true });
        return normalizeContentResponse(response);
    }
    function uploadFilesFromParams(value) {
        if (!Array.isArray(value) || value.length === 0) {
            return { error: { code: "InvalidArgumentError", message: "upload requires file payloads from the pire-browser CLI" } };
        }
        const files = [];
        for (const item of value) {
            if (!item || typeof item !== "object") {
                return { error: { code: "InvalidArgumentError", message: "upload file payload is malformed" } };
            }
            const candidate = item;
            if (typeof candidate.name !== "string" || typeof candidate.bytesBase64 !== "string" || typeof candidate.size !== "number") {
                return { error: { code: "InvalidArgumentError", message: "upload file payload is missing name, size, or bytes" } };
            }
            files.push({
                name: candidate.name,
                mimeType: typeof candidate.mimeType === "string" ? candidate.mimeType : "application/octet-stream",
                size: candidate.size,
                sha256: typeof candidate.sha256 === "string" ? candidate.sha256 : undefined,
                bytesBase64: candidate.bytesBase64,
            });
        }
        return { files };
    }
    async function waitDownloadCommand(args) {
        const timeoutResult = parseTimeoutOption(args, DOWNLOAD_TIMEOUT_MS);
        if ("error" in timeoutResult)
            return timeoutResult;
        const tab = await targetTab().catch(() => undefined);
        if (tab)
            await activatePage(tab);
        const watcher = createDownloadWatcher({
            timeout: timeoutResult.ms,
            startedAfter: Date.now() - DOWNLOAD_RECENT_MS,
            activeUrl: tab?.url,
        });
        return watcher.promise;
    }
    function parseDownloadCommand(args) {
        const timeoutResult = parseTimeoutOption(args, DOWNLOAD_TIMEOUT_MS);
        if (timeoutResult.error)
            return { error: timeoutResult.error };
        const target = firstPositionalArg(args, ["--timeout"]);
        if (!target) {
            return { error: { code: "invalid_args", message: "download requires <target> <path>" } };
        }
        return { target, timeout: timeoutResult.ms };
    }
    function createDownloadWatcher(options) {
        let settled = false;
        let timeoutTimer = 0;
        let pollTimer = 0;
        let wakeTimer = 0;
        let cleanupWatcher = () => { };
        const activeOrigin = safeOrigin(options.activeUrl);
        const createdDownloadIds = new Set();
        const promise = new Promise((resolve) => {
            const cleanup = () => {
                clearTimeout(timeoutTimer);
                clearInterval(pollTimer);
                clearTimeout(wakeTimer);
                browser.downloads?.onChanged?.removeListener?.(listener);
                browser.downloads?.onCreated?.removeListener?.(createdListener);
            };
            cleanupWatcher = cleanup;
            const settle = (result) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                resolve(result);
            };
            const check = async () => {
                const match = await newestEligibleDownload(options.startedAfter, activeOrigin, createdDownloadIds).catch((error) => ({
                    error: {
                        code: "DownloadError",
                        message: `Failed to inspect Firefox downloads: ${error instanceof Error ? error.message : String(error)}`,
                    },
                }));
                if ("error" in match) {
                    settle(match);
                    return;
                }
                if (!match.item)
                    return;
                if (match.item.state === "complete") {
                    settle(downloadResult(match.item));
                }
                else if (match.item.state === "interrupted") {
                    settle({
                        error: {
                            code: "DownloadError",
                            message: `Firefox download ${match.item.id} was interrupted`,
                        },
                    });
                }
            };
            const wake = () => {
                clearTimeout(wakeTimer);
                wakeTimer = setTimeout(() => void check(), 50);
            };
            const listener = () => wake();
            const createdListener = (item) => {
                if (typeof item?.id === "number")
                    createdDownloadIds.add(item.id);
                wake();
            };
            if (!browser.downloads?.search) {
                settle(notAvailable("download", "Firefox did not expose the downloads API to the extension context."));
                return;
            }
            browser.downloads.onChanged?.addListener?.(listener);
            browser.downloads.onCreated?.addListener?.(createdListener);
            pollTimer = setInterval(() => void check(), DOWNLOAD_POLL_INTERVAL_MS);
            timeoutTimer = setTimeout(() => settle({ error: { code: "TimeoutError", message: `Timed out waiting for Firefox download after ${options.timeout}ms` } }), options.timeout);
            void check();
        });
        return {
            promise,
            cancel: () => {
                if (settled)
                    return;
                settled = true;
                cleanupWatcher();
            },
        };
    }
    async function newestEligibleDownload(startedAfter, activeOrigin, createdDownloadIds) {
        const downloads = await browser.downloads.search({});
        const eligible = downloads
            .filter((item) => typeof item.id === "number" && typeof item.filename === "string" && item.filename.length > 0)
            .filter((item) => downloadStartMs(item) >= startedAfter || createdDownloadIds.has(item.id))
            .filter((item) => ["in_progress", "complete", "interrupted"].includes(item.state));
        eligible.sort((left, right) => downloadScore(right, activeOrigin) - downloadScore(left, activeOrigin));
        return { item: eligible[0] };
    }
    function downloadResult(item) {
        const bytes = typeof item.fileSize === "number" && item.fileSize >= 0
            ? item.fileSize
            : typeof item.totalBytes === "number" && item.totalBytes >= 0
                ? item.totalBytes
                : 0;
        return {
            text: `Firefox download ${item.id} completed`,
            stagedPath: item.filename,
            bytes,
            state: item.state ?? "complete",
            downloadId: item.id,
            url: item.url,
            displayUrl: typeof item.url === "string" ? displayUrlWithoutQueryOrFragment(item.url) : undefined,
        };
    }
    function downloadScore(item, activeOrigin) {
        const referrerOrigin = safeOrigin(item.referrer);
        const sourceOrigin = safeOrigin(item.url);
        const originBonus = activeOrigin && (referrerOrigin === activeOrigin || sourceOrigin === activeOrigin) ? 10000000000000 : 0;
        return originBonus + downloadStartMs(item);
    }
    function downloadStartMs(item) {
        const parsed = Date.parse(item.startTime ?? "");
        return Number.isFinite(parsed) ? parsed : 0;
    }
    function safeOrigin(url) {
        if (!url)
            return undefined;
        try {
            const parsed = new URL(url);
            return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : undefined;
        }
        catch {
            return undefined;
        }
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
            const frames = await findInTab(tab.tabId, locator.locator, targetFrameIdForTab(tab.tabId, locator.frameId));
            const count = frames.reduce((sum, frame) => sum + frame.elements.length, 0);
            return { text: String(count), value: count };
        }
        if (!target)
            return { error: { code: "InvalidArgumentError", message: "get requires <property> <selector>" } };
        const locator = locatorFromTarget(target);
        if ("error" in locator)
            return locator;
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, targetFrameIdForTab(tab.tabId, locator.frameId), { type: "get", locator: locator.locator, property, attribute }, { staleOnFrameRoutingError: true });
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
        const response = await sendFrame(tab.tabId, targetFrameIdForTab(tab.tabId, locator.frameId), { type: "is", locator: locator.locator, state }, { staleOnFrameRoutingError: true });
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
    async function pushStateCommand(args, domainPolicy) {
        const target = firstPositionalArg(args, []);
        if (!target)
            return { error: { code: "invalid_args", message: "pushstate requires <url>" } };
        const tab = await targetTab();
        const resolved = resolveNavigationUrl(target, tab.url);
        if ("error" in resolved)
            return resolved;
        if (domainPolicy?.enabled) {
            const domainError = domainPolicyErrorForUrl(resolved.url, domainPolicy);
            if (domainError)
                return { error: domainError };
        }
        const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "pushstate", url: target });
        const result = normalizeContentResponse(response);
        if (!("error" in result)) {
            const current = await browser.tabs.get(tab.tabId).catch(() => null);
            if (current)
                rememberTab(current);
        }
        return result;
    }
    function resolveNavigationUrl(input, baseUrl) {
        const base = baseUrl && !baseUrl.startsWith("about:") ? baseUrl : undefined;
        try {
            const url = new URL(input, base);
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                return { error: { code: "invalid_args", message: `${url.protocol.replace(":", "")}: URLs are not supported by pushstate` } };
            }
            return { url: url.href };
        }
        catch {
            return { error: { code: "invalid_args", message: `Invalid pushstate URL: ${input}` } };
        }
    }
    async function screenshotCommand(args) {
        const dir = valueAfter(args, "--screenshot-dir");
        const format = valueAfter(args, "--screenshot-format") === "jpeg" ? "jpeg" : "png";
        const quality = Number(valueAfter(args, "--screenshot-quality") ?? "92");
        const positional = firstPositionalArg(args, ["--screenshot-dir", "--screenshot-format", "--screenshot-quality"]);
        const generatedName = `pire-browser-screenshot-${Date.now()}.${format === "jpeg" ? "jpg" : "png"}`;
        const defaultScreenshotPath = !dir && !positional;
        const path = screenshotPathFor(dir, positional, generatedName);
        const annotate = args.includes("--annotate");
        const full = args.includes("--full");
        const tab = await targetTab();
        await activatePage(tab);
        let annotationResult = null;
        const annotationFrameId = selectedFrameIdForTab(tab.tabId);
        if (annotate) {
            const response = await sendFrame(tab.tabId, annotationFrameId, { type: "screenshot_annotate", fullPage: full });
            const result = normalizeContentResponse(response);
            if ("error" in result)
                return result;
            annotationResult = addScreenshotAnnotationRefs(result, tab.tabId, annotationFrameId ?? 0);
            await delay(50);
        }
        let meta;
        let fullPage;
        try {
            const capture = full
                ? await captureFullPageScreenshot(tab, format, quality)
                : { dataUrl: await browser.tabs.captureVisibleTab(tab.windowId, { format, quality }), fullPage: undefined };
            fullPage = capture.fullPage;
            const dataUrl = capture.dataUrl;
            meta = await sendScreenshotChunks(dataUrl);
        }
        finally {
            if (annotate) {
                await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "screenshot_clear_annotations" }).catch(() => undefined);
            }
        }
        return {
            text: screenshotResultText(path, annotationResult),
            screenshot: meta,
            screenshotPath: path,
            screenshotDefaultPath: defaultScreenshotPath || undefined,
            fullPage,
            annotated: annotate ? annotationResult?.annotated ?? 0 : undefined,
            annotations: annotate ? annotationResult?.annotations ?? [] : undefined,
            warnings: mergeWarnings(annotationResult?.warnings),
        };
    }
    function addScreenshotAnnotationRefs(result, tabId, frameId) {
        const annotations = Array.isArray(result.annotations) ? result.annotations : [];
        if (!annotations.length)
            return result;
        refs.clear();
        let refNumber = 1;
        const withRefs = annotations.map((annotation) => {
            if (!isScreenshotAnnotation(annotation) || !isLocator(annotation.locator))
                return annotation;
            const ref = `@e${refNumber++}`;
            const summary = screenshotAnnotationSummary(annotation);
            refs.set(ref, { tabId, frameId, locator: annotation.locator, summary });
            return { ...annotation, ref };
        });
        return { ...result, annotations: withRefs };
    }
    function screenshotResultText(path, annotationResult) {
        const base = `Screenshot captured for ${path}`;
        if (!annotationResult)
            return base;
        const annotations = Array.isArray(annotationResult.annotations) ? annotationResult.annotations.filter(isScreenshotAnnotation) : [];
        const annotated = Number(annotationResult.annotated ?? annotations.length);
        const lines = [base, `Annotated ${Number.isFinite(annotated) ? annotated : annotations.length} element(s).`];
        if (annotations.length) {
            lines.push("Annotation refs:");
            for (const annotation of annotations.slice(0, 24)) {
                const label = annotation.label ? `[${annotation.label}] ` : "";
                const ref = annotation.ref ? `${annotation.ref} ` : "";
                lines.push(`  ${label}${ref}${screenshotAnnotationSummary(annotation)}`.trimEnd());
            }
            if (annotations.length > 24)
                lines.push(`  ... ${annotations.length - 24} more annotation(s)`);
            lines.push("Use these @e refs for follow-up click/fill/get commands.");
        }
        return lines.join("\n");
    }
    function isScreenshotAnnotation(value) {
        return Boolean(value && typeof value === "object");
    }
    function isLocator(value) {
        return Boolean(value && typeof value === "object" && typeof value.kind === "string");
    }
    function screenshotAnnotationSummary(annotation) {
        const role = annotation.role || "element";
        const name = annotation.name ? ` "${truncate(annotation.name, 80)}"` : "";
        return `${role}${name}`;
    }
    function screenshotPathFor(dir, positional, generatedName) {
        if (dir) {
            const cleanDir = dir.replace(/[\\/]$/, "");
            const name = positional && !/[\\/]/.test(positional) ? positional : positional ? undefined : generatedName;
            if (name)
                return `${cleanDir}/${name}`;
        }
        return positional ?? generatedName;
    }
    async function captureFullPageScreenshot(tab, format, quality) {
        const frameId = selectedFrameIdForTab(tab.tabId);
        const metricsResponse = await sendFrame(tab.tabId, frameId, { type: "screenshot_full_metrics" });
        const metricsResult = normalizeContentResponse(metricsResponse);
        if ("error" in metricsResult)
            throw new Error(String(metricsResult.error?.message ?? "failed to read page metrics"));
        const metrics = fullPageMetricsFromResult(metricsResult);
        const originalX = metrics.scrollX;
        const originalY = metrics.scrollY;
        const xs = tilePositions(metrics.documentWidth, metrics.viewportWidth, metrics.maxScrollX);
        const ys = tilePositions(metrics.documentHeight, metrics.viewportHeight, metrics.maxScrollY);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context)
            throw new Error("failed to create screenshot canvas");
        let scaleX = 1;
        let scaleY = 1;
        let initialized = false;
        let tileCount = 0;
        try {
            for (const y of ys) {
                for (const x of xs) {
                    const scrollResponse = await sendFrame(tab.tabId, frameId, { type: "screenshot_scroll", x, y });
                    const scrollResult = normalizeContentResponse(scrollResponse);
                    if ("error" in scrollResult)
                        throw new Error(String(scrollResult.error?.message ?? "failed to scroll page"));
                    await delay(80);
                    const actualX = Math.max(0, Number(scrollResult.scrollX ?? x));
                    const actualY = Math.max(0, Number(scrollResult.scrollY ?? y));
                    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format, quality });
                    const loaded = await loadCaptureImage(dataUrl);
                    try {
                        if (!initialized) {
                            scaleX = loaded.width / metrics.viewportWidth;
                            scaleY = loaded.height / metrics.viewportHeight;
                            canvas.width = Math.max(1, Math.ceil(metrics.documentWidth * scaleX));
                            canvas.height = Math.max(1, Math.ceil(metrics.documentHeight * scaleY));
                            context.fillStyle = "#ffffff";
                            context.fillRect(0, 0, canvas.width, canvas.height);
                            initialized = true;
                        }
                        const destinationX = Math.round(actualX * scaleX);
                        const destinationY = Math.round(actualY * scaleY);
                        const sourceWidth = Math.min(loaded.width, Math.ceil((metrics.documentWidth - actualX) * scaleX));
                        const sourceHeight = Math.min(loaded.height, Math.ceil((metrics.documentHeight - actualY) * scaleY));
                        if (sourceWidth > 0 && sourceHeight > 0) {
                            context.drawImage(loaded.image, 0, 0, sourceWidth, sourceHeight, destinationX, destinationY, sourceWidth, sourceHeight);
                            tileCount += 1;
                        }
                    }
                    finally {
                        loaded.close?.();
                    }
                }
            }
        }
        finally {
            await sendFrame(tab.tabId, frameId, { type: "screenshot_scroll", x: originalX, y: originalY }).catch(() => undefined);
        }
        const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
        const dataUrl = canvas.toDataURL(mimeType, Math.max(0, Math.min(1, quality / 100)));
        return {
            dataUrl,
            fullPage: {
                width: canvas.width,
                height: canvas.height,
                cssWidth: metrics.documentWidth,
                cssHeight: metrics.documentHeight,
                viewportWidth: metrics.viewportWidth,
                viewportHeight: metrics.viewportHeight,
                tiles: tileCount,
            },
        };
    }
    function fullPageMetricsFromResult(result) {
        const viewportWidth = positiveNumber(result.viewportWidth, "viewportWidth");
        const viewportHeight = positiveNumber(result.viewportHeight, "viewportHeight");
        const documentWidth = positiveNumber(result.documentWidth, "documentWidth");
        const documentHeight = positiveNumber(result.documentHeight, "documentHeight");
        return {
            viewportWidth,
            viewportHeight,
            documentWidth,
            documentHeight,
            maxScrollX: Math.max(0, Number(result.maxScrollX ?? Math.max(0, documentWidth - viewportWidth))),
            maxScrollY: Math.max(0, Number(result.maxScrollY ?? Math.max(0, documentHeight - viewportHeight))),
            scrollX: Math.max(0, Number(result.scrollX ?? 0)),
            scrollY: Math.max(0, Number(result.scrollY ?? 0)),
        };
    }
    function positiveNumber(value, label) {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0)
            throw new Error(`invalid full-page screenshot metric: ${label}`);
        return number;
    }
    function tilePositions(total, viewport, maxScroll) {
        if (total <= viewport || maxScroll <= 0)
            return [0];
        const positions = [];
        for (let position = 0; position < maxScroll; position += viewport) {
            positions.push(position);
        }
        positions.push(maxScroll);
        return [...new Set(positions.map((position) => Math.max(0, Math.round(position))))];
    }
    async function loadCaptureImage(dataUrl) {
        if (typeof createImageBitmap === "function") {
            const blob = await (await fetch(dataUrl)).blob();
            const bitmap = await createImageBitmap(blob);
            return {
                image: bitmap,
                width: bitmap.width,
                height: bitmap.height,
                close: () => bitmap.close(),
            };
        }
        const image = await loadHtmlImage(dataUrl);
        return {
            image,
            width: image.naturalWidth,
            height: image.naturalHeight,
        };
    }
    function loadHtmlImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("failed to decode screenshot tile"));
            image.src = dataUrl;
        });
    }
    async function setCommand(args) {
        const [subcommand, ...rest] = args;
        if (subcommand === "headers")
            return setHeadersCommand(rest);
        if (subcommand === "media")
            return setMediaCommand(rest);
        if (subcommand === "device")
            return setDeviceCommand(rest);
        if (subcommand === "offline")
            return setOfflineCommand(rest);
        if (subcommand !== "viewport") {
            return notAvailable(`set ${subcommand || ""}`.trim(), "Only `set viewport <w> <h> [scale]`, `set device <name>`, `set headers <json>`, `set media dark|light|auto`, and `set offline on|off` are implemented on the Firefox WebExtension backend. geo and credentials still require a CDP-capable backend.");
        }
        const parsed = parseViewportArgs(rest);
        if ("error" in parsed)
            return parsed;
        const resized = await resizeViewport(parsed.width, parsed.height, parsed.scale, "set viewport");
        const page = resized.viewport.page;
        return {
            text: `Viewport resize requested ${parsed.width}x${parsed.height}${parsed.scale ? ` scale ${parsed.scale}` : ""}; measured ${page?.innerWidth ?? "unknown"}x${page?.innerHeight ?? "unknown"}`,
            viewport: resized.viewport,
            warnings: resized.warnings,
        };
    }
    async function setDeviceCommand(args) {
        const parsed = parseDeviceArgs(args);
        if ("error" in parsed)
            return parsed;
        const resized = await resizeViewport(parsed.profile.width, parsed.profile.height, parsed.profile.scale, "set device");
        const page = resized.viewport.page;
        return {
            text: `Device ${parsed.profile.name} requested ${parsed.profile.width}x${parsed.profile.height} scale ${parsed.profile.scale}; measured ${page?.innerWidth ?? "unknown"}x${page?.innerHeight ?? "unknown"}`,
            device: {
                name: parsed.profile.name,
                viewport: {
                    width: parsed.profile.width,
                    height: parsed.profile.height,
                    scale: parsed.profile.scale,
                },
                userAgent: parsed.profile.userAgent,
                isMobile: parsed.profile.isMobile,
                hasTouch: parsed.profile.hasTouch,
                emulated: {
                    viewport: true,
                    deviceScaleFactor: false,
                    userAgent: false,
                    touch: false,
                },
            },
            viewport: resized.viewport,
            warnings: mergeWarnings(resized.warnings, bestEffortWarning("set device", "Firefox WebExtensions approximate device emulation by resizing the content viewport only. User-Agent, touch events, mobile browser chrome, and deviceScaleFactor are reported but not enforced.")),
        };
    }
    async function resizeViewport(width, height, scale, feature) {
        const tab = await targetTab();
        await activatePage(tab);
        const beforeWindow = await browser.windows.get(tab.windowId);
        const beforeMetrics = await viewportMetrics(tab.tabId).catch(() => null);
        const chromeWidth = finitePositiveNumber(beforeWindow.width) && finitePositiveNumber(beforeMetrics?.innerWidth)
            ? Number(beforeWindow.width) - Number(beforeMetrics?.innerWidth)
            : 0;
        const chromeHeight = finitePositiveNumber(beforeWindow.height) && finitePositiveNumber(beforeMetrics?.innerHeight)
            ? Number(beforeWindow.height) - Number(beforeMetrics?.innerHeight)
            : 0;
        const targetOuterWidth = Math.max(100, Math.round(width + Math.max(0, chromeWidth)));
        const targetOuterHeight = Math.max(100, Math.round(height + Math.max(0, chromeHeight)));
        await browser.windows.update(tab.windowId, { focused: true, width: targetOuterWidth, height: targetOuterHeight });
        await delay(150);
        await tuneViewportWindow(tab.tabId, tab.windowId, width, height);
        const updatedWindow = await browser.windows.get(tab.windowId);
        const page = await viewportMetrics(tab.tabId).catch(() => null);
        const warnings = [
            bestEffortWarning(feature, "Firefox WebExtensions resize the browser window to approximate the requested content viewport. Check the returned page.innerWidth/page.innerHeight before relying on pixel-perfect screenshots."),
        ];
        if (scale !== undefined && scale !== 1) {
            warnings.push(bestEffortWarning(feature, "Firefox WebExtensions cannot set deviceScaleFactor for an existing page; the requested scale is reported but not enforced."));
        }
        const viewport = {
            requested: { width, height, scale: scale ?? 1 },
            window: { id: updatedWindow.id, width: updatedWindow.width, height: updatedWindow.height },
            page,
        };
        return { viewport, warnings };
    }
    async function setMediaCommand(args) {
        const parsed = normalizeContentColorScheme(args[0]);
        if ("error" in parsed)
            return parsed;
        if (!parsed.scheme) {
            return { error: { code: "invalid_args", message: "set media requires dark|light|auto" } };
        }
        const applied = await applyContentColorScheme(parsed.scheme);
        if ("error" in applied)
            return applied;
        return {
            text: `Media color scheme set to ${parsed.scheme}`,
            media: applied.media,
        };
    }
    async function setOfflineCommand(args) {
        const parsed = parseOfflineMode(args);
        if ("error" in parsed)
            return parsed;
        offlineModeEnabled = parsed.enabled;
        return {
            text: `Offline mode ${offlineModeEnabled ? "enabled" : "disabled"}`,
            offline: {
                enabled: offlineModeEnabled,
                emulated: {
                    webRequestBlocking: true,
                    navigatorOnLine: false,
                    serviceWorkerCache: false,
                    socketState: false,
                },
            },
            warnings: [offlineModeWarning()],
        };
    }
    function parseOfflineMode(args) {
        if (args.length > 1) {
            return { error: { code: "invalid_args", message: "set offline accepts on|off" } };
        }
        const value = (args[0] ?? "on").toLowerCase();
        if (value === "on" || value === "true" || value === "1")
            return { enabled: true };
        if (value === "off" || value === "false" || value === "0")
            return { enabled: false };
        return { error: { code: "invalid_args", message: "set offline accepts on|off" } };
    }
    function offlineModeWarning() {
        return bestEffortWarning("set offline", "Firefox WebExtensions can cancel future network requests for managed tabs, but this is not full CDP offline emulation: navigator.onLine, service worker cache behavior, DNS, and socket state are not controlled.");
    }
    function normalizeContentColorScheme(value) {
        if (value == null || value === "")
            return {};
        if (typeof value !== "string") {
            return { error: { code: "invalid_args", message: "color scheme must be dark, light, or auto" } };
        }
        const scheme = value.toLowerCase();
        if (scheme === "dark" || scheme === "light" || scheme === "auto")
            return { scheme };
        return { error: { code: "invalid_args", message: "color scheme must be dark, light, or auto" } };
    }
    async function applyContentColorScheme(scheme) {
        const setting = browser.browserSettings?.overrideContentColorScheme;
        if (!setting?.set) {
            return {
                error: {
                    code: "not_available",
                    message: "Firefox browserSettings.overrideContentColorScheme is unavailable in this extension context",
                },
            };
        }
        const applied = await setting.set({ value: scheme });
        return {
            media: {
                colorScheme: scheme,
                applied: applied !== false,
            },
        };
    }
    async function setHeadersCommand(args) {
        const jsonText = args.join(" ").trim();
        if (!jsonText) {
            return { error: { code: "InvalidArgumentError", message: "set headers requires <json>" } };
        }
        const parsed = parseHeadersOption(jsonText, "set headers");
        if ("error" in parsed)
            return parsed;
        const tab = await targetTab();
        const origin = safeOrigin(tab.url);
        if (!origin) {
            return { error: { code: "InvalidArgumentError", message: "set headers requires an active http(s) page" } };
        }
        const headers = applyHeadersForOrigin(origin, parsed.headers);
        return {
            text: headers.names.length
                ? `Set ${headers.names.length} header(s) for ${headers.origin}: ${headers.names.join(", ")}`
                : `Cleared headers for ${headers.origin}`,
            headers,
        };
    }
    function parseHeadersOption(value, feature) {
        if (value === undefined)
            return { provided: false, headers: [] };
        let parsed;
        try {
            parsed = JSON.parse(value);
        }
        catch {
            return { error: { code: "InvalidArgumentError", message: `${feature} requires a JSON object of header names to values` } };
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return { error: { code: "InvalidArgumentError", message: `${feature} requires a JSON object of header names to values` } };
        }
        const headers = [];
        for (const [name, rawValue] of Object.entries(parsed)) {
            const normalizedName = name.trim();
            const validName = validateHeaderName(normalizedName);
            if ("error" in validName)
                return validName;
            if (!["string", "number", "boolean"].includes(typeof rawValue)) {
                return { error: { code: "InvalidArgumentError", message: `${feature} header ${normalizedName} must be a string, number, or boolean` } };
            }
            const headerValue = String(rawValue);
            if (/[\r\n]/.test(headerValue)) {
                return { error: { code: "InvalidArgumentError", message: `${feature} header ${normalizedName} cannot contain newlines` } };
            }
            headers.push({ name: normalizedName, value: headerValue });
        }
        return { provided: true, headers };
    }
    function validateHeaderName(name) {
        if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(name)) {
            return { error: { code: "InvalidArgumentError", message: `invalid header name: ${name || "(empty)"}` } };
        }
        const lower = name.toLowerCase();
        if (lower === "host" ||
            lower === "cookie" ||
            lower === "set-cookie" ||
            lower === "content-length" ||
            lower === "transfer-encoding" ||
            lower === "connection" ||
            lower.startsWith("sec-")) {
            return { error: { code: "InvalidArgumentError", message: `header ${name} cannot be managed by pire-browser` } };
        }
        return { ok: true };
    }
    function setHeadersForUrl(url, headers) {
        const origin = safeOrigin(url);
        if (!origin) {
            return { error: { code: "InvalidArgumentError", message: "open --headers requires an http(s) URL" } };
        }
        return { headers: applyHeadersForOrigin(origin, headers) };
    }
    function applyHeadersForOrigin(origin, headers) {
        if (headers.length === 0) {
            headersByOrigin.delete(origin);
        }
        else {
            headersByOrigin.set(origin, headers);
        }
        return { origin, names: headers.map((header) => header.name) };
    }
    function parseViewportArgs(args) {
        const width = Number(args[0]);
        const height = Number(args[1]);
        const scale = args[2] === undefined ? undefined : Number(args[2]);
        if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
            return { error: { code: "InvalidArgumentError", message: "set viewport requires positive integer <w> <h> [scale]" } };
        }
        if (scale !== undefined && (!Number.isFinite(scale) || scale <= 0)) {
            return { error: { code: "InvalidArgumentError", message: "set viewport scale must be a positive number" } };
        }
        return { width, height, scale };
    }
    function parseDeviceArgs(args) {
        if (args.some((arg) => arg.startsWith("-") && arg !== "--json")) {
            return { error: { code: "InvalidArgumentError", message: "set device does not support options" } };
        }
        const name = args.filter((arg) => arg !== "--json").join(" ").trim();
        if (!name) {
            return {
                error: {
                    code: "InvalidArgumentError",
                    message: `set device requires <name>. Supported devices: ${supportedDeviceNames()}`,
                },
            };
        }
        const profile = findDeviceProfile(name);
        if (!profile) {
            return {
                error: {
                    code: "InvalidArgumentError",
                    message: `Unknown device "${name}". Supported devices: ${supportedDeviceNames()}`,
                },
            };
        }
        return { profile };
    }
    function findDeviceProfile(name) {
        const normalized = normalizeDeviceName(name);
        return DEVICE_PROFILES.find((profile) => [profile.name, ...profile.aliases].some((alias) => normalizeDeviceName(alias) === normalized));
    }
    function normalizeDeviceName(name) {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    }
    function supportedDeviceNames() {
        return DEVICE_PROFILES.map((profile) => profile.name).join(", ");
    }
    async function tuneViewportWindow(tabId, windowId, width, height) {
        const metrics = await viewportMetrics(tabId).catch(() => null);
        if (!metrics || !finitePositiveNumber(metrics.innerWidth) || !finitePositiveNumber(metrics.innerHeight))
            return;
        const deltaWidth = width - Number(metrics.innerWidth);
        const deltaHeight = height - Number(metrics.innerHeight);
        if (Math.abs(deltaWidth) <= 2 && Math.abs(deltaHeight) <= 2)
            return;
        const current = await browser.windows.get(windowId);
        const nextWidth = finitePositiveNumber(current.width) ? Math.max(100, Math.round(Number(current.width) + deltaWidth)) : undefined;
        const nextHeight = finitePositiveNumber(current.height) ? Math.max(100, Math.round(Number(current.height) + deltaHeight)) : undefined;
        if (nextWidth === undefined && nextHeight === undefined)
            return;
        await browser.windows.update(windowId, { width: nextWidth, height: nextHeight });
        await delay(100);
    }
    async function viewportMetrics(tabId) {
        return normalizeContentResponse(await sendFrame(tabId, undefined, { type: "viewport_metrics" }));
    }
    function finitePositiveNumber(value) {
        return typeof value === "number" && Number.isFinite(value) && value > 0;
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
        const target = args[0];
        const tab = await targetTab();
        if (!target)
            return { error: { code: "invalid_args", message: "frame requires <ref|selector> or main" } };
        if (target === "main") {
            selectedFramesByTabId.delete(tab.tabId);
            return { text: "Frame targeting reset to main", frame: { frameId: 0, main: true } };
        }
        const locator = locatorFromTarget(target);
        if ("error" in locator)
            return locator;
        const parentFrameId = targetFrameIdForTab(tab.tabId, locator.frameId) ?? 0;
        const response = await sendFrame(tab.tabId, parentFrameId, { type: "frame_target", locator: locator.locator }, { staleOnFrameRoutingError: true });
        const targetResult = normalizeContentResponse(response);
        if ("error" in targetResult)
            return targetResult;
        const child = await childFrameForTarget(tab.tabId, parentFrameId, targetResult);
        if ("error" in child)
            return child;
        selectedFramesByTabId.set(tab.tabId, {
            frameId: child.frameId,
            parentFrameId,
            url: child.url,
            summary: String(targetResult.text ?? `frame ${child.frameId}`),
        });
        return {
            ...targetResult,
            text: `Frame ${child.frameId} selected`,
            frame: {
                frameId: child.frameId,
                parentFrameId,
                url: child.url,
                target: targetResult,
            },
        };
    }
    async function dialogCommand(args) {
        const [subcommand = "status", ...rest] = args;
        const tab = await targetTab();
        if (subcommand === "status") {
            const dialogs = await recentDialogsForStatus(tab.tabId);
            const dialog = dialogs[dialogs.length - 1] ?? null;
            return {
                text: dialog ? `${dialog.type}: ${dialog.message}` : "No dialog recorded",
                active: Boolean(dialog),
                dialog,
                dialogs,
            };
        }
        if (subcommand === "accept" || subcommand === "dismiss") {
            const text = rest.length ? rest.join(" ") : undefined;
            const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), {
                type: "dialog_control",
                action: subcommand,
                text,
            });
            const result = normalizeContentResponse(response);
            if ("error" in result)
                return result;
            return result;
        }
        return { error: { code: "invalid_args", message: "dialog requires status|accept|dismiss" } };
    }
    async function debugLogCommand(kind, args) {
        const clear = args.includes("--clear") || args[0] === "clear";
        const unexpected = args.filter((arg) => arg !== "--clear" && arg !== "clear");
        if (unexpected.length > 0) {
            return {
                error: {
                    code: "invalid_args",
                    message: `${kind} supports no positional arguments; use ${kind}${kind === "console" ? " [--clear]" : " [--clear]"}`,
                },
            };
        }
        const tab = await targetTab();
        const frames = await framesForScope(tab.tabId);
        const frameResults = [];
        let lastError = "";
        for (const frame of frames) {
            try {
                const response = await sendFrame(tab.tabId, frame.frameId, { type: "debug_logs", kind, clear });
                if (response?.error) {
                    lastError = response.error.message ?? String(response.error);
                    continue;
                }
                frameResults.push({
                    frameId: frame.frameId,
                    url: frame.url,
                    count: response?.count ?? 0,
                    cleared: Boolean(response?.cleared),
                    messages: response?.messages ?? [],
                    errors: response?.errors ?? [],
                });
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }
        }
        if (frameResults.length === 0 && lastError) {
            return {
                error: {
                    code: "FrameUnavailable",
                    message: `Could not read ${kind} records from the active page: ${lastError}`,
                },
            };
        }
        const recordKey = kind === "errors" ? "errors" : "messages";
        const records = [];
        for (const frame of frameResults) {
            const items = Array.isArray(frame[recordKey]) ? frame[recordKey] : [];
            for (const item of items) {
                records.push({
                    ...item,
                    frameId: frame.frameId,
                    frameUrl: frame.url,
                });
            }
        }
        records.sort((left, right) => Number(left.at ?? 0) - Number(right.at ?? 0));
        const count = records.length;
        const noun = kind === "errors" ? "page error" : "console message";
        return {
            text: clear
                ? `Cleared ${count} ${noun}${count === 1 ? "" : "s"}`
                : formatDebugRecords(kind, records),
            [recordKey]: records,
            count,
            cleared: clear,
            frames: frameResults.map((frame) => ({
                frameId: frame.frameId,
                url: frame.url,
                count: frame.count,
            })),
        };
    }
    function formatDebugRecords(kind, records) {
        if (!records.length)
            return kind === "errors" ? "No page errors recorded" : "No console messages recorded";
        return records.map((record) => {
            if (kind === "errors") {
                const source = typeof record.source === "string" && record.source ? record.source : "";
                const line = typeof record.lineno === "number" ? `:${record.lineno}` : "";
                const column = typeof record.colno === "number" ? `:${record.colno}` : "";
                const location = source ? ` (${source}${line}${column})` : "";
                return `[${record.type ?? "error"}] ${record.message ?? ""}${location}`;
            }
            return `[${record.level ?? "log"}] ${record.text ?? ""}`;
        }).join("\n");
    }
    async function vitalsCommand(args, _domainPolicy) {
        const parsed = parseVitalsArgs(args);
        if ("error" in parsed)
            return parsed;
        const opened = parsed.url ? await openCommand([parsed.url], "open") : null;
        if (opened && "error" in opened)
            return opened;
        const tab = await targetTab();
        const response = await sendFrame(tab.tabId, 0, { type: "vitals" });
        const result = normalizeContentResponse(response);
        if ("error" in result)
            return result;
        return {
            ...result,
            tab,
            open: opened ? resultSummary(opened) : undefined,
            warnings: mergeWarnings(opened ? opened.warnings : undefined, result.warnings, bestEffortWarning("vitals", "Firefox exposes a subset of Chrome Web Vitals timing APIs to WebExtensions; unavailable metrics are reported explicitly.")),
        };
    }
    function parseVitalsArgs(args) {
        let url;
        for (const arg of args) {
            if (arg === "--json")
                continue;
            if (arg.startsWith("-")) {
                return { error: { code: "invalid_args", message: `vitals does not support option: ${arg}` } };
            }
            if (url) {
                return { error: { code: "invalid_args", message: "vitals accepts at most one URL" } };
            }
            url = arg;
        }
        return { url };
    }
    async function networkCommand(args) {
        const [subcommand, ...rest] = args;
        if (!subcommand || subcommand.startsWith("--") || subcommand === "requests") {
            return networkRequestsCommand(subcommand?.startsWith("--") ? args : rest);
        }
        if (subcommand === "request")
            return networkRequestDetailCommand(rest);
        if (subcommand === "route")
            return networkRouteCommand(rest);
        if (subcommand === "unroute")
            return networkUnrouteCommand(rest);
        if (subcommand === "har" || subcommand === "export-har")
            return networkHarCommand(rest);
        return { error: { code: "invalid_args", message: "network requires requests|request|route|unroute|har|export-har" } };
    }
    async function networkRouteCommand(args) {
        const tab = await targetTab();
        const parsed = parseNetworkRouteArgs(args);
        if ("error" in parsed)
            return parsed;
        const id = `nr${nextNetworkRouteNumber++}`;
        const route = {
            id,
            tabId: tab.tabId,
            pattern: parsed.pattern,
            abort: parsed.abort,
            body: parsed.body,
            contentType: parsed.contentType,
            resourceTypes: parsed.resourceTypes,
            createdAt: Date.now(),
        };
        networkRoutes.set(id, route);
        return {
            text: `Registered network route ${id} for ${route.pattern} (${networkRouteAction(route)})`,
            route: publicNetworkRoute(route),
        };
    }
    async function networkUnrouteCommand(args) {
        const tab = await targetTab();
        const pattern = firstPositionalArg(args, []);
        const unexpected = args.filter((arg, index) => index > 0 || arg.startsWith("--"));
        if (unexpected.length > 0) {
            return { error: { code: "invalid_args", message: `network unroute does not support argument: ${unexpected[0]}` } };
        }
        let removed = 0;
        for (const [id, route] of Array.from(networkRoutes.entries())) {
            if (route.tabId !== tab.tabId)
                continue;
            if (pattern && route.pattern !== pattern && route.id !== pattern)
                continue;
            networkRoutes.delete(id);
            removed += 1;
        }
        return {
            text: pattern
                ? `Removed ${removed} network route${removed === 1 ? "" : "s"} for ${pattern}`
                : `Removed ${removed} network route${removed === 1 ? "" : "s"}`,
            removed,
        };
    }
    function parseNetworkRouteArgs(args) {
        const pattern = firstPositionalArg(args, ["--body", "--resource-type", "--type", "--content-type"]);
        if (!pattern)
            return { error: { code: "invalid_args", message: "network route requires <url-pattern>" } };
        const abort = args.includes("--abort");
        const body = valueAfter(args, "--body");
        const contentType = valueAfter(args, "--content-type") ?? inferRouteContentType(body);
        const resourceTypeValue = valueAfter(args, "--resource-type") ?? valueAfter(args, "--type");
        const resourceTypes = resourceTypeValue
            ?.split(",")
            .map((part) => normalizeNetworkType(part.trim()))
            .filter(Boolean);
        if (abort && body !== undefined) {
            return { error: { code: "invalid_args", message: "network route cannot combine --abort and --body" } };
        }
        const valueFlags = new Set(["--body", "--resource-type", "--type", "--content-type"]);
        const boolFlags = new Set(["--abort"]);
        let positionalCount = 0;
        for (let index = 0; index < args.length; index++) {
            const arg = args[index];
            if (valueFlags.has(arg)) {
                const value = args[index + 1];
                if (value === undefined || value.startsWith("--"))
                    return { error: { code: "invalid_args", message: `${arg} requires a value` } };
                index += 1;
                continue;
            }
            if (boolFlags.has(arg))
                continue;
            if (arg.startsWith("--"))
                return { error: { code: "invalid_args", message: `network route does not support argument: ${arg}` } };
            positionalCount += 1;
            if (positionalCount > 1)
                return { error: { code: "invalid_args", message: `network route unexpected argument: ${arg}` } };
        }
        return { pattern, abort, body, contentType, resourceTypes };
    }
    function inferRouteContentType(body) {
        if (body === undefined)
            return undefined;
        const trimmed = body.trim();
        if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
            return "application/json";
        }
        return "text/plain";
    }
    function publicNetworkRoute(route) {
        return {
            id: route.id,
            pattern: route.pattern,
            action: networkRouteAction(route),
            resourceTypes: route.resourceTypes ?? [],
            tabId: route.tabId,
            createdAt: route.createdAt,
        };
    }
    function networkRouteAction(route) {
        if (route.abort)
            return "abort";
        if (route.body !== undefined)
            return "mock";
        return "continue";
    }
    async function networkRequestsCommand(args) {
        const tab = await targetTab();
        const clear = args.includes("--clear");
        const filter = valueAfter(args, "--filter");
        const typeFilter = valueAfter(args, "--type");
        const methodFilter = valueAfter(args, "--method");
        const statusFilter = valueAfter(args, "--status");
        const invalid = invalidNetworkRequestsArgs(args);
        if (invalid)
            return invalid;
        const records = networkRecordsForTab(tab.tabId)
            .filter((record) => networkRecordMatches(record, { filter, typeFilter, methodFilter, statusFilter }))
            .map(publicNetworkRecord);
        if (clear) {
            const cleared = clearNetworkLog(tab.tabId);
            return {
                text: `Cleared ${cleared} network request${cleared === 1 ? "" : "s"}`,
                requests: records,
                count: records.length,
                cleared,
            };
        }
        return {
            text: formatNetworkRecords(records),
            requests: records,
            count: records.length,
        };
    }
    async function networkHarCommand(args) {
        const tab = await targetTab();
        const mode = networkHarMode(args);
        const commandArgs = networkHarCommandArgs(args, mode);
        const invalid = invalidNetworkHarArgs(commandArgs, mode);
        if (invalid)
            return invalid;
        if (mode === "start") {
            const startedAt = Date.now();
            networkHarRecordingStartedAtByTabId.set(tab.tabId, startedAt);
            return {
                text: `Started HAR recording in ${tab.agentId}`,
                harRecording: {
                    active: true,
                    startedAt,
                    tabId: tab.tabId,
                    agentId: tab.agentId,
                },
                warnings: [networkHarMetadataWarning()],
            };
        }
        const recordingStartedAt = mode === "stop" ? networkHarRecordingStartedAtByTabId.get(tab.tabId) : undefined;
        if (mode === "stop" && recordingStartedAt === undefined) {
            return {
                error: {
                    code: "invalid_state",
                    message: "No HAR recording is active for the current tab. Run `network har start` before `network har stop`.",
                },
            };
        }
        const path = firstPositionalArg(commandArgs, ["--filter", "--type", "--method", "--status"]);
        const filter = valueAfter(commandArgs, "--filter");
        const typeFilter = valueAfter(commandArgs, "--type");
        const methodFilter = valueAfter(commandArgs, "--method");
        const statusFilter = valueAfter(commandArgs, "--status");
        const records = networkRecordsForTab(tab.tabId)
            .filter((record) => recordingStartedAt === undefined || record.startedAt >= recordingStartedAt)
            .filter((record) => networkRecordMatches(record, { filter, typeFilter, methodFilter, statusFilter }))
            .map(publicNetworkRecord);
        const har = networkHarForRecords(records, tab, { startedAt: recordingStartedAt });
        if (mode === "stop")
            networkHarRecordingStartedAtByTabId.delete(tab.tabId);
        return {
            text: path ? `Prepared HAR with ${records.length} request${records.length === 1 ? "" : "s"} for ${path}` : JSON.stringify(har, null, 2),
            har,
            path,
            count: records.length,
            harRecording: {
                active: false,
                mode,
                startedAt: recordingStartedAt,
                stoppedAt: mode === "stop" ? Date.now() : undefined,
                tabId: tab.tabId,
                agentId: tab.agentId,
            },
            warnings: [networkHarMetadataWarning()],
        };
    }
    function networkHarMode(args) {
        if (args[0] === "start")
            return "start";
        if (args[0] === "stop")
            return "stop";
        return "export";
    }
    function networkHarCommandArgs(args, mode) {
        return mode === "export" ? args : args.slice(1);
    }
    function networkHarMetadataWarning() {
        return bestEffortWarning("network har", "HAR export is built from Firefox WebExtension request metadata. Request/response headers, cookies, and response bodies are not captured.");
    }
    function invalidNetworkHarArgs(args, mode) {
        if (mode === "start" && args.length > 0) {
            return { error: { code: "invalid_args", message: "network har start does not accept filters or an output path" } };
        }
        const valueFlags = new Set(["--filter", "--type", "--method", "--status"]);
        let positionalCount = 0;
        for (let index = 0; index < args.length; index++) {
            const arg = args[index];
            if (valueFlags.has(arg)) {
                const value = args[index + 1];
                if (!value || value.startsWith("--")) {
                    return { error: { code: "invalid_args", message: `${arg} requires a value` } };
                }
                index += 1;
                continue;
            }
            if (arg.startsWith("--")) {
                return { error: { code: "invalid_args", message: `network har does not support argument: ${arg}` } };
            }
            positionalCount += 1;
            if (positionalCount > 1) {
                return { error: { code: "invalid_args", message: `network har unexpected argument: ${arg}` } };
            }
        }
        return null;
    }
    function invalidNetworkRequestsArgs(args) {
        const valueFlags = new Set(["--filter", "--type", "--method", "--status"]);
        const boolFlags = new Set(["--clear"]);
        for (let index = 0; index < args.length; index++) {
            const arg = args[index];
            if (valueFlags.has(arg)) {
                const value = args[index + 1];
                if (!value || value.startsWith("--")) {
                    return { error: { code: "invalid_args", message: `${arg} requires a value` } };
                }
                index += 1;
                continue;
            }
            if (boolFlags.has(arg))
                continue;
            return { error: { code: "invalid_args", message: `network requests does not support argument: ${arg}` } };
        }
        return null;
    }
    async function networkRequestDetailCommand(args) {
        const requestId = firstPositionalArg(args, []);
        if (!requestId)
            return { error: { code: "invalid_args", message: "network request requires <requestId>" } };
        const record = networkRequestsById.get(requestId);
        if (!record) {
            return {
                error: {
                    code: "not_found",
                    message: `No network request recorded with id ${requestId}`,
                },
            };
        }
        const request = publicNetworkRecord(record);
        return {
            text: formatNetworkDetail(request),
            request,
        };
    }
    function networkRecordsForTab(tabId) {
        return (networkRequestLogIdsByTabId.get(tabId) ?? [])
            .map((id) => networkRequestsById.get(id))
            .filter((record) => Boolean(record))
            .sort((left, right) => left.startedAt - right.startedAt);
    }
    function networkRecordMatches(record, filters) {
        if (filters.filter && !networkUrlMatches(record.url ?? "", filters.filter))
            return false;
        if (filters.typeFilter && !networkTypeMatches(record.type, filters.typeFilter))
            return false;
        if (filters.methodFilter && record.method?.toUpperCase() !== filters.methodFilter.toUpperCase())
            return false;
        if (filters.statusFilter && !networkStatusMatches(record.statusCode, filters.statusFilter))
            return false;
        return true;
    }
    function networkUrlMatches(url, pattern) {
        if (pattern.includes("*")) {
            try {
                return globToRegExp(pattern).test(url);
            }
            catch {
                return false;
            }
        }
        return url.toLowerCase().includes(pattern.toLowerCase());
    }
    function networkTypeMatches(type, filter) {
        const normalized = normalizeNetworkType(type);
        const accepted = filter.split(",").map((part) => normalizeNetworkType(part.trim())).filter(Boolean);
        return accepted.includes(normalized);
    }
    function normalizeNetworkType(type) {
        const value = String(type ?? "").toLowerCase();
        if (value === "xhr" || value === "fetch")
            return "xmlhttprequest";
        return value;
    }
    function networkStatusMatches(statusCode, filter) {
        if (typeof statusCode !== "number")
            return false;
        const value = filter.trim().toLowerCase();
        const family = /^([1-5])xx$/.exec(value);
        if (family) {
            const start = Number(family[1]) * 100;
            return statusCode >= start && statusCode <= start + 99;
        }
        const range = /^(\d{3})-(\d{3})$/.exec(value);
        if (range) {
            const start = Number(range[1]);
            const end = Number(range[2]);
            return statusCode >= start && statusCode <= end;
        }
        const exact = Number(value);
        return Number.isInteger(exact) && statusCode === exact;
    }
    function publicNetworkRecord(record) {
        return {
            id: record.requestId,
            requestId: record.requestId,
            url: record.url,
            method: record.method ?? "GET",
            type: record.type,
            status: record.statusCode,
            statusCode: record.statusCode,
            statusLine: record.statusLine,
            error: record.error,
            active: record.active === true,
            fromCache: record.fromCache,
            frameId: record.frameId,
            parentFrameId: record.parentFrameId,
            documentUrl: record.documentUrl,
            initiator: record.initiator,
            startedAt: record.startedAt,
            completedAt: record.completedAt,
            durationMs: record.durationMs,
            routeId: record.routeId,
            routeAction: record.routeAction,
        };
    }
    function formatNetworkRecords(records) {
        if (!records.length)
            return "No network requests recorded";
        return records.map(formatNetworkRecordLine).join("\n");
    }
    function formatNetworkRecordLine(record) {
        const status = record.active ? "active" : record.error ? "ERR" : typeof record.statusCode === "number" ? String(record.statusCode) : "-";
        const method = record.method ?? "GET";
        const type = record.type ? ` ${record.type}` : "";
        const duration = typeof record.durationMs === "number" ? ` ${record.durationMs}ms` : "";
        const route = record.routeAction ? ` route:${record.routeAction}` : "";
        return `${record.requestId} ${status} ${method} ${truncate(record.url ?? "", 180)}${type}${duration}${route}`;
    }
    function formatNetworkDetail(record) {
        return [
            `Request: ${record.requestId}`,
            `URL: ${record.url ?? ""}`,
            `Method: ${record.method ?? "GET"}`,
            `Type: ${record.type ?? ""}`,
            `Status: ${record.statusCode ?? (record.error ? "error" : record.active ? "active" : "")}`,
            record.routeAction ? `Route: ${record.routeAction}${record.routeId ? ` (${record.routeId})` : ""}` : "",
            record.error ? `Error: ${record.error}` : "",
            typeof record.durationMs === "number" ? `Duration: ${record.durationMs}ms` : "",
        ].filter(Boolean).join("\n");
    }
    function networkHarForRecords(records, tab, options = {}) {
        const pageStartedAt = options.startedAt ?? Math.min(...records.map((record) => record.startedAt).filter(Number.isFinite), Date.now());
        return {
            log: {
                version: "1.2",
                creator: {
                    name: "pire-browser",
                    version: browser.runtime.getManifest().version,
                    comment: "Firefox WebExtension metadata export; bodies and headers are not captured.",
                },
                browser: {
                    name: "Firefox",
                    version: "",
                },
                pages: [
                    {
                        startedDateTime: new Date(pageStartedAt).toISOString(),
                        id: `page_${tab.agentId}`,
                        title: tab.title ?? "",
                        pageTimings: {
                            onContentLoad: -1,
                            onLoad: -1,
                        },
                        _url: tab.url,
                    },
                ],
                entries: records.map((record) => networkHarEntry(record, tab)),
            },
        };
    }
    function networkHarEntry(record, tab) {
        const startedAt = typeof record.startedAt === "number" ? record.startedAt : Date.now();
        const duration = typeof record.durationMs === "number" ? record.durationMs : record.active ? Math.max(0, Date.now() - startedAt) : 0;
        const status = typeof record.statusCode === "number" ? record.statusCode : 0;
        return {
            pageref: `page_${tab.agentId}`,
            startedDateTime: new Date(startedAt).toISOString(),
            time: duration,
            request: {
                method: record.method ?? "GET",
                url: record.url ?? "",
                httpVersion: "HTTP/1.1",
                cookies: [],
                headers: [],
                queryString: harQueryString(record.url),
                headersSize: -1,
                bodySize: -1,
            },
            response: {
                status,
                statusText: harStatusText(record),
                httpVersion: "HTTP/1.1",
                cookies: [],
                headers: [],
                content: {
                    size: -1,
                    mimeType: "x-unknown",
                },
                redirectURL: "",
                headersSize: -1,
                bodySize: -1,
                _error: record.error,
                _fromCache: record.fromCache,
            },
            cache: {},
            timings: {
                blocked: -1,
                dns: -1,
                connect: -1,
                send: 0,
                wait: duration,
                receive: 0,
                ssl: -1,
            },
            _pireBrowser: {
                requestId: record.requestId,
                type: record.type,
                active: record.active,
                frameId: record.frameId,
                parentFrameId: record.parentFrameId,
                documentUrl: record.documentUrl,
                initiator: record.initiator,
                routeId: record.routeId,
                routeAction: record.routeAction,
            },
        };
    }
    function harStatusText(record) {
        if (record.error)
            return record.error;
        if (record.active)
            return "active";
        if (record.statusLine)
            return record.statusLine.replace(/^HTTP\/\S+\s+\d+\s*/, "");
        return "";
    }
    function harQueryString(url) {
        if (!url)
            return [];
        try {
            const params = [];
            new URL(url).searchParams.forEach((value, name) => {
                params.push({ name, value });
            });
            return params;
        }
        catch {
            return [];
        }
    }
    function clearNetworkLog(tabId) {
        const ids = networkRequestLogIdsByTabId.get(tabId) ?? [];
        const activeIds = networkRequestIdsByTabId.get(tabId) ?? new Set();
        let cleared = 0;
        for (const id of ids) {
            if (activeIds.has(id))
                continue;
            networkRequestsById.delete(id);
            networkRouteMatchesByRequestId.delete(id);
            cleared += 1;
        }
        networkRequestLogIdsByTabId.set(tabId, [...activeIds]);
        return cleared;
    }
    async function recentDialogsForStatus(tabId) {
        const existing = recentDialogsByTabId.get(tabId) ?? [];
        if (existing.length > 0)
            return existing;
        const deadline = Date.now() + 750;
        while (Date.now() < deadline) {
            await collectDialogsForStatus(tabId);
            const collected = recentDialogsByTabId.get(tabId) ?? [];
            if (collected.length > 0)
                return collected;
            await delay(50);
            const dialogs = recentDialogsByTabId.get(tabId) ?? [];
            if (dialogs.length > 0)
                return dialogs;
        }
        await collectDialogsForStatus(tabId);
        const finalDialogs = recentDialogsByTabId.get(tabId) ?? [];
        if (finalDialogs.length > 0)
            return finalDialogs;
        return [];
    }
    async function collectDialogsForStatus(tabId) {
        const frames = await framesForScope(tabId, selectedFrameIdForTab(tabId));
        for (const frame of frames) {
            try {
                await sendFrame(tabId, frame.frameId, { type: "dialog_status" });
            }
            catch {
                // Cross-origin, opaque, or not-yet-ready frames may reject extension messages.
            }
        }
    }
    async function batchCommand(args, domainPolicy, actionPolicy, confirmationPolicy) {
        const bailOnError = args.includes("--bail");
        const commands = args.filter((arg) => arg !== "--bail");
        const results = [];
        for (const commandText of commands) {
            const commandArgs = splitCommand(commandText);
            const result = await executeCommandWithPolicies(commandArgs, domainPolicy, actionPolicy, confirmationPolicy);
            results.push(batchStepResult(commandArgs, result));
            const errorCode = result.error?.code;
            if ("error" in result && (errorCode === "DomainPolicyError" || errorCode === "ActionPolicyError" || errorCode === "ConfirmationRequired")) {
                return batchErrorResult(result.error, `Ran ${results.length} batch command(s)`, results);
            }
            if (bailOnError && "error" in result) {
                return batchErrorResult(result.error, `Ran ${results.length} batch command(s)`, results);
            }
        }
        return { text: `Ran ${results.length} batch command(s)`, results };
    }
    function batchStepResult(command, result) {
        if ("error" in result) {
            const error = result.error;
            return {
                command,
                success: false,
                error: error?.message ?? String(error ?? "unknown error"),
                errorCode: error?.code,
                result: null,
            };
        }
        return {
            command,
            success: true,
            error: null,
            result,
        };
    }
    function batchErrorResult(error, text, results) {
        const data = error?.data && typeof error.data === "object" ? error.data : {};
        return {
            error: {
                ...error,
                data: {
                    ...data,
                    batch: { text, results },
                },
            },
            text,
            results,
        };
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
    async function authCommand(args, domainPolicy) {
        const [subcommand, name, ...rest] = args;
        if (subcommand === "save")
            return authSaveCommand(name, rest);
        if (subcommand === "login")
            return authLoginCommand(name, domainPolicy);
        if (subcommand === "list" || !subcommand)
            return authListCommand();
        if (subcommand === "show")
            return authShowCommand(name);
        if (subcommand === "delete")
            return authDeleteCommand(name);
        return { error: { code: "InvalidArgumentError", message: "auth requires save|login|list|show|delete" } };
    }
    async function authSaveCommand(name, args) {
        if (!name)
            return { error: { code: "InvalidArgumentError", message: "auth save requires <name>" } };
        const parsed = parseAuthSaveArgs(args);
        if ("error" in parsed)
            return parsed;
        const existing = await authProfiles();
        const now = new Date().toISOString();
        const profile = {
            schemaVersion: 1,
            name,
            url: parsed.url,
            username: parsed.username,
            password: parsed.password,
            selectors: parsed.selectors,
            createdAt: existing[name]?.createdAt ?? now,
            updatedAt: now,
        };
        existing[name] = profile;
        await saveAuthProfiles(existing);
        return {
            text: `Saved auth profile ${name}`,
            profile: publicAuthProfile(profile),
            warnings: [authStorageWarning()],
        };
    }
    async function authLoginCommand(name, domainPolicy) {
        if (!name)
            return { error: { code: "InvalidArgumentError", message: "auth login requires <name>" } };
        const profiles = await authProfiles();
        const profile = profiles[name];
        if (!profile)
            return { error: { code: "not_found", message: `No auth profile found: ${name}` } };
        if (domainPolicy?.enabled) {
            const domainError = domainPolicyErrorForUrl(profile.url, domainPolicy);
            if (domainError)
                return { error: domainError };
        }
        const opened = await openCommand([profile.url], "open");
        if ("error" in opened)
            return opened;
        const username = await fillLocator(selectorToLocator(profile.selectors.username), profile.username);
        if ("error" in username)
            return username;
        const password = await fillLocator(selectorToLocator(profile.selectors.password), profile.password);
        if ("error" in password)
            return password;
        const submit = await clickLocator(selectorToLocator(profile.selectors.submit));
        if ("error" in submit)
            return submit;
        return {
            text: `Logged in with auth profile ${name}`,
            profile: publicAuthProfile(profile),
            results: {
                open: resultSummary(opened),
                username: resultSummary(username),
                password: resultSummary(password),
                submit: resultSummary(submit),
            },
            warnings: mergeWarnings(opened.warnings, authStorageWarning()),
        };
    }
    async function authListCommand() {
        const profiles = Object.values(await authProfiles()).map(publicAuthProfile);
        const rows = profiles.map((profile) => `${profile.name} ${profile.url}`).join("\n");
        return {
            text: rows || "No auth profiles saved",
            profiles,
            warnings: [authStorageWarning()],
        };
    }
    async function authShowCommand(name) {
        if (!name)
            return { error: { code: "InvalidArgumentError", message: "auth show requires <name>" } };
        const profile = (await authProfiles())[name];
        if (!profile)
            return { error: { code: "not_found", message: `No auth profile found: ${name}` } };
        return {
            text: `${profile.name} ${profile.url}`,
            profile: publicAuthProfile(profile),
            warnings: [authStorageWarning()],
        };
    }
    async function authDeleteCommand(name) {
        if (!name)
            return { error: { code: "InvalidArgumentError", message: "auth delete requires <name>" } };
        const profiles = await authProfiles();
        const existed = Boolean(profiles[name]);
        delete profiles[name];
        await saveAuthProfiles(profiles);
        return {
            text: existed ? `Deleted auth profile ${name}` : `No auth profile found: ${name}`,
            deleted: existed,
            warnings: [authStorageWarning()],
        };
    }
    function parseAuthSaveArgs(args) {
        const values = {};
        for (let index = 0; index < args.length; index++) {
            const arg = args[index];
            if (arg === "--password-stdin") {
                return {
                    error: {
                        code: "NotAvailableError",
                        message: "auth save --password-stdin is not implemented by pire-browser yet; pass --password for this best-effort profile path",
                        data: { feature: "auth --password-stdin", status: "not_supported" },
                    },
                };
            }
            if ([
                "--url",
                "--username",
                "--password",
                "--username-selector",
                "--password-selector",
                "--submit-selector",
            ].includes(arg)) {
                const value = args[index + 1];
                if (!value || value.startsWith("--")) {
                    return { error: { code: "InvalidArgumentError", message: `${arg} requires a value` } };
                }
                values[arg] = value;
                index += 1;
                continue;
            }
            return { error: { code: "InvalidArgumentError", message: `unsupported auth save option: ${arg}` } };
        }
        if (!values["--url"])
            return { error: { code: "InvalidArgumentError", message: "auth save requires --url <url>" } };
        if (!/^https?:\/\//.test(values["--url"])) {
            return { error: { code: "InvalidArgumentError", message: "auth save --url must be an http(s) URL" } };
        }
        if (!values["--username"])
            return { error: { code: "InvalidArgumentError", message: "auth save requires --username <user>" } };
        if (!values["--password"])
            return { error: { code: "InvalidArgumentError", message: "auth save requires --password <pass>" } };
        return {
            url: values["--url"],
            username: values["--username"],
            password: values["--password"],
            selectors: {
                username: values["--username-selector"] ?? DEFAULT_AUTH_SELECTORS.username,
                password: values["--password-selector"] ?? DEFAULT_AUTH_SELECTORS.password,
                submit: values["--submit-selector"] ?? DEFAULT_AUTH_SELECTORS.submit,
            },
        };
    }
    async function authProfiles() {
        const stored = await browser.storage.local.get(AUTH_STORAGE_KEY);
        const raw = stored?.[AUTH_STORAGE_KEY];
        if (!raw || typeof raw !== "object")
            return {};
        const profiles = {};
        for (const [name, value] of Object.entries(raw)) {
            if (isAuthProfile(value))
                profiles[name] = value;
        }
        return profiles;
    }
    async function saveAuthProfiles(profiles) {
        await browser.storage.local.set({ [AUTH_STORAGE_KEY]: profiles });
    }
    function isAuthProfile(value) {
        if (!value || typeof value !== "object")
            return false;
        const candidate = value;
        return (candidate.schemaVersion === 1 &&
            typeof candidate.name === "string" &&
            typeof candidate.url === "string" &&
            typeof candidate.username === "string" &&
            typeof candidate.password === "string" &&
            typeof candidate.selectors?.username === "string" &&
            typeof candidate.selectors?.password === "string" &&
            typeof candidate.selectors?.submit === "string");
    }
    function publicAuthProfile(profile) {
        return {
            name: profile.name,
            url: profile.url,
            username: profile.username,
            selectors: profile.selectors,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
        };
    }
    function authStorageWarning() {
        return bestEffortWarning("auth", "pire-browser auth profiles are stored in the managed Firefox profile extension storage, not a full encrypted auth vault.");
    }
    function resultSummary(result) {
        return { text: typeof result.text === "string" ? result.text : "ok" };
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
    async function snapshotTab(tabId, selector, depth, frameId) {
        const frames = await framesForScope(tabId, frameId);
        const out = [];
        for (const frame of frames) {
            try {
                const snapshot = await sendFrame(tabId, frame.frameId, { type: "snapshot", selector, depth });
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
    async function findInTab(tabId, locator, frameId) {
        const frames = await framesForScope(tabId, frameId);
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
    async function framesForScope(tabId, frameId) {
        const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => [{ frameId: 0 }]);
        if (typeof frameId !== "number")
            return frames;
        const frame = frames.find((candidate) => candidate.frameId === frameId);
        return frame ? [frame] : [{ frameId, opaque: true, url: undefined }];
    }
    function selectedFrameIdForTab(tabId) {
        return selectedFramesByTabId.get(tabId)?.frameId;
    }
    function targetFrameIdForTab(tabId, explicitFrameId) {
        return typeof explicitFrameId === "number" ? explicitFrameId : selectedFrameIdForTab(tabId);
    }
    async function childFrameForTarget(tabId, parentFrameId, target) {
        const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => []);
        const childFrames = frames.filter((frame) => frame.parentFrameId === parentFrameId);
        const urls = frameUrlCandidates(target);
        const matches = urls.length
            ? childFrames.filter((frame) => urls.some((url) => frameUrlsMatch(frame.url, url)))
            : childFrames;
        if (matches.length === 0) {
            return {
                error: {
                    code: "not_found",
                    message: "No child frame matched the selected iframe; rerun snapshot and try the frame ref again",
                },
            };
        }
        if (matches.length > 1) {
            return {
                error: {
                    code: "ambiguous_locator",
                    message: `${matches.length} child frames matched the selected iframe URL`,
                },
            };
        }
        const frame = matches[0];
        return { frameId: frame.frameId, url: frame.url };
    }
    function frameUrlCandidates(target) {
        return [target.frameUrl, target.href]
            .filter((value) => typeof value === "string" && value.length > 0)
            .map(normalizeFrameUrl)
            .filter((value) => Boolean(value));
    }
    function normalizeFrameUrl(value) {
        try {
            return new URL(value).href;
        }
        catch {
            return undefined;
        }
    }
    function frameUrlsMatch(left, right) {
        if (typeof left !== "string")
            return false;
        const normalized = normalizeFrameUrl(left);
        return normalized === right;
    }
    async function sendFrame(tabId, frameId, message, behavior = {}) {
        const target = typeof frameId === "number" ? { frameId } : undefined;
        try {
            const response = await browser.tabs.sendMessage(tabId, message, target);
            rememberDialogs(tabId, response?.dialogs);
            return response;
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
    function rememberDialogs(tabId, dialogs) {
        if (!Array.isArray(dialogs) || dialogs.length === 0)
            return;
        const existing = recentDialogsByTabId.get(tabId) ?? [];
        const records = dialogs.filter(isDialogRecord);
        if (!records.length)
            return;
        recentDialogsByTabId.set(tabId, [...existing, ...records].slice(-10));
    }
    function isDialogRecord(value) {
        if (!value || typeof value !== "object")
            return false;
        const candidate = value;
        return ((candidate.type === "alert" || candidate.type === "confirm" || candidate.type === "prompt") &&
            typeof candidate.message === "string" &&
            typeof candidate.at === "number");
    }
    function isFrameRoutingError(error) {
        const message = error instanceof Error ? error.message : String(error);
        return /frame.*not found|receiving end does not exist|could not establish connection|no matching message handler/i.test(message);
    }
    function parseFind(args) {
        const [kind, ...rest] = args;
        let locator;
        const index = Number(valueAfter(rest, "--index") ?? "0");
        const exact = rest.includes("--exact");
        if (kind === "role") {
            const role = rest[0];
            if (!role)
                return { error: { code: "invalid_args", message: "find role requires <role>" } };
            locator = { kind: "role", role, name: valueAfter(rest, "--name"), index, exact };
            const tail = actionTail(rest.slice(1), ["--name", "--index"], ["--exact"]);
            if (tail[0])
                return { locator, action: tail[0], text: tail.slice(1).join(" ") };
        }
        else if (kind === "label" || kind === "text" || kind === "placeholder" || kind === "alt" || kind === "title") {
            const text = rest[0];
            if (!text)
                return { error: { code: "invalid_args", message: `find ${kind} requires <text>` } };
            locator = { kind, text, index, exact };
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
            ...response,
            text: response?.text ?? "ok",
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
                data: { feature, status: "not_supported" },
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
        return structuredWarning("BEST_EFFORT_FIREFOX_GAP", feature, message);
    }
    function structuredWarning(code, feature, message, extra = {}) {
        return { ...extra, code, feature, message };
    }
    function mergeWarnings(...groups) {
        return groups.flatMap((group) => (Array.isArray(group) ? group : group ? [group] : []));
    }
    async function prepareLargeResult(result) {
        normalizeResultWarnings(result);
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
    function normalizeResultWarnings(result) {
        if (!("warnings" in result))
            return;
        result.warnings = normalizeWarnings(result.warnings);
    }
    function normalizeWarnings(value) {
        const warnings = Array.isArray(value) ? value : value == null ? [] : [value];
        return warnings.map((warning) => normalizeWarning(warning));
    }
    function normalizeWarning(warning) {
        if (warning && typeof warning === "object") {
            const candidate = warning;
            if (typeof candidate.code === "string" &&
                typeof candidate.feature === "string" &&
                typeof candidate.message === "string") {
                return candidate;
            }
            const message = typeof candidate.message === "string" ? candidate.message : JSON.stringify(candidate);
            return structuredWarning(typeof candidate.code === "string" ? candidate.code : warningCodeForMessage(message), typeof candidate.feature === "string" ? candidate.feature : warningFeatureForMessage(message), message, candidate);
        }
        const message = String(warning);
        return structuredWarning(warningCodeForMessage(message), warningFeatureForMessage(message), message);
    }
    function warningCodeForMessage(message) {
        if (message.includes("tab is already inspectable") || message.includes("tab is inspectable")) {
            return "NAVIGATION_RECOVERED";
        }
        return "COMMAND_WARNING";
    }
    function warningFeatureForMessage(message) {
        if (message.includes("tab is already inspectable") || message.includes("tab is inspectable")) {
            return "open";
        }
        return "runtime";
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
            lastSnapshotTextByTabId.delete(tabId);
            clearNetworkStateForTab(tabId);
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
    function registerHeaderListener() {
        if (!browser.webRequest?.onBeforeSendHeaders?.addListener)
            return;
        browser.webRequest.onBeforeSendHeaders.addListener(applyScopedRequestHeaders, { urls: ["<all_urls>"] }, ["blocking", "requestHeaders"]);
    }
    function registerNetworkRouteListener() {
        if (!browser.webRequest?.onBeforeRequest?.addListener)
            return;
        browser.webRequest.onBeforeRequest.addListener(applyNetworkRoute, { urls: ["<all_urls>"] }, ["blocking"]);
    }
    function registerNetworkActivityListeners() {
        if (!browser.webRequest?.onBeforeRequest?.addListener)
            return;
        browser.webRequest.onBeforeRequest.addListener(trackNetworkRequestStart, { urls: ["<all_urls>"] });
        browser.webRequest.onCompleted?.addListener?.(trackNetworkRequestEnd, { urls: ["<all_urls>"] });
        browser.webRequest.onErrorOccurred?.addListener?.(trackNetworkRequestEnd, { urls: ["<all_urls>"] });
    }
    function trackNetworkRequestStart(details) {
        const tabId = typeof details?.tabId === "number" ? details.tabId : -1;
        if (tabId < 0 || shouldIgnoreNetworkActivity(details))
            return {};
        const requestId = String(details.requestId ?? `${tabId}:${Date.now()}:${Math.random()}`);
        const now = Date.now();
        const routeMatch = networkRouteMatchesByRequestId.get(requestId);
        const record = {
            requestId,
            tabId,
            url: typeof details.url === "string" ? details.url : undefined,
            type: typeof details.type === "string" ? details.type : undefined,
            method: typeof details.method === "string" ? details.method : undefined,
            frameId: typeof details.frameId === "number" ? details.frameId : undefined,
            parentFrameId: typeof details.parentFrameId === "number" ? details.parentFrameId : undefined,
            documentUrl: typeof details.documentUrl === "string" ? details.documentUrl : undefined,
            initiator: typeof details.originUrl === "string" ? details.originUrl : typeof details.initiator === "string" ? details.initiator : undefined,
            startedAt: now,
            active: true,
            routeId: routeMatch?.routeId,
            routeAction: routeMatch?.action,
        };
        networkRequestsById.set(requestId, record);
        rememberNetworkRecord(tabId, requestId);
        const ids = networkRequestIdsByTabId.get(tabId) ?? new Set();
        ids.add(requestId);
        networkRequestIdsByTabId.set(tabId, ids);
        lastNetworkActivityAtByTabId.set(tabId, now);
        return {};
    }
    function trackNetworkRequestEnd(details) {
        const requestId = String(details?.requestId ?? "");
        const record = requestId ? networkRequestsById.get(requestId) : undefined;
        const tabId = record?.tabId ?? (typeof details?.tabId === "number" ? details.tabId : -1);
        if (tabId < 0)
            return;
        const now = Date.now();
        if (requestId) {
            const current = record ?? {
                requestId,
                tabId,
                url: typeof details.url === "string" ? details.url : undefined,
                type: typeof details.type === "string" ? details.type : undefined,
                method: typeof details.method === "string" ? details.method : undefined,
                startedAt: now,
            };
            current.statusCode = typeof details.statusCode === "number" ? details.statusCode : current.statusCode;
            current.statusLine = typeof details.statusLine === "string" ? details.statusLine : current.statusLine;
            current.fromCache = typeof details.fromCache === "boolean" ? details.fromCache : current.fromCache;
            current.error = typeof details.error === "string" ? details.error : current.error;
            const routeMatch = networkRouteMatchesByRequestId.get(requestId);
            current.routeId = routeMatch?.routeId ?? current.routeId;
            current.routeAction = routeMatch?.action ?? current.routeAction;
            current.completedAt = now;
            current.durationMs = Math.max(0, now - current.startedAt);
            current.active = false;
            networkRequestsById.set(requestId, current);
            rememberNetworkRecord(tabId, requestId);
            networkRequestIdsByTabId.get(tabId)?.delete(requestId);
        }
        lastNetworkActivityAtByTabId.set(tabId, now);
    }
    function rememberNetworkRecord(tabId, requestId) {
        const ids = networkRequestLogIdsByTabId.get(tabId) ?? [];
        if (!ids.includes(requestId))
            ids.push(requestId);
        networkRequestLogIdsByTabId.set(tabId, ids);
        pruneNetworkLog(tabId);
    }
    function pruneNetworkLog(tabId) {
        const ids = networkRequestLogIdsByTabId.get(tabId);
        if (!ids)
            return;
        const activeIds = networkRequestIdsByTabId.get(tabId) ?? new Set();
        while (ids.length > MAX_NETWORK_RECORDS_PER_TAB) {
            const index = ids.findIndex((id) => !activeIds.has(id));
            if (index < 0)
                break;
            const [removed] = ids.splice(index, 1);
            if (removed) {
                networkRequestsById.delete(removed);
                networkRouteMatchesByRequestId.delete(removed);
            }
        }
    }
    function clearNetworkStateForTab(tabId) {
        for (const id of networkRequestLogIdsByTabId.get(tabId) ?? []) {
            networkRequestsById.delete(id);
            networkRouteMatchesByRequestId.delete(id);
        }
        for (const id of networkRequestIdsByTabId.get(tabId) ?? []) {
            networkRequestsById.delete(id);
            networkRouteMatchesByRequestId.delete(id);
        }
        for (const [id, route] of Array.from(networkRoutes.entries())) {
            if (route.tabId === tabId)
                networkRoutes.delete(id);
        }
        networkHarRecordingStartedAtByTabId.delete(tabId);
        networkRequestLogIdsByTabId.delete(tabId);
        networkRequestIdsByTabId.delete(tabId);
        lastNetworkActivityAtByTabId.delete(tabId);
    }
    function shouldIgnoreNetworkActivity(details) {
        const type = String(details?.type ?? "").toLowerCase();
        return type === "websocket";
    }
    function applyNetworkRoute(details) {
        if (offlineModeEnabled && requestBelongsToManagedTab(details)) {
            rememberOfflineNetworkBlock(details);
            return { cancel: true };
        }
        const route = matchingNetworkRoute(details);
        if (!route)
            return {};
        const action = networkRouteAction(route);
        rememberNetworkRouteMatch(details, route, action);
        if (route.abort)
            return { cancel: true };
        if (route.body !== undefined)
            return { redirectUrl: networkRouteDataUrl(route) };
        return {};
    }
    function matchingNetworkRoute(details) {
        const tabId = typeof details?.tabId === "number" ? details.tabId : -1;
        if (tabId < 0 || shouldIgnoreNetworkActivity(details))
            return undefined;
        const routes = Array.from(networkRoutes.values()).filter((route) => route.tabId === tabId);
        for (let index = routes.length - 1; index >= 0; index--) {
            const route = routes[index];
            if (!networkRouteUrlMatches(String(details?.url ?? ""), route.pattern))
                continue;
            if (route.resourceTypes?.length && !route.resourceTypes.includes(normalizeNetworkType(details?.type)))
                continue;
            return route;
        }
        return undefined;
    }
    function requestBelongsToManagedTab(details) {
        const tabId = typeof details?.tabId === "number" ? details.tabId : -1;
        return tabId >= 0 && tabsByBrowserId.has(tabId);
    }
    function rememberNetworkRouteMatch(details, route, action) {
        const requestId = String(details?.requestId ?? "");
        if (!requestId)
            return;
        networkRouteMatchesByRequestId.set(requestId, { routeId: route.id, action });
        const record = networkRequestsById.get(requestId);
        if (record) {
            record.routeId = route.id;
            record.routeAction = action;
        }
    }
    function rememberOfflineNetworkBlock(details) {
        const requestId = String(details?.requestId ?? "");
        if (!requestId)
            return;
        networkRouteMatchesByRequestId.set(requestId, { routeId: "offline", action: "abort" });
        const record = networkRequestsById.get(requestId);
        if (record) {
            record.routeId = "offline";
            record.routeAction = "abort";
        }
    }
    function networkRouteDataUrl(route) {
        const contentType = route.contentType ?? inferRouteContentType(route.body) ?? "text/plain";
        const encoded = new TextEncoder().encode(route.body ?? "");
        return `data:${contentType};base64,${bytesToBase64(encoded)}`;
    }
    function networkRouteUrlMatches(url, pattern) {
        if (pattern === "*" || pattern === "**" || pattern === "<all_urls>")
            return true;
        return networkUrlMatches(url, pattern);
    }
    function applyScopedRequestHeaders(details) {
        const origin = safeOrigin(details?.url);
        const rules = origin ? headersByOrigin.get(origin) : undefined;
        if (!rules?.length)
            return {};
        const requestHeaders = Array.isArray(details.requestHeaders) ? [...details.requestHeaders] : [];
        for (const rule of rules) {
            const existing = requestHeaders.find((header) => header?.name?.toLowerCase() === rule.name.toLowerCase());
            if (existing) {
                existing.value = rule.value;
            }
            else {
                requestHeaders.push({ name: rule.name, value: rule.value });
            }
        }
        return { requestHeaders };
    }
    function waitForNetworkIdle(tabId, timeout, idleMs) {
        return new Promise((resolve) => {
            const startedAt = Date.now();
            const startedWithLastActivity = lastNetworkActivityAtByTabId.get(tabId);
            if (!startedWithLastActivity)
                lastNetworkActivityAtByTabId.set(tabId, startedAt);
            let pollTimer = 0;
            let timeoutTimer = 0;
            const cleanup = () => {
                clearInterval(pollTimer);
                clearTimeout(timeoutTimer);
            };
            const settle = (result) => {
                cleanup();
                resolve(result);
            };
            const activeRequestCount = () => networkRequestIdsByTabId.get(tabId)?.size ?? 0;
            const check = () => {
                const active = activeRequestCount();
                const lastActivityAt = lastNetworkActivityAtByTabId.get(tabId) ?? startedAt;
                const quietFor = Date.now() - lastActivityAt;
                if (active === 0 && quietFor >= idleMs) {
                    settle({
                        text: `Network idle for ${idleMs}ms`,
                        networkIdle: {
                            quietMs: idleMs,
                            activeRequests: 0,
                            waitedMs: Date.now() - startedAt,
                        },
                    });
                }
            };
            pollTimer = setInterval(check, NETWORK_IDLE_POLL_INTERVAL_MS);
            timeoutTimer = setTimeout(() => settle({
                error: {
                    code: "TimeoutError",
                    message: `Timed out waiting for network idle after ${timeout}ms (${activeRequestCount()} request(s) still active)`,
                },
            }), timeout);
            check();
        });
    }
    async function waitForTabComplete(tabId, timeout) {
        await waitForTabState(tabId, timeout, (tab) => tab.status === "complete");
    }
    async function waitForTabReady(tabId, expectedUrl, previousUrl, timeout) {
        await waitForTabState(tabId, timeout, (tab) => {
            if (tab.status !== "complete" || !tab.url || tab.url === "about:blank" || tab.url === "about:newtab")
                return false;
            if (tab.url === expectedUrl || tab.url.startsWith(`${expectedUrl}#`))
                return true;
            return previousUrl ? tab.url !== previousUrl : true;
        });
    }
    function isInspectableTab(tab) {
        return Boolean(typeof tab?.id === "number" && tab.url && tab.url !== "about:blank" && tab.url !== "about:newtab");
    }
    async function waitForTabState(tabId, timeout, isReady) {
        await new Promise((resolve, reject) => {
            let settled = false;
            let timeoutTimer = 0;
            let pollTimer = 0;
            const cleanup = () => {
                clearTimeout(timeoutTimer);
                clearInterval(pollTimer);
                browser.tabs.onUpdated.removeListener(listener);
            };
            const succeed = () => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                resolve();
            };
            const fail = (error) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                reject(error);
            };
            const checkCurrent = async () => {
                try {
                    const tab = await browser.tabs.get(tabId);
                    if (isReady(tab))
                        succeed();
                }
                catch (error) {
                    fail(error instanceof Error ? error : new Error(String(error)));
                }
            };
            const listener = (updatedTabId, _changeInfo, updatedTab) => {
                if (updatedTabId === tabId && isReady(updatedTab))
                    succeed();
            };
            timeoutTimer = setTimeout(() => fail(new Error("timeout waiting for page load")), timeout);
            browser.tabs.onUpdated.addListener(listener);
            pollTimer = setInterval(() => void checkCurrent(), TAB_READY_POLL_INTERVAL_MS);
            void checkCurrent();
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
    function summarizeElement(element, options = { urls: false }) {
        const name = element.name || element.label || element.placeholder || element.text;
        const disabled = element.disabled ? " disabled" : "";
        const url = options.urls && element.href ? ` ${truncate(element.href, 120)}` : "";
        return `${element.role}${name ? ` "${truncate(name, 80)}"` : ""}${url}${disabled}`;
    }
    function withDialogs(result, frames) {
        const dialogs = frames.flatMap((frame) => frame.dialogs ?? []);
        if (dialogs.length) {
            result.dialogs = dialogs;
            result.warnings = dialogs.map((dialog) => structuredWarning("PAGE_DIALOG", "dialogs", `${dialog.type}: ${dialog.message}`, { dialogType: dialog.type }));
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
        const positional = firstPositionalArg(args, ["--selector", "--timeout", "--state"]);
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
