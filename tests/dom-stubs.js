// Minimal DOM/browser stubs so app.js (a browser IIFE) can be `require()`d
// from plain Node for unit testing its pure financial-math exports.
// app.js touches `document`/`window` at top-level (mobile picker setup,
// the DOMContentLoaded listener registration) — none of that code path
// runs in these tests, but it must not throw while the module loads.
global.document = {
  getElementById: () => null,
  addEventListener: () => {},
  querySelector: () => null,
  activeElement: null
};
global.window = {
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  location: { href: "http://localhost/", search: "" },
  innerWidth: 1024,
  innerHeight: 768
};
global.navigator = {
  clipboard: { writeText: async () => {} },
  share: undefined
};
