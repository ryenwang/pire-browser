type DialogPayload = {
  type: "alert" | "confirm" | "prompt";
  message: string;
  defaultValue?: string;
  returned: boolean | string | null;
  at: number;
};

function emit(payload: DialogPayload) {
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

window.alert = (message?: unknown) => {
  emit({
    type: "alert",
    message: String(message ?? ""),
    returned: true,
    at: Date.now(),
  });
};

window.confirm = (message?: unknown) => {
  emit({
    type: "confirm",
    message: String(message ?? ""),
    returned: false,
    at: Date.now(),
  });
  return false;
};

window.prompt = (message?: unknown, defaultValue?: string) => {
  emit({
    type: "prompt",
    message: String(message ?? ""),
    defaultValue,
    returned: null,
    at: Date.now(),
  });
  return null;
};
