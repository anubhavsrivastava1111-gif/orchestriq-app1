// Lifeline — bridge to the Android app (window.LifelineNative), with web fallbacks so the
// same interface also runs as an installable web app.

interface NativeBridge {
  info(): string;
  shareText(text: string, subject: string, pkg: string): void;
  installedPackages(json: string): string;
  openApp(pkg: string): boolean;
  openUrl(url: string): void;
  setSecureScreen(on: boolean): void;
  setTheme(dark: boolean): void;
  scheduleReminders(json: string): void;
  notificationsEnabled(): boolean;
  requestNotificationPermission(cb: string): void;
  saveFile(cb: string, name: string, mime: string, content: string): void;
  openFile(cb: string): void;
  httpGet(cb: string, url: string): void;
  bioStatus(): string;
  bioEnable(cb: string, secretB64: string): void;
  bioUnlock(cb: string): void;
  bioDisable(): void;
  wipeNative(): void;
  deviceEncrypt(plainB64: string): string;
  deviceDecrypt(sealedB64: string): string;
}

declare global {
  interface Window {
    LifelineNative?: NativeBridge;
    __lifelineCb?: (id: string, ok: boolean, payload: string) => void;
    LifelineOnBack?: () => boolean;
  }
}

const bridge: NativeBridge | null = typeof window !== "undefined" && window.LifelineNative ? window.LifelineNative : null;
export const isNative = !!bridge;

// ─── Async callbacks from native ────────────────────────────────────────────
const pending = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();
let seq = 0;
if (typeof window !== "undefined") {
  window.__lifelineCb = (id, ok, payload) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(payload); else p.reject(new Error(payload || "failed"));
  };
}
function call(start: (id: string) => void): Promise<string> {
  const id = "cb" + ++seq + "_" + Date.now();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try { start(id); } catch (e) { pending.delete(id); reject(e as Error); }
  });
}

// ─── App info ───────────────────────────────────────────────────────────────
export interface NativeInfo { platform: string; version: string; sdk: number; biometric: string; biometricEnrolled: boolean; notifications: boolean; secureScreen: boolean }
export function nativeInfo(): NativeInfo | null {
  if (!bridge) return null;
  try { return JSON.parse(bridge.info()) as NativeInfo; } catch { return null; }
}

// ─── Sharing & other apps ───────────────────────────────────────────────────
export async function shareText(text: string, subject = "", pkg = ""): Promise<"native" | "web-share" | "copied"> {
  if (bridge) { bridge.shareText(text, subject, pkg); return "native"; }
  if (navigator.share) {
    try { await navigator.share({ title: subject, text }); return "web-share"; } catch { /* cancelled → copy */ }
  }
  await copyText(text);
  return "copied";
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function installedApps(pkgs: string[]): Set<string> {
  if (!bridge) return new Set();
  try { return new Set(JSON.parse(bridge.installedPackages(JSON.stringify(pkgs))) as string[]); } catch { return new Set(); }
}

export function openApp(pkg: string): boolean {
  return bridge ? bridge.openApp(pkg) : false;
}

export function openExternal(url: string) {
  if (bridge) bridge.openUrl(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export const setSecureScreen = (on: boolean) => bridge?.setSecureScreen(on);
export const setNativeTheme = (dark: boolean) => bridge?.setTheme(dark);

// ─── Reminders ──────────────────────────────────────────────────────────────
export interface NativeReminder { id: number; at: number; title: string; body: string }
export function scheduleReminders(list: NativeReminder[]) {
  bridge?.scheduleReminders(JSON.stringify(list));
}
export const notificationsEnabled = () => (bridge ? bridge.notificationsEnabled() : false);
export async function requestNotifications(): Promise<boolean> {
  if (!bridge) return false;
  return (await call(id => bridge.requestNotificationPermission(id))) === "true";
}

// ─── Files ──────────────────────────────────────────────────────────────────
export async function saveTextFile(name: string, mime: string, content: string): Promise<boolean> {
  if (bridge) {
    try { await call(id => bridge.saveFile(id, name, mime, content)); return true; } catch { return false; }
  }
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export function pickTextFile(): Promise<string> {
  if (bridge) return call(id => bridge.openFile(id));
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json,text/plain";
    input.onchange = () => { const f = input.files?.[0]; if (!f) reject(new Error("cancelled")); else f.text().then(resolve, reject); };
    input.click();
  });
}

// ─── Network (native helper bypasses CORS for allow-listed market data hosts) ─
export async function httpGetJson<T>(url: string): Promise<T> {
  if (bridge) {
    const raw = JSON.parse(await call(id => bridge.httpGet(id, url))) as { status: number; body: string };
    if (raw.status >= 400) throw new Error("HTTP " + raw.status);
    return JSON.parse(raw.body) as T;
  }
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return (await r.json()) as T;
}

// ─── Biometrics ─────────────────────────────────────────────────────────────
export type BioStatus = { supported: boolean; available: boolean; enrolledHere: boolean; reason: string };
export function bioStatus(): BioStatus {
  if (!bridge) return { supported: false, available: false, enrolledHere: false, reason: "web" };
  const [s, on] = bridge.bioStatus().split(":");
  return { supported: s !== "unavailable", available: s === "available", enrolledHere: on === "on", reason: s };
}
export const bioEnable = (secretB64: string) => call(id => bridge!.bioEnable(id, secretB64));
export const bioUnlock = () => call(id => bridge!.bioUnlock(id));
export const bioDisable = () => bridge?.bioDisable();
export const wipeNative = () => bridge?.wipeNative();

// ─── Device binding (Android Keystore) ──────────────────────────────────────
export const hasDeviceKey = () => !!bridge && typeof bridge.deviceEncrypt === "function";
export function deviceEncrypt(plainB64: string): string {
  const r = bridge ? bridge.deviceEncrypt(plainB64) : "";
  if (!r) throw new Error("device-key-failed");
  return r;
}
export function deviceDecrypt(sealedB64: string): string {
  const r = bridge ? bridge.deviceDecrypt(sealedB64) : "";
  if (!r) throw new Error("device-key-failed");
  return r;
}
