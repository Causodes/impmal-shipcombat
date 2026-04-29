/**
 * impmal-shipcombat – Main entry module.
 *
 * Load order:
 *   init          → register Ship actor type + sheet, settings, Handlebars helpers, templates
 *   socketlib.ready → register socket actions via socketlib
 */

import { MODULE_ID } from "./scripts/constants.js";
import { ShipCombatState } from "./scripts/state/ShipCombatState.js";
import { setupSocket } from "./scripts/socket.js";
import { ShipModel } from "./scripts/actors/ship/ShipModel.js";
import { ShipSheet } from "./scripts/actors/ship/ShipSheet.js";
import { NpcShipModel } from "./scripts/actors/npc/NpcShipModel.js";
import { NpcShipSheet } from "./scripts/actors/npc/NpcShipSheet.js";
import { TorpedoModel } from "./scripts/actors/torpedo/TorpedoModel.js";
import { TorpedoSheet } from "./scripts/actors/torpedo/TorpedoSheet.js";
import { StrikeCraftModel } from "./scripts/actors/strike-craft/StrikeCraftModel.js";
import { StrikeCraftSheet } from "./scripts/actors/strike-craft/StrikeCraftSheet.js";
import { HelmPreview } from "./scripts/canvas/HelmPreview.js";
import { ShieldArcOverlay } from "./scripts/canvas/ShieldArcOverlay.js";
import { WeaponArcOverlay } from "./scripts/canvas/WeaponArcOverlay.js";
import { StrikeCraftArcOverlay } from "./scripts/canvas/StrikeCraftArcOverlay.js";
import { refreshTokenVisibility, applyTokenVisibility } from "./scripts/canvas/TokenVisibility.js";
import { VoidshipComponentModel } from "./scripts/items/VoidshipComponentModel.js";
import { VoidshipComponentSheet } from "./scripts/items/VoidshipComponentSheet.js";
import { SystemAdapter } from "./scripts/systems/SystemAdapter.js";
import { ImpmalAdapter } from "./scripts/systems/impmal-adapter.js";
import { registerSettings } from "./scripts/settings.js";
import { registerFlavorHelper } from "./scripts/flavor.js";
import { BDAPopup, launchBDAFromChat } from "./scripts/apps/BDAPopup.js";

// ── Handlebars helpers ─────────────────────────────────────────────────────

Handlebars.registerHelper("imscEq",       (a, b) => a === b);
Handlebars.registerHelper("imscNeq",      (a, b) => a !== b);
Handlebars.registerHelper("imscGt",       (a, b) => Number(a) > Number(b));
Handlebars.registerHelper("imscLt",       (a, b) => Number(a) < Number(b));
Handlebars.registerHelper("imscNot",      (v)    => !v);
Handlebars.registerHelper("imscOr",       (a, b) => a || b);
Handlebars.registerHelper("imscTimes", function(n, block) {
  let result = "";
  for (let i = 0; i < n; i++) result += block.fn(i);
  return result;
});
Handlebars.registerHelper("divide",   (a, b) => b !== 0 ? a / b : 0);
Handlebars.registerHelper("multiply", (a, b) => a * b);

// ── Term helper ─────────────────────────────────────────────────────────────
// Usage in templates: {{imscTerm "PowerCore"}} → "Power Core"
// Edit the canonical display string in lang/en.json under IMSC.Term.*
// Role names (Helmsman, Ordnance Master, etc.) live in IMSC.Role.*
Handlebars.registerHelper("imscTerm", key => game.i18n.localize(`IMSC.Term.${key}`));
Handlebars.registerHelper("imscRole", key => game.i18n.localize(`IMSC.Role.${key}`));

// ── init ──────────────────────────────────────────────────────────────────

Hooks.once("init", async () => {
  console.log(`${MODULE_ID} | Initialising ship combat module`);

  // ── Register system adapter ─────────────────────────────────────────────
  SystemAdapter.register(new ImpmalAdapter());

  CONFIG.Actor.typeLabels[`${MODULE_ID}.ship`] = `TYPES.Actor.${MODULE_ID}.ship`;
  CONFIG.Actor.typeLabels[`${MODULE_ID}.npcShip`] = `TYPES.Actor.${MODULE_ID}.npcShip`;
  CONFIG.Actor.typeLabels[`${MODULE_ID}.torpedo`] = `TYPES.Actor.${MODULE_ID}.torpedo`;
  CONFIG.Actor.typeLabels[`${MODULE_ID}.strikeCraft`] = `TYPES.Actor.${MODULE_ID}.strikeCraft`;

  // Register the Ship actor type
  Object.assign(CONFIG.Actor.dataModels, {
    [`${MODULE_ID}.ship`]: ShipModel,
    [`${MODULE_ID}.npcShip`]: NpcShipModel,
    [`${MODULE_ID}.torpedo`]: TorpedoModel,
    [`${MODULE_ID}.strikeCraft`]: StrikeCraftModel,
  });

  // Register the Voidship Component item type
  Object.assign(CONFIG.Item.dataModels, {
    [`${MODULE_ID}.component`]: VoidshipComponentModel,
  });
  CONFIG.Item.typeLabels[`${MODULE_ID}.component`] = `TYPES.Item.${MODULE_ID}.component`;

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Actor,
    MODULE_ID,
    ShipSheet,
    {
      types: [`${MODULE_ID}.ship`],
      makeDefault: true,
      label: "IMSC.Sheet.Ship",
    }
  );

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Actor,
    MODULE_ID,
    NpcShipSheet,
    {
      types: [`${MODULE_ID}.npcShip`],
      makeDefault: true,
      label: "IMSC.Sheet.NpcShip",
    }
  );

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Actor,
    MODULE_ID,
    TorpedoSheet,
    {
      types: [`${MODULE_ID}.torpedo`],
      makeDefault: true,
      label: "IMSC.Sheet.Torpedo",
    }
  );

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Actor,
    MODULE_ID,
    StrikeCraftSheet,
    {
      types: [`${MODULE_ID}.strikeCraft`],
      makeDefault: true,
      label: "IMSC.Sheet.StrikeCraft",
    }
  );

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Item,
    MODULE_ID,
    VoidshipComponentSheet,
    {
      types: [`${MODULE_ID}.component`],
      makeDefault: true,
      label: "IMSC.Sheet.Component",
    }
  );

  // Settings & Flavor
  registerSettings();
  registerFlavorHelper();

  // Pre-load templates
  await loadTemplates([
    `modules/${MODULE_ID}/templates/actor/ship-header.hbs`,
    `modules/${MODULE_ID}/templates/actor/ship-overview.hbs`,
    `modules/${MODULE_ID}/templates/actor/ship-config.hbs`,
    `modules/${MODULE_ID}/templates/actor/ship-captain.hbs`,
    `modules/${MODULE_ID}/templates/actor/ship-enginseer.hbs`,
    `modules/${MODULE_ID}/templates/actor/ship-pilot.hbs`,
    `modules/${MODULE_ID}/templates/actor/ship-sensors.hbs`,
    `modules/${MODULE_ID}/templates/actor/ship-gunner.hbs`,
    `modules/${MODULE_ID}/templates/actor/ship-notes.hbs`,
    `modules/${MODULE_ID}/templates/actor/partials/action-card.hbs`,
    `modules/${MODULE_ID}/templates/actor/partials/complete-turn.hbs`,
    `modules/${MODULE_ID}/templates/actor/partials/core-status-banner.hbs`,
    `modules/${MODULE_ID}/templates/actor/partials/payload-status-badge.hbs`,
    `modules/${MODULE_ID}/templates/item/component-header.hbs`,
    `modules/${MODULE_ID}/templates/item/component-details.hbs`,
    `modules/${MODULE_ID}/templates/item/component-description.hbs`,
    `modules/${MODULE_ID}/templates/actor/npc-ship-header.hbs`,
    `modules/${MODULE_ID}/templates/actor/npc-ship-body.hbs`,
    `modules/${MODULE_ID}/templates/actor/npc-ship-config.hbs`,
    `modules/${MODULE_ID}/templates/actor/npc-ship-effects.hbs`,
    `modules/${MODULE_ID}/templates/actor/torpedo-header.hbs`,
    `modules/${MODULE_ID}/templates/actor/torpedo-warhead.hbs`,
    `modules/${MODULE_ID}/templates/actor/torpedo-config.hbs`,
    `modules/${MODULE_ID}/templates/actor/strike-craft-header.hbs`,
    `modules/${MODULE_ID}/templates/actor/strike-craft-sheet.hbs`,
    `modules/${MODULE_ID}/templates/actor/strike-craft-config.hbs`,
    `modules/${MODULE_ID}/templates/actor/ship-ordnance.hbs`,
    `modules/${MODULE_ID}/templates/apps/bda-popup.hbs`,
    `modules/${MODULE_ID}/templates/apps/strike-craft-attack-popup.hbs`,
    `modules/${MODULE_ID}/templates/apps/recover-craft-popup.hbs`,
    `modules/${MODULE_ID}/templates/chat/bda-pending.hbs`,
    `modules/${MODULE_ID}/templates/chat/strike-craft-result.hbs`,
    `modules/${MODULE_ID}/templates/chat/torpedo-result.hbs`,
  ]);

  // ── Token visibility override ──────────────────────────────────────────
  // Foundry V13 resets token.visible = this.isVisible inside
  // _refreshVisibility() on every render cycle, so hook-based overrides are
  // immediately undone.  Patch the prototype so our own-ship and auspex-tier
  // logic runs *after* the base method and survives the render pipeline.
  const TokenCls = CONFIG.Token.objectClass;
  const _origRefreshVisibility = TokenCls.prototype._refreshVisibility;
  TokenCls.prototype._refreshVisibility = function () {
    _origRefreshVisibility.call(this);
    // Defer to the module's per-token handler (imported from TokenVisibility.js)
    applyTokenVisibility(this);
  };

  // ── Ordnance token control restriction ─────────────────────────────────
  // Non-GM, non-Ordnance Master players can see friendly ordnance but not select or
  // move it.  Only the ordnance role holder (Ordnance Master) may interact.
  const _origCanControl = TokenCls.prototype._canControl;
  TokenCls.prototype._canControl = function (user, event) {
    const actorType = this.document.actor?.type;
    if (actorType === `${MODULE_ID}.torpedo` || actorType === `${MODULE_ID}.strikeCraft`) {
      if (user.isGM) return true;
      const ship = ShipCombatState.ship;
      const myRole = ship?.system?.roles?.[user.id];
      return myRole === "ordnance";
    }
    return _origCanControl.call(this, user, event);
  };
});

// ── Default component icon ───────────────────────────────────────────────

Hooks.on("preCreateItem", (item, data) => {
  if (item.type !== `${MODULE_ID}.component`) return;
  if (!data.img || data.img === foundry.documents.BaseItem.DEFAULT_ICON) {
    item.updateSource({ img: "modules/impmal-core/assets/icons/weapons/explosive.webp" });
  }
});

// ── Socket ────────────────────────────────────────────────────────────────

Hooks.once("socketlib.ready", () => {
  setupSocket();
  console.log(`${MODULE_ID} | Registered with socketlib`);
});

// ── Ghost cleanup on canvas teardown ──────────────────────────────────────

Hooks.on("canvasTearDown", () => {
  HelmPreview.hide();
  ShieldArcOverlay.destroyAll();
  WeaponArcOverlay.destroyAll();
  StrikeCraftArcOverlay.destroyAll();
});

// ── Ship token defaults ──────────────────────────────────────────────────────
// Sets friendly disposition and disables artwork rotation lock when a new
// ship actor is created (before it is written to the database).

Hooks.on("preCreateActor", (actor, data) => {
  if (actor.type === `${MODULE_ID}.ship`) {
    actor.updateSource({
      "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      "prototypeToken.lockRotation": false,
      "prototypeToken.actorLink": true,
    });
  } else if (actor.type === `${MODULE_ID}.npcShip`) {
    actor.updateSource({
      "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.HOSTILE,
      "prototypeToken.lockRotation": false,
      "prototypeToken.actorLink": true,
      "prototypeToken.hidden": true,
    });
  } else if (actor.type === `${MODULE_ID}.torpedo`) {
    // Torpedoes can be created by GM (as templates) or spawned by the Ordnance Master.
    if (!game.user.isGM && !data.flags?.[MODULE_ID]?.fromOrdnanceMaster) {
      ui.notifications.error("Torpedoes can only be launched from the Ordnance Master role.");
      return false;
    }
    actor.updateSource({
      "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.NEUTRAL,
      "prototypeToken.lockRotation": false,
      "prototypeToken.actorLink": true,
    });
    // When created manually (not from Ordnance Master), set sane hull defaults
    if (!data.flags?.[MODULE_ID]?.fromOrdnanceMaster) {
      actor.updateSource({ "system.hull": { value: 0, max: 1 } });
    }
  } else if (actor.type === `${MODULE_ID}.strikeCraft`) {
    // Strike craft can be created by GM (as templates) or spawned by the Ordnance Master.
    if (!game.user.isGM && !data.flags?.[MODULE_ID]?.fromOrdnanceMaster) {
      ui.notifications.error("Strike craft can only be launched from the Ordnance Master role.");
      return false;
    }
    actor.updateSource({
      "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.NEUTRAL,
      "prototypeToken.lockRotation": false,
      "prototypeToken.actorLink": true,
    });
    // When created manually (not from Ordnance Master), set sane hull defaults
    if (!data.flags?.[MODULE_ID]?.fromOrdnanceMaster) {
      actor.updateSource({ "system.hull": { value: 0, max: 1 } });
    }
  }
});

// ── Shield Arc Overlay ───────────────────────────────────────────────────────

Hooks.on("canvasReady", () => {
  ShieldArcOverlay.refresh();
  refreshTokenVisibility();

  // Auto-link any existing unlinked ship tokens so that world-actor data
  // and token-actor data stay in sync (role assignments, combat state, etc.).
  if (game.user.isGM && canvas?.scene) {
    const shipTypes = [`${MODULE_ID}.ship`, `${MODULE_ID}.npcShip`];
    const unlinked = canvas.scene.tokens.filter(
      t => shipTypes.includes(t.actor?.type) && !t.actorLink
    );
    for (const td of unlinked) {
      console.warn(`${MODULE_ID} | Auto-linking unlinked ship token "${td.name}" (${td.id})`);
      td.update({ actorLink: true });
    }
  }
});

Hooks.on("updateActor", (actor) => {
  if (actor.type === `${MODULE_ID}.ship` || actor.type === `${MODULE_ID}.npcShip`) {
    ShieldArcOverlay.refresh();
    refreshTokenVisibility();
  }
});

// refreshToken fires every time a token is redrawn, including each frame of
// movement animation and during manual drag  -  giving smooth overlay tracking.
// applyTokenVisibility runs AFTER all render flags are resolved, ensuring our
// visibility overrides survive Foundry's _refreshState / _refreshVisibility.
Hooks.on("refreshToken", (token) => {
  ShieldArcOverlay._redrawToken(token);
  WeaponArcOverlay.onRefreshToken(token);
  applyTokenVisibility(token);
});

// When a token is deleted, destroy its shield overlay immediately.
Hooks.on("deleteToken", (tokenDoc) => {
  ShieldArcOverlay._destroyToken(tokenDoc.id);
  WeaponArcOverlay.destroyAll();

  // Auto-delete world actors spawned by ordnance launch
  if (game.user.isGM && tokenDoc.actor?.flags?.[MODULE_ID]?.fromOrdnanceMaster) {
    // Track destroyed strike craft (does not come back during the fight)
    // Skip if craft is being recovered (not destroyed)
    if (tokenDoc.actor?.type === `${MODULE_ID}.strikeCraft` && !tokenDoc.actor?.flags?.[MODULE_ID]?.recovering && !ShipCombatState._suppressDestroyTracking) {
      const parentTokenId = tokenDoc.actor?.system?.parentShipTokenId;
      if (parentTokenId) {
        const parentToken = canvas?.scene?.tokens.get(parentTokenId);
        const ship = parentToken?.actor;
        if (ship) {
          const current = ship.system?.resources?.ordnance?.craftDestroyed ?? 0;
          ship.update({ "system.resources.ordnance.craftDestroyed": current + 1 });
        }
      }
    }
    const actorId = tokenDoc.actorId;
    const actor = game.actors.get(actorId);
    if (actor) actor.delete();
  }

  // Re-render any open ship sheets so Deployed Ordnance list updates live
  const parentId = tokenDoc.actor?.system?.parentShipTokenId;
  if (parentId) {
    const parentToken = canvas?.scene?.tokens.get(parentId);
    if (parentToken?.actor?.sheet?.rendered) {
      parentToken.actor.sheet.render();
    }
  }
});

// ── Reroll detection: if a tracked piloting message is updated, sync new SL ──

Hooks.on("updateChatMessage", (message, changes) => {
  // Only the GM should write back to the ship actor
  if (!game.user.isGM) return;

  const ship = ShipCombatState.ship;
  if (!ship) return;

  const trackedId = ship.system.resources?.pilot?.pilotingMessageId;
  if (!trackedId || message.id !== trackedId) return;

  // The message's system data may have been updated by a reroll
  const newSL = message.system?.result?.SL;
  if (newSL == null) return;

  const clampedSL = Math.max(0, newSL);
  const currentSL = ship.system.resources?.pilot?.pilotingSL ?? 0;
  if (clampedSL === currentSL) return;

  // Update SL and reset allocations if they exceed the new pool
  const allocSpeed = ship.system.resources?.pilot?.allocSpeed ?? 0;
  const allocMano  = ship.system.resources?.pilot?.allocMano  ?? 0;
  const updates = { "resources.pilot.pilotingSL": clampedSL };
  if (allocSpeed + allocMano > clampedSL) {
    updates["resources.pilot.allocSpeed"] = 0;
    updates["resources.pilot.allocMano"]  = 0;
  }
  ShipCombatState.update(updates);
});

// ── Sync helm reset with Foundry combat tracker turn/round advancement ────
// When the ship's turn ends in the Foundry tracker: auto-move if idle,
// When the ship's turn ends: auto-move at minimum speed if idle.
// When the ship's turn starts: apply Internal Fire → Hull Damage, then reset
// helm state and all allocations for the new turn.

Hooks.on("updateCombat", async (combat, changes) => {
  if (!game.user.isGM) return;
  if (!("round" in changes) && !("turn" in changes)) return;

  const ship = ShipCombatState.ship;
  if (!ship) return;

  const shipCombatant = combat.combatants.find(c => c.actor?.id === ship.id);
  if (!shipCombatant) return;

  const prevCombatantId    = combat.previous?.combatantId;
  const currentCombatantId = combat.combatant?.id;

  // ── Ship's turn ENDED: auto-move at minimum speed if the ship didn't move ──
  if (prevCombatantId === shipCombatant.id) {
    const fuelBurned = ship.system.resources?.pilot?.fuelBurned ?? 0;
    if (fuelBurned === 0) {
      const token = ship.getActiveTokens()?.[0];
      if (token) {
        const speed = (ship.system.movement?.speed ?? 6)
                    + (ship.system.resources?.pilot?.allocSpeed ?? 0);
        const prevTurnMove = ship.system.resources?.pilot?.prevTurnMove ?? 0;
        const minMove      = Math.ceil(prevTurnMove / 2);
        const bearing      = ship.system.resources?.pilot?.bearing ?? 0;

        if (minMove > 0) {
          const projected = HelmPreview.projectPosition(token, bearing, 0, speed, minMove);
          if (projected) {
            await ShipCombatState.confirmMovement({
              fuelUsed: 0,
              newX: projected.x,
              newY: projected.y,
              newRotation: projected.rotation,
              gridSquaresMoved: minMove,
            });
          }
        }
      }
    }
  }

  // ── Ship's turn STARTED: apply effects and reset all allocations ───────────
  if (currentCombatantId === shipCombatant.id) {
    // 1. Carry forward prevTurnMove computed from last turn's fuel before reset
    const fuelBurned   = ship.system.resources?.pilot?.fuelBurned ?? 0;
    const speed        = ship.system.movement?.speed ?? 6;
    const prevTurnMove = (fuelBurned / 100) * speed;
    await ShipCombatState.update({ "resources.pilot.prevTurnMove": prevTurnMove });

    // 2. Per-round condition effects  -  capture fire BEFORE updates so Hull High
    //    doesn't also apply the new fire as hull damage in the same tick
    const fireBefore   = ship.system.internalFire ?? 0;
    const sysConds     = ship.system.conditions ?? {};
    const condHullTier = sysConds.hull?.tier;
    const condUp       = {};
    if (condHullTier) {
      const dmgMap = { low: 1, medium: 2, high: 3 };
      const hullVal = ship.system.hull?.value ?? 0;
      const hullMax = ship.system.hull?.max   ?? 40;
      condUp["hull.value"] = Math.min(hullMax, hullVal + (dmgMap[condHullTier] ?? 0));
      if (condHullTier === "high") {
        condUp.internalFire = fireBefore + 5;
      }
    }
    if (sysConds.coreSystems?.tier === "high") {
      condUp["resources.enginseer.heat"] = (ship.system.resources?.enginseer?.heat ?? 0) + 5;
    }
    if (Object.keys(condUp).length > 0) {
      await ShipCombatState.update(condUp);
    }

    // 3. Internal Fire (pre-condition snapshot) → Hull Damage
    if (fireBefore > 0) {
      const curDamage = ship.system.hull?.value ?? 0;
      const maxDamage = ship.system.hull?.max   ?? 40;
      const newDamage = Math.min(maxDamage, curDamage + fireBefore);
      await ShipCombatState.update({ "hull.value": newDamage });
    }

    // 4. Reset helm state and all allocations for the new turn
    await ShipCombatState.resetHelmState();
    await ShipCombatState.resetActions();
  }

  // ── NPC ship turn STARTED: condition effects, internal fire, flux reset ───
  if (currentCombatantId && canvas?.scene) {
    const currentCombatant = combat.combatants.get(currentCombatantId);
    if (currentCombatant?.actor?.type === `${MODULE_ID}.npcShip`) {
      const npcActor = currentCombatant.actor;
      const npcSys   = npcActor.system;
      const npcUpd   = {};

      // Voidshield flux: reset remaining to max
      const fluxMax = npcSys.voidshieldFlux ?? 0;
      if (fluxMax > 0) {
        npcUpd["system.voidshieldFluxRemaining"] = fluxMax;
      }

      // Hull crit condition: per-round hull damage (Low +1, Medium +2, High +3)
      const conds    = npcSys.conditions ?? {};
      const hullTier = conds.hull?.tier;
      if (hullTier) {
        const dmgMap = { low: 1, medium: 2, high: 3 };
        const hullVal = npcSys.hull?.value ?? 0;
        const hullMax = npcSys.hull?.max   ?? 50;
        npcUpd["system.hull.value"] = Math.min(hullMax, hullVal + (dmgMap[hullTier] ?? 0));
        // Critical Breach (High): also +5 internal fire per round
        if (hullTier === "high") {
          npcUpd["system.internalFire"] = (npcSys.internalFire ?? 0) + 5;
        }
      }

      // Reactor Breach (Core Systems High): +5 heat per round
      if (conds.coreSystems?.tier === "high") {
        const heatMax = npcSys.heatMax ?? 10;
        npcUpd["system.heat"] = Math.min(heatMax, (npcSys.heat ?? 0) + 5);
      }

      // Internal fire → hull damage (uses updated internalFire if just incremented)
      const fire = npcUpd["system.internalFire"] ?? (npcSys.internalFire ?? 0);
      if (fire > 0) {
        const hullVal = npcUpd["system.hull.value"] ?? (npcSys.hull?.value ?? 0);
        const hullMax = npcSys.hull?.max ?? 50;
        npcUpd["system.hull.value"] = Math.min(hullMax, hullVal + fire);
      }

      if (Object.keys(npcUpd).length > 0) {
        await npcActor.update(npcUpd);
      }
    }
  }
});

// ── BDA-Pending chat card: Augur-only launch button ─────────────────────────

Hooks.on("renderChatMessage", (message, html) => {
  const flags = message.flags?.[MODULE_ID];
  if (flags?.type !== "bdaPending") return;

  const btn = html[0]?.querySelector("[data-action='openBDAFromChat']");
  if (!btn) return; // Already in rolled/completed state  -  no button in template

  const augurUserId = flags.augurUserId;
  if (game.user.id !== augurUserId) {
    btn.remove();
    return;
  }

  let _launching = false;
  btn.addEventListener("click", async () => {
    if (_launching) return;
    _launching = true;
    btn.disabled = true;

    const ship = ShipCombatState.ship;
    if (!ship) { _launching = false; btn.disabled = false; return; }

    await launchBDAFromChat(ship, message);
  });
});

// ── Public API ────────────────────────────────────────────────────────────

window.ImpMalShipCombat = {
  ShipCombatState,
  ShipModel,
  ShipSheet,
  HelmPreview,
  getShip: () => ShipCombatState.ship,

};
