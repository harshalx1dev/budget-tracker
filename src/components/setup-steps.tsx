import Link from "next/link";
import { Check } from "lucide-react";

/** First run: the few things free-to-spend needs before it means anything. */
export function SetupSteps({ steps }: { steps: { done: boolean; title: string; why: string; href: string }[] }) {
  return (
    <section className="well setup" aria-labelledby="setup-h">
      <h2 id="setup-h">Set up in a few minutes</h2>
      <ol className="rows">
        {steps.map((s, i) => (
          <li key={s.title} className="row setup__row" data-done={s.done || undefined}>
            <span className="stat__icon" aria-hidden>{s.done ? <Check size={17} /> : i + 1}</span>
            <div><p className="row__title">{s.title}</p><p className="label">{s.why}</p></div>
            {s.done ? <span className="label">Done</span> : <Link href={s.href} className="btn btn--secondary">Start</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}
