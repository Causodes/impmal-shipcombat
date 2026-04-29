/**
 * gunner.test.js – Tests for Ordnance Master (Gunner) role logic
 */

const { describe, it, assertEqual, assert } = globalThis._test;

const {
  MACRO_FIRE_TIERS, LANCE_CHARGE_TIERS, DEFAULT_COMBAT_STATE,
} = await import("../scripts/constants.js");
const { THEME, pixi, hex } = await import("../scripts/theme.js");

describe("Gunner – Macro Cannon fire tiers", () => {

  it("ranging fire costs 1 ammo", () => {
    assertEqual(MACRO_FIRE_TIERS[0].ammo, 1);
  });

  it("ranging fire is exclusive", () => {
    assertEqual(MACRO_FIRE_TIERS[0].exclusive, true);
  });

  it("volley costs 3 ammo, salvoMult 1", () => {
    const volley = MACRO_FIRE_TIERS.find(t => t.id === "volley");
    assertEqual(volley.ammo, 3);
    assertEqual(volley.salvoMult, 1);
  });

  it("broadside costs 6 ammo", () => {
    const broad = MACRO_FIRE_TIERS.find(t => t.id === "broadside");
    assertEqual(broad.ammo, 6);
  });

  it("devastating broadside costs 16 ammo + hitMod +20", () => {
    const dev = MACRO_FIRE_TIERS.find(t => t.id === "devastatingBroadside");
    assertEqual(dev.ammo, 16);
    assertEqual(dev.hitMod, 20);
  });

  it("salvoMult increases with tier", () => {
    const mults = MACRO_FIRE_TIERS.map(t => t.salvoMult);
    // rangingFire=0.5, volley=1, broadside=1.5, fullBroadside=2, devastating=3
    for (let i = 1; i < mults.length; i++) {
      assert(mults[i] >= mults[i - 1], `Tier ${i} salvoMult should be >= previous`);
    }
  });
});

describe("Gunner – Lance charge tiers", () => {

  it("has 4 tiers spanning 1-20", () => {
    assertEqual(LANCE_CHARGE_TIERS.length, 4);
    assertEqual(LANCE_CHARGE_TIERS[0].min, 1);
    assertEqual(LANCE_CHARGE_TIERS[3].max, 20);
  });

  it("glancing at charge 1-5, multiplier 0.5", () => {
    const t = LANCE_CHARGE_TIERS[0];
    assertEqual(t.min, 1);
    assertEqual(t.max, 5);
    assertEqual(t.multiplier, 0.5);
  });

  it("standard at charge 6-10, multiplier 1", () => {
    const t = LANCE_CHARGE_TIERS[1];
    assertEqual(t.min, 6);
    assertEqual(t.max, 10);
    assertEqual(t.multiplier, 1);
  });

  it("focused at charge 11-15, multiplier 1.5", () => {
    const t = LANCE_CHARGE_TIERS[2];
    assertEqual(t.min, 11);
    assertEqual(t.max, 15);
    assertEqual(t.multiplier, 1.5);
  });

  it("full discharge at charge 16-20, multiplier 2", () => {
    const t = LANCE_CHARGE_TIERS[3];
    assertEqual(t.min, 16);
    assertEqual(t.max, 20);
    assertEqual(t.multiplier, 2);
  });

  function tierForCharge(charge) {
    return LANCE_CHARGE_TIERS.find(t => charge >= t.min && charge <= t.max) ?? null;
  }

  it("charge 0 has no tier", () => {
    assertEqual(tierForCharge(0), null);
  });

  it("charge 7 → standard tier", () => {
    const tier = tierForCharge(7);
    assertEqual(tier.multiplier, 1);
  });

  it("charge 20 → full discharge", () => {
    const tier = tierForCharge(20);
    assertEqual(tier.multiplier, 2);
  });

  it("charge 12 → focused tier", () => {
    const tier = tierForCharge(12);
    assertEqual(tier.multiplier, 1.5);
  });
});

describe("Gunner – Zone classification", () => {
  // Zone 1: guaranteed hit (0 → ghRange)
  // Zone 2: effective range (ghRange → range)
  // Zone 3: extended range (range → range + bandSize * maxBands)

  function classifyZone(distance, ghRange, range, bandSize, rating) {
    const maxBands = Math.floor(rating / 10);
    if (distance <= ghRange) return 1;
    if (distance <= range) return 2;
    if (distance <= range + bandSize * maxBands) return 3;
    return 0; // out of range
  }

  it("distance 2, ghRange 3 → Zone 1", () => {
    assertEqual(classifyZone(2, 3, 10, 2, 30), 1);
  });

  it("distance 5, ghRange 3, range 10 → Zone 2", () => {
    assertEqual(classifyZone(5, 3, 10, 2, 30), 2);
  });

  it("distance 12, range 10, bandSize 2, rating 30 → Zone 3", () => {
    // maxBands = 3, extended = 10 + 2*3 = 16
    assertEqual(classifyZone(12, 3, 10, 2, 30), 3);
  });

  it("distance 20, range 10, bandSize 2, rating 30 → out of range", () => {
    // extended = 10 + 6 = 16, 20 > 16
    assertEqual(classifyZone(20, 3, 10, 2, 30), 0);
  });

  it("rating 10 → only 1 extended band", () => {
    const maxBands = Math.floor(10 / 10);
    assertEqual(maxBands, 1);
  });

  it("rating 0 → no extended bands", () => {
    assertEqual(classifyZone(11, 3, 10, 2, 0), 0);
  });
});

describe("Gunner – Weapon type colors from theme", () => {

  it("macroCannon → 0xff4444", () => {
    assertEqual(pixi(THEME.weaponTypes.macroCannon), 0xff4444);
  });

  it("plasmaCannon → 0x4488ff", () => {
    assertEqual(pixi(THEME.weaponTypes.plasmaCannon), 0x4488ff);
  });

  it("lanceBattery → 0x44ff88", () => {
    assertEqual(pixi(THEME.weaponTypes.lanceBattery), 0x44ff88);
  });

  it("pointDefense → 0xffaa44", () => {
    assertEqual(pixi(THEME.weaponTypes.pointDefense), 0xffaa44);
  });
});

describe("Gunner – Hit quadrant calculation", () => {
  // Attack angle → quadrant for shield resolution

  function getHitQuadrant(attackAngleDeg) {
    const a = ((attackAngleDeg % 360) + 360) % 360;
    if (a >= 315 || a < 45)  return "bow";
    if (a >= 45  && a < 135) return "starboard";
    if (a >= 135 && a < 225) return "stern";
    return "port";
  }

  it("0° → bow", () => { assertEqual(getHitQuadrant(0), "bow"); });
  it("90° → starboard", () => { assertEqual(getHitQuadrant(90), "starboard"); });
  it("180° → stern", () => { assertEqual(getHitQuadrant(180), "stern"); });
  it("270° → port", () => { assertEqual(getHitQuadrant(270), "port"); });
  it("350° → bow", () => { assertEqual(getHitQuadrant(350), "bow"); });
  it("-90° (=270°) → port", () => { assertEqual(getHitQuadrant(-90), "port"); });
});
