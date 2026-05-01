/**
 * Pilot / Helmsman role – all helm-related action handlers, state management,
 * and preview logic extracted from ShipSheet.
 *
 * Every function in PILOT_ACTIONS is a static action handler (bound to the sheet
 * instance by Foundry's ApplicationV2 action system).
 * The lifecycle hooks (onRender, updatePreview) must be called from ShipSheet.
 */
import { emitToGM } from "../socket.js";
import { HelmPreview } from "../canvas/HelmPreview.js";
import { SystemAdapter } from "../systems/SystemAdapter.js";

// ── Action handlers (static, `this` = sheet instance) ──────────────────────

async function _onAllocBonus(event, target) {
  const sys = this.actor.system;
  const stat  = target.dataset.stat;
  const delta = Number(target.dataset.delta);
  const pilotingSL  = sys.resources?.pilot?.pilotingSL  ?? 0;
  const allocSpeed   = sys.resources?.pilot?.allocSpeed   ?? 0;
  const allocMano    = sys.resources?.pilot?.allocMano    ?? 0;
  const allocEvasion = sys.resources?.pilot?.allocEvasion ?? 0;
  const fuelBurned   = sys.resources?.pilot?.fuelBurned   ?? 0;

  if (fuelBurned > 0) return;

  let newAllocSpeed   = allocSpeed;
  let newAllocMano    = allocMano;
  let newAllocEvasion = allocEvasion;

  if (stat === "speed") {
    newAllocSpeed = Math.max(0, allocSpeed + delta);
  } else if (stat === "mano") {
    newAllocMano = Math.max(0, allocMano + delta);
  } else if (stat === "evasion") {
    newAllocEvasion = Math.max(0, allocEvasion + delta);
  }

  if (newAllocSpeed + newAllocMano + newAllocEvasion > pilotingSL) return;

  if (stat === "speed") {
    emitToGM("updateResource", { roleId: "pilot", key: "allocSpeed",   value: newAllocSpeed });
  } else if (stat === "mano") {
    emitToGM("updateResource", { roleId: "pilot", key: "allocMano",    value: newAllocMano });
  } else if (stat === "evasion") {
    emitToGM("updateResource", { roleId: "pilot", key: "allocEvasion", value: newAllocEvasion });
  }
}

async function _onRollPiloting() {
  const sys = this.actor.system;
  let crewActor = null;

  const pilotRef = sys.crewActors?.pilot;
  if (pilotRef?.uuid) {
    try { crewActor = await fromUuid(pilotRef.uuid); } catch { /* ignore */ }
  }

  if (!crewActor) {
    const entry = Object.entries(sys.roles ?? {}).find(([, r]) => r === "pilot");
    if (entry) {
      const user = game.users.get(entry[0]);
      crewActor = user?.character ?? null;
    }
  }

  if (!crewActor) {
    return ui.notifications.warn(game.i18n.localize("IMSC.Warning.NoPilotAssigned"));
  }

  const result = await SystemAdapter.current.rollSkillTest(crewActor, "pilot");
  if (!result) return;

  const sl = Math.max(0, result.SL);
  emitToGM("updateResource", { roleId: "pilot", key: "pilotingSL",   value: sl });
  emitToGM("updateResource", { roleId: "pilot", key: "allocSpeed",   value: 0  });
  emitToGM("updateResource", { roleId: "pilot", key: "allocMano",    value: 0  });
  emitToGM("updateResource", { roleId: "pilot", key: "allocEvasion", value: 0  });

  const msgId = result.messageId ?? "";
  if (msgId) {
    emitToGM("updateResource", { roleId: "pilot", key: "pilotingMessageId", value: msgId });
  }
}

async function _onResetHelm() {
  emitToGM("resetHelmState", {});
}

async function _onConfirmHelm() {
  const token = this.actor.getActiveTokens()?.[0];
  if (!token) {
    ui.notifications.warn(game.i18n.localize("IMSC.Warning.NoShip"));
    return;
  }

  const sys        = this.actor.system;
  const speed      = (sys.movement?.speed ?? 6) + (sys.resources?.pilot?.allocSpeed ?? 0);
  const fuelBurned = sys.resources?.pilot?.fuelBurned ?? 0;
  const fuelSlider = this._helmState?.fuelSlider ?? fuelBurned;
  const bearing    = this._helmState?.bearing ?? 0;

  const thrustPct  = fuelSlider - fuelBurned;
  const prevTurnMove = sys.resources?.pilot?.prevTurnMove ?? 0;
  const minMove      = Math.ceil(prevTurnMove / 2);
  const isFirstCommit = fuelBurned === 0;
  const driftUnits = isFirstCommit ? minMove : 0;

  if (thrustPct <= 0 && driftUnits === 0) {
    ui.notifications.warn(game.i18n.localize("IMSC.Helm.WarnNoFuel"));
    return;
  }

  const projected = HelmPreview.projectPosition(token, bearing, thrustPct, speed, driftUnits);
  if (!projected) return;
  HelmPreview.hide();

  const waypoints = HelmPreview.projectWaypoints(token, bearing, thrustPct, speed, driftUnits);

  emitToGM("confirmMovement", {
    fuelUsed:       fuelSlider,
    driftUsed:      driftUnits,
    speed,
    newX:           projected.x,
    newY:           projected.y,
    newRotation:    projected.rotation,
    waypoints,
  });

  const round = sys.round ?? 0;
  this._helmState = {
    round,
    helmResetId: sys.resources?.pilot?.helmResetId ?? 0,
    bearing: 0,
    fuelSlider,
    confirmed: true,
  };
}

// ── Overcharge action handlers ──────────────────────────────────────────────

async function _onPilotRetrograde() {
  const sys = this.actor.system;
  if (!((sys.resources?.pilot?.coreCount ?? 0) > 0)) return;

  const token = this.actor.getActiveTokens()?.[0];
  if (!token) {
    ui.notifications.warn(game.i18n.localize("IMSC.Warning.NoShip"));
    return;
  }

  const retroValue   = this._retrogradeState?.value ?? 1;
  const prevTurnMove = sys.resources?.pilot?.prevTurnMove ?? 0;
  const minMove      = Math.ceil(prevTurnMove / 2);
  const backDist     = Math.max(0, retroValue - minMove);

  const projected = backDist > 0 ? HelmPreview.projectRetrograde(token, backDist) : null;
  const waypoints = backDist > 0 ? HelmPreview.projectRetrogradeWaypoints(token, backDist) : [];

  emitToGM("pilotRetrograde", {
    userId:      game.user.id,
    retroValue,
    newX:        projected?.x ?? token.document.x,
    newY:        projected?.y ?? token.document.y,
    newRotation: token.document.rotation,
    waypoints,
  });
}

async function _onPilotOverdrive() {
  const sys = this.actor.system;
  if (!((sys.resources?.pilot?.coreCount ?? 0) > 0)) return;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("IMSC.Dialog.OverdriveTitle") },
    content: `<p>${game.i18n.localize("IMSC.Dialog.OverdriveBody")}</p>`,
  });
  if (!confirmed) return;
  emitToGM("pilotOverdrive", { userId: game.user.id });
}

async function _onApToThrust() {
  const sys = this.actor.system;
  const ap = sys.resources?.enginseer?.auxiliaryPower ?? 0;
  if (ap <= 0) {
    ui.notifications.warn(game.i18n.localize("IMSC.Warning.NoAuxiliaryPower"));
    return;
  }
  emitToGM("apToThrust", { userId: game.user.id });
}

async function _onPilotStrafe() {
  const sys = this.actor.system;
  if (!((sys.resources?.pilot?.coreCount ?? 0) > 0)) return;

  const token = this.actor.getActiveTokens()?.[0];
  if (!token) {
    ui.notifications.warn(game.i18n.localize("IMSC.Warning.NoShip"));
    return;
  }

  const v = this._strafeState?.value ?? 0;
  if (v === 0) return;
  const dir  = Math.sign(v);
  const dist = Math.abs(v);

  const projected = HelmPreview.projectStrafe(token, dir, dist);
  if (!projected) return;

  const waypoints = HelmPreview.projectStrafeWaypoints(token, dir, dist);
  HelmPreview.hide();

  const dirLabel = dir === 1
    ? game.i18n.localize("IMSC.Helm.StrafeStarboard")
    : game.i18n.localize("IMSC.Helm.StrafePort");

  emitToGM("pilotStrafe", {
    userId:      game.user.id,
    newX:        projected.x,
    newY:        projected.y,
    newRotation: projected.rotation,
    dist,
    dirLabel,
    waypoints,
  });
}

// ── Exported action map (merged into ShipSheet.DEFAULT_OPTIONS.actions) ────

export const PILOT_ACTIONS = {
  allocBonus:      _onAllocBonus,
  rollPiloting:    _onRollPiloting,
  resetHelm:       _onResetHelm,
  confirmHelm:     _onConfirmHelm,
  pilotRetrograde: _onPilotRetrograde,
  pilotOverdrive:  _onPilotOverdrive,
  pilotStrafe:     _onPilotStrafe,
  apToThrust:      _onApToThrust,
};

// ── Helm context builder ────────────────────────────────────────────────────

export function buildHelmContext(sys, opts = {}) {
  const { engineComponent } = opts;
  const baseSpeed = sys.movement?.speed ?? 6;
  const baseMano  = sys.movement?.maneuverability ?? 2;
  const pilotingSL  = sys.resources?.pilot?.pilotingSL  ?? 0;
  const allocSpeed   = sys.resources?.pilot?.allocSpeed   ?? 0;
  const allocMano    = sys.resources?.pilot?.allocMano    ?? 0;
  const allocEvasion = sys.resources?.pilot?.allocEvasion ?? 0;
  const overdrive    = sys.resources?.pilot?.overdrive    ?? false;
  const speedPayloadBonus = sys.resources?.pilot?.payload === "fuelCatalyst"
    ? Math.max(1, Math.ceil(baseSpeed * 0.5))
    : 0;
  const manoPayloadBonus = sys.resources?.pilot?.payload === "chaffPods"
    ? Math.max(1, Math.ceil(baseMano * 0.5))
    : 0;

  // ── Captain card: Hard Over doubles base maneuverability ───────────────────────────
  const hardOverActive = sys.resources?.pilot?.hardOverActive ?? false;
  const effectiveBaseMano = hardOverActive ? baseMano * 2 : baseMano;
  const PILOT_BOOST_CARDS = ["pressTheAttack", "hardOver"];
  const _captainPlayedCards = sys.resources?.captain?.playedCards ?? [];
  const captainBoosts = _captainPlayedCards
    .filter(id => PILOT_BOOST_CARDS.includes(id))
    .map(id => ({
      id,
      label: game.i18n.localize(`IMSC.Captain.Card.${id}`),
    }));

  // ── Crit condition penalties ───────────────────────────────────────────────────────
  const conditions = sys.conditions ?? {};
  const engineTier = conditions.engines?.tier;
  const manTier    = conditions.manoeuvring?.tier;
  const enginePenalty = engineTier === "high" ? 4 : engineTier === "medium" ? 2 : engineTier === "low" ? 1 : 0;
  const manPenalty    = manTier    === "high" ? 4 : manTier    === "medium" ? 2 : manTier    === "low" ? 1 : 0;

  // ── Captain stance modifiers ───────────────────────────────────────────────────
  const stance       = sys.resources?.captain?.stance ?? "none";
  const stanceSpeedMod = stance === "aggressive" ? -1 : stance === "defensive" ? 1 : 0;
  const stanceManoMod  = stance === "aggressive" ? -1 : stance === "defensive" ? 1 : 0;

  const effSpeed   = Math.max(0, baseSpeed + allocSpeed + speedPayloadBonus + stanceSpeedMod - enginePenalty);
  const effMano    = Math.max(0, effectiveBaseMano + allocMano + manoPayloadBonus + stanceManoMod - manPenalty);
  const overdriveMult = overdrive ? 2 : 1;
  const powerPerAP    = engineComponent?.system?.powerPerAP ?? 0;
  const auxiliaryPower = sys.resources?.enginseer?.auxiliaryPower ?? 0;
  const auxPowerCapacity = opts.reactorStats?.auxPowerCapacity ?? 0;
  const apThrustBonus  = sys.resources?.pilot?.apThrustBonus ?? 0;
  const powerMax   = 100 * overdriveMult + apThrustBonus;
  const fuelBurned = sys.resources?.pilot?.fuelBurned ?? 0;
  const pilotingMessageId = sys.resources?.pilot?.pilotingMessageId ?? "";
  const prevTurnMove = sys.resources?.pilot?.prevTurnMove ?? 0;
  const minMove      = Math.ceil(prevTurnMove / 2);
  return {
    speed:           baseSpeed,
    maneuverability: baseMano,
    pilotingSL,
    allocSpeed,
    allocMano,
    allocEvasion,
    evasionPct:      allocEvasion * 5,
    overdrive,
    powerMax,
    effectiveSpeed:  effSpeed,
    effectiveMano:   effMano,
    remainingSL:     Math.max(0, pilotingSL - allocSpeed - allocMano - allocEvasion),
    allocLocked:     fuelBurned > 0,
    hasRolledPiloting: !!pilotingMessageId,
    minMove,
    prevTurnMove,
    minMovePct:      (powerMax > 0 && effSpeed > 0) ? Math.max(0, Math.round(minMove / effSpeed * (10000 / powerMax))) : 0,
    maxBearing:      effMano * 15,
    fuelBurned,
    fuelSlider:      fuelBurned,
    bearing:         sys.resources?.pilot?.bearing ?? 0,
    speedTooltip:    game.i18n.format("IMSC.Helm.SpeedTooltip",    { val: effSpeed }),
    manoTooltip:     game.i18n.format("IMSC.Helm.ManoTooltip",     { val: effMano * 15, mano: effMano }),
    minMoveTooltip:  game.i18n.format("IMSC.Helm.MinMoveTooltip",  { val: minMove }),
    strafeMax:       Math.max(1, Math.floor(baseSpeed / 2)),
    retroMax:        Math.max(1, baseSpeed),
    overchargeAction: sys.resources?.pilot?.overchargeAction ?? "",
    // Per-action flags for template button gating (replaced overchargedUsed boolean)
    overdriveUsed: (sys.resources?.pilot?.coreActionsPlayed ?? []).includes("overdrive"),
    strafeUsed:    (sys.resources?.pilot?.coreActionsPlayed ?? []).includes("strafe"),
    retroUsed:     (sys.resources?.pilot?.coreActionsPlayed ?? []).includes("retro"),
    coreActionsPlayedLabels: (() => {
      const played = sys.resources?.pilot?.coreActionsPlayed ?? [];
      const LABELS = { overdrive: "IMSC.Action.PilotOverdrive", strafe: "IMSC.Action.PilotStrafe", retro: "IMSC.Action.PilotOverchargeRetro" };
      return played.map(id => game.i18n.localize(LABELS[id] ?? id));
    })(),
    // Condition / stance info for UI
    enginePenalty,
    manPenalty,
    stanceSpeedMod,
    stanceManoMod,
    hasMovementCondition: enginePenalty > 0 || manPenalty > 0 || stanceSpeedMod !== 0 || stanceManoMod !== 0,
    hardOverActive,
    captainBoosts,
    hasCaptainFreeCore: false,
    // hasCoreAssigned drives the core action button visibility in the helm template.
    // True whenever ANY core is available (captain-granted OR enginseer-dispatched).
    hasCoreAssigned: (sys.resources?.pilot?.coreCount ?? 0) > 0,
    // Auxiliary Power (from enginseer resources, read-only display in pilot tab)
    auxiliaryPower,
    auxPowerCapacity,
    auxPowerPct: auxPowerCapacity > 0 ? Math.min(100, (auxiliaryPower / auxPowerCapacity) * 100) : 0,
    powerPerAP,
    apThrustBonus,
  };
}

// ── Helm _onRender wiring ───────────────────────────────────────────────────

/**
 * Wire up helm sliders and power bar.  Called from ShipSheet._onRender().
 * @param {ShipSheet} sheet – the sheet instance (provides _helmState, element, _updateHelmPreview)
 */
export function helmOnRender(sheet) {
  const sys          = sheet.actor.system;
  const fuelBurned   = sys.resources?.pilot?.fuelBurned ?? 0;
  const currentRound = sys.round ?? 0;
  const helmResetId  = sys.resources?.pilot?.helmResetId ?? 0;

  const overdrive    = sys.resources?.pilot?.overdrive ?? false;
  const apThrustBonus = sys.resources?.pilot?.apThrustBonus ?? 0;
  const powerMax     = (overdrive ? 200 : 100) + apThrustBonus;

  if (!sheet._helmState
      || sheet._helmState.round !== currentRound
      || sheet._helmState.helmResetId !== helmResetId) {
    sheet._helmState = { round: currentRound, helmResetId, bearing: sys.resources?.pilot?.bearing ?? 0, fuelSlider: fuelBurned };
  } else {
    sheet._helmState.bearing = sys.resources?.pilot?.bearing ?? 0;
    if (sheet._helmState.fuelSlider < fuelBurned) {
      sheet._helmState.fuelSlider = fuelBurned;
    }
    // Cap to new powerMax (in case overdrive just changed)
    if (sheet._helmState.fuelSlider > powerMax) {
      sheet._helmState.fuelSlider = powerMax;
    }
  }

  if (!sheet._strafeState || !("value" in sheet._strafeState)) {
    sheet._strafeState = { value: 0 };
  }

  const powerBarEl    = sheet.element.querySelector("[data-helm-power-bar]");
  const powerInput    = sheet.element.querySelector("[data-helm-fuel]");
  const bearingSlider = sheet.element.querySelector("[data-helm-bearing]");
  const bearingDisp   = sheet.element.querySelector("[data-bearing-display]");
  const fuelDisp      = sheet.element.querySelector("[data-fuel-display]");

  // Min-move marker position: written as data-minmove-pct on the power bar by the template
  const minMovePct = parseInt(powerBarEl?.dataset?.minmovePct ?? "0") || 0;

  // Set dynamic power max
  if (powerInput) {
    powerInput.max = String(powerMax);
    powerInput.value = String(sheet._helmState.fuelSlider);
  }

  const _syncPowerBar = (selectedPct) => {
    const ratio      = 100 / powerMax;
    const committed  = fuelBurned  * ratio;
    const extra      = Math.max(0, selectedPct - fuelBurned) * ratio;
    if (powerBarEl) {
      // Hide the delimiter once the slider (even uncommitted) passes the min-move
      // threshold; redisplay it if the slider moves back below the threshold.
      const effectiveMinmove = (selectedPct * ratio) >= minMovePct ? 0 : minMovePct;
      powerBarEl.style.setProperty("--committed", `${committed}%`);
      powerBarEl.style.setProperty("--extra",     `${extra}%`);
      powerBarEl.style.setProperty("--minmove",   `${effectiveMinmove}%`);
      const line = powerBarEl.querySelector(".imsc-power-minmove-line");
      if (line) line.style.display = effectiveMinmove > 0 ? "" : "none";
    }
    if (fuelDisp) fuelDisp.textContent = `${selectedPct}%`;
  };

  _syncPowerBar(sheet._helmState.fuelSlider);

  if (powerInput) {
    powerInput.addEventListener("change", ev => { ev.stopPropagation(); ev.preventDefault(); }, true);
    powerInput.addEventListener("input",  ev => {
      ev.stopPropagation();
      let val = Math.max(fuelBurned, Math.min(powerMax, Number(ev.target.value)));
      if (val !== Number(ev.target.value)) ev.target.value = String(val);
      sheet._helmState.fuelSlider = val;
      _syncPowerBar(val);
      sheet._updateHelmPreview();
    }, true);
  }

  if (bearingSlider) {
    bearingSlider.addEventListener("change", ev => ev.stopPropagation());
    bearingSlider.addEventListener("input",  ev => {
      const val = Number(ev.target.value);
      sheet._helmState.bearing = val;
      if (bearingDisp) bearingDisp.textContent = `${val}°`;
      sheet._updateHelmPreview();
      // Persist bearing to system data for auto-move on turn end
      clearTimeout(sheet._bearingDebounce);
      sheet._bearingDebounce = setTimeout(() => {
        emitToGM("updateResource", { roleId: "pilot", key: "bearing", value: val });
      }, 300);
    });
  }

  // ── Strafe controls ──────────────────────────────────────────────────────
  const token = sheet.actor.getActiveTokens()?.[0];

  const strafeSlider  = sheet.element.querySelector("[data-strafe-slider]");
  const strafeDisplay = sheet.element.querySelector("[data-strafe-display]");
  const strafeConfirm = sheet.element.querySelector("[data-strafe-confirm]");

  const _syncStrafe = () => {
    const v = sheet._strafeState.value;
    let label;
    if (v === 0) label = game.i18n.localize("IMSC.Helm.StrafeCenter");
    else if (v > 0) label = `${game.i18n.localize("IMSC.Helm.StrafeStarboard")} ${v}`;
    else label = `${game.i18n.localize("IMSC.Helm.StrafePort")} ${Math.abs(v)}`;
    if (strafeDisplay) strafeDisplay.textContent = label;
    if (strafeConfirm) strafeConfirm.disabled = (v === 0);
    if (v !== 0 && token && canvas?.ready) {
      HelmPreview.showStrafe(token, Math.sign(v), Math.abs(v));
    } else {
      HelmPreview.hide();
    }
  };

  if (strafeSlider) {
    strafeSlider.value = String(sheet._strafeState.value);
    strafeSlider.addEventListener("input", ev => {
      sheet._strafeState.value = Number(ev.target.value);
      _syncStrafe();
    });
  }
  _syncStrafe();

  // ── Retrograde controls ───────────────────────────────────────────────────
  if (!sheet._retrogradeState || !("value" in sheet._retrogradeState)) {
    sheet._retrogradeState = { value: 1 };
  }

  const retroSlider  = sheet.element.querySelector("[data-retro-slider]");
  const retroDisplay = sheet.element.querySelector("[data-retro-display]");

  const _syncRetro = () => {
    const v = sheet._retrogradeState.value;
    const prevTurnMove2 = sys.resources?.pilot?.prevTurnMove ?? 0;
    const minMove2 = Math.ceil(prevTurnMove2 / 2);
    const netAft     = Math.max(0, v - minMove2);
    const netForward = Math.max(0, minMove2 - v);
    let label;
    if (netAft > 0)          label = `${netAft} ${game.i18n.localize("IMSC.Label.VoidUnits")} ${game.i18n.localize("IMSC.Helm.Sternward")}`;
    else if (netForward > 0) label = game.i18n.format("IMSC.Helm.RetrogradePartial", { n: netForward });
    else                     label = game.i18n.localize("IMSC.Helm.RetrogradeNeutral");
    if (retroDisplay) retroDisplay.textContent = label;

    const retroBtn = sheet.element.querySelector("[data-action='pilotRetrograde']");
    const canPreview = retroBtn && !retroBtn.disabled && token && canvas?.ready;
    if (canPreview && netAft > 0) {
      HelmPreview.showRetrograde(token, netAft);
    } else {
      HelmPreview.hide();
    }
  };

  if (retroSlider) {
    retroSlider.value = String(sheet._retrogradeState.value);
    retroSlider.addEventListener("input", ev => {
      sheet._retrogradeState.value = Number(ev.target.value);
      _syncRetro();
    });
  }
  _syncRetro();

  // Show projected drift immediately on render (no slider interaction needed)
  sheet._updateHelmPreview();
}

// ── Helm preview updater ────────────────────────────────────────────────────

/**
 * Compute the ghost token position from current helm state and update the
 * canvas preview.  Called from ShipSheet._updateHelmPreview().
 * @param {ShipSheet} sheet
 */
export function helmUpdatePreview(sheet) {
  const token = sheet.actor.getActiveTokens()?.[0];
  if (!token || !canvas?.ready) return;

  const sys          = sheet.actor.system;
  const speed        = (sys.movement?.speed ?? 6) + (sys.resources?.pilot?.allocSpeed ?? 0);
  const prevTurnMove = sys.resources?.pilot?.prevTurnMove ?? 0;
  const minMove      = Math.ceil(prevTurnMove / 2);
  const fuelBurned   = sys.resources?.pilot?.fuelBurned ?? 0;
  const fuelSlider   = sheet._helmState?.fuelSlider ?? fuelBurned;
  const bearing      = sheet._helmState?.bearing ?? 0;

  const isFirstCommit = fuelBurned === 0 && !sheet._helmState?.confirmed;
  const thrustPct     = fuelSlider - fuelBurned;
  const driftUnits    = isFirstCommit ? minMove : 0;

  if (thrustPct <= 0 && driftUnits === 0) {
    HelmPreview.hide();
    return;
  }

  const projected = HelmPreview.projectPosition(token, bearing, thrustPct, speed, driftUnits);
  if (!projected) { HelmPreview.hide(); return; }
  HelmPreview.show(token, projected);
  HelmPreview.updateLine(bearing, thrustPct, speed, driftUnits);
}
