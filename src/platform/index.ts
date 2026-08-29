/**
 * Platform abstraction layer.
 *
 * Centralizes environment detection (Electron / Capacitor / browser) and
 * screen-size helpers so the renderer never needs to sniff `window.electronAPI`
 * or `navigator.userAgent` directly for branching decisions.
 */

export const isElectron = (): boolean =>
  typeof window !== "undefined" &&
  typeof (window as any).electronAPI !== "undefined";

export const isCapacitor = (): boolean =>
  typeof window !== "undefined" &&
  typeof (window as any).Capacitor !== "undefined" &&
  Boolean((window as any).Capacitor.isNativePlatform?.());

export const isNativeApp = (): boolean => isCapacitor() || isElectron();

export const isAndroid = (): boolean =>
  isCapacitor() &&
  (typeof navigator !== "undefined" &&
    /android/i.test(navigator.userAgent || ""));

/** Phone-class width; the manager UI switches to compact/narrow layout. */
export const isNarrowScreen = (): boolean =>
  typeof window !== "undefined" && window.innerWidth <= 768;

/** Small-window class (compact layout, e.g. tablets / small desktops). */
export const isCompactScreen = (): boolean =>
  typeof window !== "undefined" && window.innerWidth <= 950;

/** Whether the device should get the mobile-oriented reader layout. */
export const isMobileDevice = (): boolean =>
  isCapacitor() || isNarrowScreen();

/**
 * Bridge shim for the reading engine's mobile mode.
 *
 * When a rendition is created with `isMobile: "yes"` the engine routes
 * console output and in-book events (link clicks, pinch zoom, scroll bottom
 * ...) through `window.ReactNativeWebView.postMessage`. That object only
 * exists inside the upstream React Native wrapper; without this shim the
 * first log or gesture inside a mobile-layout book throws
 * "Cannot read properties of undefined (reading 'postMessage')".
 *
 * Idempotent; leaves an existing bridge untouched. Messages are echoed to
 * the original console so they stay visible during development.
 */
export const installMobileBridge = (): void => {
  if (typeof window === "undefined") return;
  if ((window as any).ReactNativeWebView) return;
  const nativeLog = console.log?.bind(console) ?? (() => {});
  (window as any).ReactNativeWebView = {
    postMessage: (message: string) => {
      nativeLog("[book-engine]", message);
    },
  };
};
