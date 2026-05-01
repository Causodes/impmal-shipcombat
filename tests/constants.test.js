/**
 * constants.test.js – Tests for scripts/constants.js
 */

const { describe, it, assertEqual, assert } = globalThis._test;

const {
  MODULE_ID, ROLES, ROLE_ACTIONS,
  MACRO_FIRE_TIERS, LANCE_CHARGE_TIERS,
  DEFAULT_COMBAT_STATE,
} = await import("../scripts/constants.js");

describe("constants.js – MODULE_ID", () => {
  it("is 'impmal-shipcombat'", () => {
    assertEqual(MODULE_ID, "impmal-shipcombat");
  });
});

describe("constants.js – ROLES", () => {
  it("has exactly 6 roles", () => {
    assertEqual(Object.keys(ROLES).length, 6);
  });

  it("each role has required fields", () => {
    for (const [id, role] of Object.entries(ROLES)) {
      assertEqual(role.id, id, `${id}.id matches key`);
      assert(typeof role.label === "string", `${id}.label is string`);
      assert(typeof role.icon === "string", `${id}.icon is string`);
      assert(typeof role.color === "string", `${id}.color is hex string`);
      assert(role.color.startsWith("#"), `${id}.color starts with #`);
    }
  });

  it("role colors come from theme (hex format)", () => {
    // All colors should be 7-char hex strings
    for (const role of Object.values(ROLES)) {
      assert(role.color.match(/^#[0-9a-f]{6}$/), `${role.id} color ${role.color} is valid hex`);
    }
  });
});

describe("constants.js – ROLE_ACTIONS", () => {
  it("has entries for all 6 roles", () => {
    for (const roleId of Object.keys(ROLES)) {
      assert(ROLE_ACTIONS[roleId], `Missing ROLE_ACTIONS for ${roleId}`);
      assert(ROLE_ACTIONS[roleId].standard, `${roleId} missing .standard`);
      assert(ROLE_ACTIONS[roleId].overcharged, `${roleId} missing .overcharged`);
    }
  });
});

describe("constants.js – MACRO_FIRE_TIERS", () => {
  it("has 5 tiers", () => {
    assertEqual(MACRO_FIRE_TIERS.length, 5);
  });

  it("ammo costs increase monotonically", () => {
    for (let i = 1; i < MACRO_FIRE_TIERS.length; i++) {
      assert(
        MACRO_FIRE_TIERS[i].ammo >= MACRO_FIRE_TIERS[i - 1].ammo,
        `Tier ${i}: ammo should be >= previous`
      );
    }
  });

  it("first tier is exclusive (Ranging Fire)", () => {
    assert(MACRO_FIRE_TIERS[0].exclusive === true);
  });
});

describe("constants.js – LANCE_CHARGE_TIERS", () => {
  it("has 4 tiers", () => {
    assertEqual(LANCE_CHARGE_TIERS.length, 4);
  });

  it("tiers cover charge range 1-20 with no gaps", () => {
    let covered = 0;
    for (const tier of LANCE_CHARGE_TIERS) {
      for (let c = tier.min; c <= tier.max; c++) covered++;
    }
    assertEqual(covered, 20, "Should cover charges 1-20");
  });
});

describe("constants.js – DEFAULT_COMBAT_STATE", () => {
  it("starts inactive", () => {
    assertEqual(DEFAULT_COMBAT_STATE.active, false);
  });

  it("starts at round 0", () => {
    assertEqual(DEFAULT_COMBAT_STATE.round, 0);
  });

  it("has resources for enginseer with heat 0", () => {
    assertEqual(DEFAULT_COMBAT_STATE.resources.enginseer.heat, 0);
  });

  it("enginseer powerCores starts at 0 (reactor component not yet installed)", () => {
    assertEqual(DEFAULT_COMBAT_STATE.resources.enginseer.powerCores, 0);
  });
});
