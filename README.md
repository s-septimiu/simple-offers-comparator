# Simple Offers Comparator

A single HTML file that normalizes Romanian freelance and employment offers to the same unit — **what actually lands in your account** — so you can compare them directly regardless of contract type, currency, or how the number was quoted.

**[→ Open the tool](https://romanian-simple-offers-comparator.netlify.app/)**

---

## What it handles

Most offer comparators stop at gross salary. This one doesn't. You can mix and match:

- **Contract type** — B2B (PFA sistem real) or employment (CIM)
- **Billing basis** — hourly, daily, or monthly
- **Currency** — EUR, USD, GBP, or RON
- **Gross or net** — CIM salaries quoted as net are reverse-solved through the payroll stack
- **Paid days off** — PTO that doesn't cover your actual holidays becomes a real cost
- **Annual bonus** — one-time lump sums included in the annual total
- **Meal tickets** — modeled at 2026 rates (45 lei/day, 80% net efficiency vs 58.5% on salary)
- **Other perks** — monthly benefits added to the take-home
- **Part-time** — hours per week adjusts the effective hourly rate

You can add as many offers as you want. Each one gets a card. The comparison table and waterfall chart update live.

---

## Tax model — Romania 2026

**PFA (B2B):**
- CASS 10% on annual net income, floored at 6 minimum wages (24,300 RON), capped at 72 minimum wages (291,600 RON)
- CAS 25% on a capped base — 12 minimum wages if net income is between 48,600–97,200 RON, 24 minimum wages above that, zero below the floor
- Income tax 10% on what remains after CAS and CASS
- Alternatively, use the flat-rate override if you know your effective rate

**CIM (employment):**
- CAS 25% + CASS 10% on full gross, uncapped for salary income
- Income tax 10% on the remainder
- The IT income-tax exemption was eliminated by OUG 156/2024 effective January 2025 — the toggle is there only for modeling the old regime

**Meal tickets:**
- Taxed at CASS 10% + income tax 10%, CAS-exempt
- Net efficiency: ~80% vs 58.5% on equivalent salary
- Cap: 45 lei/worked day (Legea 201/2025, valid through September 2026)

Exchange rates (EUR/RON, EUR/USD, EUR/GBP) are fetched live on load from four independent sources. You can override any of them manually.

---

## How to use

**Online:** visit the link above. Nothing to install.

**Self-host:** download `index.html`, put it in a folder, open it in a browser. Works offline for the calculator itself; rates fetch requires internet.

**Deploy your own copy:**
1. Fork this repo
2. Connect it to Netlify (or any static host)
3. Done — Netlify will deploy automatically on every push

---

## Keeping it current

Romanian tax rules change frequently. The constants to update each fiscal year are at the top of `index.html`:

```
MW         — minimum wage (4,050 RON for 2026)
TICKET_MAX — meal ticket ceiling (45 RON for 2026)
CIM_NET_RATIO — net/gross ratio (0.585 for 2026 without IT exemption)
TICKET_NET_RATIO — meal ticket net efficiency (0.80 for 2026)
```

If the IT exemption is reinstated or CAS/CASS rates change, update those constants and the inline documentation.

---

## Tech

Single HTML file. React 18 and ReactDOM load from unpkg CDN. Tailwind CSS loads from their CDN. The app code is pre-compiled JSX — no build step, no bundler, no Node required to run it.

To rebuild from source after editing the JSX:

```bash
npm install
npx babel src/comparator.jsx \
  --no-babelrc \
  --plugins '[["@babel/plugin-transform-react-jsx", {"runtime":"classic"}]]' \
  --out-file compiled.js
# then replace the app script block in index.html with compiled.js content
```

---

## License

MIT — do whatever you want with it. If you find a tax modeling error, open an issue.
