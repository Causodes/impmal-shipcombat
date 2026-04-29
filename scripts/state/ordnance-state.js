/**
 * ordnance-state.js – Ordnance token spawning and management extracted from ShipCombatState.
 *
 * Every exported function is attached as a static method on ShipCombatState.
 * Inside each function, `this` refers to the ShipCombatState class itself.
 */

import { MODULE_ID } from "../constants.js";

/**
 * Spawn a torpedo or strike craft token near the ship.
 * If the ship has an ordnance actor template assigned, clone its data.
 * GM-only  -  called via socket from the OM's launch actions.
 */
export async function spawnOrdnance({ type, parentShipTokenId, x, y, rotation, templateId }) {
  if (!game.user.isGM) return;

  const actorType = type === "strikeCraft"
    ? `${MODULE_ID}.strikeCraft`
    : `${MODULE_ID}.torpedo`;
  const slotKey = type === "strikeCraft" ? "strikeCraft" : "torpedo";
  const defaultName = type === "strikeCraft" ? "Strike Craft" : "Torpedo";

  // ── Try to clone from the ship's embedded ordnance actor template ──
  const shipToken = canvas?.scene?.tokens.get(parentShipTokenId);
  const shipActor = shipToken?.actor;
  const templates = shipActor?.system?.ordnanceActors?.[slotKey] ?? [];
  // Use the specified template if provided, otherwise fall back to the first
  const templateRef = (templateId ? templates.find(t => t.id === templateId) : null) ?? templates[0];

  // Look up salvo/flight size from weapons bay component
  let hullOverride = 1;
  if (shipActor) {
    const bay = shipActor.items.find(i => i.type === `${MODULE_ID}.component` && i.system.slot === "weaponsBay");
    if (type === "torpedo") {
      hullOverride = bay?.system?.bayTorpedoSalvoSize ?? 1;
    } else if (type === "strikeCraft") {
      hullOverride = bay?.system?.bayStrikeCraftFlightSize ?? 1;
    }
  }

  let actorData;
  if (templateRef?.actorData) {
    // Inline embedded data  -  use directly (no external actor needed)
    actorData = foundry.utils.deepClone(templateRef.actorData);
    actorData._id = undefined;
    actorData.flags = foundry.utils.mergeObject(actorData.flags ?? {}, {
      [MODULE_ID]: { fromOrdnanceMaster: true },
    });
    actorData.system.parentShipTokenId = parentShipTokenId;
    actorData.system.turnComplete = type !== "strikeCraft";  // craft can manoeuvre on launch turn
    actorData.system.hull = { value: 0, max: hullOverride };
  } else if (templateRef?.uuid) {
    // Legacy UUID reference  -  fetch from world actors
    let templateActor = null;
    try { templateActor = await fromUuid(templateRef.uuid); } catch { /* not found */ }
    if (templateActor) {
      actorData = templateActor.toObject();
      actorData._id = undefined;
      actorData.flags = foundry.utils.mergeObject(actorData.flags ?? {}, {
        [MODULE_ID]: { fromOrdnanceMaster: true },
      });
      actorData.system.parentShipTokenId = parentShipTokenId;
      actorData.system.turnComplete = type !== "strikeCraft";
      actorData.system.hull = { value: 0, max: hullOverride };
    } else {
      actorData = {
        name: defaultName,
        type: actorType,
        flags: { [MODULE_ID]: { fromOrdnanceMaster: true } },
        system: { parentShipTokenId, hull: { value: 0, max: hullOverride } },
      };
    }
  } else {
    actorData = {
      name: defaultName,
      type: actorType,
      flags: { [MODULE_ID]: { fromOrdnanceMaster: true } },
      system: { parentShipTokenId, hull: { value: 0, max: hullOverride } },
    };
  }

  const actor = await Actor.create(actorData);
  if (!actor) return;

  if (canvas?.scene) {
    const tokenOverrides = { x, y, rotation, hidden: false, disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL };
    tokenOverrides.width = 0.5;
    tokenOverrides.height = 0.5;
    const tokenData = await actor.getTokenDocument(tokenOverrides);
    await canvas.scene.createEmbeddedDocuments("Token", [tokenData.toObject()]);
  }

  // Re-render any open ship sheets so Deployed Ordnance updates immediately
  if (shipActor?.sheet?.rendered) {
    shipActor.sheet.render();
  }
}

/**
 * Set the RTB flag on a deployed ordnance token.
 */
export async function setOrdnanceRtb(tokenId, rtb) {
  if (!game.user.isGM || !canvas?.scene) return;
  const td = canvas.scene.tokens.get(tokenId);
  if (!td?.actor) return;
  await td.actor.update({ "system.rtb": !!rtb });
}

/**
 * Set the turnComplete flag on a deployed ordnance token.
 */
export async function setOrdnanceTurnDone(tokenId, done) {
  if (!game.user.isGM || !canvas?.scene) return;
  const td = canvas.scene.tokens.get(tokenId);
  if (!td?.actor) return;
  await td.actor.update({ "system.turnComplete": !!done });
}

/**
 * Designate a hostile torpedo: locks helm controls for this round.
 * Sets designated=true (powerMax→0, maneuverability→0, detonate disabled).
 * The torpedo still auto-drifts its minimum distance in advanceRound.
 */
export async function designateHostileTorpedo(tokenId) {
  if (!game.user.isGM || !canvas?.scene) return;
  const td = canvas.scene.tokens.get(tokenId);
  if (!td?.actor) return;
  await td.actor.update({ "system.designated": true });
}

/**
 * Set the powerBoostActive flag on an allied torpedo, doubling its power
 * maximum (100 → 200) so it can commit up to 200% thrust this turn.
 */
export async function torpedoPowerBoost(tokenId) {
  if (!game.user.isGM || !canvas?.scene) return;
  const td = canvas.scene.tokens.get(tokenId);
  if (!td?.actor) return;
  await td.actor.update({ "system.powerBoostActive": true });
}
