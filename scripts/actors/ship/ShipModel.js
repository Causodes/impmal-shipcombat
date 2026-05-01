import { MODULE_ID } from "../../constants.js";

// StandardActorModel is a closure-local class inside the impmal system's classic
// script and is never exposed on globalThis. Extending it from an ES module
// would silently set up a broken prototype chain. We extend the publicly
// exported base class from warhammer-lib and provide all the interface stubs
// that the underlying system calls on actor.system.
//
// To swap to a different system, replace the base class below and update
// SystemAdapter with a matching adapter implementation.
export class ShipModel extends warhammer.models.BaseWarhammerActorModel {

  // Only voidship components may be embedded on the ship actor.
  itemIsAllowed(item) {
    if (item.type === `${MODULE_ID}.component`) return true;
    ui.notifications.error("IMSC.Warning.OnlyComponents", { localize: true });
    return false;
  }

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // ── Combat meta ─────────────────────────────────────────────────────────
    schema.active    = new fields.BooleanField({ initial: false });
    schema.round     = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.crewSize  = new fields.NumberField({ initial: 6, min: 3, max: 6, integer: true });

    // ── Bridge crew assignments { [userId]: roleId } ─────────────────────
    schema.roles         = new fields.ObjectField({ initial: {} });
    // ── Vehicle-style actor references { [roleId]: { uuid, id, name, img } }
    schema.crewActors    = new fields.ObjectField({ initial: {} });
    // ── Ordnance actor templates { torpedo: [{ uuid, id, name, img }], strikeCraft: [...] }
    schema.ordnanceActors = new fields.ObjectField({ initial: { torpedo: [], strikeCraft: [] } });
    schema.assignedCores  = new fields.ObjectField({ initial: {} });
    schema.turnDone       = new fields.ObjectField({ initial: {} });
    schema.overchargeUsed = new fields.ObjectField({ initial: {} });

    // ── Role-specific resource pools { [roleId]: { … } } ────────────────
    schema.resources = new fields.ObjectField({ initial: {} });

    // ── Internal Fire condition severity (0 = no fire) ───────────────────
    schema.internalFire = new fields.NumberField({ initial: 0, min: 0, integer: true });
    // ── Crit conditions ──────────────────────────────────────────────────────
    // Each location holds {} (no condition) or { tier: "low"|"medium"|"high", ...meta }
    // meta examples: { tier: "low", jammedItemId: "..." } for weaponsSensors
    schema.conditions = new fields.SchemaField({
      hull:           new fields.ObjectField({ initial: {} }),
      engines:        new fields.ObjectField({ initial: {} }),
      manoeuvring:    new fields.ObjectField({ initial: {} }),
      coreSystems:    new fields.ObjectField({ initial: {} }),
      weaponsSensors: new fields.ObjectField({ initial: {} }),
    });
    // ── Hull: single ship-wide hit point pool ───────────────────────────────
    schema.hull = new fields.SchemaField({
      value: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      max:   new fields.NumberField({ initial: 50, min: 0, integer: true }),
    });

    // ── Per-sector void shield integrity ─────────────────────────────────────
    // Flat value per zone (Sensors distributes from the shield pool).
    schema.shields = new fields.SchemaField({
      bow:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
      stern:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
      port:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
      starboard: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Void Shield Pool ─────────────────────────────────────────────────────
    // current  = available flux for Sensors to distribute this turn
    // committed = cores the Enginseer allocated to shields this turn (converts next round)
    schema.shieldPool = new fields.SchemaField({
      current:   new fields.NumberField({ initial: 0, min: 0, integer: true }),
      committed: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Core Bank (residual cores from previous turns) ───────────────────────
    schema.coreBank = new fields.NumberField({ initial: 0, min: 0, integer: true });

    // ── Vent Lock (blocks Core Distribution panel next turn) ─────────────────
    schema.ventLocked = new fields.BooleanField({ initial: false });

    // ── Vent Pending (vent fired this turn → locks next turn) ───────────────
    schema.ventPending = new fields.BooleanField({ initial: false });

    // ── Per-sector armour: flat damage reduction ──────────────────────────────
    schema.armour = new fields.SchemaField({
      bow:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
      stern:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
      port:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
      starboard: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Per-sector accumulated rend damage (reduces derived armour value) ─────
    schema.armourRend = new fields.SchemaField({
      bow:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
      stern:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
      port:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
      starboard: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    schema.weaponSlots = new fields.SchemaField({
      port:      new fields.NumberField({ initial: 1, min: 0, integer: true }),
      starboard: new fields.NumberField({ initial: 1, min: 0, integer: true }),
      prow:      new fields.NumberField({ initial: 1, min: 0, integer: true }),
      dorsal:    new fields.NumberField({ initial: 1, min: 0, integer: true }),
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
    });

    // ── Notes ────────────────────────────────────────────────────────────
    schema.notes = new fields.SchemaField({
      player: new fields.HTMLField({ initial: "" }),
      gm:     new fields.HTMLField({ initial: "" }),
    });

    // ── Ship Identity ───────────────────────────────────────────────────
    schema.classification = new fields.StringField({ initial: "" });
    schema.model          = new fields.StringField({ initial: "" });
    schema.shipFaction    = new fields.StringField({ initial: "" });
    schema.shipRole       = new fields.StringField({ initial: "" });
    schema.patron         = new fields.StringField({ initial: "" }); // UUID of linked Patron actor

    // ── Enginseer reactor config ─────────────────────────────────────────────
    // Per-ship maximum Power Cores the Enginseer starts each round with.
    // Overrides the world setting when explicitly configured.
    schema.powerCoresMax = new fields.NumberField({ initial: 0, min: 0, max: 8, integer: true });

    // ── Movement (configured by engine or manually) ──────────────────────
    schema.movement = new fields.SchemaField({
      speed:          new fields.NumberField({ initial: 0, min: 0, integer: true }),
      maneuverability: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Combat stub ──────────────────────────────────────────────────────
    // Satisfies impmal's CombatTracker hook (accesses actor.system.combat.action)
    // and the HealthEstimate module (looks for actor.system.combat.wounds).
    schema.combat = new fields.SchemaField({
      action: new fields.StringField({ initial: "" }),
      wounds: new fields.SchemaField({
        value: new fields.NumberField({ initial: 0, min: 0, integer: true }),
        max:   new fields.NumberField({ initial: 0, min: 0, integer: true }),
      }),
    });

    return schema;
  }

  // ── warhammer-lib / impmal interface stubs ──────────────────────────────
  // warhammer-lib's WarhammerActor.prepareBaseData calls this.system.computeBase()
  // and prepareDerivedData calls this.system.computeDerived().  The base
  // implementation on BaseWarhammerModel._addModelProperties() is inherited,
  // but impmal's BaseActorModel wraps it with initialize()  -  we inline that here.
  computeBase() {
    this._addModelProperties();
    // Stub characteristics so embedded items calling damage.compute(actor)
    // don't crash with "actor.system.characteristics is undefined".
    // Ships have no characteristics; all access safely resolves to 0.
    this.characteristics = {};
    this.skills = {};
  }
  computeDerived()           {
    // hull.value = damage taken; HealthEstimate expects remaining HP
    this.combat.wounds.value = this.hull.max - this.hull.value;
    this.combat.wounds.max   = this.hull.max;

    // Derive movement stats from the installed engine component (if any).
    const engine = this.parent?.items?.find(
      i => i.type === `${MODULE_ID}.component` && i.system.slot === "engine"
    );
    if (engine) {
      this.movement.speed           = engine.system.speed           ?? this.movement.speed;
      this.movement.maneuverability = engine.system.maneuverability ?? this.movement.maneuverability;
    }

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

    // Sum armour from all equipped armour components, then subtract accumulated rend.
    const armourItems = this.parent?.items?.filter(
      i => i.type === `${MODULE_ID}.component` && i.system.slot === "armour"
    ) ?? [];
    for (const sector of ["bow", "stern", "port", "starboard"]) {
      const base = armourItems.reduce(
        (sum, item) => sum + (item.system.armourValues?.[sector] ?? 0), 0
      );
      this.armour[sector] = Math.max(0, base - (this.armourRend[sector] ?? 0));
    }
  }
  // allApplicableEffects() calls getOtherEffects() and effectIsApplicable()
  getOtherEffects()          { return []; }
  effectIsApplicable(_effect){ return true; }
  // impmal's allApplicableEffects override also calls this to filter zone effects
  effectIncluded(_effect)    { return true; }
}
