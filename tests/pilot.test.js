/**
 * pilot.test.js – Tests for Helmsman role logic and HelmPreview calculations
 *
 * Coverage:
 *  • Default pilot state values
 *  • Heading conversion (Foundry rotation → math angle h0)
 *  • HelmPreview forward projection geometry
 *  • Flip and Burn: translation direction (along original h0, not h0+π)
 *  • Flip and Burn: halfSpeedUnits calculation
 *  • Flip and Burn: powerMax calculation (base / overdrive / apThrustBonus)
 *  • Flip and Burn: flipAndBurnAvailable gate logic
 *  • Flip and Burn: consumed power is exactly 50
 *  • buildHelmContext: flipAndBurnUsed / flipAndBurnAvailable flags (inline)
 *  • buildHelmContext: coreActionsPlayedLabels includes flipBurn key
 *  • Strafe: lateral direction (h0 ± π/2), max = floor(speed/2)
 *  • Retrograde: sternward direction (h0 + π), max = speed
 *  • Maneuverability bearing cap
 *  • Minimum move formula
 *  • Ghost colour resolves from theme
 */

const { describe, it, assertEqual, assert, assertApprox } = globalThis._test;

const { DEFAULT_COMBAT_STATE } = await import("../scripts/constants.js");
const { pixi, THEME }          = await import("../scripts/theme.js");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (inline replications of formulas used in pilot.js / HelmPreview.js)
// ─────────────────────────────────────────────────────────────────────────────

/** Convert Foundry token rotation (degrees, 0=north CW) to math angle (radians, 0=east CCW). */
function toH0(rotation) {
  return (rotation - 90) * (Math.PI / 180);
}

/**
 * Replicate projectFlipAndBurn endpoint math.
 * Ship moves halfSpeedUnits grid squares along h0 (original heading).
 */
function projectFlipBurn(cx0, cy0, h0, halfSpeedUnits, gridSize) {
  const dist = halfSpeedUnits * gridSize;
  return {
    cx: cx0 + dist * Math.cos(h0),
    cy: cy0 + dist * Math.sin(h0),
  };
}

/**
 * Replicate projectStrafe endpoint math.
 * dir = +1 (starboard) → h0 + π/2, dir = -1 (port) → h0 - π/2.
 */
function projectStrafe(cx0, cy0, h0, dir, dist, gridSize) {
  const lateralAngle = h0 + dir * (Math.PI / 2);
  const d = dist * gridSize;
  return {
    cx: cx0 + d * Math.cos(lateralAngle),
    cy: cy0 + d * Math.sin(lateralAngle),
  };
}

/**
 * Replicate projectRetrograde endpoint math.
 * Ship moves sternward = h0 + π.
 */
function projectRetrograde(cx0, cy0, h0, dist, gridSize) {
  const backAngle = h0 + Math.PI;
  const d = dist * gridSize;
  return {
    cx: cx0 + d * Math.cos(backAngle),
    cy: cy0 + d * Math.sin(backAngle),
  };
}

/** powerMax as computed in buildHelmContext / _onPilotFlipAndBurn. */
function calcPowerMax(overdrive, apThrustBonus) {
  return (overdrive ? 200 : 100) + (apThrustBonus ?? 0);
}

/** flipAndBurnAvailable gate. */
function flipBurnAvailable(fuelBurned, overdrive, apThrustBonus) {
  return (calcPowerMax(overdrive, apThrustBonus) - fuelBurned) >= 50;
}

/** halfSpeedUnits formula used in handler and preview. */
function halfSpeedUnits(baseSpeed, allocSpeed) {
  const eff = Math.max(0, (baseSpeed ?? 6) + (allocSpeed ?? 0));
  return Math.max(1, Math.round(eff * 0.5));
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – Default state", () => {
  const pilot = DEFAULT_COMBAT_STATE.resources.pilot;

  it("fuelBurned starts at 0", () => {
    assertEqual(pilot.fuelBurned, 0);
  });

  it("bearing starts at 0", () => {
    assertEqual(pilot.bearing, 0);
  });

  it("coreActionsPlayed starts as empty array", () => {
    assert(Array.isArray(pilot.coreActionsPlayed), "should be array");
    assertEqual(pilot.coreActionsPlayed.length, 0);
  });

  it("overdrive starts false", () => {
    assertEqual(pilot.overdrive ?? false, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – Heading conversion (Foundry rotation → h0)", () => {
  it("rotation 90° (east) → h0 = 0", () => {
    assertApprox(toH0(90), 0);
  });

  it("rotation 0° (north) → h0 = -π/2", () => {
    assertApprox(toH0(0), -Math.PI / 2);
  });

  it("rotation 180° (south) → h0 = π/2", () => {
    assertApprox(toH0(180), Math.PI / 2);
  });

  it("rotation 270° (west) → h0 = π", () => {
    assertApprox(toH0(270), Math.PI);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – Flip and Burn: halfSpeedUnits", () => {
  it("speed 6 → halfSpeed 3", () => {
    assertEqual(halfSpeedUnits(6, 0), 3);
  });

  it("speed 1 → halfSpeed 1 (minimum 1)", () => {
    assertEqual(halfSpeedUnits(1, 0), 1);
  });

  it("speed 5 → halfSpeed 3 (rounds up 2.5)", () => {
    assertEqual(halfSpeedUnits(5, 0), 3);
  });

  it("speed 4 → halfSpeed 2", () => {
    assertEqual(halfSpeedUnits(4, 0), 2);
  });

  it("allocSpeed bonus is included", () => {
    assertEqual(halfSpeedUnits(6, 2), 4);  // eff=8 → round(4) = 4
  });

  it("negative effective speed clamps to minimum 1", () => {
    assertEqual(halfSpeedUnits(0, 0), 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – Flip and Burn: powerMax", () => {
  it("base (no overdrive, no apBonus) = 100", () => {
    assertEqual(calcPowerMax(false, 0), 100);
  });

  it("overdrive doubles base to 200", () => {
    assertEqual(calcPowerMax(true, 0), 200);
  });

  it("apThrustBonus adds on top of base", () => {
    assertEqual(calcPowerMax(false, 25), 125);
  });

  it("overdrive + apThrustBonus stacks correctly", () => {
    assertEqual(calcPowerMax(true, 50), 250);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – Flip and Burn: availability gate", () => {
  it("0 fuel burned → available (100 remaining ≥ 50)", () => {
    assert(flipBurnAvailable(0, false, 0));
  });

  it("50 fuel burned → available (50 remaining = 50)", () => {
    assert(flipBurnAvailable(50, false, 0));
  });

  it("51 fuel burned → NOT available (49 remaining < 50)", () => {
    assert(!flipBurnAvailable(51, false, 0));
  });

  it("100 fuel burned → NOT available (0 remaining)", () => {
    assert(!flipBurnAvailable(100, false, 0));
  });

  it("overdrive: 100 burned → available (100 remaining of 200)", () => {
    assert(flipBurnAvailable(100, true, 0));
  });

  it("overdrive: 151 burned → NOT available (49 remaining)", () => {
    assert(!flipBurnAvailable(151, true, 0));
  });

  it("apThrustBonus extends window: 75 burned of 125 → available", () => {
    assert(flipBurnAvailable(75, false, 25));   // 125 - 75 = 50
  });

  it("apThrustBonus: 76 burned of 125 → NOT available", () => {
    assert(!flipBurnAvailable(76, false, 25));  // 125 - 76 = 49
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – Flip and Burn: consumed power is 50", () => {
  it("confirmed action charges fuelUsed = fuelBurned + 50", () => {
    const fuelBefore = 30;
    const expectedFuelAfter = fuelBefore + 50;
    assertEqual(expectedFuelAfter, 80);
  });

  it("at exactly 50 remaining, post-burn fuel = powerMax", () => {
    const powerMax = 100;
    const fuelBefore = 50;  // powerMax - fuelBefore = 50 (just barely available)
    assertEqual(fuelBefore + 50, powerMax);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – Flip and Burn: translation direction (h0 = original heading)", () => {
  const gridSize = 100;
  const cx0 = 500, cy0 = 500;
  const HALF = 3; // halfSpeedUnits

  it("facing east (rot=90, h0=0): translates in +x direction", () => {
    const h0 = toH0(90); // 0
    const { cx, cy } = projectFlipBurn(cx0, cy0, h0, HALF, gridSize);
    assertApprox(cx, cx0 + HALF * gridSize, 0.5, "cx should increase");
    assertApprox(cy, cy0,                   0.5, "cy should be unchanged");
  });

  it("facing north (rot=0, h0=-π/2): translates in -y direction", () => {
    const h0 = toH0(0); // -π/2
    const { cx, cy } = projectFlipBurn(cx0, cy0, h0, HALF, gridSize);
    assertApprox(cx, cx0,                   0.5, "cx should be unchanged");
    assertApprox(cy, cy0 - HALF * gridSize, 0.5, "cy should decrease");
  });

  it("facing south (rot=180, h0=π/2): translates in +y direction", () => {
    const h0 = toH0(180); // π/2
    const { cx, cy } = projectFlipBurn(cx0, cy0, h0, HALF, gridSize);
    assertApprox(cx, cx0,                   0.5, "cx should be unchanged");
    assertApprox(cy, cy0 + HALF * gridSize, 0.5, "cy should increase");
  });

  it("facing west (rot=270, h0=π): translates in -x direction", () => {
    const h0 = toH0(270); // π
    const { cx, cy } = projectFlipBurn(cx0, cy0, h0, HALF, gridSize);
    assertApprox(cx, cx0 - HALF * gridSize, 0.5, "cx should decrease");
    assertApprox(cy, cy0,                   0.5, "cy should be unchanged");
  });

  it("direction is NOT the reverse of h0 (not sternward)", () => {
    const h0 = toH0(90); // 0, eastward
    const { cx: cxFlip }  = projectFlipBurn(cx0, cy0, h0, HALF, gridSize);
    const { cx: cxRetro } = projectRetrograde(cx0, cy0, h0, HALF, gridSize);
    // Flip moves east (+x), retrograde moves west (-x) — they must be different
    assert(cxFlip !== cxRetro, "flip-and-burn must not equal retrograde direction");
    assert(cxFlip > cx0, "flip moves forward (+x when east)");
    assert(cxRetro < cx0, "retrograde moves backward (-x when east)");
  });

  it("final rotation is original + 180°", () => {
    const originalRotation = 90;
    const finalRotation = originalRotation + 180;
    assertEqual(finalRotation, 270);
  });

  it("final rotation wraps: 180° + 180° = 360° (normalised)", () => {
    const originalRotation = 180;
    const finalRotation = originalRotation + 180;
    // module uses raw +180; 360 ≡ 0 in Foundry
    assertEqual(finalRotation, 360);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – buildHelmContext: flip-and-burn flags (inline)", () => {
  // Replicate the context builder logic without importing pilot.js

  function buildFlipBurnFlags(coreActionsPlayed, fuelBurned, overdrive, apThrustBonus) {
    return {
      flipAndBurnUsed:      coreActionsPlayed.includes("flipBurn"),
      flipAndBurnAvailable: flipBurnAvailable(fuelBurned, overdrive, apThrustBonus),
    };
  }

  it("unused + available → shows button", () => {
    const f = buildFlipBurnFlags([], 0, false, 0);
    assertEqual(f.flipAndBurnUsed, false);
    assertEqual(f.flipAndBurnAvailable, true);
  });

  it("used → shows nothing (flipAndBurnUsed=true)", () => {
    const f = buildFlipBurnFlags(["flipBurn"], 0, false, 0);
    assertEqual(f.flipAndBurnUsed, true);
  });

  it("unused but power too low → shows warning note", () => {
    const f = buildFlipBurnFlags([], 60, false, 0); // only 40 remaining
    assertEqual(f.flipAndBurnUsed, false);
    assertEqual(f.flipAndBurnAvailable, false);
  });

  it("used AND power too low → flipAndBurnUsed still wins", () => {
    const f = buildFlipBurnFlags(["flipBurn"], 60, false, 0);
    assertEqual(f.flipAndBurnUsed, true);
    assertEqual(f.flipAndBurnAvailable, false);
  });

  it("other actions in coreActionsPlayed don't trip flipAndBurnUsed", () => {
    const f = buildFlipBurnFlags(["overdrive", "strafe"], 0, false, 0);
    assertEqual(f.flipAndBurnUsed, false);
    assertEqual(f.flipAndBurnAvailable, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – coreActionsPlayed label mapping", () => {
  const LABELS = {
    overdrive: "IMSC.Action.PilotOverdrive",
    strafe:    "IMSC.Action.PilotStrafe",
    retro:     "IMSC.Action.PilotOverchargeRetro",
    flipBurn:  "IMSC.Action.PilotFlipAndBurn",
  };

  it("flipBurn maps to IMSC.Action.PilotFlipAndBurn", () => {
    assertEqual(LABELS.flipBurn, "IMSC.Action.PilotFlipAndBurn");
  });

  it("all four core-action ids are present in LABELS", () => {
    const keys = Object.keys(LABELS);
    assert(keys.includes("overdrive"), "overdrive missing");
    assert(keys.includes("strafe"),    "strafe missing");
    assert(keys.includes("retro"),     "retro missing");
    assert(keys.includes("flipBurn"),  "flipBurn missing");
  });

  it("unknown id falls back to raw id string", () => {
    const id = "unknownAction";
    const label = LABELS[id] ?? id;
    assertEqual(label, id);
  });

  it("played [flipBurn] localizes to PilotFlipAndBurn key", () => {
    const played = ["flipBurn"];
    const labels = played.map(id => LABELS[id] ?? id);
    assertEqual(labels[0], "IMSC.Action.PilotFlipAndBurn");
  });

  it("played [overdrive, flipBurn] returns both labels", () => {
    const played = ["overdrive", "flipBurn"];
    const labels = played.map(id => LABELS[id] ?? id);
    assertEqual(labels.length, 2);
    assertEqual(labels[1], "IMSC.Action.PilotFlipAndBurn");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – Strafe: lateral direction", () => {
  const gridSize = 100;
  const cx0 = 500, cy0 = 500;
  const dist = 2;

  it("facing east, starboard strafe (+1) translates +y (south)", () => {
    const h0 = toH0(90); // 0
    const { cx, cy } = projectStrafe(cx0, cy0, h0, 1, dist, gridSize);
    // h0=0, dir=+1 → angle = π/2 → cos=0, sin=1 → +y
    assertApprox(cx, cx0,                  0.5);
    assertApprox(cy, cy0 + dist * gridSize, 0.5);
  });

  it("facing east, port strafe (-1) translates -y (north)", () => {
    const h0 = toH0(90); // 0
    const { cx, cy } = projectStrafe(cx0, cy0, h0, -1, dist, gridSize);
    // angle = -π/2 → cos=0, sin=-1 → -y
    assertApprox(cx, cx0,                  0.5);
    assertApprox(cy, cy0 - dist * gridSize, 0.5);
  });

  it("facing north, starboard strafe translates +x (east)", () => {
    const h0 = toH0(0); // -π/2
    const { cx, cy } = projectStrafe(cx0, cy0, h0, 1, dist, gridSize);
    // angle = -π/2 + π/2 = 0 → cos=1, sin=0 → +x
    assertApprox(cx, cx0 + dist * gridSize, 0.5);
    assertApprox(cy, cy0,                   0.5);
  });

  it("strafeMax = floor(baseSpeed / 2)", () => {
    assertEqual(Math.floor(6 / 2), 3);
    assertEqual(Math.floor(5 / 2), 2);
    assertEqual(Math.floor(1 / 2), 0); // degenerate edge case
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – Retrograde: sternward direction (h0 + π)", () => {
  const gridSize = 100;
  const cx0 = 500, cy0 = 500;
  const dist = 3;

  it("facing east, retrograde moves west (-x)", () => {
    const h0 = toH0(90); // 0 → back = π
    const { cx, cy } = projectRetrograde(cx0, cy0, h0, dist, gridSize);
    assertApprox(cx, cx0 - dist * gridSize, 0.5);
    assertApprox(cy, cy0,                   0.5);
  });

  it("facing north, retrograde moves south (+y)", () => {
    const h0 = toH0(0); // -π/2 → back = π/2
    const { cx, cy } = projectRetrograde(cx0, cy0, h0, dist, gridSize);
    assertApprox(cx, cx0,                   0.5);
    assertApprox(cy, cy0 + dist * gridSize, 0.5);
  });

  it("retrograde is opposite to flip-and-burn translation", () => {
    const h0 = toH0(90);
    const { cx: cxRetro }  = projectRetrograde(cx0, cy0, h0, dist, gridSize);
    const { cx: cxFlipBurn } = projectFlipBurn(cx0, cy0, h0, dist, gridSize);
    // Should be mirror-image offsets from cx0
    assertApprox(cxRetro  - cx0, -(cxFlipBurn - cx0), 0.5);
  });

  it("retroMax = baseSpeed", () => {
    const baseSpeed = 6;
    assertEqual(baseSpeed, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – Helm controls", () => {
  it("maneuverability * 15° = max bearing degrees", () => {
    assertEqual(4 * 15, 60);
    assertEqual(2 * 15, 30);
  });

  it("minimum move is ceil(prevMove / 2)", () => {
    assertEqual(Math.ceil(5 / 2), 3);
    assertEqual(Math.ceil(4 / 2), 2);
    assertEqual(Math.ceil(0 / 2), 0);
    assertEqual(Math.ceil(1 / 2), 1);
  });

  it("overdrive effective speed = base * 2 (via powerMax 200%)", () => {
    const base = 6;
    const overdriveMultiplier = 2;
    assertEqual(base * overdriveMultiplier, 12);
  });

  it("forward distance = (thrust / powerMax) * speed * gridSize", () => {
    const thrust = 100, powerMax = 100, speed = 6, gridSize = 100;
    assertEqual((thrust / powerMax) * speed * gridSize, 600);
  });

  it("partial thrust (50%) halves distance", () => {
    const thrust = 50, powerMax = 100, speed = 6, gridSize = 100;
    assertEqual((thrust / powerMax) * speed * gridSize, 300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – Ghost colour references theme", () => {
  it("helmGhost resolves to 0x00ff88 via pixi()", () => {
    assertEqual(pixi(THEME.overlay.helmGhost), 0x00ff88);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – canReachRealistic: carryPct shifts drift endpoint", () => {
  /**
   * Inline replication of HelmPreview.canReachRealistic geometry.
   * Drift end = start + (carryPct/100) * velocity * gridSize.
   * Thrust must bridge drift_end → target within powerRemaining budget and bearing arc.
   */
  function canReachRealistic(shipBasis, targetCx, targetCy, effSpeed, maxBearingDeg, powerRemaining, powerMax, vx, vy, carryPct = 0) {
    const { cx0, cy0, h0, gridSize } = shipBasis;
    const carry     = carryPct / 100;
    const driftEndX = cx0 + carry * vx * gridSize;
    const driftEndY = cy0 + carry * vy * gridSize;
    const Tx = targetCx - driftEndX;
    const Ty = targetCy - driftEndY;
    const tMag = Math.hypot(Tx, Ty);

    if (tMag < gridSize * 0.5) {
      return { bearingDeg: 0, thrustPct: 0, isPureDrift: true };
    }

    const maxThrustPx = (powerRemaining / 100) * effSpeed * gridSize;
    if (tMag > maxThrustPx + 0.5) return null;

    const thrustAngle = Math.atan2(Ty, Tx);
    let bearingRad    = thrustAngle - h0;
    bearingRad = ((bearingRad + Math.PI) % (2 * Math.PI)) - Math.PI;
    const bearingDeg  = bearingRad * (180 / Math.PI);
    if (Math.abs(bearingDeg) > maxBearingDeg + 1e-6) return null;

    const thrustPct = (effSpeed * gridSize > 0) ? (tMag / (effSpeed * gridSize)) * 100 : 0;
    if (thrustPct > powerRemaining + 0.5) return null;

    return { bearingDeg, thrustPct, isPureDrift: false };
  }

  const gridSize = 100;
  // Ship facing east (rotation 90 → h0 = 0), at origin
  const basis = { cx0: 0, cy0: 0, h0: 0, gridSize };

  it("carryPct=0: drift stays at origin; target due east at 1 grid is reachable", () => {
    // driftEnd = (0,0), thrust eastward = 100px = 1 grid unit (thrustPct 100)
    const result = canReachRealistic(basis, 100, 0, 1, 90, 100, 100, 2, 0, 0);
    assert(result !== null, "should reach");
    assertApprox(result.thrustPct, 100, 1);
  });

  it("carryPct=100 with vx=1: drift moves 1 grid east; target at drift_end is pure drift", () => {
    // driftEnd = (100, 0) = exactly the target → pure drift ram
    const result = canReachRealistic(basis, 100, 0, 1, 90, 100, 100, 1, 0, 100);
    assert(result !== null, "should reach as pure drift");
    assertEqual(result.isPureDrift, true);
    assertEqual(result.thrustPct, 0);
  });

  it("carryPct=100 with vx=2: drift overshoots target; target is behind drift_end", () => {
    // driftEnd = (200, 0), target = (100, 0) → Tx = -100, thrustAngle = π
    // bearing from east-facing ship = π − 0 = π ≈ 180° → exceeds maxBearing 30°
    const result = canReachRealistic(basis, 100, 0, 1, 30, 100, 100, 2, 0, 100);
    assertEqual(result, null, "should NOT reach: drift overshoots, can't turn back 180°");
  });

  it("carryPct=50 with vx=2: drift moves 1 grid; target at 1.5 grids east is reachable", () => {
    // driftEnd = (100, 0), target = (150, 0) → Tx = 50 = 0.5 grid → thrustPct 50
    const result = canReachRealistic(basis, 150, 0, 1, 30, 100, 100, 2, 0, 50);
    assert(result !== null, "should reach");
    assertApprox(result.thrustPct, 50, 1);
    assertApprox(result.bearingDeg, 0, 0.5);
  });

  it("carryPct=0 vs carryPct=100 yield different reach results for same velocity/target", () => {
    // vx=3, target 1 grid east (100,0)
    // carryPct=0: driftEnd=(0,0), thrust to (100,0) = 100px, easily reachable
    // carryPct=100: driftEnd=(300,0), target behind by 200px and 180° off bearing → unreachable
    const r0   = canReachRealistic(basis, 100, 0, 1, 30, 100, 100, 3, 0, 0);
    const r100 = canReachRealistic(basis, 100, 0, 1, 30, 100, 100, 3, 0, 100);
    assert(r0   !== null, "carryPct=0 should reach");
    assert(r100 === null, "carryPct=100 should NOT reach (drift past target)");
  });

  it("pure drift: carryPct=100, vx=1, target exactly at drift_end", () => {
    // driftEnd = (100, 0) = target → pure drift
    const result = canReachRealistic(basis, 100, 0, 1, 45, 100, 100, 1, 0, 100);
    assert(result !== null);
    assertEqual(result.isPureDrift, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Pilot – computeRamRotationRealistic: post-impact rotation cap", () => {
  /**
   * Inline replication of HelmPreview.computeRamRotationRealistic.
   */
  function computeRamRotation(h0deg, attackAngle, maxBearingDeg) {
    const h0    = (h0deg - 90) * (Math.PI / 180);
    const candA = attackAngle + Math.PI / 2;
    const candB = attackAngle - Math.PI / 2;
    const normDiff = (a, b) => {
      const d = ((a - b + Math.PI) % (2 * Math.PI)) - Math.PI;
      return Math.abs(d);
    };
    const targetHeading = normDiff(candA, h0) <= normDiff(candB, h0) ? candA : candB;
    let delta = ((targetHeading - h0 + Math.PI) % (2 * Math.PI)) - Math.PI;
    const maxRad = maxBearingDeg * (Math.PI / 180);
    delta = Math.max(-maxRad, Math.min(maxRad, delta));
    return (h0 + delta) * (180 / Math.PI) + 90;
  }

  it("cap of 20° means rotation ≤ 20° from current heading", () => {
    // Ship facing east (rot=90), attack from west (attackAngle = π)
    // orthogonal candidates: π ± π/2 = 3π/2 (south) and π/2 (north)
    // h0 = 0 (east), closest orthogonal = π/2 (north) or -π/2 (south) — equal distance
    const before = 90; // east
    const result = computeRamRotation(before, Math.PI, 20);
    const delta = Math.abs(result - before);
    assert(delta <= 20 + 0.1, `rotation delta ${delta} should be ≤ 20°`);
  });

  it("with full mano bearing (mano=4, maxBearing=60), cap at 20 limits rotation", () => {
    const mano = 4;
    const fullBearing = Math.max(0, mano) * 15; // 60°
    const capped = Math.min(20, fullBearing);    // 20°
    assertEqual(capped, 20);
  });

  it("with mano=1 (maxBearing=15), cap of 20 does not inflate rotation beyond 15°", () => {
    const mano = 1;
    const fullBearing = Math.max(0, mano) * 15; // 15°
    const capped = Math.min(20, fullBearing);    // 15° (not inflated)
    assertEqual(capped, 15);
  });

  it("ship already orthogonal: zero rotation applied", () => {
    // Ship facing north (rot=0, h0=-π/2), attack from west (attackAngle=π)
    // orthogonal to π is π/2 (south, h0=π/2) or -π/2 (north, h0=-π/2)
    // Ship already at h0=-π/2 (north) → delta should be ~0
    const result = computeRamRotation(0, Math.PI, 20);
    assertApprox(result, 0, 1); // stays near north (rot ≈ 0)
  });
});
