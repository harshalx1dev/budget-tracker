import { CardCycleForm, PayCardForm } from "./card-bills";
import { formatMinor } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import type { listCards } from "@/server/services/cards";

type Card = Awaited<ReturnType<typeof listCards>>[number];

/** Each credit card: what is to pay and by when, a way to record paying it, and its two dates. */
export function CardSection({ cards, payFrom }: { cards: Card[]; payFrom: { id: string; name: string }[] }) {
  if (!cards.length) return null;
  return (
    <section className="stack-sm" aria-labelledby="cards-h">
      <h2 id="cards-h">Credit cards</h2>
      <ul className="well rows">
        {cards.map((c) => (
          <li key={c.id} className="row">
            <div className="bar__head">
              <p className="row__title">{c.name}</p>
              {c.bill && <p className="row__value" data-bad={c.bill.overdue || undefined}>{formatMinor(c.bill.toPay, c.currency, { whole: true })}</p>}
            </div>
            {c.bill ? (
              <p className="label">
                {c.bill.toPay === 0 ? `Nothing to pay on the ${formatDay(c.bill.statementOn)} bill.` : c.bill.overdue ? `Overdue: this was due on ${formatDay(c.bill.dueOn)}.` : `To pay by ${formatDay(c.bill.dueOn)}.`}
                {c.bill.unbilled > 0 ? ` ${formatMinor(c.bill.unbilled, c.currency, { whole: true })} spent since goes on the ${formatDay(c.bill.nextStatementOn)} bill.` : ""}
              </p>
            ) : (
              <p className="label">Add the day your bill is made and the day it must be paid, and it counts against the salary that pays it.</p>
            )}
            {c.bill && c.bill.toPay > 0 && <PayCardForm id={c.id} amount={String(c.bill.toPay / 100)} from={payFrom} />}
            <details className="wish__more" open={!c.bill}><summary className="link">Card dates</summary><CardCycleForm id={c.id} statementDay={c.statementDay} dueDay={c.dueDay} /></details>
          </li>
        ))}
      </ul>
    </section>
  );
}
