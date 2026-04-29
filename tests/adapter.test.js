/**
 * adapter.test.js – Tests for SystemAdapter and ImpmalAdapter
 */

const { describe, it, assertEqual, assert, assertThrows } = globalThis._test;

const { SystemAdapter } = await import("../scripts/systems/SystemAdapter.js");
const { ImpmalAdapter } = await import("../scripts/systems/impmal-adapter.js");

describe("SystemAdapter – Registry", () => {

  it("throws when no adapter registered", () => {
    SystemAdapter._current = null;
    assertThrows(() => SystemAdapter.current, "Should throw when unregistered");
  });

  it("register() accepts a valid adapter", () => {
    const adapter = new ImpmalAdapter();
    SystemAdapter.register(adapter);
    assertEqual(SystemAdapter.current, adapter);
  });

  it("register() rejects non-adapter", () => {
    assertThrows(() => SystemAdapter.register({}), "Should reject non-adapter");
  });
});

describe("ImpmalAdapter – Identity", () => {
  const adapter = new ImpmalAdapter();

  it("systemName is 'Imperium Maledictum'", () => {
    assertEqual(adapter.systemName, "Imperium Maledictum");
  });
});

describe("ImpmalAdapter – Skill resolution", () => {
  const adapter = new ImpmalAdapter();

  it("resolves 'pilot' to { key: 'piloting', name: 'Major Voidship' }", () => {
    const skill = adapter.resolveSkill("pilot");
    assertEqual(skill.key, "piloting");
    assertEqual(skill.name, "Major Voidship");
  });

  it("resolves 'engineering' to { key: 'tech', name: 'Engineering' }", () => {
    const skill = adapter.resolveSkill("engineering");
    assertEqual(skill.key, "tech");
    assertEqual(skill.name, "Engineering");
  });

  it("resolves 'sensors' to { key: 'intuition', name: 'Surroundings' }", () => {
    const skill = adapter.resolveSkill("sensors");
    assertEqual(skill.key, "intuition");
    assertEqual(skill.name, "Surroundings");
  });

  it("resolves 'ordnance' to { key: 'athletics', name: 'Might' }", () => {
    const skill = adapter.resolveSkill("ordnance");
    assertEqual(skill.key, "athletics");
    assertEqual(skill.name, "Might");
  });

  it("resolves 'gunner' to { key: 'ranged', name: 'Ordnance' }", () => {
    const skill = adapter.resolveSkill("gunner");
    assertEqual(skill.key, "ranged");
    assertEqual(skill.name, "Ordnance");
  });

  it("resolves 'leadership' to { key: 'presence', name: 'Leadership' }", () => {
    const skill = adapter.resolveSkill("leadership");
    assertEqual(skill.key, "presence");
    assertEqual(skill.name, "Leadership");
  });

  it("resolves 'navigation' to { key: 'navigation', name: 'Warp' }", () => {
    const skill = adapter.resolveSkill("navigation");
    assertEqual(skill.key, "navigation");
    assertEqual(skill.name, "Warp");
  });

  it("throws on unknown role skill", () => {
    assertThrows(() => adapter.resolveSkill("unknown"), "Should throw for unknown skill");
  });
});

describe("ImpmalAdapter – Base classes", () => {
  const adapter = new ImpmalAdapter();

  it("SheetBaseClass returns IMActorSheet", () => {
    assertEqual(adapter.SheetBaseClass, IMActorSheet);
  });

  it("ActorModelBaseClass returns BaseWarhammerActorModel", () => {
    assertEqual(adapter.ActorModelBaseClass, warhammer.models.BaseWarhammerActorModel);
  });

  it("ItemModelBaseClass returns BaseWarhammerItemModel", () => {
    assertEqual(adapter.ItemModelBaseClass, warhammer.models.BaseWarhammerItemModel);
  });

  it("ItemSheetBaseClass returns WarhammerItemSheetV2", () => {
    assertEqual(adapter.ItemSheetBaseClass, warhammer.apps.WarhammerItemSheetV2);
  });
});

describe("ImpmalAdapter – rollSkillTest", () => {
  const adapter = new ImpmalAdapter();

  it("returns null when crewActor.setupSkillTest returns null", async () => {
    const mockActor = {
      setupSkillTest: async () => null,
    };
    const result = await adapter.rollSkillTest(mockActor, "pilot");
    assertEqual(result, null);
  });

  it("returns structured result from successful test", async () => {
    const mockActor = {
      setupSkillTest: async () => ({
        result: { SL: 3, roll: { total: 25 } },
        context: { messageId: "msg123" },
      }),
    };
    const result = await adapter.rollSkillTest(mockActor, "engineering", { modifier: -10 });
    assertEqual(result.SL, 3);
    assertEqual(result.succeeded, true);
    assertEqual(result.messageId, "msg123");
  });

  it("passes modifier through to setupSkillTest", async () => {
    let capturedOpts;
    const mockActor = {
      setupSkillTest: async (skillDesc, opts) => {
        capturedOpts = opts;
        return { result: { SL: 0 }, context: {} };
      },
    };
    await adapter.rollSkillTest(mockActor, "sensors", { modifier: -20 });
    assertEqual(capturedOpts.modifier, -20);
  });
});

describe("ImpmalAdapter – getAvailabilityOptions", () => {
  const adapter = new ImpmalAdapter();

  it("returns empty object when game.impmal is undefined", () => {
    game.impmal = undefined;
    const result = adapter.getAvailabilityOptions();
    assertEqual(JSON.stringify(result), "{}");
  });

  it("returns config.availability when available", () => {
    game.impmal = { config: { availability: { common: "Common", rare: "Rare" } } };
    const result = adapter.getAvailabilityOptions();
    assertEqual(result.common, "Common");
    assertEqual(result.rare, "Rare");
    game.impmal = undefined; // cleanup
  });
});
