// Integration tests that exercise the real DOM-driving functions
// (updateAll, resetAll, applyScenarioFromUrl, buildScenarioUrl) against a
// fake document, not just the pure math. This is the closest we can get to
// "click around the app and check the results" without a real browser.
//
// Run with: node --test tests/

require("./dom-stubs.js"); // lets app.js load (top-level document/window touches are harmless no-ops)
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeEnvironment, seedDefaults } = require("./fake-dom.js");
const app = require("../app.js");

global.requestAnimationFrame = (fn) => fn();

function freshEnv() {
  const env = createFakeEnvironment();
  seedDefaults(env.get);
  global.document = env.document;
  global.window = env.window;
  global.navigator = env.navigator;
  return env;
}

function approx(actual, expected, epsilon = 1e-2, msg) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    msg || `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

function num(text) {
  return Number(String(text).replace(/[^0-9.\-]/g, ""));
}

// ===================== Core calc wiring =====================

test("updateAll: fully financed (0% equity, default) produces a breakeven consistent with the pure calc", () => {
  const env = freshEnv();
  const result = app.updateAll();
  assert.ok(result, "updateAll should return a result object for a fully-filled scenario");

  const expected = app.computeCostBreakdown({
    inWeight: 850, priceCwt: 240, outWeight: 1450,
    cogNoInterest: 1.10, deathLossPct: 1.0, interestRatePct: 7.25,
    daysOnFeed: result.daysOnFeed, equityPct: 0
  });
  approx(result.breakEvenCwt, (expected.totalCostPerHd / 1450) * 100, 1e-6);
  assert.notEqual(env.get("roe").textContent, "—", "0% equity → ROE falls back to Return on Total Capital, not a blank dash");
  assert.ok(!/NaN|Infinity/.test(env.get("roe").textContent));
  assert.equal(env.get("returnsZeroEquityNote").classList.contains("hidden"), false, "the Return-on-Total-Capital explanation should be visible");
});

test("updateAll: raising equity to 30% lowers interest/total cost and defines ROE", () => {
  freshEnv();
  const at0 = app.updateAll();

  const env = freshEnv();
  env.get("equityPct").value = "30";
  const at30 = app.updateAll();

  assert.ok(at30.interestPerHd < at0.interestPerHd, "financing less of the cost should charge less interest");
  approx(at30.interestPerHd, at0.interestPerHd * 0.7, 1e-6);
  assert.ok(at30.totalCostPerHd < at0.totalCostPerHd);
  assert.notEqual(env.get("roe").textContent, "—", "30% equity should produce a defined ROE");
  assert.equal(env.get("returnsZeroEquityNote").classList.contains("hidden"), true);

  // Changing equity must not move sales price, cattle sales, or ownership.
  approx(at30.salesPrice, at0.salesPrice, 1e-9);
  approx(at30.cattleSales, at0.cattleSales, 1e-9);
  assert.equal(at30.myHead, at0.myHead);
});

test("updateAll: 100% equity charges zero interest and uses full capital invested for ROE", () => {
  const env = freshEnv();
  env.get("equityPct").value = "100";
  const result = app.updateAll();

  approx(result.interestPerHd, 0, 1e-9);
  approx(result.equityInvested, result.capitalInvested, 1e-6);
  assert.equal(env.get("d_interestPerHd").textContent, "$0.00");
});

test("updateAll: P/L per head/day is P/L per head divided by days on feed, using unrounded values", () => {
  const env = freshEnv();
  const result = app.updateAll();
  const expected = app.computePlPerHdPerDay(result.plPerHd, result.daysOnFeed);
  approx(result.plPerHdPerDay, expected, 1e-9);
  assert.equal(env.get("plPerHdPerDay").textContent, `${env.get("plPerHdPerDay").textContent}`); // sanity: element exists/writable
  assert.ok(env.get("plPerHdPerDay").textContent.includes("/hd/day"));
});

// ===================== Empty / invalid states =====================

test("updateAll: missing a required field shows an em dash, not NaN or Infinity, everywhere downstream", () => {
  const env = freshEnv();
  env.get("outWeight").value = ""; // blank a required field
  const result = app.updateAll();
  assert.equal(result, null);

  ["breakEvenCwt", "plPerHd", "plPerHdPerDay", "projectedTotalPL", "roe", "annualRoe", "irr"].forEach(id => {
    const text = env.get(id).textContent;
    assert.equal(text, "—", `${id} should show an em dash, got "${text}"`);
    assert.ok(!/NaN|Infinity/.test(text), `${id} must never render NaN/Infinity, got "${text}"`);
  });
});

test("updateAll: out-of-range equity shows a field-specific message and blocks results (not silently clamped)", () => {
  const env = freshEnv();
  env.get("equityPct").value = "150";
  const result = app.updateAll();
  assert.equal(result, null);
  assert.match(env.get("errorText").textContent, /Equity contribution must be between 0% and 100%/);
  assert.equal(env.get("breakEvenCwt").textContent, "—");
});

test("updateAll: an invalid input does not corrupt other, still-valid fields", () => {
  const env = freshEnv();
  env.get("equityPct").value = "150"; // invalid
  app.updateAll();
  // The other fields the user already typed are untouched.
  assert.equal(env.get("inWeight").value, "850");
  assert.equal(env.get("outWeight").value, "1450");
  assert.equal(env.get("priceCwt").value, "240");
});

// ===================== Ownership clarification =====================

test("updateAll: ownership below 100% labels only the ownership-adjusted results", () => {
  const env = freshEnv();
  env.get("ownershipPct").value = "30";
  app.updateAll();

  const note = env.get("ownershipNoteCapital").textContent;
  assert.match(note, /Your share/);
  assert.match(note, /30% ownership/);
  assert.equal(env.get("ownershipNoteCapital").classList.contains("hidden"), false);
  assert.equal(env.get("ownershipNoteHero").classList.contains("hidden"), false);
  assert.equal(env.get("ownershipNoteReturns").classList.contains("hidden"), false);
  assert.equal(env.get("ownershipNoteHedging").classList.contains("hidden"), false);
});

test("updateAll: full ownership (100%) never shows the 'your share' note", () => {
  const env = freshEnv(); // seedDefaults already sets ownershipPct to 100
  app.updateAll();
  assert.equal(env.get("ownershipNoteCapital").classList.contains("hidden"), true);
  assert.equal(env.get("ownershipNoteHero").classList.contains("hidden"), true);
});

test("updateAll: P/L per head is unaffected by ownership % (it is a per-head figure)", () => {
  const env100 = freshEnv();
  const r100 = app.updateAll();

  const env30 = freshEnv();
  env30.get("ownershipPct").value = "30";
  const r30 = app.updateAll();

  approx(r30.plPerHd, r100.plPerHd, 1e-9);
  approx(r30.breakEvenCwt, r100.breakEvenCwt, 1e-9);
  // But the ownership-scaled totals differ.
  assert.ok(r30.projectedTotalPL < r100.projectedTotalPL);
});

// ===================== Reset behavior =====================

test("resetAll: returns equity to 0%/100% financed and collapses the expander", () => {
  const env = freshEnv();
  env.get("equityPct").value = "45";
  app.resetAll();
  assert.equal(env.get("equityPct").value, "0");
  assert.equal(env.get("equityExpanderPanel").classList.contains("hidden"), true);
});

// ===================== Scenario persistence =====================

test("buildScenarioUrl -> applyScenarioFromUrl: equity value round-trips", () => {
  const env = freshEnv();
  env.get("equityPct").value = "37";
  const url = app.buildScenarioUrl();
  const search = "?" + url.split("?")[1];

  const env2 = freshEnv();
  env2.get("equityPct").value = "0";
  env2.window.location.search = search;
  app.applyScenarioFromUrl();
  assert.equal(env2.get("equityPct").value, "37");
});

test("applyScenarioFromUrl: a scenario link missing the equity field defaults to 0% (older shared link)", () => {
  const env = freshEnv();
  env.get("equityPct").value = "80"; // simulate a stale value before loading the link
  env.window.location.search = "?iw=850&ow=1450&pp=240"; // no "eq" param at all
  app.applyScenarioFromUrl();
  assert.equal(env.get("equityPct").value, "0");
});

test("applyScenarioFromUrl: an out-of-range equity value in the link is clamped, not rejected", () => {
  const env = freshEnv();
  env.window.location.search = "?iw=850&eq=250";
  app.applyScenarioFromUrl();
  assert.equal(env.get("equityPct").value, "100");
});
