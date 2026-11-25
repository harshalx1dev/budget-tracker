import { addMonths } from "./dates";

export type RevisionIn =
  | { effectiveOn: string; kind: "emi"; emiMinor: number }
  | { effectiveOn: string; kind: "rate"; ratePct: number }
  | { effectiveOn: string; kind: "prepayment"; amountMinor: number };

export type LoanIn = {
  firstDueOn: string;
  instalments: number; // remaining instalments counted from firstDueOn
  emiMinor: number; // the lender's figure, stored as given
  principalMinor: number | null; // balance before the first listed instalment; optional
  annualRatePct: number | null;
  revisions: RevisionIn[];
};

export type Instalment = { n: number; dueOn: string; amountMinor: number; interestMinor: number | null; principalMinor: number | null; balanceAfterMinor: number | null };
export type Schedule = { rows: Instalment[]; stalled: boolean };

/** Standard EMI, used only to suggest a figure; the lender's own number is what gets stored. */
export function pmt(principalMinor: number, annualRatePct: number, n: number) {
  const r = annualRatePct / 1200;
  if (r === 0) return Math.round(principalMinor / n);
  const f = (1 + r) ** n;
  return Math.round((principalMinor * r * f) / (f - 1));
}

const MAX = 1200;

export function buildSchedule(loan: LoanIn): Schedule {
  const revs = [...loan.revisions].sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn));
  const rows: Instalment[] = [];
  let emi = loan.emiMinor;
  let rate = loan.annualRatePct ?? 0;
  let ri = 0;

  const applyRevisions = (due: string, onPrepay?: (amt: number) => void) => {
    while (ri < revs.length && revs[ri].effectiveOn <= due) {
      const v = revs[ri++];
      if (v.kind === "emi") emi = v.emiMinor;
      else if (v.kind === "rate") rate = v.ratePct;
      else onPrepay?.(v.amountMinor);
    }
  };

  // Without a principal we only know the monthly outflow and when it stops.
  if (loan.principalMinor === null) {
    for (let i = 0; i < loan.instalments; i++) {
      const dueOn = addMonths(loan.firstDueOn, i);
      applyRevisions(dueOn);
      rows.push({ n: i + 1, dueOn, amountMinor: emi, interestMinor: null, principalMinor: null, balanceAfterMinor: null });
    }
    return { rows, stalled: false };
  }

  let balance = loan.principalMinor;
  for (let i = 0; i < MAX && balance > 0; i++) {
    const dueOn = addMonths(loan.firstDueOn, i);
    applyRevisions(dueOn, (amt) => { balance = Math.max(0, balance - amt); });
    if (balance <= 0) break;
    const interest = Math.round((balance * rate) / 1200);
    if (emi <= interest) return { rows, stalled: true }; // never pays down: stop instead of looping
    const principalPart = emi - interest;
    const last = principalPart >= balance;
    const part = last ? balance : principalPart;
    balance -= part;
    rows.push({ n: i + 1, dueOn, amountMinor: part + interest, interestMinor: interest, principalMinor: part, balanceAfterMinor: balance });
  }
  return { rows, stalled: balance > 0 };
}
