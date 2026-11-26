"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoMark } from "./logo";

const MIN_MS = 1100; // keep the loading screen up at least this long, even when the page is already ready
const MAX_MS = 20000; // never trap anyone if a navigation stalls

/**
 * The loading screen between pages. It appears on the click of an in-app link, stays until the new page has
 * arrived and a minimum time has passed, then fades away. A thin bar also runs across the top.
 */
export function NavProgress() {
  const path = usePathname();
  const [from, setFrom] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      document.documentElement.dataset.loading = "1"; // before React renders, so the screen is up on the very frame of the click
      setFrom(window.location.pathname);
      setStartedAt(Date.now());
      setShow(true);
    };
    const onStart = () => { setFrom(window.location.pathname); setStartedAt(Date.now()); setShow(true); };
    const onEnd = () => { delete document.documentElement.dataset.loading; setShow(false); setFrom(null); };
    document.addEventListener("click", onClick, true);
    window.addEventListener("budggyy:loading", onStart);
    window.addEventListener("budggyy:loading-end", onEnd);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("budggyy:loading", onStart);
      window.removeEventListener("budggyy:loading-end", onEnd);
    };
  }, []);

  const arrived = from !== null && from !== path;
  useEffect(() => {
    if (!show) return;
    const wait = arrived ? Math.max(0, MIN_MS - (Date.now() - startedAt)) : Math.max(0, MAX_MS - (Date.now() - startedAt));
    const t = setTimeout(() => { delete document.documentElement.dataset.loading; setShow(false); setFrom(null); }, wait);
    return () => clearTimeout(t);
  }, [show, arrived, startedAt]);

  const state = from === null ? "idle" : arrived ? "done" : "running";
  return (
    <>
      <div className="navprogress" data-state={state} aria-hidden="true" />
      <div className="pageload" data-show={show} aria-hidden={!show} role="status" aria-label="Loading">
        <div className="pageload__rings" aria-hidden="true" />
        <div className="pageload__inner">
          <span className="pageload__mark"><LogoMark size={68} draw={show} /></span>
          <span className="pageload__track"><span className="pageload__bar" /></span>
        </div>
      </div>
    </>
  );
}
