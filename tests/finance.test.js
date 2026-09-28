// Focused unit tests for the equity/financing math introduced in this change,
// plus the persistence fallback used when restoring shared/older scenarios.
// Run with: node --test tests/
//
// No dependencies: uses Node's built-in test runner + assert. app.js is a
// browser IIFE with no bundler/module system, so tests/dom-stubs.js installs
// the minimal global.document/window/navigator it touches at load time
// before requiring it — none of the DOM-driving code paths inside execute
// during these tests, only the pure exported functions are exercised.

require("./dom-stubs.js");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveEquityPct,
  computeFinancing,
  computeCostBreakdown,
  computeReturns,
  computePlPerHdPerDay,
  irrTwoPoint,
  fmtPctShort
} = require("../app.js");

function approx(actual, expected, epsilon = 1e-6, msg) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    msg || `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

// ===================== resolveEquityPct (scenario persistence) =====================

test("resolveEquityPct: missing/absent param defaults to 0% (fully financed)", () => {
  assert.equal(resolveEquityPct(null), 0);
  assert.equal(resolveEquityPct(undefined), 0);
});

test("resolveEquityPct: empty string defaults to 0%", () => {
  assert.equal(resolveEquityPct(""), 0);
});

test("resolveEquityPct: non-numeric value defaults to 0%", () => {
  assert.equal(resolveEquityPct("abc"), 0);
});

test("resolveEquityPct: valid in-range value passes through", () => {
  assert.equal(resolveEquityPct("30"), 30);
  assert.equal(resolveEquityPct("0"), 0);
  assert.equal(resolveEquityPct("100"), 100);
});

test("resolveEquityPct: out-of-range values are clamped, not rejected", () => {
  assert.equal(resolveEquityPct("150"), 100);
  assert.equal(resolveEquityPct("-20"), 0);
});

// ===================== computeFinancing =====================

test("computeFinancing: default 0% equity means 100% financed", () => {
  const f = computeFinancing(0);
  assert.equal(f.equityPct, 0);
  assert.equal(f.financedPct, 100);
  assert.equal(f.equityFraction, 0);
  assert.equal(f.financedFraction, 1);
});

test("computeFinancing: 30% equity / 70% financed", () => {
  const f = computeFinancing(30);
  assert.equal(f.equityPct, 30);
  assert.equal(f.financedPct, 70);
  approx(f.equityFraction, 0.3);
  approx(f.financedFraction, 0.7);
});

test("computeFinancing: 100% equity means 0% financed", () => {
  const f = computeFinancing(100);
  assert.equal(f.financedPct, 0);
  assert.equal(f.financedFraction, 0);
});

test("computeFinancing: clamps out-of-range and non-finite input", () => {
  assert.equal(computeFinancing(150).equityPct, 100);
  assert.equal(computeFinancing(-10).equityPct, 0);
  assert.equal(computeFinancing(NaN).equityPct, 0);
});

// ===================== computeCostBreakdown (interest timing / financing) =====================

const BASE_INPUTS = {
  inWeight: 850,
  priceCwt: 240,
  outWeight: 1450,
  cogNoInterest: 1.10,
  deathLossPct: 1.0,
  interestRatePct: 7.25,
  daysOnFeed: 180
};

test("computeCostBreakdown: at 0% equity, matches the pre-existing fully-financed formula", () => {
  const b = computeCostBreakdown({ ...BASE_INPUTS, equityPct: 0 });
  // Hand-computed from the original (pre-equity) formula:
  // costPerHd = 850*240/100 = 2040; perHdCOG = 600*1.10 + 0.01*2040 = 680.4
  // interest = ((2040 + 0.5*680.4) * 0.0725/365) * 180
  approx(b.costPerHd, 2040);
  approx(b.perHdCOG, 680.4);
  approx(b.interestPerHd, 85.100301369863, 1e-6);
  approx(b.totalCostPerHd, 2040 + 680.4 + b.interestPerHd);
});

test("computeCostBreakdown: interest scales linearly with the financed fraction", () => {
  const at0 = computeCostBreakdown({ ...BASE_INPUTS, equityPct: 0 });
  const at30 = computeCostBreakdown({ ...BASE_INPUTS, equityPct: 30 });
  const at100 = computeCostBreakdown({ ...BASE_INPUTS, equityPct: 100 });

  approx(at30.interestPerHd, at0.interestPerHd * 0.7, 1e-6);
  assert.equal(at100.interestPerHd, 0, "100% equity must charge zero interest");

  // Total cost (purchase + feed/COG) is identical across equity levels —
  // only the interest component (and therefore total cost) changes.
  approx(at0.costPerHd, at100.costPerHd);
  approx(at0.perHdCOG, at100.perHdCOG);
  assert.ok(at100.totalCostPerHd < at0.totalCostPerHd, "more equity should mean lower total cost (less interest)");
});

test("computeCostBreakdown: never charges interest on the equity portion (no bank interest on cash)", () => {
  const b = computeCostBreakdown({ ...BASE_INPUTS, equityPct: 100 });
  assert.equal(b.interestPerHd, 0);
});

// ===================== computeReturns (ROE / Annualized ROE) =====================

test("computeReturns: zero equity invested yields undefined ROE, not Infinity", () => {
  const r = computeReturns({ projectedTotalPL: 15000, capitalInvested: 100000, equityPct: 0, daysOnFeed: 180 });
  assert.equal(r.equityInvested, 0);
  assert.ok(Number.isNaN(r.roe), "ROE must be NaN (→ em dash), never Infinity");
  assert.ok(Number.isNaN(r.annualRoe));
});

test("computeReturns: 30% equity uses equity invested (not a hidden hard-coded %) as the ROE basis", () => {
  const r = computeReturns({ projectedTotalPL: 15000, capitalInvested: 100000, equityPct: 30, daysOnFeed: 365 });
  approx(r.equityInvested, 30000);
  approx(r.roe, 0.5); // 15000 / 30000
  // With exactly 365 days (1 year), annualizing a 1-year return is a no-op.
  approx(r.annualRoe, r.roe, 1e-9);
});

test("computeReturns: 100% equity uses the full capital invested as the ROE basis", () => {
  const r = computeReturns({ projectedTotalPL: 15000, capitalInvested: 100000, equityPct: 100, daysOnFeed: 365 });
  approx(r.equityInvested, 100000);
  approx(r.roe, 0.15);
});

test("computeReturns: example from spec — $100,000 relevant cost, 30% equity = $30,000 own cash", () => {
  const { equityFraction, financedFraction } = computeFinancing(30);
  const relevantCost = 100000;
  approx(relevantCost * equityFraction, 30000);
  approx(relevantCost * financedFraction, 70000);
});

// ===================== computePlPerHdPerDay =====================

test("computePlPerHdPerDay: worked example from spec ($76.38 / 117 days ≈ $0.65/hd/day)", () => {
  const v = computePlPerHdPerDay(76.38, 117);
  approx(v, 0.6528205, 1e-6);
  assert.equal(v.toFixed(2), "0.65");
});

test("computePlPerHdPerDay: em dash (NaN) when days on feed is zero", () => {
  assert.ok(Number.isNaN(computePlPerHdPerDay(50, 0)));
});

test("computePlPerHdPerDay: em dash (NaN) when days on feed is negative or missing", () => {
  assert.ok(Number.isNaN(computePlPerHdPerDay(50, -5)));
  assert.ok(Number.isNaN(computePlPerHdPerDay(NaN, 100)));
  assert.ok(Number.isNaN(computePlPerHdPerDay(50, NaN)));
});

test("computePlPerHdPerDay: uses unrounded inputs (rounding happens only at display time)", () => {
  // A value that would round differently if computed from already-rounded
  // display strings ($76.38 rounded) vs the true unrounded P/L per head.
  const trueValue = computePlPerHdPerDay(76.384999, 117);
  approx(trueValue, 76.384999 / 117, 1e-9);
});

// ===================== irrTwoPoint (existing, retained project-IRR basis) =====================

test("irrTwoPoint: 10% simple return over exactly one year annualizes to ~10%", () => {
  const d0 = new Date("2026-01-01T00:00:00");
  const d1 = new Date("2027-01-01T00:00:00"); // 365 days later
  const irr = irrTwoPoint(-100, 110, d0, d1);
  approx(irr, 0.10, 1e-3);
});

test("irrTwoPoint: unavailable (NaN) when there is no positive return cash flow", () => {
  const d0 = new Date("2026-01-01T00:00:00");
  const d1 = new Date("2026-07-01T00:00:00");
  assert.ok(Number.isNaN(irrTwoPoint(-100, 0, d0, d1)));
});

test("irrTwoPoint: unavailable (NaN) when the date range is invalid", () => {
  const d0 = new Date("2026-01-01T00:00:00");
  const d1 = new Date("2026-01-01T00:00:00"); // zero elapsed time
  assert.ok(Number.isNaN(irrTwoPoint(-100, 110, d0, d1)));
});

// ===================== fmtPctShort =====================

test("fmtPctShort: whole numbers render without trailing decimals", () => {
  assert.equal(fmtPctShort(0), "0");
  assert.equal(fmtPctShort(30), "30");
  assert.equal(fmtPctShort(100), "100");
});

test("fmtPctShort: fractional values round to at most 2 decimals", () => {
  assert.equal(fmtPctShort(33.333), "33.33");
});

test("fmtPctShort: non-finite input defaults to \"0\"", () => {
  assert.equal(fmtPctShort(NaN), "0");
});
