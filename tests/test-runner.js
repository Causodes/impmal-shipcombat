/**
 * test-runner.js – Minimal browser-free test harness for Ship Combat module.
 *
 * Run:  node tests/test-runner.js
 *
 * Mocks Foundry VTT globals (game, ui, CONST, etc.) just enough for
 * pure-logic unit tests on the module's own functions.
 */

/* ── Foundry global stubs ─────────────────────────────────────────────────── */

globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
  TOKEN_DISPOSITIONS: { HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 },
};

globalThis.foundry = {
  data: {
    fields: {
      StringField:  class { constructor(opts) { Object.assign(this, opts); } },
      NumberField:  class { constructor(opts) { Object.assign(this, opts); } },
      BooleanField: class { constructor(opts) { Object.assign(this, opts); } },
      HTMLField:    class { constructor(opts) { Object.assign(this, opts); } },
      ArrayField:   class { constructor(inner, opts) { Object.assign(this, opts); } },
      SchemaField:  class { constructor(obj, opts) { Object.assign(this, opts); } },
      ObjectField:  class { constructor(opts) { Object.assign(this, opts); } },
    },
  },
  abstract: { DataModel: class {} },
  applications: { apps: { DocumentSheetConfig: { registerSheet() {} } } },
  documents: { BaseItem: { DEFAULT_ICON: "icons/svg/item-bag.svg" } },
};

globalThis.game = {
  i18n: { localize: (k) => k, format: (k, d) => `${k}: ${JSON.stringify(d)}` },
  user: { id: "test-user", isGM: true },
  users: { get: () => null },
  actors: { get: () => null, find: () => null },
  settings: { register() {}, get: () => 4 },
  combat: null,
};

globalThis.ui = {
  notifications: {
    info: (m) => console.log(`[info] ${m}`),
    warn: (m) => console.log(`[warn] ${m}`),
    error: (m) => console.log(`[error] ${m}`),
  },
};

globalThis.canvas = null;
globalThis.Hooks = { on() {}, once() {}, callAll() {} };
globalThis.Handlebars = { registerHelper() {} };
globalThis.CONFIG = { Actor: { dataModels: {}, typeLabels: {} }, Item: { dataModels: {}, typeLabels: {} } };
globalThis.PIXI = { Container: class {}, Graphics: class {}, Sprite: class {}, Text: class {} };

// warhammer-lib stub
globalThis.warhammer = {
  models: {
    BaseWarhammerActorModel: class {
      static defineSchema() { return {}; }
      _addModelProperties() {}
    },
    BaseWarhammerItemModel: class {
      static defineSchema() { return {}; }
    },
  },
  apps: {
    WarhammerItemSheetV2: class {},
  },
};

// IMActorSheet stub (normally from impmal system)
globalThis.IMActorSheet = class {};

/* ── Test harness ─────────────────────────────────────────────────────────── */

let _passed = 0;
let _failed = 0;
let _currentSuite = "";
const _failures = [];
const _suites = [];

function describe(name, fn) {
  const tests = [];
  _suites.push({ name, tests });
  const prevCollector = globalThis._collectingTests;
  globalThis._collectingTests = tests;
  fn();
  globalThis._collectingTests = prevCollector;
}

function it(name, fn) {
  globalThis._collectingTests.push({ name, fn });
}

async function runSuites() {
  for (const suite of _suites) {
    _currentSuite = suite.name;
    console.log(`\n  ${suite.name}`);
    for (const test of suite.tests) {
      try {
        await test.fn();
        _passed++;
        console.log(`    ✓ ${test.name}`);
      } catch (e) {
        _failed++;
        _failures.push({ suite: _currentSuite, test: test.name, error: e.message });
        console.log(`    ✗ ${test.name}`);
        console.log(`      ${e.message}`);
      }
    }
  }
}

function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, label = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label ? label + ": " : ""}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn, label = "") {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(`${label ? label + ": " : ""}Expected function to throw`);
}

function assertApprox(actual, expected, epsilon = 0.001, label = "") {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label ? label + ": " : ""}Expected ~${expected}, got ${actual}`);
  }
}

/* ── Export for test files ────────────────────────────────────────────────── */

globalThis._test = { describe, it, assert, assertEqual, assertDeepEqual, assertThrows, assertApprox };

/* ── Run all test suites ──────────────────────────────────────────────────── */

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║       Ship Combat Module – Unit Test Suite               ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");

  // Import test files (each registers describe/it blocks on import)
  await import("./theme.test.js");
  await import("./constants.test.js");
  await import("./adapter.test.js");
  await import("./enginseer.test.js");
  await import("./pilot.test.js");
  await import("./sensors.test.js");
  await import("./gunner.test.js");
  await import("./component.test.js");
  await import("./flavor.test.js");
  await import("./settings.test.js");
  await import("./crit.test.js");

  // Now run all collected suites (supports async tests)
  await runSuites();

  console.log("\n─────────────────────────────────────────────────────────────");
  console.log(`  ${_passed} passed, ${_failed} failed`);
  if (_failures.length) {
    console.log("\n  Failures:");
    for (const f of _failures) {
      console.log(`    [${f.suite}] ${f.test}: ${f.error}`);
    }
  }
  console.log("");
  process.exit(_failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
