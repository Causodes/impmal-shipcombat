/**
 * settings.test.js – Tests for scripts/settings.js
 */

const { describe, it, assert } = globalThis._test;

const { registerSettings } = await import("../scripts/settings.js");

describe("registerSettings()", () => {
  it("registers all expected settings", () => {
    const _registered = [];
    const origRegister = game.settings.register;
    game.settings.register = (mod, key, opts) => {
      _registered.push({ mod, key, opts });
    };
    try {
      registerSettings();

      assert(_registered.some(s => s.key === "powerCoresMax"), "powerCoresMax registered");
      assert(_registered.some(s => s.key === "contactDesignation"), "contactDesignation registered");
      assert(_registered.some(s => s.key === "sweepGatedPositions"), "sweepGatedPositions registered");

      const fp = _registered.find(s => s.key === "flavorPack");
      assert(fp, "flavorPack registered");
      assert(fp.opts.choices["40k"], "has 40k choice");
      assert(fp.opts.choices["naval"], "has naval choice");
      assert(fp.opts.choices["military"], "has military choice");

      for (const s of _registered) {
        assert(s.opts.scope === "world", `${s.key} should be world-scoped`);
      }
    } finally { game.settings.register = origRegister; }
  });
});
