/**
 * theme.test.js – Tests for scripts/theme.js
 */

const { describe, it, assertEqual, assertApprox } = globalThis._test;

// Dynamic import to resolve relative to module root
const { THEME, cssRgba, pixi, hex, withAlpha, heatColor } = await import("../scripts/theme.js");

describe("theme.js – Format helpers", () => {

  it("cssRgba converts [r,g,b,a] to CSS string", () => {
    assertEqual(cssRgba([255, 0, 128, 0.5]), "rgba(255,0,128,0.5)");
  });

  it("cssRgba defaults alpha to 1", () => {
    assertEqual(cssRgba([10, 20, 30]), "rgba(10,20,30,1)");
  });

  it("pixi converts [r,g,b] to 0xRRGGBB integer", () => {
    assertEqual(pixi([255, 68, 68]), 0xff4444);
  });

  it("pixi ignores alpha", () => {
    assertEqual(pixi([255, 68, 68, 0.5]), 0xff4444);
  });

  it("hex converts [r,g,b] to #rrggbb string", () => {
    assertEqual(hex([192, 57, 43]), "#c0392b");
  });

  it("hex pads small values with zeros", () => {
    assertEqual(hex([0, 0, 0]), "#000000");
  });

  it("withAlpha creates a new color array with given alpha", () => {
    const result = withAlpha([255, 128, 64], 0.3);
    assertEqual(result.length, 4);
    assertEqual(result[0], 255);
    assertEqual(result[3], 0.3);
  });
});

describe("theme.js – Heat gradient", () => {

  it("heatColor(0) returns green", () => {
    assertEqual(heatColor(0), "rgb(39,174,96)");
  });

  it("heatColor(100) returns red", () => {
    assertEqual(heatColor(100), "rgb(192,57,43)");
  });

  it("heatColor clamps below 0 to green", () => {
    assertEqual(heatColor(-50), "rgb(39,174,96)");
  });

  it("heatColor clamps above 100 to red", () => {
    assertEqual(heatColor(200), "rgb(192,57,43)");
  });

  it("heatColor(50) returns intermediate orange-ish", () => {
    // Between lime (20%) and orange (55%), closer to orange
    const result = heatColor(50);
    // Should be a valid rgb string
    assertEqual(result.startsWith("rgb("), true, "Starts with rgb(");
    assertEqual(result.endsWith(")"), true, "Ends with )");
  });
});

describe("theme.js – THEME palette completeness", () => {

  it("has all role colors", () => {
    const roles = ["captain", "enginseer", "pilot", "sensors", "gunner", "ordnance"];
    for (const r of roles) {
      assertEqual(Array.isArray(THEME.roles[r]), true, `Missing role: ${r}`);
      assertEqual(THEME.roles[r].length, 4, `Role ${r} should have 4 components`);
    }
  });

  it("has all 4 weapon type colors", () => {
    const types = ["ammo", "heat", "power", "none"];
    for (const t of types) {
      assertEqual(Array.isArray(THEME.weaponTypes[t]), true, `Missing weapon type: ${t}`);
    }
  });

  it("has all 3 zone colors", () => {
    assertEqual(Array.isArray(THEME.zones.zone1), true);
    assertEqual(Array.isArray(THEME.zones.zone2), true);
    assertEqual(Array.isArray(THEME.zones.zone3), true);
  });

  it("has all 8 trait colors", () => {
    const traits = ["shieldBypass", "unlimitedRof", "shieldBurn", "rend", "armourPenetration", "devastating", "unreliable", "overcharge"];
    for (const t of traits) {
      assertEqual(Array.isArray(THEME.traits[t]), true, `Missing trait: ${t}`);
    }
  });

  it("THEME is frozen", () => {
    assertEqual(Object.isFrozen(THEME), true);
  });
});
