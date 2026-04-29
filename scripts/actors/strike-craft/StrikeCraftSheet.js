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
    header: { template: `modules/${MODULE_ID}/templates/actor/strike-craft-header.hbs`, classes: ["vehicle-header"] },
    tabs:   { template: "templates/generic/tab-navigation.hbs" },
    main: {
      template: `modules/${MODULE_ID}/templates/actor/strike-craft-sheet.hbs`,
      scrollable: [""],
    },
    config: {
      template: `modules/${MODULE_ID}/templates/actor/strike-craft-config.hbs`,
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
    context.helm = {
      speed,
      mano,
      minMove:    Math.ceil(speed / 2),
      maxBearing: mano * 15,
      bearing:    helm.bearing ?? 0,
      fuelBurned: helm.fuelBurned ?? 0,
      powerMax:   100,
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

    // Helper: update ghost preview on canvas (like torpedo)
    const _updateCraftPreview = () => {
      const token = this.actor.getActiveTokens()?.[0];
      if (!token || !canvas?.ready) return;
      const sys = this.actor.system;
      const speed = sys.movement.speed;
      const helm  = sys.helm ?? {};
      const fuelBurned = helm.fuelBurned ?? 0;
      const minMove = Math.ceil(speed / 2);

      const curBearing = parseInt(html.querySelector("[data-helm-bearing]")?.value) || 0;
      const curFuel    = parseInt(html.querySelector("[data-helm-fuel]")?.value)    || 0;
      const thrustPct  = curFuel - fuelBurned;
      const isFirstCommit = fuelBurned === 0;
      const driftUnits = isFirstCommit ? minMove : 0;

      if (thrustPct <= 0 && driftUnits === 0) {
        HelmPreview.hide();
        return;
      }
      const projected = HelmPreview.projectPosition(token, curBearing, thrustPct, speed, driftUnits);
      if (!projected) { HelmPreview.hide(); return; }
      HelmPreview.show(token, projected);
      HelmPreview.updateLine(curBearing, thrustPct, speed, driftUnits);
    };

    // Bearing slider live update
    const bearingSlider = html.querySelector("[data-helm-bearing]");
    const bearingDisplay = html.querySelector("[data-bearing-display]");
    if (bearingSlider) {
      bearingSlider.addEventListener("input", (e) => {
        if (bearingDisplay) bearingDisplay.textContent = `${e.target.value}°`;
        _updateCraftPreview();
      });
    }

    // Power bar (ship-identical: committed red / extra orange / available green)
    const powerBarEl = html.querySelector("[data-helm-power-bar]");
    const fuelSlider = html.querySelector("[data-helm-fuel]");
    const fuelDisplay = html.querySelector("[data-fuel-display]");
    const fuelBurned = context.helm.fuelBurned;
    const powerMax   = context.helm.powerMax;

    const _syncPowerBar = (selectedPct) => {
      const ratio     = 100 / powerMax;
      const committed = fuelBurned * ratio;
      const extra     = Math.max(0, selectedPct - fuelBurned) * ratio;
      if (powerBarEl) {
        powerBarEl.style.setProperty("--committed", `${committed}%`);
        powerBarEl.style.setProperty("--extra",     `${extra}%`);
      }
      if (fuelDisplay) fuelDisplay.textContent = `${selectedPct}%`;
    };

    if (fuelSlider) {
      fuelSlider.value = String(fuelBurned);
      fuelSlider.addEventListener("change", ev => { ev.stopPropagation(); ev.preventDefault(); }, true);
      fuelSlider.addEventListener("input", (ev) => {
        ev.stopPropagation();
        let val = Math.max(fuelBurned, Math.min(powerMax, Number(ev.target.value)));
        if (val !== Number(ev.target.value)) ev.target.value = String(val);
        _syncPowerBar(val);
        _updateCraftPreview();
      }, true);
    }
    _syncPowerBar(fuelBurned);

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
    const fuelSlider = parseInt(html?.querySelector("[data-helm-fuel]")?.value) || 0;
    const fuelBurned = helm.fuelBurned ?? 0;

    if (fuelSlider <= fuelBurned) {
      return ui.notifications.warn("No additional thrust committed.");
    }

    const prevTurnMove = helm.prevTurnMove ?? 0;
    const minMove      = Math.ceil(speed / 2);
    const isFirstCommit = !helm.confirmed;   // use confirmed flag, not fuelBurned, to prevent infinite free drift
    const driftUnits    = isFirstCommit ? minMove : 0;

    // Move the token on canvas via waypoints (curved interpolation)
    const token = this.actor.getActiveTokens()?.[0];
    if (token && canvas?.ready) {
      const projected = HelmPreview.projectPosition(token, bearing, fuelSlider - fuelBurned, speed, driftUnits);
      if (projected) {
        const waypoints = HelmPreview.projectWaypoints(token, bearing, fuelSlider - fuelBurned, speed, driftUnits);
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

    const totalMoved = fuelSlider > 0 ? Math.max(driftUnits, Math.round((fuelSlider / 100) * speed)) : driftUnits;
    await this.actor.update({
      "system.helm.fuelBurned": fuelSlider,
      "system.helm.prevTurnMove": (prevTurnMove || 0) + totalMoved,
      "system.helm.bearing": bearing,
      "system.helm.confirmed": true,
    });

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
