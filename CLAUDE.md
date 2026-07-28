# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev                            # Vite dev server
npm test                               # full suite (vitest run)
npm run test:watch
npx vitest run src/fiscal/pfa.test.js  # one file
npx vitest run -t "CAS"                # one test by name
npm run build                          # dist/ + regenerates the committed root index.html
npm run check                          # test && build — run before committing any src/ change
```

Node 22 (CI and `netlify.toml` both pin it). No linter or formatter is configured.

## The two `index.html` files

This is the single easiest thing to get wrong here.

- `src/index.html` — the Vite entry. Edit this one.
- `index.html` at the repo root — **generated and committed**. `npm run build` writes `dist/` (which is
  gitignored, and what Netlify publishes), then `scripts/emit-bundle.mjs` copies it to the root with a
  DO-NOT-EDIT banner. It is the downloadable, fully self-contained single file — React and compiled
  Tailwind inlined, works offline from disk.

CI (`.github/workflows/ci.yml`) fails if `git diff --exit-code -- index.html` is dirty after a clean
build, or if the bundle references any external `src=`/`href=` URL. **After any change under `src/`,
run `npm run check` and commit the regenerated root `index.html` in the same commit** — otherwise the
published file silently lags behind the tested code, which for a tax calculator means shipping numbers
nobody verified.

`vitest.config.js` is deliberately separate from `vite.config.js`: the build sets `root: 'src'`, which
would hide the test files from discovery.

## Architecture

Pure-function tax engines under `src/fiscal/` and `src/engine/`, a React UI on top that only formats.
No state is persisted anywhere — no localStorage, no cookies, no analytics. `main.jsx` →
`ErrorBoundary` → `App.jsx`, which owns all state (offers, globals, FX rates) and memoizes
`results` / `engagementResults` / `warnings` per offer, passing them down as props.

**Everything computes in RON; EUR values are display mirrors only.** The tax code is denominated in RON
and the plafoane are RON thresholds, so converting earlier would route threshold comparisons through a
floating FX rate and make the cliff detectors lie. `compute.js` adds `*EUR` fields at the very end.

**`src/fiscal/constants.js` is the only file to edit when the law changes.** Everything downstream
derives from it, including `PLAFON_ANCHOR` and the documented ANAF ambiguity about whether the annual
plafoane follow the mid-year minimum-wage rise. When updating a fiscal year, also bump `FISCAL_YEAR`
and `LAST_REVIEWED`; the boundary tests will report exactly what moved. Tests are the point here
rather than a formality — every plafon boundary is pinned from both sides.

**Take-home is not monotonic in the headline rate.** Dividend CASS and the PFA CAS floors are step
functions — crossing one by a single leu can cost thousands — so earning less can genuinely leave you
with more. Never introduce a plain bisection: use `solveSmallestReaching` from `engine/numeric.js`,
which takes the *first* crossing and refines into it. Existing callers: `cimGrossFromNet`
(`fiscal/cim.js`) and `solveAmount` (`engine/solve.js`).

**Two schedules, neither derived from the other** (`engine/schedule.js`):

- `steadySchedule` — twelve months at the settled post-probation, post-raise rate. This is what
  `compute()` uses, and what the ranking, the best-offer badge and the solver all compare on.
- `engagementSchedule` — the actual cash: probation, raise timing, contract end, mid-year start.
  Used by `computeEngagement()`.

Each is taxed on its own real income so the drill-down reconciles to its headline exactly.

**Annual taxes must group by `byCalendarYear(schedule)` first.** Plafoane are per calendar year, never
per rolling twelve months — an engagement starting in September splits across two tax years and each
partial year faces the *full* annual thresholds independently. `computePfa` and `computeSrlOffer` both
do this; anything new that applies an annual threshold must too.

**CIM is per-month; PFA and SRL are per-calendar-year.** Payroll depends on that month's gross against
that month's minimum wage (which rose in July 2026), so summing twelve monthly results is not the same
as annualising once the personal deduction is non-zero. `fiscal/cim.js` works strictly per month and
callers aggregate.

### Two things that break silently

- **The URL hash is the only way state survives a reload.** A new offer or globals field must be added
  to `OFFER_KEYS` / `GLOBAL_KEYS` in `engine/share.js`, or it will not survive a share link — and
  nothing will error. `share.test.js` covers the round trip.
- **A new FX source must be added to `connect-src` in `netlify.toml`**, or the CSP blocks it in
  production while it works fine locally. `engine/fx.js` races four sources with `Promise.any` and
  falls back to dated constants that the UI badges as *not live*.

### UI conventions

- Every numeric input goes through `useNumericText` (`src/ui/useNumericText.js`). Binding a raw number
  and coercing with `parseFloat(x) || 0` looks equivalent and is not — the header explains the failure
  modes.
- All display formatting comes from `src/format.js` (Romanian convention: dot thousands, comma
  decimals).
- `engine/warnings.js` severity: `error` blocks belief in the number, `warn` changes a decision, `info`
  is worth knowing. The `'micro-ceiling'` code is the deliberate exception — an `error` whose number is
  still correct, so the card keeps its derivation open.
- `MathDrilldown.jsx` must reconcile line-by-line to the headline. If a figure cannot be shown
  honestly, it does not belong in the model.

## Comment style

The existing comments explain *why*, at length, and several are anti-fix warnings guarding against
plausible-looking "corrections" (e.g. `TICKET_NET_RATIO` must stay `0.80` — both withholdings apply to
the full nominal value and add; it is not `0.9 × 0.9`). Match that density, and when you resolve a
subtle point, leave the reasoning behind.

See `README.md` for the tax model itself and the user-facing feature set.
