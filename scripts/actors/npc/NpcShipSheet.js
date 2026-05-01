/**
 * NpcShipSheet  -  tabbed actor sheet for GM-controlled NPC vessels.
 *
 * Tabs:
 *   main     – combat dashboard (shields, heat, fire, controls)
 *   movement – helm controls identical to the player pilot tab
 *   gunner   – weapon batteries by position, ammo tracks
 *   effects  – active effect management (temporary, passive, disabled)
 *
 * No roles, no cores, no crew assignments.  All resource writes go directly
 * to the actor (GM always has write permission)  -  no socket routing.
 */

import { MODULE_ID, MACRO_FIRE_TIERS, LANCE_CHARGE_TIERS, SHIP_CLASSIFICATIONS, buildChargeTiers, CRIT_CONDITIONS, CRIT_LOCATIONS } from "../../constants.js";
import { HelmPreview } from "../../canvas/HelmPreview.js";
import { WeaponArcOverlay } from "../../canvas/WeaponArcOverlay.js";
import { buildHelmContext, helmUpdatePreview } from "../../roles/pilot.js";
import { heatColor } from "../../theme.js";
import { enrichWeaponForGunner } from "../../roles/gunner.js";
import { TargetingPopup } from "../../apps/TargetingPopup.js";
import { RecoverCraftPopup } from "../../apps/StrikeCraftPopups.js";

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

// ── Constants ─────────────────────────────────────────────────────────────
const SECTORS = ["bow", "stern", "port", "starboard"];
const WEAPON_SECTIONS = [
  { id: "port",      label: "IMSC.Slot.Port" },
  { id: "starboard", label: "IMSC.Slot.Starboard" },
  { id: "prow",      label: "IMSC.Slot.Prow" },
  { id: "dorsal",    label: "IMSC.Slot.Dorsal" },
];

const SECTOR_ABBR = { bow: "BOW", stern: "STN", port: "PRT", starboard: "STBD" };

export class NpcShipSheet extends IMActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["vehicle", "imsc-ship", "imsc-npc-ship"],
    actions: {
      // Main tab
      npcAdjustShield:    _onAdjustShield,
      npcSuppressFire:    _onSuppressFire,
      npcReduceHeat:      _onReduceHeat,
      npcFullReset:       _onFullReset,
      npcRefillShields:   _onRefillShields,
      npcFluxToCharge:    _onFluxToCharge,
      // Movement tab
      npcRollPiloting:    _onNpcRollPiloting,
      npcRollInitiative:  _onNpcRollInitiative,
      npcAllocBonus:      _onNpcAllocBonus,
      npcConfirmHelm:     _onNpcConfirmHelm,
      npcResetHelm:       _onNpcResetHelm,
      // Gunner tab
      npcFireWeapon:       _onNpcFireWeapon,
      // Ordnance tab
      npcLaunchTorpedo:    _onNpcLaunchTorpedo,
      npcLaunchStrikeCraft: _onNpcLaunchStrikeCraft,
      npcOpenOrdTemplate:  _onNpcOpenOrdTemplate,
      npcRemoveOrdTemplate: _onNpcRemoveOrdTemplate,
      panToOrdnance:       _onNpcPanToOrdnance,
      npcRTB:              _onNpcRTB,
      npcSaveCraftConfig:  _onNpcSaveCraftConfig,
      // Conditions
      npcStepCondition:    _onNpcStepCondition,
    },
    position: { width: 640, height: 720 },
    defaultTab: "main",
  };

  static PARTS = {
    header:   { template: `modules/${MODULE_ID}/templates/actor/partials/npc-ship-header.hbs`,    classes: ["vehicle-header"], scrollable: [""] },
    tabs:     { template: "templates/generic/tab-navigation.hbs" },
    main:     { template: `modules/${MODULE_ID}/templates/actor/tabs/npc/npc-ship-body.hbs`,      scrollable: [""] },
    movement: { template: `modules/${MODULE_ID}/templates/actor/tabs/npc/npc-ship-movement.hbs`,  scrollable: [""] },
    gunner:   { template: `modules/${MODULE_ID}/templates/actor/tabs/npc/npc-ship-gunner.hbs`,    scrollable: [""] },
    ordnance: { template: `modules/${MODULE_ID}/templates/actor/tabs/npc/npc-ship-ordnance.hbs`,  scrollable: [""] },
    // effects tab suppressed  -  kept for future use
    // effects:  { template: `modules/${MODULE_ID}/templates/actor/npc-ship-effects.hbs`,   scrollable: [""] },
  };

  static TABS = {
    main:     { id: "main",     group: "primary", label: "IMSC.Tab.Overview"  },
    movement: { id: "movement", group: "primary", label: "IMSC.Tab.Movement" },
    gunner:   { id: "gunner",   group: "primary", label: "IMSC.Tab.NpcWeapons" },
    ordnance: { id: "ordnance", group: "primary", label: "IMSC.NpcShip.OrdnanceTab" },
    // effects:  { id: "effects",  group: "primary", label: "IMSC.Tab.Effects"  },
  };

  get isEditable() { return true; }

  // ── Context ──────────────────────────────────────────────────────────────

  async _preparePartContext(partId, context) {
    context = await super._preparePartContext(partId, context);
    const sys = this.actor.system;

    // Shield status per sector
    const shields = {};
    for (const s of SECTORS) {
      const val = sys.shields?.[s] ?? 0;
      const max = sys.shieldMax?.[s] ?? 0;
      shields[s] = { val, max, pct: max > 0 ? Math.round((val / max) * 100) : 0, over: val > max };
    }

    const hullPct = sys.hull.max > 0
      ? Math.round(((sys.hull.max - sys.hull.value) / sys.hull.max) * 100)
      : 100;

    // Weapon components
    const components = this.actor.items.filter(i => i.type === `${MODULE_ID}.component`);
    const weaponComponents = components.filter(c => c.system.slot === "weapon");

    // Gunner context  -  NPC uses sys.heat instead of sys.resources.enginseer.heat
    const gunnerCtx = _buildNpcGunnerContext(sys);

    // Build weapon sections with enriched weapon data
    const weaponSections = WEAPON_SECTIONS.map(def => {
      const sectionItems = weaponComponents.filter(item => {
        const pos = item.system?.weaponPosition ?? "prow";
        return pos === "flank" ? (item.system?.weaponBay ?? "port") === def.id : pos === def.id;
      });
      const slotCount = Math.max(0, Number(sys.weaponSlots?.[def.id] ?? 0));
      return {
        ...def,
        labelLocalized: game.i18n.localize(def.label),
        slotCount,
        emptySlots: Math.max(0, slotCount - sectionItems.length),
        items: sectionItems.map(item => enrichWeaponForGunner(item, gunnerCtx)),
      };
    });

    // Ammo tracks
    const ammoTracks = ["a", "b", "c"].map(k => ({
      key: k,
      ...(sys.ammoTracks?.[k] ?? { label: "", value: 0, max: 10 }),
      pct: (sys.ammoTracks?.[k]?.max ?? 10) > 0
        ? Math.round(((sys.ammoTracks?.[k]?.value ?? 0) / (sys.ammoTracks?.[k]?.max ?? 10)) * 100)
        : 0,
    }));

    // Effects
    const allEffects = Array.from(this.actor.effects ?? []);
    const effects = {
      temporary: allEffects.filter(e => !e.disabled && e.isTemporary),
      passive:   allEffects.filter(e => !e.disabled && !e.isTemporary),
      disabled:  allEffects.filter(e => e.disabled),
    };

    // Helm context
    const helm = buildHelmContext(sys);

    Object.assign(context, {
      sys,
      shields,
      hullPct,
      weaponSections,
      ammoTracks,
      effects,
      helm,
      gunnerCtx,
      sectors: SECTORS.map(s => ({
        id: s,
        abbr:        SECTOR_ABBR[s] ?? s.toUpperCase(),
        label: game.i18n.localize(`IMSC.Sector.${s[0].toUpperCase() + s.slice(1)}`),
        shield:      sys.shields?.[s] ?? 0,
        shieldMax:   sys.shieldMax?.[s] ?? 0,
        armour:      sys.armour?.[s] ?? 0,
        armourBase:  sys.armourBase?.[s] ?? 0,
      })),

      // ── Conditions panel ──────────────────────────────────────────────────
      conditionsList: CRIT_LOCATIONS.map(loc => {
        const cond = sys.conditions?.[loc.id] ?? {};
        const tier = cond.tier ?? null;
        return {
          locId:          loc.id,
          tier,
          hasCondition:   !!tier,
          locLabel:       game.i18n.localize(`IMSC.Crit.Location.${loc.id}`),
          conditionName:  tier ? game.i18n.localize(`IMSC.Crit.Condition.${loc.id}.${tier}`) : "",
          conditionEffect: tier ? game.i18n.localize(`IMSC.Crit.Effect.${loc.id}.${tier}`) : "",
          tierLabel:      tier ? game.i18n.localize(`IMSC.Crit.Tier.${tier.charAt(0).toUpperCase() + tier.slice(1)}`) : "",
          jammedItemName: cond.jammedItemId ? (cond.jammedItemName ?? null) : null,
          tierClass:     tier ? `imsc-crit-tier--${tier}` : "",
        };
      }),
      hasAnyCondition: CRIT_LOCATIONS.some(loc => !!(sys.conditions?.[loc.id]?.tier)),

      shipClassifications: SHIP_CLASSIFICATIONS,
    });

    // ── Ordnance tab context ──────────────────────────────────────────────
    if (partId === "ordnance") {
      const shipToken = canvas?.scene?.tokens?.find(t => t.actor?.id === this.actor.id);
      const parentShipTokenId = shipToken?.id ?? null;
      const allTokens = parentShipTokenId ? [...(canvas.scene.tokens ?? [])] : [];
      const deployedTorpedoes = allTokens.filter(t =>
        t.actor?.type === `${MODULE_ID}.torpedo` &&
        t.actor?.system?.parentShipTokenId === parentShipTokenId,
      );
      const deployedCraft = allTokens.filter(t =>
        t.actor?.type === `${MODULE_ID}.strikeCraft` &&
        t.actor?.system?.parentShipTokenId === parentShipTokenId,
      );
      Object.assign(context, {
        torpedoTemplates: (sys.ordnanceActors?.torpedo ?? []).map(t => ({
          ...t,
          torpedoCount: t.actorData?.system?.hull?.max ?? 1,
        })),
        craftTemplates:   (sys.ordnanceActors?.strikeCraft ?? []).map(t => ({
          ...t,
          squadronSize:  t.actorData?.system?.hull?.max ?? 1,
        })),
        deployedTorpedoes: deployedTorpedoes.map(t => ({
          tokenId:      t.id, name: t.name, img: t.actor?.img,
          turnComplete: t.actor?.system?.turnComplete ?? false,
          hull:         t.actor?.system?.hull ?? { value: 1, max: 1 },
        })),
        deployedCraft: deployedCraft.map(t => ({
          tokenId:      t.id, name: t.name, img: t.actor?.img,
          turnComplete: t.actor?.system?.turnComplete ?? false,
          rtb:          t.actor?.system?.rtb ?? false,
          hull:         t.actor?.system?.hull ?? { value: 0, max: 0 },
        })),
        deployedCount: deployedTorpedoes.length + deployedCraft.length,
      });
    }

    return context;
  }

  // ── Render wiring ────────────────────────────────────────────────────────

  _onRender(context, options) {
    super._onRender?.(context, options);

    // ── Helm slider wiring (Movement tab) ──────────────────────────────────
    _npcHelmOnRender(this);

    // ── Shield arc: scroll / click / right-click to adjust ──────────────────
    this.element.querySelectorAll(".imsc-arc-val[data-sector]").forEach(el => {
      el.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        _adjustShieldSector(this, el.dataset.sector, 1);
      });
      el.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        _adjustShieldSector(this, el.dataset.sector, -1);
      });
      el.addEventListener("wheel", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        _adjustShieldSector(this, el.dataset.sector, ev.deltaY < 0 ? 1 : -1);
      }, { passive: false });
    });

    // ── Weapon arc hover + pin (Gunner tab) ─────────────────────────────────
    this.element.querySelectorAll("[data-weapon-arc]").forEach(row => {
      row.addEventListener("mouseenter", () => WeaponArcOverlay.showHover(row.dataset.weaponArc));
      row.addEventListener("mouseleave", () => WeaponArcOverlay.hideHover());
    });
    this.element.querySelectorAll("[data-pin-weapon]").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const pinned = WeaponArcOverlay.togglePin(btn.dataset.pinWeapon);
        btn.classList.toggle("imsc-pin-active", pinned);
      });
      if (WeaponArcOverlay.isPinned(btn.dataset.pinWeapon)) {
        btn.classList.add("imsc-pin-active");
      }
    });

    // ── Macro Cannon tier picker (NPC gunner tab) ────────────────────────────
    this.element.querySelectorAll(".imsc-macro-tier-picker").forEach(picker => {
      const card      = picker.closest(".imsc-battery-card");
      const fireBtn   = card?.querySelector(".imsc-fire--macro");
      const ammoVal   = card?.querySelector("[data-macro-stat-display='ammo'] .imsc-battery-stat-value");
      const hitVal    = card?.querySelector("[data-macro-stat-display='hit'] .imsc-battery-stat-value");
      const salvoVal  = card?.querySelector("[data-macro-stat-display='salvo'] .imsc-battery-stat-value");
      const fireLabel = fireBtn?.querySelector(".imsc-macro-fire-label");
      const pips      = [...picker.querySelectorAll(".imsc-macro-tier-pip")];

      function selectTier(pip) {
        pips.forEach(p => p.classList.remove("imsc-macro-pip-selected"));
        pip.classList.add("imsc-macro-pip-selected");
        const hit = parseInt(pip.dataset.tierHit) || 0;
        const hitStr = hit > 0 ? `+${hit}` : hit < 0 ? String(hit) : " - ";
        if (ammoVal)  ammoVal.textContent  = pip.dataset.tierAmmo;
        if (hitVal)   hitVal.textContent   = hitStr;
        if (salvoVal) salvoVal.textContent = pip.dataset.tierSalvo;
        if (fireBtn) {
          fireBtn.dataset.fireMode    = pip.dataset.tierId;
          fireBtn.dataset.weaponId    = card.dataset.id;
          fireBtn.disabled            = pip.dataset.canAfford !== "true";
          if (fireLabel) fireLabel.textContent = pip.querySelector(".imsc-macro-pip-label")?.textContent?.trim() ?? "";
        }
      }

      pips.forEach(pip => {
        pip.addEventListener("click", () => {
          if (pip.dataset.canAfford !== "true") return;
          selectTier(pip);
        });
      });

      const firstAffordable = pips.find(p => p.dataset.canAfford === "true");
      if (firstAffordable) selectTier(firstAffordable);
    });

    // Keep overlay active whenever the sheet is open
    WeaponArcOverlay.activate(this.actor);

    // ── Deployed craft stat inputs: hull.value, hull.max, payloadCount ──────────
    this.element.querySelectorAll(".imsc-craft-stat-input").forEach(input => {
      input.addEventListener("change", async () => {
        const tokenId = input.dataset.craftTokenId;
        const field   = input.dataset.field;
        const value   = parseInt(input.value) || 0;
        const tokenDoc = canvas.scene?.tokens.get(tokenId);
        if (!tokenDoc?.actor) return;
        await tokenDoc.actor.update({ [field]: value });
      });
    });

    // ── Strike craft loadout config input (flight size → hull.max) ──────────
    this.element.querySelectorAll("[data-config='squadronSize'][data-template-id]").forEach(input => {
      input.addEventListener("change", async ev => {
        ev.stopPropagation();
        const templateId   = input.dataset.templateId;
        const squadronSize = parseInt(input.value) || 1;
        const templates = this.actor.system.ordnanceActors?.strikeCraft ?? [];
        const newTemplates = templates.map(t => {
          if (t.id !== templateId) return t;
          const updated = foundry.utils.deepClone(t);
          foundry.utils.setProperty(updated, "actorData.system.hull.max",   squadronSize);
          foundry.utils.setProperty(updated, "actorData.system.hull.value", 0);
          return updated;
        });
        await this.actor.update({ "system.ordnanceActors.strikeCraft": newTemplates });
      });
    });

    // ── Torpedo loadout config input (salvo count → hull.max) ────────────────
    this.element.querySelectorAll("[data-config='torpedoCount'][data-template-id]").forEach(input => {
      input.addEventListener("change", async ev => {
        ev.stopPropagation();
        const templateId   = input.dataset.templateId;
        const torpedoCount = parseInt(input.value) || 1;
        const templates = this.actor.system.ordnanceActors?.torpedo ?? [];
        const newTemplates = templates.map(t => {
          if (t.id !== templateId) return t;
          const updated = foundry.utils.deepClone(t);
          foundry.utils.setProperty(updated, "actorData.system.hull.max",   torpedoCount);
          foundry.utils.setProperty(updated, "actorData.system.hull.value", 0);
          return updated;
        });
        await this.actor.update({ "system.ordnanceActors.torpedo": newTemplates });
      });
    });

    // ── NPC RTB hover: show 3VU recovery range circle ──────────────────────
    this.element.querySelectorAll("[data-action='npcRTB']").forEach(btn => {
      btn.addEventListener("mouseenter", () => {
        const shipToken = this.actor.getActiveTokens()?.[0];
        if (!shipToken || !canvas.stage) return;
        const gs = canvas.grid.size;
        const cx = shipToken.center?.x ?? (shipToken.x + gs / 2);
        const cy = shipToken.center?.y ?? (shipToken.y + gs / 2);
        if (this._rtbRangeGfx) this._rtbRangeGfx.destroy();
        const g = new PIXI.Graphics();
        g.beginFill(0x00ff88, 0.04);
        g.lineStyle(2, 0x00ff88, 0.5);
        g.drawCircle(cx, cy, 3 * gs);
        g.endFill();
        canvas.stage.addChild(g);
        this._rtbRangeGfx = g;
      });
      btn.addEventListener("mouseleave", () => {
        if (this._rtbRangeGfx) {
          this._rtbRangeGfx.destroy();
          this._rtbRangeGfx = null;
        }
      });
    });
  }

  /**
   * Compute the ghost token position from current helm state and update preview.
   */
  _updateHelmPreview() {
    helmUpdatePreview(this);
  }

  /**
   * Persist helm preview and weapon arc overlay across tab switches.
   */
  changeTab(tab, group, options = {}) {
    super.changeTab(tab, group, options);
    // Do NOT hide HelmPreview or deactivate WeaponArcOverlay  -  they persist.
  }

  async _onDropItem(data, event) {
    const dropZone = event?.target?.closest?.("[data-component-slot]");
    const item = await Item.fromDropData(data);
    if (!item) return;

    if (item.type !== `${MODULE_ID}.component`) {
      return ui.notifications.warn(game.i18n.localize("IMSC.Warning.OnlyComponents"));
    }

    const targetSlot     = dropZone?.dataset.componentSlot;
    const targetPosition = dropZone?.dataset.componentPosition;

    // If the item already exists on this actor, re-slot it
    const sameItem = this.actor.items.get(item.id);
    if (sameItem) {
      if (targetSlot) {
        const update = { "system.slot": targetSlot };
        if (targetSlot === "weapon" && targetPosition) {
          if (targetPosition === "port" || targetPosition === "starboard") {
            update["system.weaponPosition"] = "flank";
            update["system.weaponBay"]      = targetPosition;
          } else {
            update["system.weaponPosition"] = targetPosition;
          }
        }
        await sameItem.update(update);
      }
      return;
    }

    // Clone and embed with correct slot/position set before creation
    const createData = item.toObject();
    delete createData._id;
    if (targetSlot) {
      createData.system.slot = targetSlot;
      if (targetSlot === "weapon" && targetPosition) {
        if (targetPosition === "port" || targetPosition === "starboard") {
          createData.system.weaponPosition = "flank";
          createData.system.weaponBay      = targetPosition;
        } else {
          createData.system.weaponPosition = targetPosition;
        }
      }
    }
    await this.actor.createEmbeddedDocuments("Item", [createData]);
  }

  async _onDropActor(data, event) {
    const dropZone = event?.target?.closest?.("[data-ordnance-drop]");
    if (!dropZone) return;
    const slotType = dropZone.dataset.ordnanceSlot;
    if (!slotType) return;
    const actor = await Actor.fromDropData(data);
    if (!actor) return;
    const expectedType = slotType === "strikeCraft" ? `${MODULE_ID}.strikeCraft` : `${MODULE_ID}.torpedo`;
    if (actor.type !== expectedType) {
      return ui.notifications.warn(game.i18n.localize("IMSC.Warning.WrongOrdnanceType"));
    }
    const ref = {
      id: foundry.utils.randomID(),
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      actorData: actor.toObject(),
    };
    const existing = this.actor.system.ordnanceActors?.[slotType] ?? [];
    await this.actor.update({ [`system.ordnanceActors.${slotType}`]: [...existing, ref] });
  }

  close(options) {
    HelmPreview.hide();
    WeaponArcOverlay.deactivate();
    return super.close(options);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// NPC gunner context (heat lives on sys.heat, not sys.resources.enginseer.heat)
// ══════════════════════════════════════════════════════════════════════════════

const AMMO_MAX   = 20;
const POWER_MAX  = 20;
const HEAT_MAX   = 10;

function _buildNpcGunnerContext(sys) {
  const ammo     = sys.resources?.gunner?.ammo ?? 0;
  const power    = sys.resources?.gunner?.power ?? 0;
  const heat     = sys.heat ?? 0;
  const ammoMax  = sys.resources?.gunner?.ammoMax  ?? AMMO_MAX;
  const powerMax = sys.resources?.gunner?.powerMax ?? POWER_MAX;
  const heatMax  = sys.heatMax ?? HEAT_MAX;

  return {
    ammo,
    ammoMax,
    ammoPct:    ammoMax > 0 ? Math.min(100, Math.round((ammo  / ammoMax)  * 100)) : 0,
    power,
    powerMax,
    powerPct:   powerMax > 0 ? Math.min(100, Math.round((power / powerMax) * 100)) : 0,
    heat,
    heatMax,
    heatPct:    heatMax > 0 ? Math.round((heat / heatMax) * 100) : 0,
    heatColor:  heatColor(heatMax > 0 ? Math.round((heat / heatMax) * 100) : 0),
    hasCoreAssigned: false,
    isCoreSpent:     false,
    canConsumeCore:  false,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// NPC Helm wiring (replaces socket-based helmOnRender for NPC ships)
// ══════════════════════════════════════════════════════════════════════════════

function _npcHelmOnRender(sheet) {
  const sys        = sheet.actor.system;
  const fuelBurned = sys.resources?.pilot?.fuelBurned ?? 0;
  const currentRound = sys.round ?? 0;
  const helmResetId  = sys.resources?.pilot?.helmResetId ?? 0;
  const overdrive    = sys.resources?.pilot?.overdrive ?? false;
  const powerMax     = overdrive ? 200 : 100;

  // Initialise or reset helm state per round
  if (!sheet._helmState
      || sheet._helmState.round !== currentRound
      || sheet._helmState.helmResetId !== helmResetId) {
    sheet._helmState = { round: currentRound, helmResetId, bearing: sys.resources?.pilot?.bearing ?? 0, fuelSlider: fuelBurned };
  } else {
    sheet._helmState.bearing = sys.resources?.pilot?.bearing ?? 0;
    if (sheet._helmState.fuelSlider < fuelBurned) sheet._helmState.fuelSlider = fuelBurned;
    if (sheet._helmState.fuelSlider > powerMax) sheet._helmState.fuelSlider = powerMax;
  }

  const powerBarEl    = sheet.element.querySelector("[data-helm-power-bar]");
  const powerInput    = sheet.element.querySelector("[data-helm-fuel]");
  const bearingSlider = sheet.element.querySelector("[data-helm-bearing]");
  const bearingDisp   = sheet.element.querySelector("[data-bearing-display]");
  const fuelDisp      = sheet.element.querySelector("[data-fuel-display]");

  // Min-move marker position: written as data-minmove-pct on the power bar by the template
  const minMovePct = parseInt(powerBarEl?.dataset?.minmovePct ?? "0") || 0;

  if (powerInput) {
    powerInput.max   = String(powerMax);
    powerInput.value = String(sheet._helmState.fuelSlider);
  }

  const _syncPowerBar = (selectedPct) => {
    const ratio     = 100 / powerMax;
    const committed = fuelBurned * ratio;
    const extra     = Math.max(0, selectedPct - fuelBurned) * ratio;
    if (powerBarEl) {
      powerBarEl.style.setProperty("--committed", `${committed}%`);
      powerBarEl.style.setProperty("--extra",     `${extra}%`);
      powerBarEl.style.setProperty("--minmove",   `${minMovePct}%`);
    }
    if (fuelDisp) fuelDisp.textContent = `${selectedPct}%`;
  };

  _syncPowerBar(sheet._helmState.fuelSlider);

  if (powerInput) {
    powerInput.addEventListener("change", ev => { ev.stopPropagation(); ev.preventDefault(); }, true);
    powerInput.addEventListener("input", ev => {
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
    bearingSlider.addEventListener("input", ev => {
      const val = Number(ev.target.value);
      sheet._helmState.bearing = val;
      if (bearingDisp) bearingDisp.textContent = `${val}°`;
      sheet._updateHelmPreview();
      // Persist bearing directly to actor (no socket needed for NPC)
      clearTimeout(sheet._bearingDebounce);
      sheet._bearingDebounce = setTimeout(() => {
        sheet.actor.update({ "system.resources.pilot.bearing": val });
      }, 300);
    });
  }

  // Show projected drift on render
  sheet._updateHelmPreview();
}

// ══════════════════════════════════════════════════════════════════════════════
// Movement tab action handlers
// ══════════════════════════════════════════════════════════════════════════════

/** Roll Piloting for the NPC ship using its flat attribute. */
async function _onNpcRollPiloting() {
  const sys    = this.actor.system;
  const target = sys.attributes?.piloting ?? 40;
  const roll   = await new Roll("1d100").evaluate();
  const margin = target - roll.total;
  const sl     = Math.floor(margin / 10);

  const msg = await roll.toMessage({
    flavor: `${game.i18n.localize("IMSC.Helm.RollPiloting")} (${target})`,
  });

  await this.actor.update({
    "system.resources.pilot.pilotingSL": Math.max(0, sl),
    "system.resources.pilot.pilotingMessageId": msg.id,
  });
}

/**
 * Roll Piloting initiative for the NPC ship and update its combatant initiative
 * in the Foundry combat tracker.  SL = floor((attribute − d100) / 10), min 0.
 * Looks up the combatant by canvas token ID so unlinked NPC tokens resolve
 * correctly (actor.id on a synthetic token differs from the world actor id).
 */
async function _onNpcRollInitiative() {
  const sys      = this.actor.system;
  const piloting = sys.attributes?.piloting ?? 40;
  const skillMod = (piloting / 100).toFixed(2);

  const roll = await new Roll(`1d10 + ${skillMod}`).evaluate();

  await roll.toMessage({
    flavor: game.i18n.localize("IMSC.NpcShip.RollInitiative"),
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
  });

  if (!game.combat) return;
  const token = this.actor.getActiveTokens()?.[0];
  const combatant = token
    ? game.combat.combatants.find(c => c.tokenId === token.id)
    : game.combat.combatants.find(c => c.actor?.id === this.actor.id);
  if (combatant) {
    await combatant.update({ initiative: roll.total });
  }
}

/** Allocate bonus to speed or maneuverability (unrestricted). */
function _onNpcAllocBonus(event, target) {
  const stat  = target.dataset.stat;
  const delta = parseInt(target.dataset.delta) || 0;
  const sys   = this.actor.system;
  const pilot = sys.resources?.pilot ?? {};
  const allocSpeed   = pilot.allocSpeed   ?? 0;
  const allocMano    = pilot.allocMano    ?? 0;
  const allocEvasion = pilot.allocEvasion ?? 0;

  if (stat === "speed") {
    this.actor.update({ "system.resources.pilot.allocSpeed":   Math.max(0, allocSpeed + delta) });
  } else if (stat === "mano") {
    this.actor.update({ "system.resources.pilot.allocMano":    Math.max(0, allocMano + delta) });
  } else if (stat === "evasion") {
    this.actor.update({ "system.resources.pilot.allocEvasion": Math.max(0, allocEvasion + delta) });
  }
}

/** Confirm current helm movement  -  burn fuel and move token. */
async function _onNpcConfirmHelm() {
  const sys        = this.actor.system;
  const fuelBurned = sys.resources?.pilot?.fuelBurned ?? 0;
  const fuelSlider = this._helmState?.fuelSlider ?? fuelBurned;
  const bearing    = this._helmState?.bearing ?? 0;

  if (fuelSlider <= fuelBurned) {
    return ui.notifications.warn(game.i18n.localize("IMSC.Helm.WarnNoFuel"));
  }

  const speed        = (sys.movement?.speed ?? 0) + (sys.resources?.pilot?.allocSpeed ?? 0);
  const prevTurnMove = sys.resources?.pilot?.prevTurnMove ?? 0;
  const minMove      = Math.ceil(prevTurnMove / 2);
  const isFirstCommit = fuelBurned === 0;
  const thrustPct     = fuelSlider - fuelBurned;
  const driftUnits    = isFirstCommit ? minMove : 0;

  // Move the token on canvas via waypoints (curved interpolation)
  const token = this.actor.getActiveTokens()?.[0];
  if (token && canvas?.ready) {
    const projected = HelmPreview.projectPosition(token, bearing, thrustPct, speed, driftUnits);
    if (projected) {
      const waypoints = HelmPreview.projectWaypoints(token, bearing, thrustPct, speed, driftUnits);
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

  // Update actor resources
  const totalMoved = fuelSlider > 0 ? Math.max(driftUnits, Math.round((fuelSlider / 100) * speed)) : driftUnits;
  await this.actor.update({
    "system.resources.pilot.fuelBurned": fuelSlider,
    "system.resources.pilot.prevTurnMove": (prevTurnMove || 0) + totalMoved,
    "system.resources.pilot.bearing": bearing,
  });

  HelmPreview.hide();
}

/** Reset NPC helm for a new turn. */
function _onNpcResetHelm() {
  const id = (this.actor.system.resources?.pilot?.helmResetId ?? 0) + 1;
  this.actor.update({
    "system.resources.pilot.pilotingSL": 0,
    "system.resources.pilot.allocSpeed": 0,
    "system.resources.pilot.allocMano": 0,
    "system.resources.pilot.allocEvasion": 0,
    "system.resources.pilot.fuelBurned": 0,
    "system.resources.pilot.bearing": 0,
    "system.resources.pilot.overdrive": false,
    "system.resources.pilot.helmResetId": id,
    "system.resources.pilot.pilotingMessageId": "",
    "system.engActionUsed": false,
    "system.voidshieldFluxRemaining": this.actor.system.voidshieldFlux ?? 0,
  });
  HelmPreview.hide();
}

// ══════════════════════════════════════════════════════════════════════════════
// Gunner tab action handlers
// ══════════════════════════════════════════════════════════════════════════════

/** Fire an NPC weapon  -  opens targeting popup. */
async function _onNpcFireWeapon(event, target) {
  const weaponId = target.closest("[data-id]")?.dataset.id ?? target.dataset.weaponId;
  const fireMode = target.dataset.fireMode;
  if (!weaponId || !fireMode) return;

  const weapon = this.actor.items.get(weaponId);
  if (!weapon) return;

  const sys = this.actor.system;
  const weaponType = weapon.system.resourceType;

  // Validate resource availability using NPC ammo tracks / heat
  if (weaponType === "ammo") {
    const tier = MACRO_FIRE_TIERS.find(t => t.id === fireMode);
    if (!tier) return;
    const ammo = sys.resources?.gunner?.ammo ?? 0;
    if (ammo < tier.ammo) {
      return ui.notifications.warn(game.i18n.localize("IMSC.Warning.InsufficientAmmo"));
    }
  } else if (weaponType === "heat") {
    if ((sys.heat ?? 0) >= (sys.heatMax ?? HEAT_MAX)) {
      return ui.notifications.warn(game.i18n.localize("IMSC.Warning.HeatMaxed"));
    }
  } else if (weaponType === "power") {
    if ((sys.resources?.gunner?.power ?? 0) <= 0) {
      return ui.notifications.warn(game.i18n.localize("IMSC.Warning.InsufficientAP"));
    }
  }

  const popup = new TargetingPopup({ weapon, fireMode });
  popup.render(true);
}

// ══════════════════════════════════════════════════════════════════════════════
// Main tab action handlers
// ══════════════════════════════════════════════════════════════════════════════

function _adjustShieldSector(sheet, sector, delta) {
  const sys = sheet.actor.system;
  const cur = sys.shields?.[sector] ?? 0;
  const newVal = Math.max(0, cur + delta);
  const actualDelta = newVal - cur;
  if (actualDelta === 0) return;
  const updates = {
    [`system.shields.${sector}`]: newVal,
    "system.voidshieldFluxRemaining": (sys.voidshieldFluxRemaining ?? 0) - actualDelta,
  };
  sheet.actor.update(updates);
}

async function _onNpcStepCondition(event, target) {
  const locId = target.dataset.locId;
  if (!locId) return;
  const cond     = this.actor.toObject()?.system?.conditions?.[locId] ?? {};
  const nextTier = cond.tier === "high" ? "medium"
    : cond.tier === "medium" ? "low"
    : null;
  await this.actor.update({
    [`system.conditions.${locId}`]: nextTier ? { ...cond, tier: nextTier } : { tier: null },
  });
}

function _onAdjustShield(event, target) {
  const sector = target.dataset.sector;
  const delta  = parseInt(target.dataset.delta) || 0;
  if (!sector || !delta) return;
  const sys = this.actor.system;
  const cur = sys.shields?.[sector] ?? 0;
  // No cap  -  shield can go above max
  const newVal = Math.max(0, cur + delta);
  const actualDelta = newVal - cur;
  const updates = { [`system.shields.${sector}`]: newVal };
  // Mirror flux: adding shields consumes flux, removing shields restores it
  if (actualDelta !== 0) {
    updates["system.voidshieldFluxRemaining"] = (sys.voidshieldFluxRemaining ?? 0) - actualDelta;
  }
  this.actor.update(updates);
}

async function _onSuppressFire() {
  const sys = this.actor.system;
  if (sys.engActionUsed) return ui.notifications.warn(game.i18n.localize("IMSC.NpcShip.EngActionUsed"));
  if ((sys.internalFire ?? 0) <= 0) return;
  const target = sys.attributes?.tech ?? 40;
  const roll   = await new Roll("1d100").evaluate();
  const sl     = Math.floor((target - roll.total) / 10);
  const newFire = Math.max(0, (sys.internalFire ?? 0) - Math.max(0, 5 + sl));
  await roll.toMessage({ flavor: `${game.i18n.localize("IMSC.NpcShip.SuppressFire")} (${game.i18n.localize("IMSC.NpcShip.Tech")} ${target})` });
  await this.actor.update({ "system.internalFire": newFire, "system.engActionUsed": true });
}

async function _onReduceHeat() {
  const sys = this.actor.system;
  if (sys.engActionUsed) return ui.notifications.warn(game.i18n.localize("IMSC.NpcShip.EngActionUsed"));
  if ((sys.heat ?? 0) <= 0) return;
  const target = sys.attributes?.tech ?? 40;
  const roll   = await new Roll("1d100").evaluate();
  const sl     = Math.floor((target - roll.total) / 10);
  const newHeat = Math.max(0, (sys.heat ?? 0) - Math.max(0, 5 + sl));
  await roll.toMessage({ flavor: `${game.i18n.localize("IMSC.NpcShip.ReduceHeat")} (${game.i18n.localize("IMSC.NpcShip.Tech")} ${target})` });
  await this.actor.update({ "system.heat": newHeat, "system.engActionUsed": true });
}

async function _onFullReset() {
  const sys = this.actor.system;
  const updates = {
    "system.active": false,
    "system.round": 0,
    "system.hull.value": 0,
    "system.internalFire": 0,
    "system.engActionUsed": false,
    "system.movement.speed":          sys.movement?.baseSpeed ?? 0,
    "system.movement.maneuverability": sys.movement?.baseManeuverability ?? 0,
    "system.resources.pilot.pilotingSL": 0,
    "system.resources.pilot.allocSpeed": 0,
    "system.resources.pilot.allocMano": 0,
    "system.resources.pilot.allocEvasion": 0,
    "system.resources.pilot.fuelBurned": 0,
    "system.resources.pilot.prevTurnMove": 0,
    "system.resources.pilot.bearing": 0,
    "system.resources.pilot.helmResetId": 0,
    "system.resources.pilot.pilotingMessageId": "",
    "system.resources.gunner.ammo": Math.round((sys.resources?.gunner?.ammoMax ?? 20) * 0.25),
    "system.resources.gunner.power": Math.round((sys.resources?.gunner?.powerMax ?? 20) * 0.5),
    "system.heat": 0,
  };
  for (const s of SECTORS) updates[`system.shields.${s}`] = sys.shieldMax?.[s] ?? 0;
  for (const s of SECTORS) updates[`system.armour.${s}`] = sys.armourBase?.[s] ?? 0;
  for (const s of SECTORS) updates[`system.armourRend.${s}`] = 0;
  for (const k of ["a", "b", "c"]) updates[`system.ammoTracks.${k}.value`] = sys.ammoTracks?.[k]?.max ?? 10;
  updates["system.voidshieldFluxRemaining"] = sys.voidshieldFlux ?? 0;
  const condClear = { tier: null, jammedItemId: null, jammedItemName: null, lockedRole: null };
  updates["system.conditions.hull"]           = { ...condClear };
  updates["system.conditions.engines"]        = { ...condClear };
  updates["system.conditions.manoeuvring"]    = { ...condClear };
  updates["system.conditions.coreSystems"]    = { ...condClear };
  updates["system.conditions.weaponsSensors"] = { ...condClear };
  await this.actor.update(updates);
  HelmPreview.hide();
  // Delete all deployed ordnance tokens belonging to this NPC ship
  if (canvas?.scene) {
    const shipTokenId = this.actor.getActiveTokens?.()?.[0]?.id;
    const ordnanceTypes = [`${MODULE_ID}.torpedo`, `${MODULE_ID}.strikeCraft`];
    const toDelete = canvas.scene.tokens
      .filter(td =>
        ordnanceTypes.includes(td.actor?.type) &&
        (!shipTokenId || td.actor?.system?.parentShipTokenId === shipTokenId)
      )
      .map(td => td.id);
    if (toDelete.length > 0) {
      await canvas.scene.deleteEmbeddedDocuments("Token", toDelete);
    }
  }
}

function _onRefillShields() {
  const sys = this.actor.system;
  const updates = {};
  let totalAdded = 0;
  for (const s of SECTORS) {
    const cur = sys.shields?.[s] ?? 0;
    const max = sys.shieldMax?.[s] ?? 0;
    updates[`system.shields.${s}`] = max;
    totalAdded += Math.max(0, max - cur);
  }
  if (totalAdded > 0) {
    updates["system.voidshieldFluxRemaining"] = (sys.voidshieldFluxRemaining ?? 0) - totalAdded;
  }
  this.actor.update(updates);
}

function _onAdjustHull(event, target) {
  const delta = parseInt(target.dataset.delta) || 0;
  const sys = this.actor.system;
  this.actor.update({ "system.hull.value": Math.max(0, Math.min(sys.hull.max, (sys.hull.value ?? 0) + delta)) });
}

/** Convert 1 voidshield flux into 1 gunner charge. */
function _onFluxToCharge() {
  const sys = this.actor.system;
  const flux = sys.voidshieldFluxRemaining ?? 0;
  if (flux <= 0) return ui.notifications.warn(game.i18n.localize("IMSC.NpcShip.NoFluxRemaining"));
  const power = sys.resources?.gunner?.power ?? 0;
  this.actor.update({
    "system.voidshieldFluxRemaining":   flux - 1,
    "system.resources.gunner.power":  power + 1,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Ordnance tab action handlers
// ══════════════════════════════════════════════════════════════════════════════

// ── NPC ordnance spawn helpers ────────────────────────────────────────────

async function _promptNpcSide() {
  return new Promise(resolve => {
    const d = new foundry.applications.api.DialogV2({
      window: { title: game.i18n.localize("IMSC.Ordnance.ChooseSide") },
      content: `<p>${game.i18n.localize("IMSC.Ordnance.ChooseSideDesc")}</p>`,
      buttons: [
        { action: "port",      label: game.i18n.localize("IMSC.Sector.Port"),      icon: "fa-solid fa-arrow-left" },
        { action: "bow",       label: game.i18n.localize("IMSC.Sector.Bow"),        icon: "fa-solid fa-arrow-up" },
        { action: "starboard", label: game.i18n.localize("IMSC.Sector.Starboard"), icon: "fa-solid fa-arrow-right" },
      ],
      close: () => resolve(null),
      submit: result => resolve(result),
    });
    d.render(true);
  });
}

function _npcComputePerpendicularSpawn(token, side) {
  if (!token) return { x: 0, y: 0, rotation: 0 };
  const grid = canvas.grid?.size ?? 100;
  const offset = grid * 1.5;
  const shipRotDeg = token.document?.rotation ?? 0;
  const headingRad = (shipRotDeg - 90) * (Math.PI / 180);
  const perpRad = side === "port" ? headingRad - Math.PI / 2 : headingRad + Math.PI / 2;
  const cx = token.center?.x ?? (token.x + grid / 2);
  const cy = token.center?.y ?? (token.y + grid / 2);
  return {
    x:        Math.round(cx + Math.cos(perpRad) * offset - grid / 2),
    y:        Math.round(cy + Math.sin(perpRad) * offset - grid / 2),
    rotation: shipRotDeg + (side === "port" ? -90 : 90),
  };
}

function _npcComputeBowSpawn(token) {
  if (!token) return { x: 0, y: 0, rotation: 0 };
  const grid = canvas.grid?.size ?? 100;
  const offset = grid * 1.5;
  const shipRotDeg = token.document?.rotation ?? 0;
  const headingRad = (shipRotDeg - 90) * (Math.PI / 180);
  const cx = token.center?.x ?? (token.x + grid / 2);
  const cy = token.center?.y ?? (token.y + grid / 2);
  return {
    x:        Math.round(cx + Math.cos(headingRad) * offset - grid * 0.25),
    y:        Math.round(cy + Math.sin(headingRad) * offset - grid * 0.25),
    rotation: shipRotDeg,
  };
}

async function _onNpcLaunchTorpedo()     { await _npcLaunchOrdnance.call(this, "torpedo"); }
async function _onNpcLaunchStrikeCraft() { await _npcLaunchOrdnance.call(this, "strikeCraft"); }

/**
 * Save inline squadron size / payload count edits from the loadout section.
 * The inputs fire on blur; we read all inputs in that template row and persist
 * the changed values back to the template's actorData on the ship actor.
 */
async function _onNpcSaveCraftConfig(event, target) {
  const row        = target.closest("[data-template-id]");
  const templateId = row?.dataset?.templateId;
  if (!templateId) return;

  const squadronInput = row.querySelector("[data-config='squadronSize']");
  const payloadInput  = row.querySelector("[data-config='payloadCount']");
  const squadronSize  = parseInt(squadronInput?.value) || 1;
  const payloadCount  = parseInt(payloadInput?.value)  || 1;

  const templates = this.actor.system.ordnanceActors?.strikeCraft ?? [];
  const newTemplates = templates.map(t => {
    if (t.id !== templateId) return t;
    const updated = foundry.utils.deepClone(t);
    foundry.utils.setProperty(updated, "actorData.system.hull.max",     squadronSize);
    foundry.utils.setProperty(updated, "actorData.system.hull.value",   0);
    foundry.utils.setProperty(updated, "actorData.system.payloadCount", payloadCount);
    return updated;
  });
  await this.actor.update({ "system.ordnanceActors.strikeCraft": newTemplates });
}

async function _onNpcPanToOrdnance(event, target) {
  const tokenId = target.dataset.tokenId;
  if (!tokenId || !canvas.scene) return;
  const token = canvas.tokens.get(tokenId);
  if (!token) return;
  canvas.animatePan({ x: token.center.x, y: token.center.y, duration: 250 });
  token.actor?.sheet?.render(true);
}

async function _onNpcRTB() {
  if (!canvas.scene) return;
  const shipToken = this.actor.getActiveTokens()?.[0];
  if (!shipToken) {
    ui.notifications.warn(game.i18n.localize("IMSC.Warning.NoShipToken"));
    return;
  }

  // Find deployed strike craft belonging to this NPC ship within 3VU
  const gs = canvas.grid.size;
  const shipCx = shipToken.center?.x ?? (shipToken.x + (shipToken.document.width  ?? 1) * gs / 2);
  const shipCy = shipToken.center?.y ?? (shipToken.y + (shipToken.document.height ?? 1) * gs / 2);
  const maxDist = 3 * gs;

  const nearbyCraft = [];
  for (const td of canvas.scene.tokens) {
    if (td.actor?.type !== `${MODULE_ID}.strikeCraft`) continue;
    if (td.actor?.system?.parentShipTokenId !== shipToken.id) continue;
    const cx = (td.x ?? 0) + (td.document?.width  ?? 1) * gs / 2;
    const cy = (td.y ?? 0) + (td.document?.height ?? 1) * gs / 2;
    const dist = Math.sqrt((shipCx - cx) ** 2 + (shipCy - cy) ** 2);
    if (dist > maxDist) continue;
    nearbyCraft.push({
      tokenId:  td.id,
      name:     td.name,
      img:      td.texture?.src ?? td.actor?.img ?? "",
      distance: Math.round((dist / gs) * 10) / 10,
      targetX:  cx,
      targetY:  cy,
    });
  }

  if (!nearbyCraft.length) {
    ui.notifications.warn(game.i18n.localize("IMSC.Ordnance.NoCraftInRange"));
    return;
  }

  const shipPos = { x: shipCx, y: shipCy };
  const popup = new RecoverCraftPopup({ nearbyCraft, shipPos });
  const selectedTokenId = await popup.show();
  if (!selectedTokenId) return;

  // Flag as recovering so the deleteToken hook doesn't count it as destroyed
  const tokenDoc = canvas.scene.tokens.get(selectedTokenId);
  if (tokenDoc?.actor) {
    await tokenDoc.actor.setFlag(MODULE_ID, "recovering", true);
  }

  await canvas.scene.deleteEmbeddedDocuments("Token", [selectedTokenId]);
}

async function _npcLaunchOrdnance(type) {
  const slotKey   = type === "strikeCraft" ? "strikeCraft" : "torpedo";
  const templates = this.actor.system.ordnanceActors?.[slotKey] ?? [];
  const tmpl      = templates[0]; // always use first template

  if (!tmpl) {
    return ui.notifications.warn(game.i18n.localize("IMSC.NpcShip.NoTemplate"));
  }

  // Find this ship's canvas token (needed for center/rotation)
  const shipToken = this.actor.getActiveTokens()?.[0];
  if (!shipToken) {
    return ui.notifications.warn(game.i18n.localize("IMSC.NpcShip.NoTokenFound"));
  }
  const parentShipTokenId = shipToken.id;

  // Prompt for launch direction
  const side = await _promptNpcSide();
  if (!side) return; // cancelled

  // Compute spawn position based on direction
  const spawn = side === "bow"
    ? _npcComputeBowSpawn(shipToken)
    : _npcComputePerpendicularSpawn(shipToken, side);

  // Clone template actor data
  const actorData = foundry.utils.deepClone(tmpl.actorData);
  delete actorData._id;
  foundry.utils.setProperty(actorData, `flags.${MODULE_ID}.fromOrdnanceMaster`, true);
  foundry.utils.setProperty(actorData, "system.parentShipTokenId", parentShipTokenId);
  // Torpedoes start turn-complete (they drift); strike craft act immediately
  if (actorData.system) actorData.system.turnComplete = (type === "torpedo");
  // Reset hull damage to 0 on spawn (0 = full, max = destroyed, same as ships)
  if (actorData.system?.hull) actorData.system.hull.value = 0;

  const actor = await Actor.create(actorData);
  if (!actor) return;

  // Place token at selected spawn position
  const tokenDoc = await actor.getTokenDocument({
    x:           spawn.x,
    y:           spawn.y,
    rotation:    spawn.rotation,
    hidden:      false,
    disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,
    width:       0.5,
    height:      0.5,
  });
  await canvas.scene.createEmbeddedDocuments("Token", [tokenDoc.toObject()]);

  this.render();
}

async function _onNpcOpenOrdTemplate(event, target) {
  const row        = target.closest("[data-template-id]");
  const slotType   = row?.dataset?.ordnanceSlot;
  const templateId = row?.dataset?.templateId;
  if (!slotType || !templateId) return;

  const templates = this.actor.system.ordnanceActors?.[slotType] ?? [];
  const ref       = templates.find(e => e.id === templateId);
  if (!ref?.actorData) return;

  // Create a temporary edit copy
  const editData = foundry.utils.deepClone(ref.actorData);
  delete editData._id;
  foundry.utils.setProperty(editData, `flags.${MODULE_ID}.embeddedEdit`, true);
  // Bypass the preCreateActor hull-reset hook so hull.max stays as configured
  foundry.utils.setProperty(editData, `flags.${MODULE_ID}.fromOrdnanceMaster`, true);
  const editActor = await Actor.create(editData);
  if (!editActor) return;

  const sheet = editActor.sheet;
  sheet.render(true);

  // Patch close() to persist changes back to the template
  const shipActor = this.actor;
  const origClose = sheet.close.bind(sheet);
  let _closing = false;
  sheet.close = async (options) => {
    if (_closing) return origClose(options);
    _closing = true;
    const updatedData = editActor.toObject();
    delete updatedData._id;
    const currentTemplates = shipActor.system.ordnanceActors?.[slotType] ?? [];
    const newTemplates = currentTemplates.map(e =>
      e.id === templateId
        ? { ...e, actorData: updatedData, name: updatedData.name, img: updatedData.img }
        : e,
    );
    await shipActor.update({ [`system.ordnanceActors.${slotType}`]: newTemplates });
    if (game.actors.has(editActor.id)) await editActor.delete();
    return origClose(options);
  };
}

async function _onNpcRemoveOrdTemplate(event, target) {
  const row        = target.closest("[data-template-id]");
  const slotType   = row?.dataset?.ordnanceSlot;
  const templateId = row?.dataset?.templateId;
  if (!slotType || !templateId) return;
  const existing = this.actor.system.ordnanceActors?.[slotType] ?? [];
  await this.actor.update({
    [`system.ordnanceActors.${slotType}`]: existing.filter(e => e.id !== templateId),
  });
}
