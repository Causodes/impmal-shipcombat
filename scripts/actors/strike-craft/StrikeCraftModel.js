/**
 * StrikeCraftModel  -  data model for strike craft (fighter/bomber) actors.
 *
 * Strike craft are autonomous squadrons launched by the Ordnance Master.
 * They cannot be manually created by users.
 *
 * All stats are copied from the strike craft component definition at launch.
 * No embedded items are used.
 */

import { MODULE_ID } from "../../constants.js";

export class StrikeCraftModel extends warhammer.models.BaseWarhammerActorModel {

  itemIsAllowed() {
    return false;
  }

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // ── Hull (flight size: each hit destroys 1 craft) ─────────────────────
    schema.hull = new fields.SchemaField({
      value: new fields.NumberField({ initial: 2, min: 0, integer: true }),
      max:   new fields.NumberField({ initial: 2, min: 0, integer: true }),
    });

    // ── Movement ──────────────────────────────────────────────────────────
    schema.movement = new fields.SchemaField({
      speed:           new fields.NumberField({ initial: 0, min: 0, integer: true }),
      maneuverability: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Fuel (VU of movement remaining) ─────────────────────────────
    schema.fuel = new fields.SchemaField({
      value: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      max:   new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Ammunition (expendable ordnance for attack runs) ──────────────────
    schema.ammo = new fields.SchemaField({
      value: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      max:   new fields.NumberField({ initial: 0, min: 0, integer: true }),
    });

    // ── Craft type ──────────────────────────────────────────────────────
    schema.craftType = new fields.StringField({ initial: "fighter" });

    // ── Payload ─────────────────────────────────────────────────────────
    schema.payloadDamage = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.payloadRadius = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.payloadCount  = new fields.NumberField({ initial: 1, min: 0, integer: true });
    schema.payloadAngle  = new fields.NumberField({ initial: 120, min: 0, max: 360, integer: true });

    // ── Auto-scan range ─────────────────────────────────────────────────
    schema.autoScanRange = new fields.NumberField({ initial: 0, min: 0, integer: true });

    // ── Auspex band size ────────────────────────────────────────────────
    schema.auspexBandSize = new fields.NumberField({ initial: 0, min: 0, integer: true });

    // ── Auspex rating ───────────────────────────────────────────────────
    schema.auspexRating = new fields.NumberField({ initial: 0, min: 0, integer: true });

    // ── Detection radius (VU at which this craft can be detected by PDC) ─
    schema.detectionRadius = new fields.NumberField({ initial: 0, min: 0, integer: true });

    // ── Weapon Traits ────────────────────────────────────────────────────
    schema.traits = new fields.SchemaField({
      rend:              new fields.NumberField({ initial: 0, min: 0, integer: true }),
      armourPenetration: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      shieldBurn:        new fields.NumberField({ initial: 0, min: 0, integer: true }),
      shieldBypass:      new fields.BooleanField({ initial: false }),
    });

    // ── Helm state (simplified  -  no piloting roll) ────────────────────
    schema.helm = new fields.SchemaField({
      bearing:      new fields.NumberField({ initial: 0, integer: true }),
      fuelBurned:   new fields.NumberField({ initial: 0, min: 0, integer: true }),
      prevTurnMove: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      confirmed:    new fields.BooleanField({ initial: false }),
    });

    // ── RTB state ────────────────────────────────────────────────────────
    schema.rtb = new fields.BooleanField({ initial: false });

    // ── Turn tracking (Ordnance Master marks each craft as having acted this round) ─
    schema.turnComplete = new fields.BooleanField({ initial: false });

    // ── Parent ship token ID (the ship that launched this craft) ─────────
    schema.parentShipTokenId = new fields.StringField({ initial: "" });

    // ── Pickup radius (VU within which the ship can recover this craft) ──
    schema.pickupRadius = new fields.NumberField({ initial: 3, min: 0, integer: true });

    // ── Notes (required by IMActorSheet._handleEnrichment) ──────────────
    schema.notes = new fields.SchemaField({
      player: new fields.HTMLField({ initial: "" }),
      gm:     new fields.HTMLField({ initial: "" }),
    });

    // ── Combat stub (HealthEstimate reads actor.system.combat.wounds) ────
    schema.combat = new fields.SchemaField({
      wounds: new fields.SchemaField({
        value: new fields.NumberField({ initial: 0, integer: true }),
        max:   new fields.NumberField({ initial: 0, integer: true }),
      }),
    });

    return schema;
  }

  initialize() {
    this._addModelProperties();
  }

  computeBase() {
    this._addModelProperties();
    this.characteristics = {};
    this.skills = {};
  }

  computeDerived() {
    this.combat.wounds.value = this.hull.max - this.hull.value;
    this.combat.wounds.max   = this.hull.max;
  }
}
