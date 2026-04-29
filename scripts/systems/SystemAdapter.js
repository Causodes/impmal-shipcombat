/**
 * SystemAdapter – abstract interface that isolates system-specific logic.
 *
 * Each TTRPG system (Imperium Maledictum, etc.) provides a concrete subclass
 * registered at module init.  All system-specific calls throughout the module
 * route through `SystemAdapter.current`.
 *
 * USAGE:
 *   import { SystemAdapter } from "./SystemAdapter.js";
 *   const adapter = SystemAdapter.current;
 *   await adapter.rollSkillTest(actor, "pilot");
 */

export class SystemAdapter {

  /* ── Registry ──────────────────────────────────────────────────────────── */

  /** @type {SystemAdapter|null} */
  static _current = null;

  /** Register the active adapter (called once at init). */
  static register(adapter) {
    if (!(adapter instanceof SystemAdapter))
      throw new Error("SystemAdapter.register() requires a SystemAdapter instance.");
    this._current = adapter;
  }

  /** @returns {SystemAdapter} */
  static get current() {
    if (!this._current) throw new Error("No SystemAdapter registered. Call SystemAdapter.register() during init.");
    return this._current;
  }

  /* ── Identity ──────────────────────────────────────────────────────────── */

  /** Human-readable system name for logging / tooltips. */
  get systemName() { throw new Error("Not implemented"); }

  /* ── Base classes ──────────────────────────────────────────────────────── */

  /**
   * Return the ApplicationV2 (or subclass) to use as the base for ShipSheet.
   * Must support warhammer-lib mixin interface if warhammer-lib is present.
   * @returns {typeof Application}
   */
  get SheetBaseClass() { throw new Error("Not implemented"); }

  /**
   * Return the base data-model class for actor models (e.g. BaseWarhammerActorModel).
   * @returns {typeof foundry.abstract.DataModel}
   */
  get ActorModelBaseClass() { throw new Error("Not implemented"); }

  /**
   * Return the base data-model class for item models.
   * @returns {typeof foundry.abstract.DataModel}
   */
  get ItemModelBaseClass() { throw new Error("Not implemented"); }

  /**
   * Return the ApplicationV2 (or subclass) to use as the base for item sheets.
   * @returns {typeof Application}
   */
  get ItemSheetBaseClass() { throw new Error("Not implemented"); }

  /* ── Skill tests ───────────────────────────────────────────────────────── */

  /**
   * Map a role-based skill key to whatever the underlying system requires.
   *
   * @param {"pilot"|"engineering"|"sensors"|"ordnance"|"leadership"|"navigation"} roleSkill
   * @returns {{ key: string, specialisation: string }} system-specific skill descriptor
   */
  resolveSkill(roleSkill) { throw new Error("Not implemented"); }

  /**
   * Invoke the system's roll workflow for a given crew actor.
   *
   * @param {Actor}  crewActor      – the character linked to the bridge role
   * @param {string} roleSkill      – abstract skill identifier (see resolveSkill)
   * @param {object} [options]      – extra options (modifier, fastForward, etc.)
   * @returns {Promise<{SL: number, succeeded: boolean, roll: Roll}>}
   */
  async rollSkillTest(crewActor, roleSkill, options = {}) { throw new Error("Not implemented"); }

  /* ── System config access ──────────────────────────────────────────────── */

  /**
   * Return an object of { key: label } pairs for item availability dropdowns.
   * @returns {Record<string, string>}
   */
  getAvailabilityOptions() { return {}; }

  /* ── Model interface stubs ─────────────────────────────────────────────── */

  /**
   * Called during `computeBase()` on the actor model. Provide any interface
   * stubs the system expects to find on `actor.system` (characteristics, skills, etc.).
   * @param {object} model – the ShipModel instance
   */
  initModelStubs(model) {}

  /**
   * Called during `computeDerived()` on the actor model (after items resolved).
   * @param {object} model – the ShipModel instance
   */
  deriveModelData(model) {}
}
