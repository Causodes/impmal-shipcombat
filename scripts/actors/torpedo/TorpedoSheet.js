/**
 * TorpedoSheet  -  compact sheet for torpedo actors.
 * Two tabs: Warhead (main combat UI) and Configuration (GM/owner only).
 */

import { MODULE_ID } from "../../constants.js";
import { HelmPreview } from "../../canvas/HelmPreview.js";
import { TorpedoOverlay } from "../../canvas/TorpedoOverlay.js";
import { emitToGM, emitToAll } from "../../socket.js";
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

export class TorpedoSheet extends IMActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["vehicle", "imsc-ship", "imsc-torpedo"],
    actions: {
      confirmHelm: TorpedoSheet._onConfirmHelm,
      detonate: TorpedoSheet._onDetonate,
      markTurnComplete: TorpedoSheet._onMarkTurnComplete,
    },
    position: { width: 380, height: 520 },
    defaultTab: "warhead",
  };

  static TABS = {
    warhead: { id: "warhead", group: "primary", label: "IMSC.Tab.Warhead" },
    config:  { id: "config",  group: "primary", label: "IMSC.Tab.Configuration" },
  };

  static PARTS = {
    header:  { template: `modules/${MODULE_ID}/templates/actor/sheets/torpedo-header.hbs`, classes: ["vehicle-header"] },
    tabs:    { template: "templates/generic/tab-navigation.hbs" },
    warhead: {
      template: `modules/${MODULE_ID}/templates/actor/sheets/torpedo-warhead.hbs`,
      scrollable: [""],
    },
    config: {
      template: `modules/${MODULE_ID}/templates/actor/sheets/torpedo-config.hbs`,
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
    // Hide the Configuration tab from non-owners
    if (!this.actor.isOwner) {
      delete tabs.config;
    }
    return tabs;
  }

  _onClose(options) {
    HelmPreview.hide();
    super._onClose?.(options);
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    // Don't render the config part for non-owners
    if (!this.actor.isOwner && options.parts) {
      options.parts = options.parts.filter(p => p !== "config");
    }
  }

  /** Torpedoes do not use the impmal condition system. */
  formatConditions() { return []; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.conditions = [];
    const sys = this.actor.system;

    context.sys   = sys;
    context.owner = this.actor.isOwner;

    // Fuel bar percentage
    context.fuelPct = sys.fuel.max > 0
      ? Math.round((sys.fuel.value / sys.fuel.max) * 100)
      : 0;

    // Warhead count bar percentage  -  hull.value = warheads expended (0 = full, max = all gone)
    context.hullPct = sys.hull.max > 0
      ? Math.round(((sys.hull.max - sys.hull.value) / sys.hull.max) * 100)
      : 0;
    context.hullRemaining = Math.max(0, (sys.hull.max ?? 0) - (sys.hull.value ?? 0));

    // Collect active traits
    context.activeTraits = [];
    if (sys.traits.rend > 0)              context.activeTraits.push(`Rend ${sys.traits.rend}`);
    if (sys.traits.armourPenetration > 0) context.activeTraits.push(`AP ${sys.traits.armourPenetration}`);
    if (sys.traits.shieldBurn > 0)        context.activeTraits.push(`Shield Burn ${sys.traits.shieldBurn}`);
    if (sys.traits.shieldBypass)           context.activeTraits.push("Shield Bypass");

    // Helm context  -  powerBoostActive doubles this torpedo's power maximum (100 → 200)
    // designated locks all helm controls for this round (powerMax → 0, mano → 0)
    const speed = sys.movement.speed ?? 0;
    const mano  = sys.designated ? 0 : sys.movement.maneuverability;
    const helm  = sys.helm ?? {};
    const torpedoPowerMax = sys.designated ? 0 : (sys.powerBoostActive ? 200 : 100);
    const minMove = Math.ceil(speed / 2);
    const totalSquares = minMove + speed;
    const thrustPct = helm.thrustPct ?? 0;
    const minMovePct = (torpedoPowerMax > 0 && totalSquares > 0) ? Math.round(minMove / totalSquares * torpedoPowerMax) : 0;

    // Parent ship power bar data
    const parentTokenId = sys.parentShipTokenId ?? "";
    const parentToken   = parentTokenId ? canvas?.scene?.tokens.get(parentTokenId) : null;
    const parentSys     = parentToken?.actor?.system ?? {};
    const parentPilot   = parentSys.resources?.pilot ?? {};
    const parentOverdrive = parentPilot.overdrive ?? false;
    const shipPowerMax  = parentOverdrive ? 200 : 100;
    const shipFuelBurned = parentPilot.fuelBurned ?? 0;

    context.helm = {
      speed,
      mano,
      minMove,
      minMovePct,
      maxBearing: mano * 15,
      bearing:    helm.bearing ?? 0,
      thrustPct,
      powerMax:   torpedoPowerMax,
      designated: sys.designated ?? false,
    };

    // Ship power data for display
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

    // Helper: update ghost preview on canvas
    const _updateTorpedoPreview = () => {
      const token = this.actor.getActiveTokens()?.[0];
      if (!token || !canvas?.ready) return;
      const sys = this.actor.system;
      const speed = sys.movement.speed ?? 0;
      const helm  = sys.helm ?? {};
      const committedPct = helm.thrustPct ?? 0;
      const powerMax = sys.powerBoostActive ? 200 : 100;
      const minMove = Math.ceil(speed / 2);
      const totalSquares = minMove + speed;

      const curBearing = parseInt(html.querySelector("[data-helm-bearing]")?.value) || 0;
      const curFuel    = parseInt(html.querySelector("[data-helm-fuel]")?.value)    || 0;
      const deltaSquares = (curFuel - committedPct) / powerMax * totalSquares;

      if (deltaSquares <= 0) {
        HelmPreview.hide();
        return;
      }
      const thrustArg = deltaSquares * 100 / speed;
      const projected = HelmPreview.projectPosition(token, curBearing, thrustArg, speed, 0);
      if (!projected) { HelmPreview.hide(); return; }
      HelmPreview.show(token, projected);
      HelmPreview.updateLine(curBearing, thrustArg, speed, 0);
    };

    // Bearing slider live update
    const bearingSlider = html.querySelector("[data-helm-bearing]");
    const bearingDisplay = html.querySelector("[data-bearing-display]");
    if (bearingSlider) {
      // Lock bearing while designated
      if (context.helm.designated) bearingSlider.disabled = true;
      bearingSlider.addEventListener("input", (e) => {
        if (bearingDisplay) bearingDisplay.textContent = `${e.target.value}°`;
        _updateTorpedoPreview();
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
      const ratio     = 100 / powerMax;
      const committed = thrustPct * ratio;
      const extra     = Math.max(0, selectedPct - thrustPct) * ratio;
      // Hide delimiter once slider passes min-move, redisplay if it moves back.
      const effectiveMinmove = selectedPct >= minMovePct ? 0 : (minMovePct / powerMax) * 100;
      if (powerBarEl) {
        powerBarEl.style.setProperty("--committed", `${committed}%`);
        powerBarEl.style.setProperty("--extra",     `${extra}%`);
        powerBarEl.style.setProperty("--minmove",   `${effectiveMinmove}%`);
        const line = powerBarEl.querySelector(".imsc-power-minmove-line");
        if (line) line.style.display = effectiveMinmove > 0 ? "" : "none";
      }
      if (fuelDisplay) fuelDisplay.textContent = `${selectedPct}%`;
    };

    if (fuelSlider) {
      fuelSlider.value = String(thrustPct);
      // Lock slider while designated
      if (context.helm.designated) fuelSlider.disabled = true;
      fuelSlider.addEventListener("change", ev => { ev.stopPropagation(); ev.preventDefault(); }, true);
      fuelSlider.addEventListener("input", (ev) => {
        ev.stopPropagation();
        let val = Math.max(thrustPct, Math.min(powerMax, Number(ev.target.value)));
        if (val !== Number(ev.target.value)) ev.target.value = String(val);
        _syncPowerBar(val);
        _updateTorpedoPreview();
      }, true);
    }
    _syncPowerBar(thrustPct);

    // Show initial preview if there's already thrust committed
    _updateTorpedoPreview();

    // Detonate button hover → show overlay
    const detonateBtn = html.querySelector("[data-action='detonate']");
    if (detonateBtn) {
      // Disable detonate while designated
      if (context.helm.designated) detonateBtn.disabled = true;
      detonateBtn.addEventListener("mouseenter", () => {
        const token = this.actor.getActiveTokens()?.[0];
        if (token) TorpedoOverlay.show(token, this.actor.system.payloadRadius);
      });
      detonateBtn.addEventListener("mouseleave", () => {
        TorpedoOverlay.hide();
      });
    }
  }

  static async _onConfirmHelm() {
    const sys = this.actor.system;
    if (sys.turnComplete) return;
    const helm = sys.helm ?? {};
    const speed = sys.movement.speed ?? 0;

    const html = this.element;
    const bearing    = parseInt(html?.querySelector("[data-helm-bearing]")?.value) || 0;
    const newPct     = parseInt(html?.querySelector("[data-helm-fuel]")?.value) || 0;
    const oldPct     = helm.thrustPct ?? 0;
    const powerMax   = sys.powerBoostActive ? 200 : 100;
    const minMove    = Math.ceil(speed / 2);
    const totalSq    = minMove + speed;

    const deltaSquares = (newPct - oldPct) / powerMax * totalSq;

    if (deltaSquares <= 0) {
      return ui.notifications.warn("No movement to commit.");
    }

    const thrustArg = deltaSquares * 100 / speed;

    // Move the token on canvas via waypoints (curved interpolation)
    const token = this.actor.getActiveTokens()?.[0];
    if (token && canvas?.ready) {
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

    const prevTurnMove = helm.prevTurnMove ?? 0;
    const updates = {
      "system.helm.thrustPct": newPct,
      "system.helm.prevTurnMove": (prevTurnMove || 0) + Math.round(deltaSquares),
      "system.helm.bearing": bearing,
    };
    // Fuel is consumed once per turn (in advanceRound), not per helm commit.
    await this.actor.update(updates);

    HelmPreview.hide();
  }

  static async _onDetonate() {
    const sys = this.actor.system;
    if (sys.turnComplete || sys.designated) return;
    const token = this.actor.getActiveTokens()?.[0];
    if (!token || !canvas?.ready) return;

    const radius   = sys.payloadRadius;
    const baseDmgRaw = sys.payloadDamage;
    const baseDmg  = baseDmgRaw;
    const warheads = Math.max(1, (sys.hull?.max ?? 1) - (sys.hull?.value ?? 0));  // surviving warheads multiply damage
    const gs       = canvas.grid.size;
    const cx       = token.x + (token.document.width * gs) / 2;
    const cy       = token.y + (token.document.height * gs) / 2;
    const radiusPx = radius * gs;

    // Find all ship tokens in radius (closest edge within blast)
    const shipTypes = [`${MODULE_ID}.ship`, `${MODULE_ID}.npcShip`];
    const targets = canvas.tokens.placeables.filter(t => {
      if (!shipTypes.includes(t.document.actor?.type)) return false;
      const closestDist = _closestEdgeDist(cx, cy, t, gs);
      return closestDist <= radiusPx;
    });

    // Find other torpedoes in blast radius (excluding self)
    const torpedoTargets = canvas.tokens.placeables.filter(t => {
      if (t === token) return false;
      if (t.document.actor?.type !== `${MODULE_ID}.torpedo`) return false;
      return _closestEdgeDist(cx, cy, t, gs) <= radiusPx;
    });

    // Find strike craft in blast radius
    const craftTargets = canvas.tokens.placeables.filter(t => {
      if (t.document.actor?.type !== `${MODULE_ID}.strikeCraft`) return false;
      return _closestEdgeDist(cx, cy, t, gs) <= radiusPx;
    });

    // Confirm detonation
    const shipCount  = targets.length;
    const torpCount  = torpedoTargets.length;
    const craftCount = craftTargets.length;
    let confirmMsg = `<p>Detonate warhead?`;
    const parts = [];
    if (shipCount  > 0) parts.push(`${shipCount} ship(s)`);
    if (torpCount  > 0) parts.push(`${torpCount} torpedo(es)`);
    if (craftCount > 0) parts.push(`${craftCount} strike craft`);
    confirmMsg += parts.length > 0 ? ` ${parts.join(", ")} in blast radius.` : ` Nothing in blast radius.`;
    confirmMsg += `</p>`;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Confirm Detonation" },
      content: confirmMsg,
    });
    if (!ok) return;

    // Apply damage to each target
    for (const t of targets) {
      // Use closest edge of target token for distance (highest damage wins)
      const dist = _closestEdgeDist(cx, cy, t, gs);

      // Damage falloff: 100% within 1 grid square of center, then
      // linear decay to 25% at the edge of the blast radius.
      // Adjacent ships (within 1 square) always take full damage.
      const innerRadius = gs;  // 1 grid square = full damage zone
      let decayMult;
      if (dist <= innerRadius) {
        decayMult = 1;
      } else {
        const outerDist = Math.min(dist - innerRadius, radiusPx - innerRadius);
        const outerRange = Math.max(1, radiusPx - innerRadius);
        decayMult = 1 - 0.75 * (outerDist / outerRange);
      }
      const damage    = Math.max(1, Math.round(baseDmg * warheads * decayMult));

      // Determine hit quadrant using center-to-center angle
      const tw = t.document.width * gs;
      const th = t.document.height * gs;
      const tx = t.x + tw / 2;
      const ty = t.y + th / 2;

      // Determine hit quadrant (closest to torpedo)
      const attackAngle = Math.atan2(ty - cy, tx - cx);
      const heading     = (t.document.rotation ?? 0) * (Math.PI / 180);
      const relAngle    = attackAngle - heading;
      const norm        = ((relAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      let hitQuadrant;
      if (norm < Math.PI / 4 || norm >= 7 * Math.PI / 4) hitQuadrant = "bow";
      else if (norm < 3 * Math.PI / 4) hitQuadrant = "starboard";
      else if (norm < 5 * Math.PI / 4) hitQuadrant = "stern";
      else hitQuadrant = "port";

      emitToGM("torpedoDamage", {
        targetActorId: t.document.actorId,
        torName:       this.actor.name,
        torImg:        this.actor.img,
        damage,
        hitQuadrant,
        traits: sys.traits,
      });
    }

    // Blast other torpedoes (destroyed) and strike craft (hull damage) in radius
    if (torpedoTargets.length > 0 || craftTargets.length > 0) {
      const craftDamages = craftTargets.map(t => {
        const dist = _closestEdgeDist(cx, cy, t, gs);
        let decayMult;
        if (dist <= gs) {
          decayMult = 1;
        } else {
          const outerDist = Math.min(dist - gs, radiusPx - gs);
          const outerRange = Math.max(1, radiusPx - gs);
          decayMult = 1 - 0.75 * (outerDist / outerRange);
        }
        return {
          tokenId: t.document.id,
          actorId: t.document.actorId,
          damage:  Math.max(1, Math.round(baseDmg * warheads * decayMult)),
        };
      });
      emitToGM("blastOrdnance", {
        torpedoTokenIds: torpedoTargets.map(t => t.document.id),
        craftDamages,
        torName: this.actor.name,
      });
    }

    // Destroy the torpedo (wait for any animation to finish, then delay)
    TorpedoOverlay.hide();
    const tokenDoc = token.document;

    // Play detonation explosion on all clients before deleting the token
    emitToAll("playWeaponAnimation", {
      weaponCategory: "torpedo_detonation",
      fireMode:       "",
      firingActorId:  null,
      targetTokenId:  tokenDoc.id,
      totalHits:      targets.length > 0 ? 1 : 0,
      totalSalvo:     1,
      isNpcFire:      false,
      blastRadius:    sys.payloadRadius ?? 1,
    });

    // Wait for any in-progress token animation to settle
    if (token._animation) {
      await CanvasAnimation.terminateAnimation(token._animation);
    }
    // Let the user see the final position before deletion
    await new Promise(r => setTimeout(r, 2000));

    await canvas.scene.deleteEmbeddedDocuments("Token", [tokenDoc.id]);
  }

  static async _onMarkTurnComplete() {
    const current = this.actor.system.turnComplete;
    const tokenId = this.actor.token?.id ?? this.actor.getActiveTokens()?.[0]?.id;
    if (!tokenId) return;
    emitToGM("setOrdnanceTurnDone", { tokenId, done: !current });
  }
}

/**
 * Compute the distance from point (px, py) to the closest edge of a token's bounding box.
 * Returns 0 if the point is inside the token.
 */
function _closestEdgeDist(px, py, token, gs) {
  const tw = token.document.width * gs;
  const th = token.document.height * gs;
  const left   = token.x;
  const right  = token.x + tw;
  const top    = token.y;
  const bottom = token.y + th;
  // Clamp point to bounding box → closest point on or inside rectangle
  const cx = Math.max(left, Math.min(px, right));
  const cy = Math.max(top,  Math.min(py, bottom));
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}
