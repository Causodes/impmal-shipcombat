/**
 * ImpmalAdapter – Imperium Maledictum implementation of SystemAdapter.
 *
 * Bridges the Ship Combat module to:
 *   - IMActorSheet & WarhammerItemSheetV2 (sheet base classes)
 *   - BaseWarhammerActorModel & BaseWarhammerItemModel (data model bases)
 *   - crewActor.setupSkillTest({ key, name }, { modifier }) (skill test API)
 *   - game.impmal.config.availability (config lookups)
 */

import { SystemAdapter } from "./SystemAdapter.js";

// ── Skill map ────────────────────────────────────────────────────────────────
// Abstract role-skill identifiers → impmal's { key, name } pattern.
const SKILL_MAP = {
  leadership:  { key: "presence",  name: "Leadership" },
  engineering: { key: "tech",       name: "Engineering" },
  pilot:       { key: "piloting",   name: "Major Voidship" },
  sensors:     { key: "intuition",  name: "Surroundings" },
  ordnance:    { key: "athletics",  name: "Might" },
  gunner:      { key: "ranged",     name: "Ordnance" },
  navigation:  { key: "navigation", name: "Warp" },
};

export class ImpmalAdapter extends SystemAdapter {

  get systemName() { return "Imperium Maledictum"; }

  /* ── Base classes ──────────────────────────────────────────────────────── */

  get SheetBaseClass() {
    return IMActorSheet;
  }

  get ActorModelBaseClass() {
    return warhammer.models.BaseWarhammerActorModel;
  }

  get ItemModelBaseClass() {
    return warhammer.models.BaseWarhammerItemModel;
  }

  get ItemSheetBaseClass() {
    return warhammer.apps.WarhammerItemSheetV2;
  }

  /* ── Skill tests ───────────────────────────────────────────────────────── */

  resolveSkill(roleSkill) {
    const entry = SKILL_MAP[roleSkill];
    if (!entry) throw new Error(`ImpmalAdapter: unknown roleSkill "${roleSkill}"`);
    return { ...entry };
  }

  async rollSkillTest(crewActor, roleSkill, options = {}) {
    const { key, name } = this.resolveSkill(roleSkill);
    const test = await crewActor.setupSkillTest(
      { key, name },
      { modifier: options.modifier ?? 0 },
    );
    if (!test) return null;
    return {
      SL:        test.result?.SL ?? 0,
      succeeded: (test.result?.SL ?? 0) >= 0,
      roll:      test.result?.roll ?? null,
      messageId: test.context?.messageId ?? test.message?.id ?? "",
    };
  }

  /* ── System config ─────────────────────────────────────────────────────── */

  getAvailabilityOptions() {
    return game.impmal?.config?.availability ?? {};
  }

  /* ── Model stubs ───────────────────────────────────────────────────────── */

  initModelStubs(model) {
    model._addModelProperties();
    model.characteristics = {};
    model.skills = {};
  }

  deriveModelData(model) {
    // HealthEstimate integration
    model.combat.wounds.value = model.hull.max - model.hull.value;
    model.combat.wounds.max   = model.hull.max;
  }
}
