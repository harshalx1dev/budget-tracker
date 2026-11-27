"use client";

import { cloneElement, useId, useState, type ReactElement } from "react";
import { Info } from "lucide-react";

/** A labelled control with, optionally, an info button that explains it. Works by hover, click, tap and keyboard. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactElement<{ id?: string; "aria-describedby"?: string }> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="field field--hinted">
      <span className="field__top">
        <label className="label" htmlFor={id}>{label}</label>
        {hint && (
          <button type="button" className="hint" aria-label={`About: ${label}`} aria-expanded={open} aria-controls={`${id}-hint`}
            onClick={() => setOpen(true)} onBlur={() => setOpen(false)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
            <Info size={15} aria-hidden />
          </button>
        )}
      </span>
      {hint && <span id={`${id}-hint`} role="tooltip" className="hint__text" hidden={!open}>{hint}</span>}
      {cloneElement(children, { id, "aria-describedby": hint ? `${id}-hint` : undefined })}
    </div>
  );
}
