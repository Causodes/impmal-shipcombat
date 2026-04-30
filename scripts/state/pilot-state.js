/**
 * pilot-state.js – Helm movement and pilot overcharge actions extracted from ShipCombatState.
 *
 * Every exported function is attached as a static method on ShipCombatState.
 * Inside each function, `this` refers to the ShipCombatState class itself.
 */

import { MODULE_ID } from "../constants.js";

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
