/**
 * flavor.test.js – Tests for scripts/flavor.js
 */

const { describe, it, assertEqual, assert } = globalThis._test;

const { flavor } = await import("../scripts/flavor.js");

describe("flavor()", () => {
  it("returns default i18n for 40k pack", () => {
    const origGet = game.settings.get;
    game.settings.get = (mod, key) => key === "flavorPack" ? "40k" : origGet(mod, key);
    try {
      // With 40k pack, no overrides  -  falls through to game.i18n.localize
      const result = flavor("IMSC.Role.Enginseer");
      assertEqual(result, "IMSC.Role.Enginseer"); // stub localize returns key
    } finally { game.settings.get = origGet; }
  });

  it("returns override for naval pack", () => {
    const origGet = game.settings.get;
    game.settings.get = (mod, key) => key === "flavorPack" ? "naval" : origGet(mod, key);
    try {
      assertEqual(flavor("IMSC.Role.Enginseer"), "Chief Engineer");
      assertEqual(flavor("IMSC.Role.Captain"), "Commanding Officer");
      assertEqual(flavor("IMSC.Role.Ordnance"), "Ordnance Officer");
    } finally { game.settings.get = origGet; }
  });

  it("returns override for military pack", () => {
    const origGet = game.settings.get;
    game.settings.get = (mod, key) => key === "flavorPack" ? "military" : origGet(mod, key);
    try {
      assertEqual(flavor("IMSC.Role.Enginseer"), "Systems Officer");
      assertEqual(flavor("IMSC.Role.Captain"), "Commander");
    } finally { game.settings.get = origGet; }
  });

  it("falls through to i18n for unknown keys in any pack", () => {
    const origGet = game.settings.get;
    game.settings.get = (mod, key) => key === "flavorPack" ? "naval" : origGet(mod, key);
    try {
      const result = flavor("IMSC.SomeOtherKey");
      assertEqual(result, "IMSC.SomeOtherKey"); // stub returns key as-is
    } finally { game.settings.get = origGet; }
  });
});
