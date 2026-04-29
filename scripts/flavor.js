import { MODULE_ID } from "./constants.js";

/**
 * Flavor packs map abstract i18n keys to setting-specific display strings.
 * The "40k" pack is empty  -  it falls through to the default lang/en.json values.
 * Other packs override only the keys that differ.
 */
const FLAVOR_PACKS = {
  "40k": {
    // Uses lang/en.json defaults (Enginseer, Ordnance Master, Portent, etc.)
  },
  naval: {
    "IMSC.Role.Captain":    "Commanding Officer",
    "IMSC.Role.Enginseer":  "Chief Engineer",
    "IMSC.Role.Pilot":      "Helmsman",
    "IMSC.Role.Sensors":    "Sensor Operator",
    "IMSC.Role.Gunner":     "Weapons Officer",
    "IMSC.Role.Ordnance":   "Ordnance Officer",
  },
  military: {
    "IMSC.Role.Captain":    "Commander",
    "IMSC.Role.Enginseer":  "Systems Officer",
    "IMSC.Role.Pilot":      "Pilot",
    "IMSC.Role.Sensors":    "EW Officer",
    "IMSC.Role.Gunner":     "Gunnery Sergeant",
    "IMSC.Role.Ordnance":   "Munitions Officer",
  },
};

/**
 * Resolve a flavor string.  If the active flavor pack overrides the given
 * i18n key, return the override; otherwise fall through to Foundry's
 * standard `game.i18n.localize()`.
 *
 * @param {string} key  An i18n key such as "IMSC.Role.Enginseer"
 * @returns {string}
 */
export function flavor(key) {
  const packId = game.settings.get(MODULE_ID, "flavorPack");
  const pack = FLAVOR_PACKS[packId];
  if (pack?.[key]) return pack[key];
  return game.i18n.localize(key);
}

/**
 * Register the {{flavor}} Handlebars helper so templates can use
 * `{{flavor "IMSC.Role.Enginseer"}}` instead of `{{localize ...}}`.
 */
export function registerFlavorHelper() {
  Handlebars.registerHelper("flavor", (key) => flavor(key));
}
