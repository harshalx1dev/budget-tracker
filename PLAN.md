# Budget tracker: feature plan

A budget tracker **and planner** for a lazy, India-based user whose spending is mostly cash and UPI, who carries EMIs that change, and who keeps a wishlist the app should reason about. Multi-user, multi-currency (INR default), PWA, bring-your-own-AI-key, and an MCP server.

## Principles

1. **Capture must cost almost nothing.** Three low-effort paths: one-line quick-add, weekly statement import, cash reconciliation. Nothing relies on logging every entry.
2. **Numbers are computed, never guessed.** Balances, forecasts and affordability are deterministic code. AI only explains, ranks and categorises, and calls those functions as tools.
3. **One service layer.** UI, AI features and the MCP server all call the same `src/server/services/*` functions, so rules, scoping and validation exist once.
4. **Every row is tenant-scoped.** `workspace_id` on every table from the start (one personal workspace per user), so sharing a household later needs no schema rewrite.
5. **Money = integer minor units + ISO currency code.** Never floats.

## Capture (the lazy-user problem)

| Path | How it works |
| --- | --- |
| Quick-add | PWA home-screen shortcut opens a single input: `chai 20 cash`, `swiggy 450 upi yesterday`. Parsed locally (amount, account, date, note, category by keyword and past merchants). AI parsing is an optional upgrade when a key is set. |
| Statement import | Upload CSV/XLSX (PDF later) weekly. Bank-format adapters (HDFC, SBI, ICICI, Axis, Kotak to start; a generic column mapper for the rest). Idempotent: dedupe on account + date + amount + bank reference, so re-importing overlapping weeks is safe. |
| UPI narration | UPI lines carry `UPI/<ref>/<payee or VPA>/<bank>` and sometimes the remark you typed in the UPI app. We parse payee + remark and try it on real statements before promising more. |
| Categorisation | Order: your rules (payee/VPA/keyword) → merchant memory learned from your corrections → AI batch guess for the rest (BYOK). Unsure rows land in a **review inbox** for one-tap confirm; confirming creates a rule. |
| Cash | ATM withdrawals become transfers into a Cash account. **Cash reconciliation:** occasionally enter cash in hand; the gap is booked as "untracked cash spending" so the books stay true without per-item logging. |

## Commitments

- **EMIs / loans:** principal, rate, tenure, start date, due day, paying account. The schedule is generated; each instalment becomes a planned payment that matches the imported statement line. Loans have **dated revisions** (rate change, EMI change, part-prepayment, tenure change) so a change recomputes the future only and history stays intact.
- **Recurring items:** rule = frequency + interval + day + start + **end date or count** ("rent till Mar 2027"). Covers income (salary), bills, subscriptions, SIPs. Occurrences are generated into the forecast and matched to actuals.
- **Planned vs actual:** each recurring or EMI occurrence is expected until matched; unmatched past ones are flagged.

## Planner

- Monthly category **budgets** with optional rollover.
- **Forecast:** per-month projected balance from income + recurring + EMIs + budget headroom, over a configurable horizon.
- **Safe to spend:** free cash after commitments, buffer and goals, shown today, this week and this month.
- **Goals:** target amount and date, progress, required monthly contribution.

## Wishlist and affordability

- Item: title, price + currency, **multiple links**, type (need / want / desire), category, priority, target date, notes, status (wanted / planned / bought / dropped), optional financing option (down payment, EMI tenure, rate).
- **Deterministic engine** (works with no AI): for each item, from the forecast and the user's rules (emergency buffer in months, max EMI-to-income ratio, default 40% and editable):
  - can pay outright now? if not, the earliest month the savings allow;
  - can take it on EMI now? if not, the earliest month an existing EMI ends or income rises enough;
  - the effect on monthly free cash and the EMI ratio.
- **AI advisor** (BYOK): takes those computed results and returns a suggested purchase order with plain reasons ("the TV on EMI fits from September, when the phone EMI ends"). It never does arithmetic itself; it calls the engine as a tool.

## AI (bring your own key)

Same pattern as the job-tracker app: per-user key stored encrypted (AES-GCM, server `ENCRYPTION_KEY`), a provider gateway on the Vercel AI SDK, a settings card to add or remove the key, Gemini first (free tier friendly). Uses: natural-language quick-add, import categorisation, wishlist advisor, monthly summary. Every feature degrades to the non-AI path when no key is set.

## MCP server

Remote MCP over streamable HTTP at `/api/mcp`, authenticated with per-user personal access tokens (stored hashed, revocable, read or read-write scope). Tools wrap the service layer: `add_transaction`, `list_transactions`, `budget_status`, `forecast`, `list_wishlist`, `add_wishlist_item`, `check_affordability`, `list_commitments`. Tokens are managed in settings.

## Multi-currency

Each transaction stores amount, ISO currency and the rate to the workspace's home currency at entry time, so past reports never shift. Daily rates table from a free source (Frankfurter/ECB). Minor-unit exponent per currency (INR 2, JPY 0). Display uses `en-IN` grouping for INR.

## Data model (additions to what exists)

`user`, `session`, `account` (auth, via Better Auth) · `workspaces`, `workspace_members` · `accounts` (+ `workspace_id`, type cash/bank/card/wallet, opening balance) · `categories` (+ parent, kind) · `tags`, `transaction_tags` · `transactions` (+ currency, fx rate, payee, source, import hash, status pending/confirmed, transfer pair id) · `category_rules` · `import_batches` · `recurring_rules`, `recurring_occurrences` · `loans`, `loan_revisions`, `loan_instalments` · `budgets` · `goals` · `wishlist_items`, `wishlist_links` · `affordability_settings` · `ai_settings` (encrypted key) · `api_tokens` · `fx_rates`.

## Phases

| # | Phase | Delivers |
| --- | --- | --- |
| 0 | Foundations | Better Auth (Google + email), workspaces, schema v2, scoped data access, PWA shell (manifest, install), real ledger, settings |
| 1 | Capture | Quick-add, categories and tags, rules, CSV/XLSX import with review inbox and dedupe, cash reconciliation |
| 2 | Commitments | EMIs with revisions, recurring rules with end dates, planned-vs-actual matching |
| 3 | Planner | Budgets, forecast, safe-to-spend, goals |
| 4 | Wishlist | Items, links, financing options, deterministic affordability engine |
| 5 | AI | BYOK settings, NL quick-add, import categorisation, wishlist advisor, monthly summary |
| 6 | MCP | Tokens, `/api/mcp`, tool set |
| 7 | Polish | Offline quick-add with sync, web-push bill reminders, charts and reports, export, keyboard palette |

Phase 1 comes before 2 to 4 because everything downstream needs real data in the ledger; the wishlist advisor needs phases 2 and 3 to give honest answers.

## Open questions

1. Households: keep the workspace-sharing schema now and build invites in phase 7, or build invites earlier?
2. Which bank(s) do you use? A redacted sample statement (CSV/XLSX) lets us build the first adapter against real narration text.
3. Are your EMIs fixed-rate, floating, or both (credit-card and product EMIs are usually fixed; home or car loans may float)?
4. AI provider: Gemini only like job-tracker, or a provider choice (Gemini, OpenAI, Anthropic)?
