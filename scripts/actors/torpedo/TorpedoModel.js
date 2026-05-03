/**
 * TorpedoModel  -  data model for torpedo actors.
 *
 * Torpedoes are autonomous projectiles created by the Ordnance Master role.
 * They cannot be manually created by users.
 *
 * Stats: Hull HP, Speed, Maneuverability, Fuel, Damage, Detection Radius.
 * Traits: Rend, Armour Penetration, Shield Burn, Shield Bypass.
 */

import { MODULE_ID } from "../../constants.js";

export class TorpedoModel extends warhammer.models.BaseWarhammerActorModel {

  itemIsAllowed() {
    return false;
  }

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // ── Hull ───────────────────────────────────────────────────────────────
    schema.hull = new fields.SchemaField({
      value: new fields.NumberField({ initial: 1, min: 0, integer: true }),
      max:   new fields.NumberField({ initial: 1, min: 0, integer: true }),
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

    // ── Warhead ───────────────────────────────────────────────────────────
    schema.payloadDamage = new fields.NumberField({ initial: 0, min: 0, integer: true });
    schema.payloadRadius = new fields.NumberField({ initial: 0, min: 0, integer: true });

    // ── Weapon Traits ────────────────────────────────────────────────────
    schema.traits = new fields.SchemaField({
      rend:            new fields.NumberField({ initial: 0, min: 0, integer: true }),
      armourPenetration: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      shieldBurn:      new fields.NumberField({ initial: 0, min: 0, integer: true }),
      shieldBypass:    new fields.BooleanField({ initial: false }),
    });

    // ── Helm state ────────────────────────────────────────────────────────
    schema.helm = new fields.SchemaField({
      bearing:      new fields.NumberField({ initial: 0, integer: true }),
      thrustPct:    new fields.NumberField({ initial: 0, min: 0, integer: true }),
      prevTurnMove: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      velocityX:    new fields.NumberField({ initial: 0 }),
      velocityY:    new fields.NumberField({ initial: 0 }),
      bearingUsed:  new fields.NumberField({ initial: 0, min: 0 }),
      momentumUsed: new fields.NumberField({ initial: 0, min: 0 }),
    });

    // ── Turn tracking ───────────────────────────────────────────────────
    schema.turnComplete      = new fields.BooleanField({ initial: false });
    schema.designated        = new fields.BooleanField({ initial: false });
    schema.parentShipTokenId = new fields.StringField({ initial: "" });
    schema.powerBoostActive  = new fields.BooleanField({ initial: false });

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
