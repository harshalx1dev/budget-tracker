"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { removeTransaction } from "@/app/app/actions";

// Two-step confirm: first press arms it, second deletes; it disarms after a few seconds.
export function DeleteButton({ id }: { id: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="icon-btn"
      data-armed={armed}
      disabled={pending}
      aria-label={armed ? "confirm delete" : "delete entry"}
      onClick={() => {
        if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); return; }
        start(() => removeTransaction(id));
      }}
    >
      {armed ? <span className="label">sure?</span> : <Trash2 size={16} aria-hidden />}
    </button>
  );
}
