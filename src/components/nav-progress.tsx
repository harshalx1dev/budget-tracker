"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * A thin bar across the top while a page loads after an in-app link click. It starts on the click and is "done"
 * as soon as the path changes, so nothing needs to be set from an effect.
 */
export function NavProgress() {
  const path = usePathname();
  const [from, setFrom] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setFrom(window.location.pathname);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const state = from === null ? "idle" : from === path ? "running" : "done";
  return <div className="navprogress" data-state={state} aria-hidden="true" />;
}
