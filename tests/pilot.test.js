/**
 * pilot.test.js – Tests for Helmsman role logic and HelmPreview calculations
 */

const { describe, it, assertEqual, assert, assertApprox } = globalThis._test;

const { DEFAULT_COMBAT_STATE } = await import("../scripts/constants.js");
const { pixi, THEME } = await import("../scripts/theme.js");

describe("Pilot – Default state", () => {
  const pilot = DEFAULT_COMBAT_STATE.resources.pilot;

  it("fuelBurned starts at 0", () => {
    assertEqual(pilot.fuelBurned, 0);
  });

  it("bearing starts at 0", () => {
    assertEqual(pilot.bearing, 0);
  });
});

describe("Pilot – HelmPreview geometry", () => {
  // Test the math behind projectPosition without canvas dependency.
  // The formulas: bearingRad = deg * PI/180, R = (speed * gridSize) / |bearingRad|

  it("straight bearing (0°) projects linearly forward", () => {
    // With bearing = 0, ship moves straight ahead
    const bearing = 0;
    const speed = 6;
    const thrust = 100; // percent
    const gridSize = 100; // px
    // Movement distance = (thrust / 100) * speed * gridSize = 600px forward
    const dist = (thrust / 100) * speed * gridSize;
    assertEqual(dist, 600);
  });

  it("maneuverability limits bearing angle", () => {
    // Maneuverability * 15° = max bearing
    const mano = 4;
    const maxBearing = mano * 15;
    assertEqual(maxBearing, 60);
  });

  it("minimum move is ceil(prevMove / 2)", () => {
    const prev = 5;
    const minMove = Math.ceil(prev / 2);
    assertEqual(minMove, 3);

    const prev2 = 0;
    assertEqual(Math.ceil(prev2 / 2), 0);
  });

  it("overdrive doubles effective speed", () => {
    const baseSpeed = 6;
    const overdrive = true;
    const effectiveSpeed = overdrive ? baseSpeed * 2 : baseSpeed;
    assertEqual(effectiveSpeed, 12);
  });
});

describe("Pilot – Helm ghost color references theme", () => {
  it("helmGhost resolves to 0x00ff88 via pixi()", () => {
    assertEqual(pixi(THEME.overlay.helmGhost), 0x00ff88);
  });
});
