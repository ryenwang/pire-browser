export type RpcRequest = {
  type: "request";
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

export type RpcResponse = {
  type: "response";
  id: string;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    data?: unknown;
  };
};

export type NativeEvent = {
  type: "event";
  name: string;
  data?: Record<string, unknown>;
};

export type NonHandleLocator =
  | { kind: "role"; role: string; name?: string; index: number }
  | { kind: "label"; text: string; index: number }
  | { kind: "text"; text: string; index: number }
  | { kind: "placeholder"; text: string; index: number }
  | { kind: "testid"; value: string; index: number }
  | { kind: "css"; selector: string; index: number }
  | { kind: "xpath"; expression: string; index: number }
  | { kind: "alt"; text: string; index: number }
  | { kind: "title"; text: string; index: number };

export type Locator = NonHandleLocator | { kind: "handle"; handle: string; fallback: NonHandleLocator };

export type ElementSnapshot = {
  ref?: string;
  role: string;
  name: string;
  text: string;
  label: string;
  placeholder: string;
  testid: string;
  disabled: boolean;
  visible: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  locator: Locator;
};

export type FrameSnapshot = {
  frameId: number;
  url?: string;
  title?: string;
  opaque?: boolean;
  elements: ElementSnapshot[];
  dialogs?: DialogRecord[];
  error?: string;
};

export type DialogRecord = {
  type: "alert" | "confirm" | "prompt";
  message: string;
  defaultValue?: string;
  returned: boolean | string | null;
  at: number;
};

export type TabRecord = {
  tabId: number;
  agentId: string;
  label?: string;
  url?: string;
  title?: string;
  active?: boolean;
  windowId?: number;
  closed?: boolean;
};

declare global {
  const browser: any;
}
