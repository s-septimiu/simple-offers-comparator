# Romanian Offer Comparator

Normalizes Romanian software development offers to the same unit — **what actually lands in your
account** — so you can compare them directly regardless of contract type, currency, or how the
number was quoted.

**[→ Open the tool](https://romanian-simple-offers-comparator.netlify.app/)**

---

## What it handles

Most offer comparators stop at gross salary. This one models all four structures a Romanian
developer actually chooses between, and the edge cases that decide between them.

**Contract types**

| | Tax treatment |
|---|---|
| **PFA** (sistem real) | CASS 10% on net income between 6 and 72 minimum wages, CAS 25% on a stepped base, 10% income tax |
| **SRL micro** | 1% of turnover, a mandatory minimum-wage employee, then 16% on dividends plus stepped CASS |
| **SRL profit tax** | 16% on profit, then 16% on dividends plus stepped CASS. Required above €100.000 turnover |
| **CIM** (employment) | CAS 25% + CASS 10% + 10% tax on the full gross, with the personal deduction |

**Everything else you can vary**

- **Billing basis** — hourly, daily or monthly, in EUR, USD, GBP or RON
- **Gross or net** — net salary quotes are reverse-solved through the whole payroll stack
- **Paid days off** — time off the contract does not cover becomes a real, priced cost
- **Timeline** — probation at reduced pay, a raise at month N, a mid-year start, fixed terms
- **Extras** — 13th salary, on-call, overtime, annual bonus, meal tickets, perks
- **Part-time** — hours per week and days per week
- **SRL levers** — your own salary and how much profit you distribute

Add as many offers as you like. Every card, the comparison table and the waterfall update live.

---

## The things it gets right that are easy to get wrong

**Thresholds are cliffs, not slopes.** CAS jumps by 12.150 lei the moment PFA income touches 12
minimum wages. Dividend CASS jumps by 2.430 lei at 6. Earning one leu more can genuinely leave you
poorer. The tool detects when you are sitting just the wrong side of one and tells you what dropping
below it would be worth.

**Take-home is therefore not monotonic in your rate.** The "what would this need to pay to match the
leader?" solver copes with that, and will tell you when the answer is to ask for *less*.

**Micro tax is charged on turnover, not profit.** Deductible costs do not reduce it at all. They
still cut the profit you can distribute, so they are not free — they just buy you nothing on the 1%.

**Business costs are one monthly figure, and it assumes recurring spend.** *Costs / month* is
annualized and deducted in full: on a PFA it lowers the net income that the CAS plateau, the CASS
clamp and the 10% are all measured against; on either SRL it comes out of profit before the dividend
chain. Employment deducts nothing, so the field is ignored there. The assumption to know about is
the write-off timing — from 5.000 lei up (OUG 8/2026, raised from 2.500) a purchase is a *mijloc
fix* and is amortized over its Catalog life, 2 to 4 years for IT equipment, rather than deducted in
the year you pay. So the field is for the accountant, hosting, licences and courses; fold a €2.000
laptop into it and the first year comes out roughly three times too generous. The tool says so
rather than modelling it — there are no purchase dates in a single monthly number.

**Plafoane are per calendar year, not per rolling twelve months.** An engagement starting in
September splits across two tax years, and each partial year is tested against the full annual
thresholds independently — which can drop CAS to zero in both.

**The personal deduction is a staircase.** It steps down every 50 lei of gross, and at each step net
pay actually falls. A one-leu raise inside the grid can cost you 1,44 lei a month.

**Net salary quotes cannot be inverted with a constant.** `net / 0.585` is only valid where the
personal deduction is zero, so the inversion is solved numerically.

---

## Tax model — Romania 2026

All constants live in [`src/fiscal/constants.js`](src/fiscal/constants.js), with the reasoning and
sources beside them. **That is the only file you need to edit when the law changes.**

Key values for 2026: minimum wage 4.050 lei to 30 June and 4.325 lei from 1 July; annual plafoane
pinned to the 1 January value; micro tax 1% with a €100.000 ceiling; dividends 16%; meal tickets
capped at 45 lei/worked day and 80% net-efficient.

> **A documented ambiguity.** Sources disagree on whether the CAS/CASS plafoane follow the July
> minimum-wage increase mid-year. This tool takes the 1 January pinning as the safe reading of Cod
> fiscal art. 170/174 and says so in the footer. If ANAF clarifies otherwise, change
> `PLAFON_ANCHOR` and everything else follows.

Exchange rates are fetched live from four independent sources on load. If all of them fail, the tool
falls back to dated constants and **labels them as not live** rather than passing them off as
current. Any rate can be overridden by hand.

---

## Privacy and state

Everything runs in your browser. Nothing is sent anywhere, and **nothing is stored** — no
localStorage, no cookies, no analytics. Every visitor gets the same starting state.

That means a refresh loses your work, so there are two ways to keep it:

- **Share link** — encodes the whole comparison into the URL and copies it to your clipboard
- **Print / PDF** — a real print stylesheet that expands every derivation, drops the interactive
  chrome, and keeps each offer on one page

---

## Development

The app is built from `src/` and shipped as **one self-contained `index.html`** — React and compiled
Tailwind inlined, zero external assets. Download that file, open it from disk, and it works offline;
only the exchange-rate fetch degrades.

```bash
npm install
npm run dev      # dev server
npm test         # tax engine test suite
npm run build    # emits dist/ and refreshes the committed index.html
```

```
src/
  fiscal/         constants.js ← edit here for law changes
                  pfa.js  cim.js  srl.js
  engine/         compute.js  schedule.js  solve.js  numeric.js
                  fx.js  warnings.js  share.js
  ui/             App.jsx and components
  index.html      the Vite entry (NOT the published file)
index.html        the committed build output — generated, do not edit
```

`index.html` at the repo root is generated. CI rebuilds and fails if the committed bundle has
drifted from `src/`, or if it ever references an external asset.

**Tests are the point, not a formality.** The suite pins every plafon boundary from both sides, the
personal-deduction grid against its published table, the accounting identity that every leu of SRL
turnover is accounted for exactly once, net↔gross round trips inside the deduction staircase, and
the share-link round trip. If you change a constant, the tests will tell you exactly what moved.

**Deploy:** fork, connect to Netlify, done. Build command `npm run build`, publish directory `dist`.
Or serve the committed `index.html` from any static host.

---

## License

MIT — do whatever you want with it. If you find a tax modelling error, open an issue; a failing test
case is the most useful possible bug report.
