/**
 * VoidshipComponentModel – data model for the "impmal-shipcombat.component" item type.
 */

const fields = foundry.data.fields;

export class VoidshipComponentModel extends warhammer.models.BaseWarhammerItemModel {

  static defineSchema() {
    const schema = super.defineSchema();

    // ── Slot assignment ──────────────────────────────────────────────────
    schema.slot = new fields.StringField({
      initial: "weapon",
      choices: {
        weapon:      "IMSC.Slot.Weapon",
        shields:     "IMSC.Slot.Shields",
        armour:      "IMSC.Slot.Armour",
        engine:      "IMSC.Slot.Engine",
        auspex:      "IMSC.Slot.Auspex",
        reactor:     "IMSC.Slot.Reactor",
        weaponsBay:  "IMSC.Slot.WeaponsBay",
      },
    });

    // ── Header fields (shared by all slots) ───────────────────────────
    schema.quantity     = new fields.NumberField({ initial: 1, min: 0, integer: true });
    schema.cost         = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.slots        = new fields.NumberField({ initial: 1, min: 1, integer: true });
    schema.availability = new fields.StringField({ initial: "" });

    // ── Notes (player + GM) ──────────────────────────────────────────
    schema.notes = new fields.SchemaField({
      player: new fields.HTMLField({ initial: "" }),
      gm:     new fields.HTMLField({ initial: "" }),
    });

    // ── Weapon fields ─────────────────────────────────────────────────
    schema.weaponPosition = new fields.StringField({
      initial: "prow",
      choices: {
        flank:  "IMSC.Slot.Flank",
        prow:   "IMSC.Slot.Prow",
        dorsal: "IMSC.Slot.Dorsal",
      },
    });
    // For flank weapons: which bay they are installed in on the ship.
    // Set automatically when dropped onto a port/starboard section.
    schema.weaponBay = new fields.StringField({
      initial: "port",
      choices: {
        port:      "IMSC.Slot.Port",
        starboard: "IMSC.Slot.Starboard",
      },
    });
    schema.resourceType = new fields.StringField({
      initial: "ammo",
      choices: {
        ammo:   "IMSC.WeaponResource.Ammo",
        heat:   "IMSC.WeaponResource.Heat",
        power:  "IMSC.WeaponResource.Power",
        none:   "IMSC.WeaponResource.None",
      },
    });
    schema.weaponCategory = new fields.StringField({
      initial: "",
      blank: true,
      choices: {
        "":               "IMSC.WeaponCategory.None",
        macrocannon:      "IMSC.WeaponCategory.Macrocannon",
        nova_cannon:      "IMSC.WeaponCategory.NovaCannon",
        railgun:          "IMSC.WeaponCategory.Railgun",
        pdc_projectile:   "IMSC.WeaponCategory.PdcProjectile",
        lance:            "IMSC.WeaponCategory.Lance",
        laser_pdc:        "IMSC.WeaponCategory.LaserPdc",
        melta:            "IMSC.WeaponCategory.Melta",
        plasma:           "IMSC.WeaponCategory.Plasma",
        missile:          "IMSC.WeaponCategory.Missile",
      },
    });
    schema.damage       = new fields.NumberField({ initial: 0, integer: true });
    schema.salvoSize    = new fields.NumberField({ initial: 1, min: 1, integer: true });
    schema.chargeStep   = new fields.NumberField({ initial: 5, min: 1, integer: true });
    schema.range        = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.degreeOfFire = new fields.NumberField({ initial: 0, min: 0, max: 360, integer: true });

    // ── Structured weapon traits ──────────────────────────────────────────
    schema.traits = new fields.SchemaField({
      shieldBypass:      new fields.BooleanField({ initial: false }),
      unlimitedRof:      new fields.BooleanField({ initial: false }),
      shieldBurn:        new fields.NumberField({ initial: 0, min: 0, integer: true }),
      rend:              new fields.NumberField({ initial: 0, min: 0, integer: true }),
      armourPenetration: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      devastating:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
      unreliable:        new fields.BooleanField({ initial: false }),
      overcharge:        new fields.BooleanField({ initial: false }),
      hitRatingModifier: new fields.NumberField({ initial: 0, integer: true }),
    });

    // ── Shield fields ─────────────────────────────────────────────────
    schema.maxVoidFlux     = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.zoneThresholds  = new fields.SchemaField({
      bow:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
      stern:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
      port:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
      starboard: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Armour fields ─────────────────────────────────────────────────
    schema.armourValues = new fields.SchemaField({
      bow:       new fields.NumberField({ initial: 0, min: 0, integer: true }),
      stern:     new fields.NumberField({ initial: 0, min: 0, integer: true }),
      port:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
      starboard: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Engine fields ─────────────────────────────────────────────────
    schema.speed              = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.maneuverability    = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.powerPerAP         = new fields.NumberField({ initial: 0, min: 0, integer: true });

    // ── Auspex fields ────────────────────────────────────────────────
    schema.rating             = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.bandSize           = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.autoScanRange      = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.maxRange           = new fields.NumberField({ initial: 0, min: 0, integer: true });
    // Legacy field alias  -  existing items may still store this; getAuspexStats reads autoScanRange.
    schema.guaranteedHitRange = new fields.NumberField({ initial: 0, min: 0, integer: true });

    // ── Reactor fields ──────────────────────────────────────────────────
    schema.shieldStrengthPerCore = new fields.NumberField({ initial: 5, min: 0, integer: true });
    schema.heatCapacity          = new fields.NumberField({ initial: 10, min: 0, integer: true });
    schema.bankCapacity          = new fields.NumberField({ initial: 40, min: 0, integer: true });
    schema.reserveMultiplier     = new fields.NumberField({ initial: 1, min: 0, integer: true });

    // ── Torpedo component fields ────────────────────────────────────────
    schema.torpedoFuel           = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.torpedoSpeed          = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.torpedoManeuverability = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.torpedoSalvo          = new fields.NumberField({ initial: 1, min: 1, integer: true });
    schema.torpedoPayloadDamage  = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.torpedoPayloadRadius  = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.torpedoTraits = new fields.SchemaField({
      shieldBypass:      new fields.BooleanField({ initial: false }),
      shieldBurn:        new fields.NumberField({ initial: 0, min: 0, integer: true }),
      rend:              new fields.NumberField({ initial: 0, min: 0, integer: true }),
      armourPenetration: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Strike Craft component fields ──────────────────────────────────
    schema.craftFuel             = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.craftSpeed            = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.craftManeuverability  = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.craftType = new fields.StringField({
      initial: "fighter",
      choices: {
        fighter: "IMSC.CraftType.Fighter",
        bomber:  "IMSC.CraftType.Bomber",
      },
    });
    schema.craftPayloadDamage    = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.craftPayloadRadius    = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.craftPayloadCount     = new fields.NumberField({ initial: 1, min: 1, integer: true });
    schema.craftFlightSize       = new fields.NumberField({ initial: 3, min: 1, integer: true });
    schema.craftAuspexRating     = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.craftTraits = new fields.SchemaField({
      shieldBypass:      new fields.BooleanField({ initial: false }),
      shieldBurn:        new fields.NumberField({ initial: 0, min: 0, integer: true }),
      rend:              new fields.NumberField({ initial: 0, min: 0, integer: true }),
      armourPenetration: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Ordnance Bay component fields ────────────────────────────────────
    schema.bayMaxFlights      = new fields.NumberField({ initial: 2, min: 0, integer: true });
    schema.bayManpower        = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.bayAmmoCapacity    = new fields.NumberField({ initial: 20, min: 0, integer: true });
    schema.bayChargeCapacity  = new fields.NumberField({ initial: 20, min: 0, integer: true });
    schema.bayTorpedoSalvoSize     = new fields.NumberField({ initial: 1, min: 1, integer: true });
    schema.bayTorpedoCapacity      = new fields.NumberField({ initial: 4, min: 0, integer: true });
    schema.bayStrikeCraftFlightSize = new fields.NumberField({ initial: 3, min: 1, integer: true });
    schema.bayStrikeCraftCapacity     = new fields.NumberField({ initial: 6, min: 0, integer: true });

    return schema;
  }

  get resource() {
    return this.resourceType;
  }

  /**
   * Comma-joined plain-text summary of active weapon traits for display in
   * list rows (e.g. "Shield Bypass (10), Unlimited Rate of Fire").
   */
  get traitsHtml() {
    const t = this.slot === "torpedo" ? this.torpedoTraits
            : this.slot === "strikeCraft" ? this.craftTraits
            : this.traits;
    return VoidshipComponentModel._formatTraits(t);
  }

  static _formatTraits(t) {
    if (!t) return "";
    const parts = [];
    if (t?.shieldBypass)           parts.push(game.i18n.localize("IMSC.Trait.ShieldBypass"));
    if (t?.unlimitedRof)           parts.push(game.i18n.localize("IMSC.Trait.UnlimitedRof"));
    if (t?.shieldBurn > 0)         parts.push(`${game.i18n.localize("IMSC.Trait.ShieldBurn")} (${t.shieldBurn})`);
    if (t?.rend > 0)               parts.push(`${game.i18n.localize("IMSC.Trait.Rend")} (${t.rend})`);
    if (t?.armourPenetration > 0)  parts.push(`${game.i18n.localize("IMSC.Trait.ArmourPenetration")} (${t.armourPenetration})`);
    if (t?.devastating > 0)        parts.push(`${game.i18n.localize("IMSC.Trait.Devastating")} (${t.devastating})`);
    if (t?.unreliable)             parts.push(game.i18n.localize("IMSC.Trait.Unreliable"));
    if (t?.overcharge)             parts.push(game.i18n.localize("IMSC.Trait.Overcharge"));
    return parts.join(", ");
  }

  /**
   * Summary data used by the impmal system's _toggleSummary action.
   */
  async summaryData() {
    return {
      notes: this.notes?.player ?? "",
      gmnotes: this.notes?.gm ?? "",
      details: { physical: "", item: {} },
      tags: [],
      summaryLabel: game.i18n.localize("IMSC.Component.Summary"),
    };
  }

  // warhammer-lib calls computeOwned(actor) on every embedded item during
  // prepareDerivedData. We don't need actor-derived stats; override to no-op.
  computeOwned(_actor) {}
  computeBase() {}
}
