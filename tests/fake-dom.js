// A tiny, purpose-built fake DOM for integration-testing app.js's
// DOM-driving functions (updateAll, resetAll, scenario persistence)
// without a real browser or a heavyweight dependency like jsdom.
//
// It auto-creates an element for any id the first time it's requested
// (mirroring how every id referenced by app.js exists in the real page),
// and supports just the handful of Element/classList members app.js uses.

class FakeClassList {
  constructor() { this._set = new Set(); }
  add(...c) { c.forEach(x => this._set.add(x)); }
  remove(...c) { c.forEach(x => this._set.delete(x)); }
  toggle(c, force) {
    const has = this._set.has(c);
    const shouldHave = force === undefined ? !has : !!force;
    if (shouldHave) this._set.add(c); else this._set.delete(c);
    return shouldHave;
  }
  contains(c) { return this._set.has(c); }
}

class FakeElement {
  constructor(id) {
    this.id = id;
    this._value = "";
    this.textContent = "";
    this.classList = new FakeClassList();
    this.readOnly = false;
    this.tabIndex = 0;
    this.scrollHeight = 200;
    // scrollWidth/clientWidth default equal (0) so fitValueText's shrink
    // loop (scrollWidth > clientWidth) never engages under the fake DOM —
    // there's no real layout to measure here.
    this.scrollWidth = 0;
    this.clientWidth = 0;
    this.style = {};
    this._attrs = {};
    this._listeners = {};
  }
  get value() { return this._value; }
  set value(v) { this._value = v === null || v === undefined ? "" : String(v); }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
}

function createFakeEnvironment() {
  const store = new Map();
  const get = (id) => {
    if (!store.has(id)) store.set(id, new FakeElement(id));
    return store.get(id);
  };
  const resultsCard = new FakeElement("__resultsCard__");

  const document = {
    getElementById: (id) => get(id),
    querySelector: (sel) => (sel === ".resultsCard" ? resultsCard : null),
    addEventListener: () => {},
    activeElement: null
  };

  const window = {
    addEventListener: () => {},
    matchMedia: () => ({ matches: false }),
    location: { href: "http://localhost/", search: "" },
    innerWidth: 1024,
    innerHeight: 768
  };

  const navigator = { clipboard: { writeText: async () => {} }, share: undefined };

  return { document, window, navigator, get, store, resultsCard };
}

// Fills in the standard set of fields the app expects before first use,
// matching the real page's HTML defaults (index.html), so a test only
// needs to override what it actually cares about.
function seedDefaults(get) {
  get("inDate").value = "2026-09-28";
  get("totalHead").value = "1000";
  get("ownershipPct").value = "100";
  get("inWeight").value = "850";
  get("priceCwt").value = "240";
  get("outWeight").value = "1450";
  get("adg").value = "3.5";
  get("daysOnFeed").value = "—";
  get("cogNoInterest").value = "1.10";
  get("deathLossPct").value = "1.0";
  get("interestRatePct").value = "7.25";
  get("equityPct").value = "0";
  get("financedPct").value = "100";
  get("futures").value = "230";
  get("basis").value = "0";
  get("equityExpanderPanel").classList.add("hidden");
}

module.exports = { createFakeEnvironment, seedDefaults, FakeElement };
