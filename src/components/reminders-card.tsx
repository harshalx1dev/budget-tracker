"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { removeSubscriptionAction, saveSubscriptionAction, sendTestAction } from "@/app/app/push-actions";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type Support = "checking" | "unsupported" | "needs-install" | "ready";

export function RemindersCard() {
  const [support, setSupport] = useState<Support>("checking");
  const [on, setOn] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    // Feature checks need the browser, so they run after mount.
    const t = setTimeout(async () => {
      if (!PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setSupport("unsupported");
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return setSupport("needs-install");
      setSupport("ready");
      setOn(Boolean(await reg.pushManager.getSubscription()) && Notification.permission === "granted");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const enable = () => start(async () => {
    try {
      if ((await Notification.requestPermission()) !== "granted") return setNote({ text: "Notifications are blocked for this site in your browser settings.", error: true });
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
      const j = sub.toJSON();
      const r = await saveSubscriptionAction({ endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth });
      if (r.error) return setNote({ text: r.error, error: true });
      setOn(true); setNote({ text: r.message ?? "On." });
    } catch { setNote({ text: "Could not turn reminders on for this device.", error: true }); }
  });

  const disable = () => start(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await removeSubscriptionAction(sub.endpoint); await sub.unsubscribe(); }
    setOn(false); setNote({ text: "Reminders are off for this device." });
  });

  if (support === "checking") return <p className="label">checking this device…</p>;
  if (support === "unsupported") return <p className="label">This browser or server setup cannot send reminders.</p>;
  if (support === "needs-install") return <p className="label">Reminders need the installed app or the production site (the service worker is not running here yet). Open the deployed app, then come back.</p>;

  return (
    <div className="stack-sm">
      <p className="label">One short notification a day, around 9am, when a bill or EMI is due today or tomorrow, or slipped in the last week. Nothing else.</p>
      <div className="inline-form">
        {on ? <button type="button" className="btn btn--secondary" disabled={pending} onClick={disable}>turn off on this device</button>
            : <button type="button" className="btn btn--primary" disabled={pending} onClick={enable}><Bell size={16} aria-hidden /> turn on reminders</button>}
        {on && <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => start(async () => { const r = await sendTestAction(); setNote({ text: r.error ?? r.message ?? "", error: Boolean(r.error) }); })}>send a test</button>}
        <p className="label" role="status">{note ? (note.error ? <span className="error">{note.text}</span> : note.text) : null}</p>
      </div>
    </div>
  );
}
