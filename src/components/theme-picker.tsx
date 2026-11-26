"use client";

import { useSyncExternalStore } from "react";
import { Palette } from "lucide-react";
import { PALETTE_KEY, PALETTES } from "@/lib/palettes";

const subscribe = (cb: () => void) => { window.addEventListener(PALETTE_KEY, cb); return () => window.removeEventListener(PALETTE_KEY, cb); };
const read = () => document.documentElement.dataset.palette ?? "passbook";

function choose(id: string) {
  if (id === "passbook") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = id;
  try { localStorage.setItem(PALETTE_KEY, id); } catch { /* private window: the choice lasts until reload */ }
  window.dispatchEvent(new Event(PALETTE_KEY));
}

/** A floating button to try the colour themes. Light and dark still follow the theme toggle. */
export function ThemePicker() {
  const current = useSyncExternalStore(subscribe, read, () => "passbook");
  return (
    <>
      <button type="button" className="themefab" popoverTarget="themepick" aria-label="Choose a colour theme"><Palette size={22} aria-hidden /></button>
      <div id="themepick" popover="auto" className="themepick" role="group" aria-label="Colour themes">
        <p className="label themepick__title">Colour theme</p>
        {PALETTES.map((p, i) => (
          <button key={p.id} type="button" className="themepick__opt" aria-pressed={current === p.id} onClick={() => choose(p.id)}>
            <span className="themepick__dots" aria-hidden>{p.colors.map((c) => <span key={c} style={{ background: c }} />)}</span>
            {i + 1}. {p.name}
          </button>
        ))}
      </div>
    </>
  );
}
