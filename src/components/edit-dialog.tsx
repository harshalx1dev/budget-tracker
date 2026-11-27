"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Pencil, X } from "lucide-react";

const Close = createContext<(() => void) | null>(null);

/** Inside an edit dialog, close it once the change has saved. Elsewhere this does nothing. */
export function useCloseWhenSaved(state: { message?: string; ok?: boolean }) {
  const close = useContext(Close);
  useEffect(() => { if (state.message || state.ok) close?.(); }, [state, close]);
}

/** A pencil button that opens the form for one thing. The form is mounted fresh each time it opens. */
export function EditDialog({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [close] = useState(() => () => ref.current?.close());
  return (
    <>
      <button type="button" className="icon-btn" aria-label={label} title={label} onClick={() => { setOpen(true); ref.current?.showModal(); }}>
        <Pencil size={16} aria-hidden />
      </button>
      <dialog ref={ref} className="editor" aria-label={label} onClose={() => setOpen(false)}>
        {open && (
          <>
            <div className="editor__head">
              <h2>{label}</h2>
              <button type="button" className="icon-btn" aria-label="Close" onClick={close}><X size={18} aria-hidden /></button>
            </div>
            <Close.Provider value={close}>{children}</Close.Provider>
          </>
        )}
      </dialog>
    </>
  );
}
