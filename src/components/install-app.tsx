"use client";

import { useSyncExternalStore } from "react";
import { Download, X } from "lucide-react";
import { BRAND } from "@/lib/brand";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const CHANGED = "budggyy-install";
const DISMISSED = "budggyy-install-dismissed";
let offer: InstallEvent | null = null;

// The browser offers this once, early, so it is caught as soon as this file loads and kept for the button.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); offer = e as InstallEvent; window.dispatchEvent(new Event(CHANGED)); });
  window.addEventListener("appinstalled", () => { offer = null; window.dispatchEvent(new Event(CHANGED)); });
}

type State = "installed" | "ready" | "ios" | "menu";

function read(): State {
  if (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone) return "installed";
  if (offer) return "ready";
  // iPhones and iPads never offer a prompt; it is done from the Share menu.
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return "menu";
}
const subscribe = (cb: () => void) => { window.addEventListener(CHANGED, cb); return () => window.removeEventListener(CHANGED, cb); };
const dismissed = () => { try { return localStorage.getItem(DISMISSED) === "1"; } catch { return true; } };
const dismiss = () => { try { localStorage.setItem(DISMISSED, "1"); } catch { /* private window */ } window.dispatchEvent(new Event(CHANGED)); };

async function install() {
  const e = offer;
  if (!e) return;
  await e.prompt();
  await e.userChoice;
  offer = null;
  window.dispatchEvent(new Event(CHANGED));
}

const HOW: Record<State, string> = {
  installed: "It is installed on this device.",
  ready: "Add it to your home screen: it opens full screen, like any other app.",
  ios: "In Safari, tap the Share button, then Add to Home Screen.",
  menu: "Open your browser's menu and choose Install app, or Add to Home screen.",
};

/** The settings block: a button where the browser allows one, otherwise the steps. */
export function InstallCard() {
  const state = useSyncExternalStore(subscribe, read, () => "menu" as State);
  return (
    <>
      <p className="label">{HOW[state]}</p>
      {state === "ready" && <div><button type="button" className="btn btn--primary" onClick={install}><Download size={16} aria-hidden /> Install {BRAND.name}</button></div>}
    </>
  );
}

/** A one-time suggestion on phones, gone once dismissed or installed. */
export function InstallNudge() {
  const state = useSyncExternalStore(subscribe, () => (dismissed() ? "installed" : read()), () => "installed" as State);
  if (state !== "ready" && state !== "ios") return null;
  return (
    <aside className="well install-nudge" aria-label="Install the app">
      <Download size={18} aria-hidden />
      <p>{state === "ios" ? HOW.ios : `Install ${BRAND.name} on this phone.`}</p>
      {state === "ready" && <button type="button" className="btn btn--primary" onClick={install}>Install</button>}
      <button type="button" className="icon-btn" aria-label="Not now" onClick={dismiss}><X size={16} aria-hidden /></button>
    </aside>
  );
}
