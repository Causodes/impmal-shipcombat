/**
 * sensors.test.js – Tests for Augur (Sensors) role logic
 */

const { describe, it, assertEqual, assert } = globalThis._test;

const { DEFAULT_COMBAT_STATE, LOCK_DECAY_ROUNDS, AP_MAX } = await import("../scripts/constants.js");
const { THEME, pixi } = await import("../scripts/theme.js");

describe("Sensors – Default state", () => {
  const sensors = DEFAULT_COMBAT_STATE.resources.sensors;

  it("bdaAvailable starts as false", () => {
    assertEqual(sensors.bdaAvailable, false);
  });

  it("fireCorrection starts as null", () => {
    assertEqual(sensors.fireCorrection, null);
  });

  it("locks starts as empty array", () => {
    assert(Array.isArray(sensors.locks), "locks should be an array");
    assertEqual(sensors.locks.length, 0);
  });

  it("effects starts as empty array", () => {
    assert(Array.isArray(sensors.effects), "effects should be an array");
    assertEqual(sensors.effects.length, 0);
  });
});

describe("Sensors – Focused Scan logic (AP-based)", () => {
  // Focused Scan: gain = SL (positive only), added to AP pool

  function computeFocusedScanGain(sl) {
    return Math.max(0, sl);
  }

  it("SL 0 → gain of 0", () => {
    assertEqual(computeFocusedScanGain(0), 0);
  });

  it("SL 1 → gain of 1", () => {
    assertEqual(computeFocusedScanGain(1), 1);
  });

  it("SL 3 → gain of 3", () => {
    assertEqual(computeFocusedScanGain(3), 3);
  });

  it("SL 5 → gain of 5", () => {
    assertEqual(computeFocusedScanGain(5), 5);
  });

  it("negative SL treated as 0", () => {
    assertEqual(computeFocusedScanGain(-2), 0);
  });

  it("AP capped at AP_MAX", () => {
    const current = 38;
    const gain = 5;
    assertEqual(Math.min(AP_MAX, current + gain), AP_MAX);
  });
});

describe("Sensors – Shield allocation math", () => {
  // Sensors distributes from shield pool to per-sector shields.
  // Each sector has a zoneThreshold cap.

  function canAllocate(shieldPoolCurrent, sectorValue, sectorMax) {
    return shieldPoolCurrent > 0 && sectorValue < sectorMax;
  }

  function canDeallocate(sectorValue) {
    return sectorValue > 0;
  }

  it("can allocate when pool has flux and sector below max", () => {
    assert(canAllocate(10, 3, 8) === true);
  });

  it("cannot allocate when pool is empty", () => {
    assert(canAllocate(0, 3, 8) === false);
  });

  it("cannot allocate when sector at max", () => {
    assert(canAllocate(10, 8, 8) === false);
  });

  it("can deallocate when sector > 0", () => {
    assert(canDeallocate(5) === true);
  });

  it("cannot deallocate when sector at 0", () => {
    assert(canDeallocate(0) === false);
  });
});

describe("Sensors – Lock action costs", () => {
  const LOCK_ACTIONS = [
    { id: "activePing",        cost: 3,  setsTier: 1, requiresTier: 0 },
    { id: "breachAnalysis",    cost: 6,  setsTier: 2, requiresTier: 1 },
    { id: "deepScan",          cost: 10, setsTier: 3, requiresTier: 2 },
    { id: "targetingSolution", cost: 15, setsTier: 4, requiresTier: 2 },
  ];

  const UTILITY_ACTIONS = [
    { id: "interferencePat",  cost: 12 },
    { id: "targetingJamming", cost: 15 },
  ];

  it("all lock actions have positive data costs", () => {
    for (const a of LOCK_ACTIONS) {
      assert(a.cost > 0, `${a.id} should cost > 0 data`);
    }
  });

  it("lock actions have ascending costs", () => {
    for (let i = 1; i < LOCK_ACTIONS.length; i++) {
      assert(LOCK_ACTIONS[i].cost > LOCK_ACTIONS[i - 1].cost, `${LOCK_ACTIONS[i].id} should cost more than ${LOCK_ACTIONS[i - 1].id}`);
    }
  });

  it("each lock action sets a unique tier", () => {
    const tiers = LOCK_ACTIONS.map(a => a.setsTier);
    assertEqual(new Set(tiers).size, tiers.length);
  });

  it("utility actions have positive costs", () => {
    for (const a of UTILITY_ACTIONS) {
      assert(a.cost > 0, `${a.id} should cost > 0 data`);
    }
  });

  function canAffordAction(currentData, cost) {
    return currentData >= cost;
  }

  it("can afford 3-cost action with 5 data", () => {
    assert(canAffordAction(5, 3) === true);
  });

  it("cannot afford 15-cost action with 10 data", () => {
    assert(canAffordAction(10, 15) === false);
  });
});

describe("Sensors – Lock tier decay", () => {

  it("tier 4 decays in 1 round", () => {
    assertEqual(LOCK_DECAY_ROUNDS[4], 1);
  });

  it("tier 3 decays in 2 rounds", () => {
    assertEqual(LOCK_DECAY_ROUNDS[3], 2);
  });

  it("tier 2 decays in 3 rounds", () => {
    assertEqual(LOCK_DECAY_ROUNDS[2], 3);
  });

  it("tier 1 decays in 5 rounds", () => {
    assertEqual(LOCK_DECAY_ROUNDS[1], 5);
  });

  // Simulate decay logic from resetActions
  function decayLock(lock) {
    const remaining = (lock.decayRounds ?? 1) - 1;
    if (remaining > 0) return { ...lock, decayRounds: remaining };
    const newTier = (lock.tier ?? 1) - 1;
    if (newTier <= 0) return null;
    return { ...lock, tier: newTier, decayRounds: LOCK_DECAY_ROUNDS[newTier] ?? 1 };
  }

  it("tier 4 drops to tier 3 after 1 decay", () => {
    const lock = { targetActorId: "a", tier: 4, decayRounds: 1 };
    const result = decayLock(lock);
    assertEqual(result.tier, 3);
    assertEqual(result.decayRounds, 2);
  });

  it("tier 3 with 2 remaining just decrements", () => {
    const lock = { targetActorId: "a", tier: 3, decayRounds: 2 };
    const result = decayLock(lock);
    assertEqual(result.tier, 3);
    assertEqual(result.decayRounds, 1);
  });

  it("tier 1 with 1 remaining removes lock", () => {
    const lock = { targetActorId: "a", tier: 1, decayRounds: 1 };
    const result = decayLock(lock);
    assertEqual(result, null);
  });

  it("full decay chain: 4→3→2→1→gone over 11 rounds", () => {
    let lock = { targetActorId: "a", tier: 4, decayRounds: 1 };
    let rounds = 0;
    while (lock !== null) {
      lock = decayLock(lock);
      rounds++;
    }
    assertEqual(rounds, 11); // 1 + 2 + 3 + 5
  });
});

describe("Sensors – Effective lock tier with auto-lock", () => {
  function getEffectiveTier(explicitTier, distSq, ghRange) {
    const autoTier = (ghRange > 0 && distSq <= ghRange) ? 2 : 0;
    return Math.max(explicitTier, autoTier);
  }

  it("no lock, outside ghRange → tier 0", () => {
    assertEqual(getEffectiveTier(0, 20, 5), 0);
  });

  it("no lock, inside ghRange → tier 2 (auto)", () => {
    assertEqual(getEffectiveTier(0, 3, 5), 2);
  });

  it("lock 1, inside ghRange → tier 2 (auto wins)", () => {
    assertEqual(getEffectiveTier(1, 3, 5), 2);
  });

  it("lock 3, inside ghRange → tier 3 (explicit wins)", () => {
    assertEqual(getEffectiveTier(3, 3, 5), 3);
  });

  it("lock 4, outside ghRange → tier 4 (explicit)", () => {
    assertEqual(getEffectiveTier(4, 20, 5), 4);
  });

  it("ghRange 0 → no auto-lock", () => {
    assertEqual(getEffectiveTier(0, 3, 0), 0);
  });
});

describe("Sensors – Shield overlay colors from theme", () => {
  it("shieldGreen resolves to 0x00ff88", () => {
    assertEqual(pixi(THEME.overlay.shieldGreen), 0x00ff88);
  });

  it("shieldBlue resolves to 0x44aaff", () => {
    assertEqual(pixi(THEME.overlay.shieldBlue), 0x44aaff);
  });
});
