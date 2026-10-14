// Reverse breakeven: solvePurchasePrice must return the purchase price that,
// fed back through the forward math (computeCostBreakdown/computeReturns),
// lands exactly on the requested target — for every target mode.
// Run with: node --test tests/*.test.js

require("./dom-stubs.js");
const test = require("node:test");
const assert = require("node:assert/strict");

const { solvePurchasePrice, computeCostBreakdown, computeReturns, computePlPerHdPerDay } = require("../app.js");
const { createFakeEnvironment, seedDefaults } = require("./fake-dom.js");
const app = require("../app.js");

global.requestAnimationFrame = (fn) => fn();

function approx(actual, expected, epsilon = 1e-6, msg) {
  assert.ok(Math.abs(actual - expected) <= epsilon, msg || `expected ${actual} to be within ${epsilon} of ${expected}`);
}

const base = {
  inWeight: 850, outWeight: 1450, cogNoInterest: 1.10, deathLossPct: 1.0,
  interestRatePct: 7.25, daysOnFeed: 171, salesPrice: 230
};
const myHead = 1000;

// Forward-calc every result the solver can target, at a given purchase price.
function forward(priceCwt, equityPct) {
  const { totalCostPerHd } = computeCostBreakdown({ ...base, priceCwt, equityPct });
  const salesPerHd = (base.salesPrice * base.outWeight) / 100;
  const plPerHd = salesPerHd - totalCostPerHd;
  const projectedTotalPL = plPerHd * myHead;
  const { roe, annualRoe } = computeReturns({
    projectedTotalPL, capitalInvested: totalCostPerHd * myHead, equityPct, daysOnFeed: base.daysOnFeed
  });
  return {
    plPerHd,
    plPerHdPerDay: computePlPerHdPerDay(plPerHd, base.daysOnFeed),
    totalPL: projectedTotalPL,
    roe: roe * 100,
    annualRoe: annualRoe * 100
  };
}

const cases = [
  ["plPerHd", 100], ["plPerHdPerDay", 0.5], ["totalPL", 75000], ["roe", 8], ["annualRoe", 15]
];

for (const equityPct of [0, 30, 100]) {
  for (const [targetMode, targetValue] of cases) {
    test(`solvePurchasePrice: ${targetMode}=${targetValue} at ${equityPct}% equity round-trips through the forward calc`, () => {
      const solved = solvePurchasePrice({ ...base, equityPct, targetMode, targetValue, myHead });
      assert.ok(solved && solved.maxPriceCwt > 0, "should produce a positive price");
      approx(forward(solved.maxPriceCwt, equityPct)[targetMode], targetValue, 1e-6);
    });
  }
}

test("solvePurchasePrice: a $0/hd target reproduces the breakeven price", () => {
  const atBreakeven = solvePurchasePrice({ ...base, equityPct: 0, targetMode: "plPerHd", targetValue: 0, myHead });
  const { totalCostPerHd } = computeCostBreakdown({ ...base, priceCwt: atBreakeven.maxPriceCwt, equityPct: 0 });
  approx((totalCostPerHd / base.outWeight) * 100, base.salesPrice, 1e-6);
});

test("solvePurchasePrice: total profit without head count, or missing inputs, returns null", () => {
  assert.equal(solvePurchasePrice({ ...base, equityPct: 0, targetMode: "totalPL", targetValue: 1000, myHead: NaN }), null);
  assert.equal(solvePurchasePrice({ ...base, salesPrice: NaN, equityPct: 0, targetMode: "plPerHd", targetValue: 100 }), null);
  assert.equal(solvePurchasePrice({ ...base, equityPct: 0, targetMode: "bogus", targetValue: 100 }), null);
});

test("solvePurchasePrice: an unreachable target yields a non-positive price", () => {
  const solved = solvePurchasePrice({ ...base, equityPct: 0, targetMode: "plPerHd", targetValue: 5000, myHead });
  assert.ok(solved.maxPriceCwt <= 0);
});

function freshEnv() {
  const env = createFakeEnvironment();
  seedDefaults(env.get);
  global.document = env.document;
  global.window = env.window;
  global.navigator = env.navigator;
  return env;
}

test("Target Price mode: Purchase Price becomes calculated and results land exactly on the target", () => {
  const env = freshEnv();
  app.setTargetPriceMode(true);
  env.get("targetMode").value = "plPerHd";
  env.get("targetValue").value = "100";
  const r = app.updateAll();
  assert.equal(env.get("priceCwt").readOnly, true);
  assert.match(env.get("priceCwtLabel").textContent, /calculated/);
  approx(r.plPerHd, 100, 1e-6);
  approx(Number(env.get("priceCwt").value), r.priceCwt, 0.005);
  app.setTargetPriceMode(false);
});

test("Target Price mode: annualized ROE target is hit by the forward Returns calc", () => {
  const env = freshEnv();
  app.setTargetPriceMode(true);
  env.get("equityPct").value = "30";
  env.get("targetMode").value = "annualRoe";
  env.get("targetValue").value = "20";
  const r = app.updateAll();
  approx(r.annualRoe * 100, 20, 1e-6);
  app.setTargetPriceMode(false);
});

test("Target Price mode: total profit with no head count explains what's missing", () => {
  const env = freshEnv();
  app.setTargetPriceMode(true);
  env.get("totalHead").value = "";
  env.get("targetMode").value = "totalPL";
  env.get("targetValue").value = "50000";
  app.updateAll();
  assert.equal(env.get("priceCwt").value, "—");
  assert.match(env.get("targetPriceNote").textContent, /Total Head/);
  app.setTargetPriceMode(false);
});

test("Target Price mode off: entered Purchase Price is used and target fields are ignored", () => {
  const env = freshEnv();
  env.get("targetValue").value = "100";
  const r = app.updateAll();
  assert.equal(r.priceCwt, 240);
  assert.equal(env.get("priceCwt").readOnly, false);
});

test("scenario link round-trips Target Price mode, target type and value", () => {
  const env = freshEnv();
  app.setTargetPriceMode(true);
  env.get("targetMode").value = "annualRoe";
  env.get("targetValue").value = "15";
  const url = new URL(app.buildScenarioUrl());
  assert.equal(url.searchParams.get("tp"), "1");
  assert.equal(url.searchParams.get("tm"), "annualRoe");
  assert.equal(url.searchParams.get("tv"), "15");
  app.setTargetPriceMode(false);

  const env2 = freshEnv();
  env2.window.location.search = url.search;
  app.applyScenarioFromUrl();
  assert.equal(env2.get("targetMode").value, "annualRoe");
  assert.equal(env2.get("targetValue").value, "15");
  const r = app.updateAll();
  approx(r.annualRoe * 100, 15, 1e-6);
  app.setTargetPriceMode(false);
});
