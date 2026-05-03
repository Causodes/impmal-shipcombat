/**
 * StrikeCraftSheet  -  compact sheet for strike craft actors.
 * Displays hull/fuel bars, movement controls, payload info,
 * and RTB controls. Editable only by GM.
 */

import { MODULE_ID } from "../../constants.js";
import { HelmPreview } from "../../canvas/HelmPreview.js";
import { StrikeCraftArcOverlay } from "../../canvas/StrikeCraftArcOverlay.js";
import { StrikeCraftAttackPopup } from "../../apps/StrikeCraftPopups.js";
import { emitToGM } from "../../socket.js";
import { ShipCombatState } from "../../state/ShipCombatState.js";

/**
 * Animate a token along waypoints (same curved path as the player ship).
 */
async function _animateTokenPath(token, waypoints, projected) {
  const canvasToken = token.object ?? token;
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    await canvasToken.animate(
      { x: wp.x, y: wp.y, rotation: wp.rotation },
      { duration: 50, chain: i > 0 },
    );
  }
  await token.document.update(
    { x: projected.x, y: projected.y, rotation: projected.rotation },
    { animate: false },
  );
}

export class StrikeCraftSheet extends IMActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["vehicle", "imsc-ship", "imsc-strikecraft"],
    actions: {
      markTurnComplete: StrikeCraftSheet._onMarkTurnComplete,
      confirmHelm: StrikeCraftSheet._onConfirmHelm,
      attack: StrikeCraftSheet._onAttack,
    },
    position: { width: 380, height: 520 },
    defaultTab: "main",
  };

  static TABS = {
    main:   { id: "main",   group: "primary", label: "IMSC.Tab.Craft" },
    config: { id: "config", group: "primary", label: "IMSC.Tab.Configuration" },
  };

  static PARTS = {
    header: { template: `modules/${MODULE_ID}/templates/actor/sheets/strike-craft-header.hbs`, classes: ["vehicle-header"] },
    tabs:   { template: "templates/generic/tab-navigation.hbs" },
    main: {
      template: `modules/${MODULE_ID}/templates/actor/sheets/strike-craft-sheet.hbs`,
      scrollable: [""],
    },
    config: {
      template: `modules/${MODULE_ID}/templates/actor/sheets/strike-craft-config.hbs`,
      scrollable: [""],
    },
  };

  get isEditable() {
    if (game.user.isGM) return true;
    const ship = ShipCombatState.ship;
    return ship?.system?.roles?.[game.user.id] === "ordnance";
  }

  _prepareTabs() {
    const tabs = super._prepareTabs();
    if (!this.actor.isOwner) {
      delete tabs.config;
    }
    return tabs;
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (!this.actor.isOwner && options.parts) {
      options.parts = options.parts.filter(p => p !== "config");
    }
  }

  /** Strike craft do not use the impmal condition system. */
  formatConditions() { return []; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.conditions = [];
    const sys = this.actor.system;

    context.sys   = sys;
    context.owner = this.actor.isOwner;

    // Bar percentages  -  hull.value = damage taken (0 = full, max = all destroyed), same as ships
    context.hullPct = sys.hull.max > 0
      ? Math.round(((sys.hull.max - sys.hull.value) / sys.hull.max) * 100)
      : 0;
    context.hullRemaining = Math.max(0, (sys.hull.max ?? 0) - (sys.hull.value ?? 0));
    context.fuelPct = sys.fuel.max > 0
      ? Math.round((sys.fuel.value / sys.fuel.max) * 100)
      : 0;
    context.ammoPct = sys.ammo.max > 0
      ? Math.round((sys.ammo.value / sys.ammo.max) * 100)
      : 0;

    // Effective speed (doubled when RTB)
    context.effectiveSpeed = sys.rtb ? sys.movement.speed * 2 : sys.movement.speed;

    // Craft type label
    context.craftTypeLabel = sys.craftType === "bomber"
      ? game.i18n.localize("IMSC.CraftType.Bomber")
      : game.i18n.localize("IMSC.CraftType.Fighter");

    // Active traits
    context.activeTraits = _collectTraits(sys);

    // Helm context
    const speed = sys.movement.speed;
    const mano  = sys.movement.maneuverability;
    const helm  = sys.helm ?? {};
    const thrustPct = helm.thrustPct ?? 0;
    const isRealistic = game.settings?.get(MODULE_ID, "movementMode") === "realistic";
    const velocityMagCtx  = isRealistic ? Math.floor(Math.hypot(helm.velocityX ?? 0, helm.velocityY ?? 0)) : 0;
    const minMove = isRealistic ? velocityMagCtx : Math.ceil(speed / 2);
    const totalSquares = minMove + speed;
    const minMovePct = totalSquares > 0 ? Math.round(minMove / totalSquares * 100) : 0;
    context.helm = {
      speed,
      mano,
      minMove,
      minMovePct,
      maxBearing:           mano * 15,
      bearingMax:           mano * 15,
      bearing:              helm.bearing ?? 0,
      thrustPct,
      powerMax:             100,
      isRealistic,
      velocityX:            helm.velocityX ?? 0,
      velocityY:            helm.velocityY ?? 0,
      // bearingUsed intentionally always 0 for ordnance (same reason as torpedo).
      bearingUsed:          0,
      momentumUsed:         0,
      bearingRemaining:     mano * 15,
      bearingBudgetTooltip: (() => {
        if (!isRealistic || typeof game === "undefined") return "";
        const bMax = mano * 15;
        return game.i18n.format("IMSC.Helm.BearingBudgetTooltip", { val: bMax, max: bMax });
      })(),
    };

    // Parent ship power bar data
    const parentTokenId = sys.parentShipTokenId ?? "";
    const parentToken   = parentTokenId ? canvas?.scene?.tokens.get(parentTokenId) : null;
    const parentSys     = parentToken?.actor?.system ?? {};
    const parentPilot   = parentSys.resources?.pilot ?? {};
    const parentOverdrive = parentPilot.overdrive ?? false;
    const shipPowerMax  = parentOverdrive ? 200 : 100;
    const shipFuelBurned = parentPilot.fuelBurned ?? 0;
    context.shipPower = {
      fuelBurned: shipFuelBurned,
      powerMax:   shipPowerMax,
      pct:        shipPowerMax > 0 ? Math.round((shipFuelBurned / shipPowerMax) * 100) : 0,
    };

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;
    if (!html) return;

    const isRealistic   = context.helm.isRealistic;
    const bearingMax    = context.helm.maxBearing;
    // bearingUsed is always 0 for ordnance (see _prepareContext comment).
    const bearingUsed   = 0;
    const bearingRemain = bearingMax;
    const momentumUsed  = 0;
    const velocityMag   = isRealistic
      ? Math.floor(Math.hypot(context.helm.velocityX, context.helm.velocityY)) : 0;
    // When stopped (no velocity), lock carry at 100%; otherwise slider is free from 0
    const momentumFloor = (isRealistic && velocityMag === 0) ? 100 : 0;

    // Bearing budget bar
    const bearingBudgetBar  = html.querySelector("[data-bearing-budget-bar]");
    const bearingBudgetDisp = html.querySelector("[data-bearing-budget-display]");
    const _syncBearingBudgetBar = (bearingAbs) => {
      if (!bearingBudgetBar || !bearingMax) return;
      const committed = (bearingUsed / bearingMax) * 100;
      const extra     = (Math.min(bearingAbs, bearingRemain) / bearingMax) * 100;
      bearingBudgetBar.style.setProperty("--committed", `${committed}%`);
      bearingBudgetBar.style.setProperty("--extra",     `${extra}%`);
      bearingBudgetBar.style.setProperty("--minmove",   "0%");
      if (bearingBudgetDisp) {
        bearingBudgetDisp.textContent = `${Math.round(bearingUsed + Math.min(bearingAbs, bearingRemain))}°`;
      }
    };
    _syncBearingBudgetBar(Math.abs(context.helm.bearing ?? 0));

    // Carry bar
    const carryBarEl = html.querySelector("[data-helm-carry-bar]");
    const carryInput = html.querySelector("[data-helm-carry]");
    const carryDisp  = html.querySelector("[data-carry-display]");
    const _syncCarryBar = (carryPct) => {
      if (!carryBarEl) return;
      carryBarEl.style.setProperty("--committed", `${momentumUsed}%`);
      carryBarEl.style.setProperty("--extra",     `${Math.max(0, carryPct - momentumUsed)}%`);
      carryBarEl.style.setProperty("--minmove",   "0%");
      if (carryDisp) carryDisp.textContent = `${Math.round(carryPct)}%`;
    };
    if (carryInput) {
      carryInput.value = String(momentumFloor);
      carryInput.addEventListener("change", ev => { ev.stopPropagation(); ev.preventDefault(); }, true);
      carryInput.addEventListener("input", ev => {
        ev.stopPropagation();
        const val = Math.max(momentumFloor, Math.min(100, Number(ev.target.value)));
        if (val !== Number(ev.target.value)) ev.target.value = String(val);
        _syncCarryBar(val);
        _updateCraftPreview();
      }, true);
    }
    _syncCarryBar(momentumFloor);

    // Helper: update ghost preview on canvas (like torpedo)
    const _updateCraftPreview = () => {
      const token = this.actor.getActiveTokens()?.[0];
      if (!token || !canvas?.ready) return;
      const sys = this.actor.system;
      const speed = sys.movement.speed;
      const helm  = sys.helm ?? {};
      const committedPct = helm.thrustPct ?? 0;
      const minMove = Math.ceil(speed / 2);
      const totalSquares = minMove + speed;

      const curBearing = parseInt(html.querySelector("[data-helm-bearing]")?.value) || 0;
      const curFuel    = parseInt(html.querySelector("[data-helm-fuel]")?.value)    || 0;
      const deltaSquares = (curFuel - committedPct) / 100 * totalSquares;

      if (isRealistic) {
        const vx = helm.velocityX ?? 0;
        const vy = helm.velocityY ?? 0;
        const velMag = Math.hypot(vx, vy);
        const thrustArg = deltaSquares > 0 ? deltaSquares * 100 / speed : 0;
        if (velMag === 0 && thrustArg === 0) { HelmPreview.hide(); return; }
        const curCarry = parseInt(html.querySelector("[data-helm-carry]")?.value) || 0;
        const projected = HelmPreview.projectPositionRealistic(token, curBearing, thrustArg, speed, vx, vy, curCarry);
        if (!projected) { HelmPreview.hide(); return; }
        HelmPreview.show(token, projected);
        HelmPreview.updateLineRealistic(curBearing, thrustArg, speed, vx, vy, curCarry);
      } else {
        if (deltaSquares <= 0) { HelmPreview.hide(); return; }
        const thrustArg = deltaSquares * 100 / speed;
        const projected = HelmPreview.projectPosition(token, curBearing, thrustArg, speed, 0);
        if (!projected) { HelmPreview.hide(); return; }
        HelmPreview.show(token, projected);
        HelmPreview.updateLine(curBearing, thrustArg, speed, 0);
      }
    };

    // Bearing slider live update
    const bearingSlider = html.querySelector("[data-helm-bearing]");
    const bearingDisplay = html.querySelector("[data-bearing-display]");
    if (bearingSlider) {
      if (isRealistic) {
        const sliderMax = Math.min(bearingRemain, 180);
        bearingSlider.min = String(-sliderMax);
        bearingSlider.max = String(sliderMax);
      }
      bearingSlider.addEventListener("input", (e) => {
        let val = Number(e.target.value);
        if (isRealistic && bearingMax > 0 && Math.abs(val) > bearingRemain) {
          val = Math.sign(val || 1) * bearingRemain;
          e.target.value = String(val);
        }
        if (bearingDisplay) bearingDisplay.textContent = `${val}°`;
        _syncBearingBudgetBar(Math.abs(val));
        _updateCraftPreview();
      });
    }

    // Power bar (ship-identical: committed red / extra orange / available green)
    const powerBarEl = html.querySelector("[data-helm-power-bar]");
    const fuelSlider = html.querySelector("[data-helm-fuel]");
    const fuelDisplay = html.querySelector("[data-fuel-display]");
    const thrustPct  = context.helm.thrustPct;
    const powerMax   = context.helm.powerMax;
    const minMovePct = context.helm.minMovePct;

    const _syncPowerBar = (selectedPct) => {
      if (!powerMax) return;
      if (isRealistic) {
        // In realistic mode min-move is folded into momentum — simple single-fill bar
        if (powerBarEl) {
          powerBarEl.style.setProperty("--committed", "0%");
          powerBarEl.style.setProperty("--extra",     `${(selectedPct / powerMax) * 100}%`);
          powerBarEl.style.setProperty("--minmove",   "0%");
          const line = powerBarEl.querySelector(".imsc-power-minmove-line");
          if (line) line.style.display = "none";
        }
      } else {
        const ratio     = 100 / powerMax;
        const committed = thrustPct * ratio;
        const extra     = Math.max(0, selectedPct - thrustPct) * ratio;
        const effectiveMinmove = selectedPct >= minMovePct ? 0 : (minMovePct / powerMax) * 100;
        if (powerBarEl) {
          powerBarEl.style.setProperty("--committed", `${committed}%`);
          powerBarEl.style.setProperty("--extra",     `${extra}%`);
          powerBarEl.style.setProperty("--minmove",   `${effectiveMinmove}%`);
          const line = powerBarEl.querySelector(".imsc-power-minmove-line");
          if (line) line.style.display = effectiveMinmove > 0 ? "" : "none";
        }
      }
      if (fuelDisplay) fuelDisplay.textContent = `${selectedPct}%`;
    };

    if (fuelSlider) {
      fuelSlider.value = String(thrustPct);
      fuelSlider.addEventListener("change", ev => { ev.stopPropagation(); ev.preventDefault(); }, true);
      fuelSlider.addEventListener("input", (ev) => {
        ev.stopPropagation();
        let val = Math.max(thrustPct, Math.min(powerMax, Number(ev.target.value)));
        if (val !== Number(ev.target.value)) ev.target.value = String(val);
        _syncPowerBar(val);
        _updateCraftPreview();
      }, true);
    }
    _syncPowerBar(thrustPct);

    // Attack arc  -  show firing cone on hover
    const attackBtn = html.querySelector("[data-action='attack']");
    if (attackBtn) {
      attackBtn.addEventListener("mouseenter", () => StrikeCraftArcOverlay.show(this.actor));
      attackBtn.addEventListener("mouseleave", () => StrikeCraftArcOverlay.hide());
    }
  }

  static async _onConfirmHelm() {
    const sys = this.actor.system;
    const helm = sys.helm ?? {};
    const speed = sys.movement.speed;

    const html = this.element;
    const bearing    = parseInt(html?.querySelector("[data-helm-bearing]")?.value) || 0;
    const newPct     = parseInt(html?.querySelector("[data-helm-fuel]")?.value) || 0;
    const oldPct     = helm.thrustPct ?? 0;
    const powerMax   = 100;
    const minMove    = Math.ceil(speed / 2);
    const totalSq    = minMove + speed;

    const deltaSquares = (newPct - oldPct) / powerMax * totalSq;

    if (deltaSquares <= 0) {
      return ui.notifications.warn("No movement to commit.");
    }

    const thrustArg = deltaSquares * 100 / speed;
    const isRealistic = game.settings?.get(MODULE_ID, "movementMode") === "realistic";
    const carryPct   = parseInt(html?.querySelector("[data-helm-carry]")?.value) || 0;

    // Move the token on canvas via waypoints (curved interpolation)
    const token = this.actor.getActiveTokens()?.[0];
    if (token && canvas?.ready) {
      if (isRealistic) {
        const vx = helm.velocityX ?? 0;
        const vy = helm.velocityY ?? 0;
        const projected = HelmPreview.projectPositionRealistic(token, bearing, thrustArg, speed, vx, vy, carryPct);
        if (projected) {
          const waypoints = HelmPreview.projectWaypointsRealistic(token, bearing, thrustArg, speed, vx, vy, carryPct);
          if (waypoints?.length > 1) {
            await _animateTokenPath(token, waypoints, projected);
          } else {
            await token.document.update(
              { x: projected.x, y: projected.y, rotation: projected.rotation },
              { animate: true },
            );
          }
        }
      } else {
        const projected = HelmPreview.projectPosition(token, bearing, thrustArg, speed, 0);
        if (projected) {
          const waypoints = HelmPreview.projectWaypoints(token, bearing, thrustArg, speed, 0);
          if (waypoints?.length > 1) {
            await _animateTokenPath(token, waypoints, projected);
          } else {
            await token.document.update(
              { x: projected.x, y: projected.y, rotation: projected.rotation },
              { animate: true },
            );
          }
        }
      }
    }

    const prevTurnMove = helm.prevTurnMove ?? 0;
    const updates = {
      "system.helm.thrustPct":    newPct,
      "system.helm.prevTurnMove": (prevTurnMove || 0) + Math.round(deltaSquares),
      "system.helm.bearing":      bearing,
      // bearingUsed and momentumUsed are NOT saved for ordnance (same reason as torpedo).
    };
    if (isRealistic && token) {
      const h0 = (token.document.rotation - 90) * (Math.PI / 180);
      const thrustDir = h0 + bearing * (Math.PI / 180);
      const thrustMag = (thrustArg / 100) * speed;
      updates["system.helm.velocityX"] = (helm.velocityX ?? 0) + Math.cos(thrustDir) * thrustMag;
      updates["system.helm.velocityY"] = (helm.velocityY ?? 0) + Math.sin(thrustDir) * thrustMag;
    }
    await this.actor.update(updates);

    HelmPreview.hide();
  }

  static async _onMarkTurnComplete(event, target) {
    const current = this.actor.system.turnComplete;
    const tokenId = this.actor.token?.id ?? this.actor.getActiveTokens()?.[0]?.id;
    if (!tokenId) return;
    emitToGM("setOrdnanceTurnDone", { tokenId, done: !current });
  }

  /**
   * Attack  -  opens a targeting popup listing ships within the forward arc.
   * The popup handles ammo deduction, accuracy display, and per-target-per-turn
   * limit enforcement.
   */
  static async _onAttack() {
    const sys = this.actor.system;
    if (sys.turnComplete) return;

    const ammo = sys.ammo?.value ?? 0;
    if (ammo <= 0) return ui.notifications.warn("No ammunition remaining.");

    const token = this.actor.getActiveTokens()?.[0];
    if (!token || !canvas?.ready) return;

    new StrikeCraftAttackPopup({ craftActor: this.actor }).render(true);
  }
}

/** Collect active traits from system data into display strings. */
function _collectTraits(sys) {
  const traits = [];
  if (sys.traits?.rend > 0)              traits.push(`Rend ${sys.traits.rend}`);
  if (sys.traits?.armourPenetration > 0) traits.push(`AP ${sys.traits.armourPenetration}`);
  if (sys.traits?.shieldBurn > 0)        traits.push(`Shield Burn ${sys.traits.shieldBurn}`);
  if (sys.traits?.shieldBypass)          traits.push("Shield Bypass");
  return traits;
}
