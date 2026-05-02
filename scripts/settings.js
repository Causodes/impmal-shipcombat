import { MODULE_ID } from "./constants.js";

/**
 * Register all module settings.
 * Called once from the main entry point during "init".
 */
export function registerSettings() {
  game.settings.register(MODULE_ID, "contactDesignation", {
    name: "IMSC.Setting.ContactDesignation",
    hint: "IMSC.Setting.ContactDesignationHint",
    scope: "world",
    config: true,
    type: String,
    default: "naval-greek",
    choices: {
      "contact-greek":   "IMSC.Setting.ContactGreek",
      "contact-numeric": "IMSC.Setting.ContactNumeric",
      "naval-greek":     "IMSC.Setting.NavalGreek",
      "naval-numeric":   "IMSC.Setting.NavalNumeric",
    },
  });

  game.settings.register(MODULE_ID, "sweepGatedPositions", {
    name: "IMSC.Setting.SweepGatedPositions",
    hint: "IMSC.Setting.SweepGatedPositionsHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, "flavorPack", {
    name: "IMSC.Setting.FlavorPack",
    hint: "IMSC.Setting.FlavorPackHint",
    scope: "world",
    config: true,
    type: String,
    default: "40k",
    choices: {
      "40k":      "IMSC.Flavor.40k",
      "naval":    "IMSC.Flavor.Naval",
      "military": "IMSC.Flavor.Military",
    },
  });

  game.settings.register(MODULE_ID, "movementMode", {
    name: "IMSC.Setting.MovementMode",
    hint: "IMSC.Setting.MovementModeHint",
    scope: "world",
    config: true,
    requiresReload: true,
    type: String,
    default: "simplified",
    choices: {
      "simplified": "IMSC.Config.MovementSimplified",
      "realistic":  "IMSC.Config.MovementRealistic",
    },
  });
}
