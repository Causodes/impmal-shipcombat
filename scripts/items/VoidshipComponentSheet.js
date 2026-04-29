/**
 * VoidshipComponentSheet – ApplicationV2 item sheet for voidship components.
 */

import { MODULE_ID } from "../constants.js";
import { SystemAdapter } from "../systems/SystemAdapter.js";

const ZONE_KEYS = ["bow", "stern", "port", "starboard"];

/** Definitions for weapon traits, mirroring impmal’s traitHasValue pattern. */
const WEAPON_TRAITS = [
  { key: "shieldBypass",      hasValue: false },
  { key: "unlimitedRof",      hasValue: false },
  { key: "shieldBurn",        hasValue: true  },
  { key: "rend",              hasValue: true  },
  { key: "armourPenetration", hasValue: true  },
  { key: "devastating",       hasValue: true  },
  { key: "unreliable",        hasValue: false },
  { key: "overcharge",        hasValue: false },  { key: "hitRatingModifier", hasValue: true, allowNegative: true },];
/** Subset of traits used by torpedo and strike craft ordnance components. */
const ORDNANCE_TRAITS = [
  { key: "shieldBypass",      hasValue: false },
  { key: "shieldBurn",        hasValue: true  },
  { key: "rend",              hasValue: true  },
  { key: "armourPenetration", hasValue: true  },
];
/**
 * Build the comma-joined displayHtml for the current weapon traits,
 * matching impmal's own `<a data-key=... data-value=...>Name (val)</a>` style.
 */
function _weaponTraitsDisplayHtml(traits) {
  const parts = [];
  for (const def of WEAPON_TRAITS) {
    const raw = traits?.[def.key];
    const active = def.hasValue ? (raw > 0) : raw;
    if (!active) continue;
    const name = game.i18n.localize(`IMSC.Trait.${def.key.charAt(0).toUpperCase() + def.key.slice(1)}`);
    const display = def.hasValue ? `${name} (${raw})` : name;
    parts.push(`<a data-key="${def.key}" data-value="${raw ?? ""}">${display}</a>`);
  }
  return parts.join(", ");
}

export class VoidshipComponentSheet extends warhammer.apps.WarhammerItemSheetV2 {

  static DEFAULT_OPTIONS = {
    classes: ["impmal", "impmal-shipcombat"],
    defaultTab: "description",
    position: { width: 480, height: 500 },
    actions: {
      editWeaponTraits: VoidshipComponentSheet._onEditWeaponTraits,
    },
  };

  static PARTS = {
    header:      { template: `modules/${MODULE_ID}/templates/item/component-header.hbs` },
    tabs:        { template: "templates/generic/tab-navigation.hbs" },
    description: { template: `modules/${MODULE_ID}/templates/item/component-description.hbs`, scrollable: [""] },
    details:     { template: `modules/${MODULE_ID}/templates/item/component-details.hbs`, scrollable: [""] },
  };

  // Description tab listed first → default active tab
  static TABS = {
    description: {
      id: "description",
      group: "primary",
      label: "IMSC.Tab.Description",
    },
    details: {
      id: "details",
      group: "primary",
      label: "IMSC.Tab.Details",
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.item.system;

    // Slot choices for localised <select>
    const slotChoices = Object.entries(
      this.item.system.schema.fields.slot.choices
    ).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(labelKey),
      selected: value === sys.slot,
    }));

    // Slot-category booleans for conditional template blocks
    const slot     = sys.slot;
    const isWeapon      = slot === "weapon";
    const isShields     = slot === "shields";
    const isArmour      = slot === "armour";
    const isEngine      = slot === "engine";
    const isAuspex      = slot === "auspex";
    const isReactor     = slot === "reactor";
    const isTorpedo     = slot === "torpedo";
    const isStrikeCraft = slot === "strikeCraft";
    const isWeaponsBay  = slot === "weaponsBay";

    // Weapon sub-selectors
    const weaponPositionChoices = Object.entries(
      this.item.system.schema.fields.weaponPosition.choices
    ).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(labelKey),
      selected: value === sys.weaponPosition,
    }));

    const resourceTypeChoices = Object.entries(
      this.item.system.schema.fields.resourceType.choices
    ).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(labelKey),
      selected: value === sys.resourceType,
    }));

    const weaponBayChoices = Object.entries(
      this.item.system.schema.fields.weaponBay.choices
    ).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(labelKey),
      selected: value === sys.weaponBay,
    }));

    const isFlankWeapon = sys.weaponPosition === "flank";

    // Zone helper arrays for armour and shields
    const zoneLabel = (key) => game.i18n.localize(`IMSC.Zone.${key.charAt(0).toUpperCase() + key.slice(1)}`);

    const shieldZones = ZONE_KEYS.map(key => ({
      key,
      label: zoneLabel(key),
      value: sys.zoneThresholds?.[key] ?? 8,
    }));

    const armourZones = ZONE_KEYS.map(key => ({
      key,
      label: zoneLabel(key),
      value: sys.armourValues[key],
    }));

    // Availability dropdown choices (via system adapter)
    const availConfig = SystemAdapter.current.getAvailabilityOptions();
    const availabilityChoices = Object.entries(availConfig)
      .filter(([k]) => k !== "")        // skip the blank-label entry
      .map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(labelKey),
        selected: value === sys.availability,
      }));

    // Traits display html (readonly, matches impmal weapon displayHtml style)
    const traitsDisplayHtml = _weaponTraitsDisplayHtml(
      isTorpedo ? sys.torpedoTraits : isStrikeCraft ? sys.craftTraits : sys.traits
    );

    // Strike Craft type dropdown
    const craftTypeChoices = Object.entries(
      this.item.system.schema.fields.craftType.choices
    ).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(labelKey),
      selected: value === sys.craftType,
    }));

    Object.assign(context, {
      sys,
      slotChoices,
      availabilityChoices,
      isWeapon,
      isShields,
      isArmour,
      isEngine,
      isAuspex,
      isReactor,
      isTorpedo,
      isStrikeCraft,
      isWeaponsBay,
      weaponPositionChoices,
      resourceTypeChoices,
      weaponBayChoices,
      isFlankWeapon,
      traitsDisplayHtml,
      shieldZones,
      armourZones,
      craftTypeChoices,
      isOwner: this.item.isOwner,
    });
    return context;
  }

  async _handleEnrichment() {
    let enriched = { system: { notes: {} } };
    enriched.system.notes.player = await TextEditor.enrichHTML(this.item.system.notes.player, { async: true });
    enriched.system.notes.gm     = await TextEditor.enrichHTML(this.item.system.notes.gm, { async: true });
    return enriched;
  }

  /**
   * Opens the weapon traits editor dialog, mirroring impmal's ItemTraitsForm pattern.
   * Each trait is a form-group with a checkbox (and optional number input for valued traits).
   */
  static async _onEditWeaponTraits() {
    const sys    = this.item.system;

    // Determine which traits schema and update path to use
    const slot = sys.slot;
    let traitPath, traits, traitDefs;
    if (slot === "torpedo") {
      traitPath = "system.torpedoTraits";
      traits = sys.torpedoTraits ?? {};
      traitDefs = ORDNANCE_TRAITS;
    } else if (slot === "strikeCraft") {
      traitPath = "system.craftTraits";
      traits = sys.craftTraits ?? {};
      traitDefs = ORDNANCE_TRAITS;
    } else {
      traitPath = "system.traits";
      traits = sys.traits ?? {};
      traitDefs = WEAPON_TRAITS;
    }

    const rows = traitDefs.map(def => {
      const name   = game.i18n.localize(`IMSC.Trait.${def.key.charAt(0).toUpperCase() + def.key.slice(1)}`);
      const active = def.hasValue ? (traits[def.key] > 0) : (traits[def.key] === true);
      const val    = def.hasValue ? (traits[def.key] ?? 0) : 0;
      return `
        <div class="form-group">
          <label for="trait-${def.key}">${name}</label>
          <div class="form-fields">
            ${def.hasValue ? `<input type="number" name="${def.key}-value" value="${val}" ${def.allowNegative ? "" : `min="0"`} style="width:3.5rem;text-align:center">` : ""}
            <input type="checkbox" id="trait-${def.key}" name="${def.key}" ${active ? "checked" : ""}>
          </div>
        </div>`;
    }).join("");

    const result = await foundry.applications.api.DialogV2.prompt({
      window:  { title: game.i18n.localize("IMSC.Component.Traits") },
      content: `<div class="flexcol">${rows}</div>`,
      ok: { callback: (_ev, button) => new FormDataExtended(button.form).object },
    });
    if (!result) return;

    const updates = {};
    for (const def of traitDefs) {
      if (def.hasValue) {
        updates[`${traitPath}.${def.key}`] = Number(result[`${def.key}-value`] ?? 0);
      } else {
        updates[`${traitPath}.${def.key}`] = result[def.key] === true || result[def.key] === "on";
      }
    }
    this.item.update(updates);
  }
}

