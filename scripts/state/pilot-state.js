/**
 * pilot-state.js – Helm movement and pilot overcharge actions extracted from ShipCombatState.
 *
 * Every exported function is attached as a static method on ShipCombatState.
 * Inside each function, `this` refers to the ShipCombatState class itself.
 */

import { MODULE_ID } from "../constants.js";
import { getHitQuadrant } from "../apps/TargetingPopup.js";
import { rollCrit } from "./crit-state.js";

/**
 * Consume the pilot's assigned Power Core and record the overcharge action played.
 * Returns false without doing anything if the role has no core.
 * @param {string} userId
 * @param {string} actionId  – "overdrive" | "strafe" | "retro"
 */
export async function consumePilotCore(userId, actionId) {
  if (!this.hasPowerCore("pilot")) return false;
  const data      = this.getData();
  const coreCount = data.resources?.pilot?.coreCount ?? 0;
  if (coreCount <= 0) return false;
  const played = [...(data.resources?.pilot?.coreActionsPlayed ?? []), actionId];
  await this.update({
    "resources.pilot.coreCount":         Math.max(0, coreCount - 1),
    "resources.pilot.coreActionsPlayed": played,
  });
  return true;
}

/**
 * Overcharge – Retrograde Thrust: reduce the min-move obligation by retroValue VU.
 */
export async function pilotRetrograde(userId, retroValue, newX, newY, newRotation, waypoints) {
  const consumed = await this.consumePilotCore(userId, "retro");
  if (!consumed) return;

  const data          = this.getData();
  const prevMove      = data.resources?.pilot?.prevTurnMove ?? 0;
  const currentMin    = Math.ceil(prevMove / 2);
  const newMin        = Math.max(0, currentMin - retroValue);
  await this.update({ "resources.pilot.prevTurnMove": newMin * 2 });
}

/**
 * Overcharge – Maximum Overdrive: flag the overdrive state so the helm
 * context doubles effective speed this turn.
 */
export async function pilotOverdrive(userId) {
  const consumed = await this.consumePilotCore(userId, "overdrive");
  if (!consumed) return;
  await this.update({ "resources.pilot.overdrive": true });
}

/**
 * Overcharge – Strafe: move the ship token laterally without changing heading.
 */
export async function pilotStrafe(userId, newX, newY, newRotation, dist, waypoints) {
  const consumed = await this.consumePilotCore(userId, "strafe");
  if (!consumed) return;
  await this.confirmMovement({ fuelUsed: this.getData().resources?.pilot?.fuelBurned ?? 0, newX, newY, newRotation, gridSquaresMoved: dist, waypoints });
}

/**
 * Overcharge – Flip and Burn: rotate 180° in place, then burn sternward at half
 * effective speed. Requires ≥50% power remaining; consumes 50% power and one Core.
 */
export async function pilotFlipAndBurn(userId, halfSpeedUnits, newX, newY, newRotation, waypoints) {
  const consumed = await this.consumePilotCore(userId, "flipBurn");
  if (!consumed) return;
  const data       = this.getData();
  const fuelBurned = data.resources?.pilot?.fuelBurned ?? 0;
  await this.confirmMovement({
    fuelUsed:         fuelBurned + 50,
    newX,
    newY,
    newRotation,
    gridSquaresMoved: halfSpeedUnits,
    waypoints,
  });
}

/**
 * AP → Thrust: spend 1 Auxiliary Power to raise the helmsman's powerMax by powerPerAP %.
 * The bonus is stored as `resources.pilot.apThrustBonus` and cleared at round end.
 */
export async function apToThrust(userId) {
  const data = this.getData();
  const ap = data.resources?.enginseer?.auxiliaryPower ?? 0;
  if (ap <= 0) return;

  const engine = this.ship?.items.find(i => i.type === `${MODULE_ID}.component` && i.system.slot === "engine");
  const powerPerAP = engine?.system?.powerPerAP ?? 0;
  if (powerPerAP <= 0) {
    return ui.notifications.warn("Engine has no Power Per AP rating configured.");
  }

  const current = data.resources?.pilot?.apThrustBonus ?? 0;
  await this.update({
    "resources.enginseer.auxiliaryPower": Math.max(0, ap - 1),
    "resources.pilot.apThrustBonus": current + powerPerAP,
  });
}

/**
 * Confirm a helm movement segment. Updates fuel burned, drift accumulated, prevTurnMove, and token position.
 */
export async function confirmMovement({ fuelUsed, driftUsed = 0, speed, newX, newY, newRotation, gridSquaresMoved, waypoints }) {
  const data = this.getData();
  const effectiveSpeed = speed
    ?? (this.ship?.system?.movement?.speed ?? 6) + (data.resources?.pilot?.allocSpeed ?? 0);
  const existingDrift  = data.resources?.pilot?.driftBurned ?? 0;
  const newDriftBurned = existingDrift + driftUsed;
  // prevTurnMove = total grid squares moved this turn (fuel-based + accumulated drift)
  const prevTurnMove = (fuelUsed / 100) * effectiveSpeed + newDriftBurned;
  await this.update({
    "resources.pilot.fuelBurned":   fuelUsed,
    "resources.pilot.driftBurned":  newDriftBurned,
    "resources.pilot.prevTurnMove": prevTurnMove,
  });

  if (!waypoints?.length) {
    const token = this.ship?.getActiveTokens()?.[0];
    if (token) await token.document.update({ x: newX, y: newY, rotation: newRotation }, { animate: true });
  }
}

/**
 * Ram manoeuvre: arc the voidship along a computed heading to impact a target.
 * Movement is committed identically to a normal helm confirmation, then damage
 * is applied to both ships (bypassing shields and armour), lockouts are set,
 * the rammed ship is displaced half a tile, and the ramming ship rotates ±20°.
 *
 * Damage formula:
 *   thrustFraction  = fuelUsed / powerMax  (capped at 1.0)
 *   angleModifier   = 0.5 + 0.5 × |sin(θ)|  where θ is impact angle from rammed ship's heading
 *                     → 1.0 at broadside, 0.5 at bow/stern
 *
 *   To rammed ship   = (max(1, ramming.armour.bow) + 0.1 × ramming.hull.max)
 *                      × thrustFraction × angleModifier × COEFF
 *   To ramming ship  = (max(1, rammed.armour[hitSector]) + 0.1 × rammed.hull.max)
 *                      × thrustFraction × 1.0 × COEFF
 *
 * Both sides bypass shields AND armour (direct hull damage).
 *
 * @param {string}   userId
 * @param {string}   targetTokenId   – id of the rammed token document
 * @param {number}   fuelUsed        – total fuel consumed this move
 * @param {number}   driftUsed       – drift units applied
 * @param {number}   speed           – effective speed (grid squares per 100% power)
 * @param {number}   newX            – ramming ship final canvas X
 * @param {number}   newY            – ramming ship final canvas Y
 * @param {number}   newRotation     – ramming ship final rotation
 * @param {object[]} waypoints       – animation path
 * @param {number}   attackAngle     – angle (radians) from ramming ship centre to rammed ship centre
 * @param {number}   powerMax        – maximum power for thrust-fraction calculation
 */
export async function pilotRam(
  userId, targetTokenId, fuelUsed, driftUsed, speed,
  newX, newY, newRotation, waypoints, attackAngle, powerMax,
  rammingActorId = null,
) {
  const RAM_COEFF = 2; // Tunable damage coefficient

  // ── Resolve the ramming actor ──────────────────────────────────────────────
  // If rammingActorId points to an NPC actor, operate on it directly.
  // If null (or the player ship), use the normal ShipCombatState path.
  const isNpcRam = rammingActorId && rammingActorId !== this.ship?.id;
  const rammingActor = isNpcRam
    ? (game.actors?.get(rammingActorId) ?? null)
    : this.ship;
  if (!rammingActor) return;

  // ── 1. Commit movement ─────────────────────────────────────────────────────
  if (isNpcRam) {
    // NPC path: update actor + token directly
    const effectiveSpeed = rammingActor.system?.resources?.pilot?.speed ?? speed;
    const prevTurnMove   = (fuelUsed / 100) * effectiveSpeed;
    await rammingActor.update({
      "system.resources.pilot.fuelBurned":   fuelUsed,
      "system.resources.pilot.prevTurnMove": prevTurnMove,
      "system.resources.pilot.prowGunLocked":  true,
      "system.resources.pilot.ramAllocLocked": true,
    });
    const npcToken = rammingActor.getActiveTokens?.()?.[0];
    if (npcToken) {
      await npcToken.document.update({ x: newX, y: newY, rotation: newRotation }, { animate: true });
    }
  } else {
    // Player ship path: delegate to ShipCombatState helpers
    await this.confirmMovement({ fuelUsed, driftUsed, speed, newX, newY, newRotation, waypoints });
    await this.update({
      "resources.pilot.prowGunLocked":  true,
      "resources.pilot.ramAllocLocked": true,
    });
  }

  // ── 3. Find rammed actor ───────────────────────────────────────────────────
  const rammingSys  = rammingActor.system;

  // Search canvas tokens first (scene-linked), then world actors as fallback
  let rammedToken = canvas?.tokens?.placeables?.find(t => t.id === targetTokenId)
    ?? canvas?.tokens?.placeables?.find(t => t.document?.id === targetTokenId);
  let rammedActor = rammedToken?.document?.actor ?? rammedToken?.actor;
  if (!rammedActor) {
    // Fallback: look in scene tokens
    const tokenDoc = canvas?.scene?.tokens?.find(t => t.id === targetTokenId);
    rammedActor = tokenDoc?.actor ?? null;
  }
  if (!rammedActor) {
    console.warn("IMSC | pilotRam: could not find rammed actor for token", targetTokenId);
    return;
  }
  const rammedSys = rammedActor.system;

  // ── 4. Compute thrust fraction ────────────────────────────────────────────
  const safeMax         = powerMax > 0 ? powerMax : 100;
  const thrustFraction  = Math.min(1, fuelUsed / safeMax);

  // ── 5. Angle modifier for rammed ship (from rammed ship's heading) ─────────
  // attackAngle: vector FROM ramming ship TO rammed ship (atan2)
  // incoming   : angle from rammed ship's bow to the impact vector
  const rammedRotation  = rammedToken?.document?.rotation ?? rammedActor.getActiveTokens?.()?.[0]?.document?.rotation ?? 0;
  const tgtHeadingRad   = (rammedRotation - 90) * (Math.PI / 180);
  let   incoming        = attackAngle - tgtHeadingRad + Math.PI;
  // Normalise to [−π, +π]
  while (incoming >  Math.PI) incoming -= 2 * Math.PI;
  while (incoming < -Math.PI) incoming += 2 * Math.PI;
  const angleModRammed  = 0.5 + 0.5 * Math.abs(Math.sin(incoming));

  // ── 6. Hit sector on rammed ship ───────────────────────────────────────────
  const hitSectorRammed = getHitQuadrant(rammedRotation, attackAngle);

  // ── 7. Damage TO rammed ship (uses RAMMING ship's stats) ──────────────────
  const rammingBowArmour = Math.max(1, rammingSys?.armour?.bow ?? 0);
  const rammingHullMax   = rammingSys?.hull?.max ?? 50;
  const rammingBase      = rammingBowArmour + 0.1 * rammingHullMax;
  const damageToRammed   = Math.max(1, Math.round(rammingBase * thrustFraction * angleModRammed * RAM_COEFF));

  // ── 8. Damage TO ramming ship (uses RAMMED ship's stats; bow armour soaks) ──
  const rammingTakesArmour  = Math.max(1, rammedSys?.armour?.[hitSectorRammed] ?? 0);
  const rammingTakesHullMax = rammedSys?.hull?.max ?? 50;
  const rammingBase2        = rammingTakesArmour + 0.1 * rammingTakesHullMax;
  const rawDamageToRamming  = Math.round(rammingBase2 * thrustFraction * 1.0 * RAM_COEFF);
  const damageToRamming     = Math.max(0, rawDamageToRamming - rammingBowArmour);

  // ── 9. Apply hull damage to rammed ship (bypasses shields and armour) ──────
  const rammedHullCur = rammedSys?.hull?.value ?? 0;
  const rammedHullMax = rammedSys?.hull?.max ?? 50;
  await rammedActor.update({
    "system.hull.value": Math.min(rammedHullMax, rammedHullCur + damageToRammed),
  });

  // ── 10. Apply hull damage to ramming ship ─────────────────────────────────
  const rammingHullCur = rammingSys?.hull?.value ?? 0;
  await rammingActor.update({
    "system.hull.value": Math.min(rammingHullMax, rammingHullCur + damageToRamming),
  });

  // ── 11. Crit rolls for both ships ─────────────────────────────────────────
  if (damageToRammed  > 0) await rollCrit.call(this, rammedActor,   damageToRammed,  false, 0);
  if (damageToRamming > 0) await rollCrit.call(this, rammingActor,  damageToRamming, false, 0);

  // ── 12. Displace rammed ship half a tile in the impact direction ──────────
  if (rammedToken && canvas?.ready) {
    const gridSize   = canvas.grid.size;
    const halfTile   = gridSize * 0.5;
    const displaceX  = (rammedToken.document?.x ?? 0) + Math.cos(attackAngle) * halfTile;
    const displaceY  = (rammedToken.document?.y ?? 0) + Math.sin(attackAngle) * halfTile;
    await rammedToken.document.update({ x: displaceX, y: displaceY }, { animate: true });
  }

  // ── 13. Rotate ramming ship ±20° randomly ─────────────────────────────────
  const rammingToken = rammingActor?.getActiveTokens?.()?.[0];
  if (rammingToken && canvas?.ready) {
    const jitter    = Math.random() * 40 - 20; // −20° to +20°
    const newRot    = ((rammingToken.document.rotation ?? 0) + jitter + 360) % 360;
    await rammingToken.document.update({ rotation: newRot }, { animate: false });
  }

  // ── 14. Chat message ───────────────────────────────────────────────────────
  const thrustPct = Math.round(thrustFraction * 100);
  const attackAngleDeg = Math.round(Math.abs(incoming) * (180 / Math.PI));
  const rammingName = rammingActor.name ?? "Unknown";
  const rammingTokenDoc = rammingToken?.document;
  const rammingImg  = rammingTokenDoc?.texture?.src ?? rammingActor.img ?? "";
  const rammedImg   = rammedToken?.document?.texture?.src ?? rammedActor.img ?? "";
  const quadLabel   = hitSectorRammed.charAt(0).toUpperCase() + hitSectorRammed.slice(1);
  const publicContent = `
    <div class="imsc-ram-chat">
      <div class="imsc-ram-chat-header">
        <i class="fa-solid fa-burst" style="color:#ff6b6b"></i>
        <strong>${game.i18n.format("IMSC.Ram.ChatTitle", { name: rammingName })}</strong>
      </div>
      <p>${game.i18n.format("IMSC.Ram.ChatPublic", {
        attacker: rammingName,
        target:   rammedActor.name ?? "Unknown",
        sector:   game.i18n.localize(`IMSC.Sector.${quadLabel}`),
        thrust:   thrustPct,
      })}</p>
      <p style="font-size:0.85em;color:#e8a87c"><i class="fa-solid fa-ban"></i> ${game.i18n.localize("IMSC.Ram.ChatLockouts")}</p>
    </div>`;
  const gmContent = `
    <div class="imsc-ram-chat">
      <div class="imsc-ram-chat-header">
        <i class="fa-solid fa-burst" style="color:#ff6b6b"></i>
        <strong>${game.i18n.localize("IMSC.Ram.ChatDamageTitle")}</strong>
      </div>
      <table class="imsc-ram-dmg-table">
        <tr><td>${rammingName}</td><td style="color:#ff6b6b">${damageToRamming} hull damage</td></tr>
        <tr><td>${rammedActor.name}</td><td style="color:#ff6b6b">${damageToRammed} hull damage</td></tr>
      </table>
      <p style="font-size:0.85em;color:#888">${game.i18n.format("IMSC.Ram.ChatDamageNote", { thrust: thrustPct, angle: attackAngleDeg, sector: game.i18n.localize(`IMSC.Sector.${quadLabel}`) })}</p>
    </div>`;

  await ChatMessage.create({
    content: publicContent,
    speaker: { alias: rammingName },
  });
  await ChatMessage.create({
    content: gmContent,
    speaker: { alias: game.i18n.localize("IMSC.Ram.ChatGMAlias") },
  });
}
