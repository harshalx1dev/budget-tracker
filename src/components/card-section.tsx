import { CalendarDays, CreditCard } from "lucide-react";
import { CardCycleForm, PayCardForm } from "./card-bills";
import { formatMinor } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import type { listCards } from "@/server/services/cards";

type Card = Awaited<ReturnType<typeof listCards>>[number];

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** Each credit card: what is to pay and by when, a way to record paying it, and its two dates. */
export function CardSection({ cards, payFrom }: { cards: Card[]; payFrom: { id: string; name: string }[] }) {
  if (!cards.length) return null;
  return (
    <section className="stack-sm" aria-labelledby="cards-h">
      <h2 id="cards-h">Credit cards</h2>
      <ul className="well rows">
        {cards.map((c) => {
          const b = c.bill;
          const status = !b ? { tone: "later", text: "Dates needed" }
            : b.toPay === 0 ? { tone: "now", text: "Nothing to pay" }
            : b.overdue ? { tone: "bad", text: `Overdue since ${formatDay(b.dueOn)}` }
            : { tone: "soon", text: `Pay by ${formatDay(b.dueOn)}` };
          return (
            <li key={c.id} className="row card-row">
              <div className="card-row__head">
                <span className="stat__icon" aria-hidden><CreditCard size={18} /></span>
                <div>
                  <p className="row__title">{c.name}</p>
                  <p className="label">{c.statementDay && c.dueDay ? `Bill on the ${ordinal(c.statementDay)}, due on the ${ordinal(c.dueDay)}` : "Add its dates so the bill counts against the right salary"}</p>
                </div>
                <div className="card-row__sum">
                  {b && <p className="row__value" data-bad={b.overdue || undefined}>{formatMinor(b.toPay, c.currency, { whole: true })}</p>}
                  <p className="when" data-tone={status.tone}>{status.text}</p>
                </div>
              </div>
              {b && b.unbilled > 0 && <p className="label">{formatMinor(b.unbilled, c.currency, { whole: true })} spent since the last bill goes on the {formatDay(b.nextStatementOn)} bill.</p>}
              {b && b.toPay > 0 && <PayCardForm id={c.id} amount={String(b.toPay / 100)} from={payFrom} />}
              <details className="more-line" open={!b}>
                <summary><CalendarDays size={15} aria-hidden />{b ? "Change card dates" : "Add card dates"}</summary>
                <div className="more-line__body"><CardCycleForm id={c.id} statementDay={c.statementDay} dueDay={c.dueDay} /></div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
