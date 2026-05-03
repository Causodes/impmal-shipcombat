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

// ── Spec cache (loaded lazily from the impmal-core compendium) ──────────────
let _allSpecsCache = null;

/**
 * Returns every Specialisation item from the impmal-core.items compendium as a
 * flat array of { value, skillKey, specName, label } objects, sorted by label.
 * The value is "skillKey|specName" – the same format stored in roleSkillOverrides.
 * Result is cached after the first successful load.
 */
export async function loadAllSpecialisations() {
  if (_allSpecsCache) return _allSpecsCache;
  const pack = game.packs.get("impmal-core.items");
  if (!pack) return (_allSpecsCache = []);
  const docs = await pack.getDocuments({ type: "specialisation" });
  const skillLabels = game.impmal?.config?.skills ?? {};
  _allSpecsCache = docs
    .filter(d => d.system?.skill)
    .map(d => ({
      value:    `${d.system.skill}|${d.name}`,
      skillKey: d.system.skill,
      specName: d.name,
      label:    `${game.i18n.localize(skillLabels[d.system.skill] ?? d.system.skill)} (${d.name})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return _allSpecsCache;
}

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
    if (SKILL_MAP[roleSkill]) return { ...SKILL_MAP[roleSkill] };
    // Also accept pipe-separated "skillKey|specName" format (from roleSkillOverrides).
    if (roleSkill?.includes("|")) {
      const idx  = roleSkill.indexOf("|");
      const key  = roleSkill.slice(0, idx);
      const name = roleSkill.slice(idx + 1);
      return { key, name };
    }
    throw new Error(`ImpmalAdapter: unknown roleSkill "${roleSkill}"`);
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
