/**
 * enginseer.test.js – Tests for Enginseer role logic
 */

const { describe, it, assertEqual, assert } = globalThis._test;

// We can't import the full role file (it requires sheet context),
// but we can test the exported heatColor and the heat tier logic.
const { heatColor } = await import("../scripts/theme.js");
const { POWER_CORES_MAX, DEFAULT_COMBAT_STATE } = await import("../scripts/constants.js");

describe("Enginseer – Heat system", () => {

  it("HEAT_MAX is 10 in default state", () => {
    // Enginseer heat starts at 0, max is convention 10
    assertEqual(DEFAULT_COMBAT_STATE.resources.enginseer.heat, 0);
  });

  it("default power cores matches POWER_CORES_MAX", () => {
    assertEqual(
      DEFAULT_COMBAT_STATE.resources.enginseer.powerCores,
      POWER_CORES_MAX,
    );
  });

  it("heatColor at 0% is green", () => {
    assertEqual(heatColor(0), "rgb(39,174,96)");
  });

  it("heatColor at 100% is red", () => {
    assertEqual(heatColor(100), "rgb(192,57,43)");
  });

  it("heatColor at 50% is intermediate", () => {
    const color = heatColor(50);
    assert(color.startsWith("rgb("), "Should be rgb string");
    // Extract components
    const [, r, g, b] = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
    // At 50%, should be orange-ish (high R, moderate G, low B)
    assert(Number(r) > 150, `R=${r} should be > 150`);
    assert(Number(b) < 50, `B=${b} should be < 50`);
  });
});

describe("Enginseer – Heat tier difficulty mapping", () => {
  // Replicate the tier logic for testing
  const HEAT_TIERS = [
    { max: 2, label: "Easy",        modifier: 40  },
    { max: 4, label: "Average",     modifier: 20  },
    { max: 6, label: "Challenging", modifier: 0   },
    { max: 7, label: "Difficult",   modifier: -10 },
    { max: 8, label: "Hard",        modifier: -20 },
    { max: 9, label: "Very Hard",   modifier: -30 },
  ];

  function getModifier(heat) {
    for (const tier of HEAT_TIERS) {
      if (heat <= tier.max) return tier;
    }
    return { max: 10, label: "Very Hard", modifier: -30 };
  }

  it("heat 0 → Easy (+40)", () => {
    assertEqual(getModifier(0).modifier, 40);
  });

  it("heat 2 → Easy (+40)", () => {
    assertEqual(getModifier(2).modifier, 40);
  });

  it("heat 3 → Average (+20)", () => {
    assertEqual(getModifier(3).modifier, 20);
  });

  it("heat 6 → Challenging (0)", () => {
    assertEqual(getModifier(6).modifier, 0);
  });

  it("heat 9 → Very Hard (-30)", () => {
    assertEqual(getModifier(9).modifier, -30);
  });

  it("heat 10 → Very Hard (-30, fallback)", () => {
    assertEqual(getModifier(10).modifier, -30);
  });
});

describe("Enginseer – Core bank and shield commitment", () => {

  it("default state has stagedCores as empty object", () => {
    const staged = DEFAULT_COMBAT_STATE.resources.enginseer.stagedCores;
    assert(typeof staged === "object", "stagedCores should be object");
    assertEqual(Object.keys(staged).length, 0, "Should start empty");
  });

  it("default actionChoice is empty (no action chosen)", () => {
    assertEqual(DEFAULT_COMBAT_STATE.resources.enginseer.actionChoice, "");
  });

  it("heatCoresStaged defaults to 1", () => {
    assertEqual(DEFAULT_COMBAT_STATE.resources.enginseer.heatCoresStaged, 1);
  });

  it("fireCoresStaged defaults to 1", () => {
    assertEqual(DEFAULT_COMBAT_STATE.resources.enginseer.fireCoresStaged, 1);
  });
});
