"use strict";
function emit(payload) {
    window.postMessage({ source: "pire-browser", kind: "dialog", payload }, "*");
}
const originalAlert = window.alert.bind(window);
const originalConfirm = window.confirm.bind(window);
const originalPrompt = window.prompt.bind(window);
Object.defineProperty(window, "__pireBrowserOriginalDialogs", {
    value: { alert: originalAlert, confirm: originalConfirm, prompt: originalPrompt },
    configurable: false,
    enumerable: false,
    writable: false,
});
window.alert = (message) => {
    emit({
        type: "alert",
        message: String(message ?? ""),
        returned: true,
        at: Date.now(),
    });
};
window.confirm = (message) => {
    emit({
        type: "confirm",
        message: String(message ?? ""),
        returned: false,
        at: Date.now(),
    });
    return false;
};
window.prompt = (message, defaultValue) => {
    emit({
        type: "prompt",
        message: String(message ?? ""),
        defaultValue,
        returned: null,
        at: Date.now(),
    });
    return null;
};
