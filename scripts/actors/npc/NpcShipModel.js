/**
 * NpcShipModel  -  simplified ship actor data model for GM-controlled NPC vessels.
 *
 * Key differences from the player ShipModel:
 *   - No roles, crew assignments, power cores, or doctrine.
 *   - Shields auto-fill to sector max at the start of every round.
 *   - Three manually-adjustable ammo tracks for ordnance.
 *   - Flat attribute fields for NPC skill checks (Piloting, Tech, Gunnery).
 *   - Heat and Internal Fire with a one-action-per-turn suppress/reduce pair.
 *   - All NPC ships are treated as Lock 3 by default (no augur).
 */

import { MODULE_ID } from "../../constants.js";

export class NpcShipModel extends warhammer.models.BaseWarhammerActorModel {

  itemIsAllowed(item) {
    if (item.type === `${MODULE_ID}.component`) return true;
    ui.notifications.error("IMSC.Warning.OnlyComponents", { localize: true });
    return false;
  }

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // ── Ship Identity ─────────────────────────────────────────────────────
    schema.classification = new fields.StringField({ initial: "" });
    schema.model          = new fields.StringField({ initial: "" });
    schema.shipFaction    = new fields.StringField({ initial: "" });
    schema.shipRole       = new fields.StringField({ initial: "" });

    // ── Combat meta ─────────────────────────────────────────────────────────
    schema.active = new fields.BooleanField({ initial: false });
    schema.round  = new fields.NumberField({ initial: 0, min: 0, integer: true });

    // ── Hull ─────────────────────────────────────────────────────────────────
    schema.hull = new fields.SchemaField({
      value: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      max:   new fields.NumberField({ initial: 50, min: 0, integer: true }),
    });

    // ── Per-sector void shield integrity ─────────────────────────────────────
    schema.shields = new fields.SchemaField({
      bow:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
      stern:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
      port:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
      starboard: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Per-sector shield max (auto-fill each turn) ──────────────────────────
    schema.shieldMax = new fields.SchemaField({
      bow:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
      stern:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
      port:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
      starboard: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Per-sector armour (current  -  directly editable, reduced by rend events) ─
    schema.armour = new fields.SchemaField({
      bow:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
      stern:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
      port:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
      starboard: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Per-sector armour base (max  -  configured value, used to reset current) ─
    schema.armourBase = new fields.SchemaField({
      bow:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
      stern:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
      port:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
      starboard: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Per-sector accumulated rend damage (kept for combat tracking) ─────────
    schema.armourRend = new fields.SchemaField({
      bow:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
      stern:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
      port:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
      starboard: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Movement ─────────────────────────────────────────────────────────────
    schema.movement = new fields.SchemaField({
      speed:              new fields.NumberField({ initial: 0, min: 0, integer: true }),
      maneuverability:    new fields.NumberField({ initial: 0, min: 0, integer: true }),
      baseSpeed:          new fields.NumberField({ initial: 0, min: 0, integer: true }),
      baseManeuverability: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Heat & Internal Fire ─────────────────────────────────────────────────
    schema.heat         = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.heatMax      = new fields.NumberField({ initial: 10, min: 1, integer: true });
    schema.internalFire = new fields.NumberField({ initial: 0, min: 0, integer: true });

    // ── Crit conditions ──────────────────────────────────────────────────────
    // Each location holds {} (no condition) or { tier: "low"|"medium"|"high", ...meta }
    schema.conditions = new fields.SchemaField({
      hull:           new fields.ObjectField({ initial: {} }),
      engines:        new fields.ObjectField({ initial: {} }),
      manoeuvring:    new fields.ObjectField({ initial: {} }),
      coreSystems:    new fields.ObjectField({ initial: {} }),
      weaponsSensors: new fields.ObjectField({ initial: {} }),
    });

    // ── Enginseer action lock (fire suppress vs heat reduce, mutually exclusive)
    schema.engActionUsed = new fields.BooleanField({ initial: false });

    // ── Voidshield Flux (configured max, and per-turn remaining counter) ─────
    schema.voidshieldFlux          = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.voidshieldFluxRemaining = new fields.NumberField({ initial: 0, integer: true });

    // ── NPC Attributes (for flat skill tests) ────────────────────────────────
    schema.attributes = new fields.SchemaField({
      piloting: new fields.NumberField({ initial: 40, integer: true }),
      tech:     new fields.NumberField({ initial: 40, integer: true }),
      gunnery:  new fields.NumberField({ initial: 40, integer: true }),
    });

    // ── Auto-scan range (VU within which targets are auto-locked) ────────────
    schema.autoScanRange = new fields.NumberField({ initial: 0, min: 0, integer: true });

    // ── Auspex stats (flat fields  -  player ships derive these from components) ─
    schema.auspexBandSize = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.auspexRating   = new fields.NumberField({ initial: 0, min: 0, integer: true });

    // ── Three ammo tracks ────────────────────────────────────────────────────
    schema.ammoTracks = new fields.SchemaField({
      a: new fields.SchemaField({
        label: new fields.StringField({ initial: "Macrocannon" }),
        value: new fields.NumberField({ initial: 0, min: 0, integer: true }),
        max:   new fields.NumberField({ initial: 10, min: 0, integer: true }),
      }),
      b: new fields.SchemaField({
        label: new fields.StringField({ initial: "Lance" }),
        value: new fields.NumberField({ initial: 0, min: 0, integer: true }),
        max:   new fields.NumberField({ initial: 10, min: 0, integer: true }),
      }),
      c: new fields.SchemaField({
        label: new fields.StringField({ initial: "Torpedo" }),
        value: new fields.NumberField({ initial: 0, min: 0, integer: true }),
        max:   new fields.NumberField({ initial: 10, min: 0, integer: true }),
      }),
    });

    // ── Weapon & Equipment slots ─────────────────────────────────────────────
    schema.weaponSlots = new fields.SchemaField({
      port:      new fields.NumberField({ initial: 1, min: 0, integer: true }),
      starboard: new fields.NumberField({ initial: 1, min: 0, integer: true }),
      prow:      new fields.NumberField({ initial: 1, min: 0, integer: true }),
      dorsal:    new fields.NumberField({ initial: 1, min: 0, integer: true }),
      stern:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    schema.equipmentSlots = new fields.SchemaField({
      shields:    new fields.NumberField({ initial: 1, min: 0, integer: true }),
      armour:     new fields.NumberField({ initial: 1, min: 0, integer: true }),
      engine:     new fields.NumberField({ initial: 1, min: 0, integer: true }),
      auspex:     new fields.NumberField({ initial: 1, min: 0, integer: true }),
      reactor:    new fields.NumberField({ initial: 1, min: 0, integer: true }),
      weaponsBay: new fields.NumberField({ initial: 1, min: 0, integer: true }),
    });

    schema.ordnanceSlots = new fields.SchemaField({
      torpedo:     new fields.NumberField({ initial: 1, min: 0, integer: true }),
      strikeCraft: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      weaponsBay:  new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Ordnance actor templates (torpedo / strikeCraft drop-and-launch) ────
    schema.ordnanceActors = new fields.SchemaField({
      torpedo:     new fields.ArrayField(new fields.ObjectField()),
      strikeCraft: new fields.ArrayField(new fields.ObjectField()),
    });
    // ── Allowed spawn sides for ordnance launches ─────────────────────────────
    const _sidesSchema = () => new fields.SchemaField({
      bow:       new fields.BooleanField({ initial: true }),
      port:      new fields.BooleanField({ initial: true }),
      starboard: new fields.BooleanField({ initial: true }),
      stern:     new fields.BooleanField({ initial: true }),
    });
    schema.ordnanceLaunchSides = new fields.SchemaField({
      torpedo:    _sidesSchema(),
      strikeCraft: _sidesSchema(),
    });

    // ── Resources (helm + gunner state, mirrors player ship for UI compat) ──
    schema.resources = new fields.SchemaField({
      pilot: new fields.SchemaField({
        pilotingSL:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
        allocSpeed:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
        allocMano:        new fields.NumberField({ initial: 0, min: 0, integer: true }),
        allocEvasion:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
        fuelBurned:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
        prevTurnMove:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
        bearing:          new fields.NumberField({ initial: 0, integer: true }),
        bearingUsed:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
        momentumUsed:     new fields.NumberField({ initial: 0, min: 0 }),
        velocityX:        new fields.NumberField({ initial: 0 }),
        velocityY:        new fields.NumberField({ initial: 0 }),
        overdrive:        new fields.BooleanField({ initial: false }),
        helmResetId:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
        pilotingMessageId: new fields.StringField({ initial: "" }),
        prowGunLocked:    new fields.BooleanField({ initial: false }),
        ramAllocLocked:   new fields.BooleanField({ initial: false }),
      }),
      gunner: new fields.SchemaField({
        ammo:             new fields.NumberField({ initial: 0,  min: 0, integer: true }),
        power:            new fields.NumberField({ initial: 0,  min: 0, integer: true }),
        ammoMax:          new fields.NumberField({ initial: 20, min: 1, integer: true }),
        powerMax:         new fields.NumberField({ initial: 20, min: 1, integer: true }),
        ordnanceSL:       new fields.NumberField({ initial: 0,  min: 0, integer: true }),
        allocAccuracy:    new fields.NumberField({ initial: 0,  min: 0, integer: true }),
        allocPenetration: new fields.NumberField({ initial: 0,  min: 0, integer: true }),
        allocFirepower:   new fields.NumberField({ initial: 0,  min: 0, integer: true }),
        ordnanceRolled:   new fields.BooleanField({ initial: false }),
        slLocked:         new fields.BooleanField({ initial: false }),
      }),
    });

    // ── Notes ────────────────────────────────────────────────────────────────
    schema.notes = new fields.SchemaField({
      gm: new fields.HTMLField({ initial: "" }),
    });


    // ── Combat stub (HealthEstimate / CombatTracker compatibility) ────────────
    schema.combat = new fields.SchemaField({
      action:     new fields.StringField({ initial: "" }),
      initiative: new fields.NumberField({ initial: 0, integer: true }),
      wounds: new fields.SchemaField({
        value: new fields.NumberField({ initial: 0, min: 0, integer: true }),
        max:   new fields.NumberField({ initial: 0, min: 0, integer: true }),
      }),
    });

    return schema;
  }

  // ── warhammer-lib / impmal interface stubs ──────────────────────────────
  computeBase() {
    this._addModelProperties();
    this.characteristics = {};
    this.skills = {};
  }

  computeDerived() {
    this.combat.wounds.value = this.hull.max - this.hull.value;
    this.combat.wounds.max   = this.hull.max;

    // Derive movement stats from installed engine component
    const engine = this.parent?.items?.find(
      i => i.type === `${MODULE_ID}.component` && i.system.slot === "engine"
    );
    if (engine) {
      this.movement.baseSpeed           = engine.system.speed           ?? this.movement.baseSpeed;
      this.movement.baseManeuverability = engine.system.maneuverability ?? this.movement.baseManeuverability;
    }

    // Derive working speed/maneuverability from base values so header edits propagate immediately.
    this.movement.speed           = this.movement.baseSpeed;
    this.movement.maneuverability = this.movement.baseManeuverability;

    // Engine crit condition: −1/−2/−4 Speed
    const engineCondTier = this.conditions?.engines?.tier;
    if (engineCondTier) {
      const speedPenalty = { low: 1, medium: 2, high: 4 };
      this.movement.speed = Math.max(1, this.movement.speed - (speedPenalty[engineCondTier] ?? 0));
    }

    // Manoeuvring crit condition: −1/−2/−4 Maneuverability
    const manoCondTier = this.conditions?.manoeuvring?.tier;
    if (manoCondTier) {
      const manoPenalty = { low: 1, medium: 2, high: 4 };
      this.movement.maneuverability = Math.max(0, this.movement.maneuverability - (manoPenalty[manoCondTier] ?? 0));
    }

    // Apply accumulated rend for tracking: stored armour is already the current value
    // (directly managed by combat system and GM; armourRend kept for tracking only)
  }

  getOtherEffects()          { return []; }
  effectIsApplicable(_effect){ return true; }
  effectIncluded(_effect)    { return true; }
}
