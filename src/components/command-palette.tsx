"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { authClient } from "@/lib/auth-client";

type Cmd = { id: string; label: string; hint?: string; run: () => void };

const PAGES: [string, string][] = [
  ["overview", "/app"], ["ledger", "/app/transactions"], ["inbox", "/app/inbox"], ["accounts", "/app/accounts"], ["settings", "/app/settings"],
  ["forecast", "/app/plan"], ["budgets", "/app/plan/budgets"], ["goals", "/app/plan/goals"], ["wishlist", "/app/plan/wishlist"],
  ["commitments, emis and bills", "/app/plan/commitments"], ["reports", "/app/plan/reports"], ["import a statement", "/app/import"], ["categories and rules", "/app/categories"],
];

/** Ctrl or Cmd + K opens it; "/" jumps to quick add. Everything in it is also reachable from the normal navigation. */
export function CommandPalette() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const close = () => ref.current?.close();
  const open = () => { setQ(""); setActive(0); ref.current?.showModal(); requestAnimationFrame(() => input.current?.focus()); };

  const commands: Cmd[] = useMemo(() => [
    { id: "quick", label: "quick add an entry", hint: "/", run: () => router.push("/app/quick") },
    ...PAGES.map(([label, href]): Cmd => ({ id: href, label: `go to ${label}`, run: () => router.push(href) })),
    { id: "theme", label: `switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`, run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark") },
    { id: "export", label: "download transactions as csv", run: () => { const a = document.createElement("a"); a.href = "/app/export/transactions"; a.download = ""; a.click(); } },
    { id: "out", label: "sign out", run: async () => { await authClient.signOut(); router.push("/login"); router.refresh(); } },
  ], [router, resolvedTheme, setTheme]);

  const shown = commands.filter((c) => q.toLowerCase().split(/\s+/).every((w) => c.label.toLowerCase().includes(w)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (ref.current?.open) close(); else open(); }
      else if (e.key === "/" && !typing && !ref.current?.open) {
        const q = document.getElementById("q");
        e.preventDefault();
        if (q) q.focus(); else router.push("/app/quick");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const choose = (c?: Cmd) => { if (!c) return; close(); c.run(); };

  return (
    <dialog ref={ref} className="palette" aria-label="command palette" onClick={(e) => { if (e.target === ref.current) close(); }}>
      <div className="palette__box">
        <input
          ref={input} value={q} className="input" placeholder="type a command" aria-label="command" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={shown[active] ? `cmd-${shown[active].id}` : undefined}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); choose(shown[active]); }
          }}
        />
        <ul id="palette-list" role="listbox" className="palette__list">
          {shown.length === 0 && <li className="label palette__none">nothing matches</li>}
          {shown.map((c, i) => (
            <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={i === active} data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => choose(c)}>
              <span>{c.label}</span>{c.hint ? <kbd className="label">{c.hint}</kbd> : null}
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
