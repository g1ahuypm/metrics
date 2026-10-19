// Browser side of phone/browser notifications. Used by client components only.

export type PushSupport = "ok" | "ios-needs-home-screen" | "unsupported";

export function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // iPhones only allow notifications for sites added to the home screen and opened from there.
  if (isIos() && !isStandalone()) return "ios-needs-home-screen";
  return capable ? "ok" : "unsupported";
}

/** "iPhone", "Android phone", "Chrome on Windows", ... shown in the list of devices. */
export function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "computer";
  return `${browser} on ${os}`;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/** Asks for permission (must follow a tap) and subscribes this device. */
export async function subscribeDevice(publicKey: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "blocked" : "dismissed");
  const reg = await registerWorker();
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // A subscription made with other keys can't receive our messages: replace it.
    const key = existing.options.applicationServerKey;
    const same = key && btoa(String.fromCharCode(...new Uint8Array(key))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") === publicKey;
    if (same) return existing;
    await existing.unsubscribe();
  }
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return (await reg?.pushManager.getSubscription()) ?? null;
}
