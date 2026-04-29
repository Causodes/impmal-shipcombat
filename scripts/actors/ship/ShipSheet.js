import { MODULE_ID, ROLES, ROLE_ACTIONS, POWER_CORES_MAX, SHIP_CLASSIFICATIONS, PAYLOAD_TYPES, CRIT_CONDITIONS, CRIT_LOCATIONS } from "../../constants.js";
import { emitToGM } from "../../socket.js";
import { ShipCombatState } from "../../state/ShipCombatState.js";

// ── Role action maps ──────────────────────────────────────────────────────
import { OVERVIEW_ACTIONS } from "../../roles/overview.js";
import { SHARED_ACTIONS, adjustShieldSectorDelta } from "../../roles/shared.js";
import { PILOT_ACTIONS, buildHelmContext, helmOnRender, helmUpdatePreview } from "../../roles/pilot.js";
import { ENGINSEER_ACTIONS, buildEngineerContext } from "../../roles/enginseer.js";
import { SENSORS_ACTIONS, buildSensorsContext } from "../../roles/sensors.js";
import { GUNNER_ACTIONS, buildGunnerContext, enrichWeaponForGunner } from "../../roles/gunner.js";
import { ORDNANCE_ACTIONS, buildOrdnanceContext } from "../../roles/ordnance.js";
import { CAPTAIN_ACTIONS, buildCaptainContext } from "../../roles/captain.js";
import { HelmPreview } from "../../canvas/HelmPreview.js";
import { WeaponArcOverlay } from "../../canvas/WeaponArcOverlay.js";
import { AuspexRadar } from "../../canvas/AuspexRadar.js";

// ── Constants ─────────────────────────────────────────────────────────────
const ROLE_IDS = Object.keys(ROLES);
const SECTORS  = ["bow", "stern", "port", "starboard"];
const SECTOR_ABBR = { bow: "BOW", stern: "STN", port: "PRT", starboard: "STBD" };
const WEAPON_SECTIONS = [
  { id: "prow",      label: "IMSC.Slot.Prow" },
  { id: "dorsal",    label: "IMSC.Slot.Dorsal" },
  { id: "port",      label: "IMSC.Slot.Port" },
  { id: "starboard", label: "IMSC.Slot.Starboard" },
];
const EQUIPMENT_SECTIONS = [
  { id: "shields", label: "IMSC.Slot.Shields" },
  { id: "armour",  label: "IMSC.Slot.Armour"  },
  { id: "engine",  label: "IMSC.Slot.Engine"  },
  { id: "auspex",  label: "IMSC.Slot.Auspex"  },
  { id: "reactor", label: "IMSC.Slot.Reactor" },
  { id: "weaponsBay", label: "IMSC.Slot.WeaponsBay" },
];
const ROLE_MAIN_SKILLS = {
  captain:   { skillKey: "presence",  specialisation: "Leadership",     rootLabel: "Presence",  label: "IMSC.MainSkill.Leadership" },
  enginseer: { skillKey: "tech",      specialisation: "Engineering",    rootLabel: "Tech",      label: "IMSC.MainSkill.Engineering" },
  pilot:     { skillKey: "piloting",  specialisation: "Major Voidship", rootLabel: "Piloting",  label: "IMSC.MainSkill.MajorVoidship" },
  sensors:   { skillKey: "intuition", specialisation: "Surroundings",   rootLabel: "Intuition", label: "IMSC.MainSkill.IntuitionSurroundings" },
  gunner:    { skillKey: "ranged",    specialisation: "Ordnance",       rootLabel: "Ranged",    label: "IMSC.MainSkill.RangedOrdnance" },
  ordnance:  { skillKey: "athletics", specialisation: "Might",          rootLabel: "Athletics", label: "IMSC.MainSkill.AthleticsMight" },
};

// ── Helpers ───────────────────────────────────────────────────────────────

function _norm(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getRoleMainSkillData(actor, roleId) {
  const cfg = ROLE_MAIN_SKILLS[roleId];
  if (!cfg) return { label: "", value: null };

  const skill = actor?.system?.skills?.[cfg.skillKey];
  const list = Array.isArray(skill?.specialisations) ? skill.specialisations : [];
  const spec = list.find(s => _norm(s?.name).includes(_norm(cfg.specialisation)));
  const total = Number(spec?.system?.total ?? skill?.total ?? NaN);

  return {
    label: game.i18n.localize(cfg.label),
    value: Number.isFinite(total) ? total : null,
    hasValue: Number.isFinite(total),
  };
}

function getComponentSlot(item) {
  return item.system?.slot ?? "prow";
}

function buildSectionedItems(definitions, items, slotConfig, keyFn = getComponentSlot) {
  return definitions.map(def => {
    const sectionItems = items.filter(item => keyFn(item) === def.id);
    const slotCount = Math.max(0, Number(slotConfig?.[def.id] ?? 0));
    return {
      ...def,
      labelLocalized: game.i18n.localize(def.label),
      slotCount,
      emptySlots: Math.max(0, slotCount - sectionItems.length),
      items: sectionItems,
    };
  });
}

// ── Sheet Class ───────────────────────────────────────────────────────────

export class ShipSheet extends IMActorSheet {

  _resolveRoleForUser(user = game.user) {
    const sys = this.actor.system;

    const direct = sys.roles?.[user.id] ?? null;
    if (direct) return direct;

    const crewActors = sys.crewActors ?? {};
    for (const [roleId, ref] of Object.entries(crewActors)) {
      const actor = ref?.id ? game.actors.get(ref.id) : null;
      if (!actor) continue;

      if (user.character?.id && user.character.id === actor.id) return roleId;

      const level = Number(actor.ownership?.[user.id] ?? actor.ownership?.default ?? 0);
      if (level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) return roleId;
    }

    return null;
  }

  /**
   * Always treat the sheet as editable. All player writes go through the
   * socket to the GM, so there is no security concern.  Without this,
   * Foundry's base rendering pipeline disables every button/input for
   * Observer-level users, which breaks our crew-action workflow.
   */
  get isEditable() {
    return true;
  }

  static DEFAULT_OPTIONS = {
    classes: ["vehicle", "imsc-ship"],
    actions: {
      ...OVERVIEW_ACTIONS,
      ...SHARED_ACTIONS,
      ...PILOT_ACTIONS,
      ...ENGINSEER_ACTIONS,
      ...SENSORS_ACTIONS,
      ...GUNNER_ACTIONS,
      ...ORDNANCE_ACTIONS,
      ...CAPTAIN_ACTIONS,
      openItem: ShipSheet._onOpenItem,
      openOrdnanceActor: ShipSheet._onOpenOrdnanceActor,
      removeOrdnanceActor: ShipSheet._onRemoveOrdnanceActor,
      debugSetCondition: ShipSheet._onDebugSetCondition,
    },
    position: { width: 720, height: 820 },
    defaultTab: "overview",
  };

  static PARTS = {
    header:    { template: `modules/${MODULE_ID}/templates/actor/ship-header.hbs`,    classes: ["vehicle-header"], scrollable: [""] },
    tabs:      { template: "templates/generic/tab-navigation.hbs" },
    overview:  { template: `modules/${MODULE_ID}/templates/actor/ship-overview.hbs`,  scrollable: [""] },
    captain:   { template: `modules/${MODULE_ID}/templates/actor/ship-captain.hbs`,   scrollable: [""] },
    enginseer: { template: `modules/${MODULE_ID}/templates/actor/ship-enginseer.hbs`, scrollable: [""] },
    pilot:     { template: `modules/${MODULE_ID}/templates/actor/ship-pilot.hbs`,     scrollable: [""] },
    sensors:   { template: `modules/${MODULE_ID}/templates/actor/ship-sensors.hbs`,   scrollable: [""] },
    gunner:    { template: `modules/${MODULE_ID}/templates/actor/ship-gunner.hbs`,    scrollable: [""] },
    ordnance:  { template: `modules/${MODULE_ID}/templates/actor/ship-ordnance.hbs`,  scrollable: [""] },
    config:    { template: `modules/${MODULE_ID}/templates/actor/ship-config.hbs`,    scrollable: [""] },
    // effects tab suppressed  -  kept for future use
    // effects:   { template: `modules/${MODULE_ID}/templates/actor/ship-effects.hbs`,   scrollable: [""] },
  };

  static TABS = {
    overview:  { id: "overview",  group: "primary", label: "IMSC.Tab.Overview"   },
    captain:   { id: "captain",   group: "primary", label: "IMSC.Role.Captain"   },
    enginseer: { id: "enginseer", group: "primary", label: "IMSC.Role.Enginseer" },
    pilot:     { id: "pilot",     group: "primary", label: "IMSC.Role.Pilot"     },
    sensors:   { id: "sensors",   group: "primary", label: "IMSC.Role.Sensors"   },
    gunner:    { id: "gunner",    group: "primary", label: "IMSC.Role.Gunner"    },
    ordnance:  { id: "ordnance",  group: "primary", label: "IMSC.Role.Ordnance"  },
    config:    { id: "config",    group: "primary", label: "IMSC.Tab.Config"     },
    // effects:   { id: "effects",   group: "primary", label: "IMSC.Tab.Effects"    },
  };

  // ── Per-user tab/part filtering ─────────────────────────────────────────

  _allowedParts() {
    if (game.user.isGM) return new Set(Object.keys(ShipSheet.PARTS));
    const myRole = this._resolveRoleForUser(game.user);
    const level = this.actor.getUserLevel(game.user) ?? 0;
    const isOwner = level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const canObserve = level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const allowed = new Set(["header", "tabs"]);
    if (canObserve) allowed.add("overview");
    if (isOwner) {
      allowed.add("config");
    }
    if (myRole) allowed.add(myRole);
    return allowed;
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (game.user.isGM) return;
    const allowed = this._allowedParts();
    options.parts = (options.parts ?? Object.keys(ShipSheet.PARTS))
      .filter(p => allowed.has(p));
  }

  /**
   * Filter tab list so non-GM users only see tabs for parts they can access.
   * warhammer-lib's _prepareTabs returns a flat { tabId: { id, group, active, ... } } object.
   */
  _prepareTabs(options) {
    const tabs = super._prepareTabs(options);
    if (game.user.isGM) return tabs;
    const allowed = this._allowedParts();
    for (const key of Object.keys(tabs)) {
      if (!allowed.has(key)) delete tabs[key];
    }
    return tabs;
  }

  // ── Context ─────────────────────────────────────────────────────────────

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys     = this.actor.system;
    const userId  = game.user.id;
    const myRole  = this._resolveRoleForUser(game.user);
    const stagedCoresMap = sys.resources?.enginseer?.stagedCores ?? {};

    const rolesArray = await Promise.all(ROLE_IDS.map(async roleId => {
      const role         = ROLES[roleId];
      const assignEntry  = Object.entries(sys.roles ?? {}).find(([, r]) => r === roleId);
      const assignedUid  = assignEntry?.[0] ?? null;
      const assignedUser = assignedUid ? game.users.get(assignedUid) : null;
      const actorRef     = sys.crewActors?.[roleId] ?? null;
      let assignedActor  = null;
      if (actorRef?.uuid) {
        try { assignedActor = await fromUuid(actorRef.uuid); }
        catch (e) { assignedActor = null; }
      }
      const actions      = ROLE_ACTIONS[roleId];
      const turnDone        = sys.turnDone?.[roleId] ?? false;
      const overchargedUsed = sys.overchargeUsed?.[roleId] ?? false;
      const actionAvailable = !turnDone;
      const mainSkill = assignedActor ? getRoleMainSkillData(assignedActor, roleId) : { label: "", value: null };
      const payloadId = sys.resources?.[roleId]?.payload ?? "";
      const payloadDef = payloadId ? PAYLOAD_TYPES[payloadId] : null;
      return {
        ...role,
        labelLocalized:    game.i18n.localize(role.label),
        assignedUser,
        actorRef,
        assignedActor: assignedActor ? {
          id: assignedActor.id,
          uuid: assignedActor.uuid,
          name: assignedActor.name,
          img: assignedActor.img,
        } : (actorRef ?? null),
        assignedUserId:    assignedUid,
        isMyRole:          assignedUid === userId,
        // hasCoreAssigned in the generic roles context = Enginseer actually dispatched a core.
        // Captain-granted cores (coreCount) do NOT count here so the pip stays clickable.
        hasCoreAssigned:   !!(sys.assignedCores?.[roleId]) && sys.assignedCores?.[roleId] !== "spent",
        hasCaptainFreeCore: false,
        isCoreSpent:        false,
        coreCount:          sys.resources?.[roleId]?.coreCount ?? 0,
        hasCoreStaged:     !!(stagedCoresMap[roleId]),
        standardUsed:      turnDone,
        overchargedUsed,
        turnDone,
        actionAvailable,
        mainSkill,
        standardAction:    { label: game.i18n.localize(actions.standard.label),    desc: game.i18n.localize(actions.standard.desc)    },
        overchargedAction: { label: game.i18n.localize(actions.overcharged.label), desc: game.i18n.localize(actions.overcharged.desc) },
        payloadId,
        payloadLabel: payloadDef ? game.i18n.localize(payloadDef.label) : "",
        payloadDesc:  payloadDef ? game.i18n.localize(payloadDef.desc)  : "",
      };
    }));

    const roles = {};
    for (const r of rolesArray) roles[r.id] = r;

    const myRoleData      = myRole ? roles[myRole] : null;
    const hasPowerCore    = (sys.resources?.pilot?.coreCount ?? 0) > 0;

    const shieldCfg = ShipCombatState.getShieldStats();
    const sectors = SECTORS.map(sector => ({
      id:           sector,
      label:        game.i18n.localize(`IMSC.Sector.${sector.charAt(0).toUpperCase() + sector.slice(1)}`),
      armour:       sys.armour?.[sector]  ?? 0,
      shield:       sys.shields?.[sector] ?? 0,
      zoneThreshold: shieldCfg.zoneThresholds?.[sector] ?? 8,
    }));

    const powerCoresAvailable = sys.resources?.enginseer?.powerCores ?? POWER_CORES_MAX;
    // Per-ship powerCoresMax (stored on actor) takes precedence over the world setting.
    const powerCoresMax = sys.powerCoresMax ?? game.settings.get(MODULE_ID, "powerCoresMax");

    const stagedCoreCount       = Object.values(stagedCoresMap).filter(Boolean).length;
    const stagedShieldCoreCount = sys.resources?.enginseer?.stagedShieldCores ?? 0;
    const stagedAuxCoreCount    = sys.resources?.enginseer?.stagedAuxCores ?? 0;
    const committedAuxCoreCount = sys.resources?.enginseer?.committedAuxCores ?? 0;
    const shieldCommittedCount  = sys.shieldPool?.committed ?? 0;
    const assignedCoreCount     = Object.values(sys.assignedCores ?? {}).filter(Boolean).length;
    const totalCoreCount        = powerCoresAvailable + stagedCoreCount + stagedShieldCoreCount + stagedAuxCoreCount + committedAuxCoreCount + shieldCommittedCount + assignedCoreCount;

    const components = this.actor.items.filter(i => i.type === `${MODULE_ID}.component`);
    const weaponComponents = components.filter(c => c.system.slot === "weapon");
    const ordnanceComponents = components.filter(c => ["torpedo", "strikeCraft"].includes(c.system.slot));
    const equipmentComponents = components.filter(c => c.system.slot !== "weapon" && !["torpedo", "strikeCraft"].includes(c.system.slot));

    const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const observerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const userLevel = this.actor.getUserLevel(game.user) ?? 0;

    Object.assign(context, {
      sys,
      isGM: game.user.isGM,
      isOwner: userLevel >= ownerLevel,
      canObserve: userLevel >= observerLevel,
      myUserId: userId,
      myRole,
      myRoleData,
      hasPowerCore,
      roles,
      sectors,
      powerCoresAvailable,
      powerCoresMax,
      powerCorePips: Array.from({ length: totalCoreCount }, (_, i) => {
        if (i < assignedCoreCount) return { state: "assigned" };
        if (i < assignedCoreCount + stagedCoreCount) return { state: "staged" };
        if (i < assignedCoreCount + stagedCoreCount + stagedShieldCoreCount) return { state: "shield-staged" };
        if (i < assignedCoreCount + stagedCoreCount + stagedShieldCoreCount + shieldCommittedCount) return { state: "shield-committed" };
        if (i < assignedCoreCount + stagedCoreCount + stagedShieldCoreCount + shieldCommittedCount + stagedAuxCoreCount) return { state: "aux-staged" };
        if (i < assignedCoreCount + stagedCoreCount + stagedShieldCoreCount + shieldCommittedCount + stagedAuxCoreCount + committedAuxCoreCount) return { state: "aux-committed" };
        return { state: "available" };
      }),
      shipSectors: sectors.map(sector => ({
        ...sector,
        abbr: SECTOR_ABBR[sector.id] ?? sector.id.toUpperCase(),
        shieldLabel: game.i18n.localize("IMSC.Label.Shield"),
        armourLabel: game.i18n.localize("IMSC.Label.Armour"),
        armourRendVal: sys.armourRend?.[sector.id] ?? 0,
      })),
      weaponSections: buildSectionedItems(
        WEAPON_SECTIONS, weaponComponents, sys.weaponSlots,
        item => {
          const pos = item.system?.weaponPosition ?? "prow";
          return pos === "flank" ? (item.system?.weaponBay ?? "port") : pos;
        },
      ).filter(s => s.items.length > 0 || s.slotCount > 0),
      weaponSectionsAll: buildSectionedItems(
        WEAPON_SECTIONS, weaponComponents, sys.weaponSlots,
        item => {
          const pos = item.system?.weaponPosition ?? "prow";
          return pos === "flank" ? (item.system?.weaponBay ?? "port") : pos;
        },
      ),
      equipmentSections: buildSectionedItems(EQUIPMENT_SECTIONS, equipmentComponents, sys.equipmentSlots)
        .filter(s => s.items.length > 0 || s.slotCount > 0),
      ordnanceActors: sys.ordnanceActors ?? { torpedo: [], strikeCraft: [] },
      components,
      weaponComponents,
      equipmentComponents,
      shipSlotSummary: (() => {
        const getWeaponPos = item => {
          const pos = item.system?.weaponPosition ?? "prow";
          return pos === "flank" ? (item.system?.weaponBay ?? "port") : pos;
        };
        const weaponGrid = weaponComponents.length > 0 ? [
          { pos: "prow",      label: game.i18n.localize("IMSC.Slot.Prow"),      items: weaponComponents.filter(c => getWeaponPos(c) === "prow"),      slotCount: Math.max(0, Number(sys.weaponSlots?.prow      ?? 0)) },
          { pos: "dorsal",    label: game.i18n.localize("IMSC.Slot.Dorsal"),    items: weaponComponents.filter(c => getWeaponPos(c) === "dorsal"),    slotCount: Math.max(0, Number(sys.weaponSlots?.dorsal    ?? 0)) },
          { pos: "port",      label: game.i18n.localize("IMSC.Slot.Port"),      items: weaponComponents.filter(c => getWeaponPos(c) === "port"),      slotCount: Math.max(0, Number(sys.weaponSlots?.port      ?? 0)) },
          { pos: "starboard", label: game.i18n.localize("IMSC.Slot.Starboard"), items: weaponComponents.filter(c => getWeaponPos(c) === "starboard"), slotCount: Math.max(0, Number(sys.weaponSlots?.starboard ?? 0)) },
        ] : null;
        const bayStats = ShipCombatState.getOrdnanceBayStats(this.actor);
        const armedTorpedoes = sys.resources?.ordnance?.armedTorpedoes ?? 0;
        const armedCraft     = sys.resources?.ordnance?.armedCraft     ?? 0;
        const ordnance = [
          { slotId: "torpedo",     label: game.i18n.localize("IMSC.Label.TorpedoActors"),     armed: armedTorpedoes, capacity: bayStats.torpedoCapacity,     items: (sys.ordnanceActors?.torpedo    ?? []).map(e => ({ id: e.id, name: e.name, img: e.img })) },
          { slotId: "strikeCraft", label: game.i18n.localize("IMSC.Label.StrikeCraftActors"), armed: armedCraft,     capacity: bayStats.strikeCraftCapacity, items: (sys.ordnanceActors?.strikeCraft ?? []).map(e => ({ id: e.id, name: e.name, img: e.img })) },
        ].filter(s => s.items.length > 0 || s.capacity > 0);
        const equipment = [
          { slotId: "shields",    label: game.i18n.localize("IMSC.Slot.Shields"),    items: components.filter(c => c.system.slot === "shields") },
          { slotId: "armour",     label: game.i18n.localize("IMSC.Slot.Armour"),     items: components.filter(c => c.system.slot === "armour") },
          { slotId: "engine",     label: game.i18n.localize("IMSC.Slot.Engine"),     items: components.filter(c => c.system.slot === "engine") },
          { slotId: "auspex",     label: game.i18n.localize("IMSC.Slot.Auspex"),     items: components.filter(c => c.system.slot === "auspex") },
          { slotId: "reactor",    label: game.i18n.localize("IMSC.Slot.Reactor"),    items: components.filter(c => c.system.slot === "reactor") },
          { slotId: "weaponsBay", label: game.i18n.localize("IMSC.Slot.WeaponsBay"), items: components.filter(c => c.system.slot === "weaponsBay") },
        ].filter(s => s.items.length > 0);
        return { weaponGrid, ordnance, equipment, hasAny: !!weaponGrid || ordnance.length > 0 || equipment.length > 0 };

      })(),
      helm: buildHelmContext(sys, {
        engineComponent: this.actor.items.find(i => i.type === `${MODULE_ID}.component` && i.system.slot === "engine"),
        reactorStats: ShipCombatState.getReactorStats(this.actor),
      }),
      engineerCtx: buildEngineerContext(sys, {
        reactorStats: ShipCombatState.getReactorStats(this.actor),
        shieldStats:  ShipCombatState.getShieldStats(this.actor),
      }),
      sensorsCtx: buildSensorsContext(sys, {
        auspexStats:  ShipCombatState.getAuspexStats(this.actor),
        reactorStats: ShipCombatState.getReactorStats(this.actor),
      }),
      gunnerCtx: buildGunnerContext(sys, {
        reactorStats:     ShipCombatState.getReactorStats(this.actor),
        ordnanceBayStats: ShipCombatState.getOrdnanceBayStats(this.actor),
      }),
      ordnanceCtx: buildOrdnanceContext(sys, {
        shipActor: this.actor,
        ordnanceBayStats: ShipCombatState.getOrdnanceBayStats(this.actor),
        reactorStats:     ShipCombatState.getReactorStats(this.actor),
      }),
      captainCtx: buildCaptainContext(sys, {
        reactorStats: ShipCombatState.getReactorStats(this.actor),
        shieldStats:  ShipCombatState.getShieldStats(this.actor),
      }),
      isEngineerOrGM: game.user.isGM || myRole === "enginseer",
      shipClassifications: SHIP_CLASSIFICATIONS,
      // GM-only: debug condition forcing
      debugLocations: game.user.isGM ? CRIT_LOCATIONS.map(loc => {
        const existing = sys.conditions?.[loc.id] ?? {};
        const tier = existing.tier ?? null;
        const condDef = tier ? CRIT_CONDITIONS[loc.id]?.[tier] : null;
        return {
          locId:           loc.id,
          locLabel:        game.i18n.localize(loc.label),
          currentTier:     tier,
          currentCondLabel: condDef ? game.i18n.localize(condDef.label) : "",
        };
      }) : [],
    });

    // Group ActiveEffects for the Effects tab
    const allEffects = Array.from(this.actor.effects ?? []);
    context.effects = {
      temporary: allEffects.filter(e => !e.disabled && e.isTemporary),
      passive:   allEffects.filter(e => !e.disabled && !e.isTemporary),
      disabled:  allEffects.filter(e => e.disabled),
    };

    // Enrich weapon sections with fire-mode data for the Ordnance Master tab
    const gunnerCtx = context.gunnerCtx;
    context.weaponSections = context.weaponSections.map(section => ({
      ...section,
      items: section.items.map(item => enrichWeaponForGunner(item, gunnerCtx)),
    }));

    return context;
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  static _onOpenItem(event, target) {
    const row = target.closest("[data-id]");
    const itemId = row?.dataset?.id;
    if (!itemId) return;
    const item = this.actor.items.get(itemId);
    item?.sheet?.render(true);
  }

  static async _onOpenOrdnanceActor(event, target) {
    const row = target.closest("[data-ordnance-id]");
    if (!row) return;
    const slotType = row.dataset.ordnanceSlot;
    const entryId  = row.dataset.ordnanceId;
    if (!slotType || !entryId) return;
    const entries = this.actor.system.ordnanceActors?.[slotType] ?? [];
    const entry = entries.find(e => e.id === entryId);
    if (!entry?.actorData) {
      // Legacy UUID reference  -  try to open externally
      const uuid = row.dataset.uuid;
      if (uuid) { const actor = await fromUuid(uuid); actor?.sheet?.render(true); }
      return;
    }

    // Create a real (world-level) actor for editing; delete on close
    const editData = foundry.utils.deepClone(entry.actorData);
    editData._id = undefined;
    editData.name = `[Edit] ${entry.name || editData.name || "Ordnance"}`;
    editData.flags = foundry.utils.mergeObject(editData.flags ?? {}, {
      [MODULE_ID]: { fromOrdnanceMaster: true, embeddedEdit: true },
    });
    const editActor = await Actor.create(editData);
    if (!editActor) return;

    const sheet = editActor.sheet;
    sheet.render(true);

    // When the sheet is closed, persist changes back and delete the temp actor
    const shipActor = this.actor;
    const origClose = sheet.close.bind(sheet);
    let _closing = false;
    sheet.close = async (options) => {
      if (_closing) return origClose(options);
      _closing = true;

      const updatedData = editActor.toObject();
      // Strip the editing prefix from the name
      if (updatedData.name?.startsWith("[Edit] ")) {
        updatedData.name = updatedData.name.slice(7);
      }
      delete updatedData._id;

      const currentEntries = shipActor.system.ordnanceActors?.[slotType] ?? [];
      const newEntries = currentEntries.map(e => {
        if (e.id === entryId) {
          return { ...e, actorData: updatedData, name: updatedData.name, img: updatedData.img };
        }
        return e;
      });
      await shipActor.update({ [`system.ordnanceActors.${slotType}`]: newEntries });

      // Delete the temporary world actor (guard against it already being deleted)
      if (game.actors.has(editActor.id)) {
        await editActor.delete();
      }
      return origClose(options);
    };
  }

  static async _onRemoveOrdnanceActor(event, target) {
    if (!this.actor?.isOwner) return;
    const row = target.closest("[data-ordnance-id]");
    const slotType = row?.dataset?.ordnanceSlot;
    const actorId  = row?.dataset?.ordnanceId;
    if (!slotType || !actorId) return;
    const existing = this.actor.system.ordnanceActors?.[slotType] ?? [];
    const filtered = existing.filter(e => e.id !== actorId);
    return this.actor.update({ [`system.ordnanceActors.${slotType}`]: filtered });
  }

  static async _onDebugSetCondition(event, target) {
    if (!game.user.isGM) return;
    const locId = target.dataset.locId;
    const tier  = target.dataset.tier;  // "" = clear
    if (!locId) return;
    if (!tier) {
      return this.actor.update({ [`system.conditions.${locId}`]: {} });
    }
    // Preserve any existing extra meta (jammedItemId, lockedRole etc.) and just set tier
    const existing = this.actor.system?.conditions?.[locId] ?? {};
    return this.actor.update({ [`system.conditions.${locId}`]: { ...existing, tier } });
  }

  // ── Post-render wiring ──────────────────────────────────────────────────

  _prepareSubmitData(event, form, formData) {
    const obj = formData.object;
    for (const key of [
      "system.hull.value", "system.hull.max",
      "system.movement.speed", "system.movement.maneuverability",
    ]) {
      if (key in obj) obj[key] = Math.round(Number(obj[key]) || 0);
    }
    return super._prepareSubmitData(event, form, formData);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    this.element.querySelectorAll("[data-sector-field]").forEach(input => {
      input.addEventListener("change", ev => {
        const { sectorField } = ev.target.dataset;
        const val = Math.max(0, Number(ev.target.value) || 0);
        this.actor.update({ [`system.${sectorField}`]: val });
      });
    });

    this.element.querySelectorAll("[data-slot-count]").forEach(input => {
      input.addEventListener("change", ev => {
        const path = ev.target.dataset.slotCount;
        const value = Math.max(0, Number(ev.target.value) || 0);
        this.actor.update({ [path]: value });
      });
    });

    // ── Shield arc: scroll / click / right-click to adjust ──────────────────
    this.element.querySelectorAll(".imsc-arc-val[data-sector]").forEach(el => {
      el.addEventListener("click", ev => {
        ev.preventDefault();
        adjustShieldSectorDelta(this, el.dataset.sector, 1);
      });
      el.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        adjustShieldSectorDelta(this, el.dataset.sector, -1);
      });
      el.addEventListener("wheel", ev => {
        ev.preventDefault();
        adjustShieldSectorDelta(this, el.dataset.sector, ev.deltaY < 0 ? 1 : -1);
      }, { passive: false });
    });

    // Delegate helm wiring to pilot role module
    helmOnRender(this);

    // ── Ordnance commitment pills: right-click to cancel new commitments ─────
    this.element.querySelectorAll(".imsc-commitment-pill--new[data-index]").forEach(pill => {
      pill.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        ORDNANCE_ACTIONS.cancelCommitment.call(this, ev, pill);
      });
    });

    // ── Captain hand cards: drag-and-drop reordering ─────────────────────────
    {
      let _dragCardId = null;
      this.element.querySelectorAll(".imsc-captain-card[data-card-id]").forEach(card => {
        card.addEventListener("dragstart", ev => {
          _dragCardId = card.dataset.cardId;
          ev.dataTransfer.effectAllowed = "move";
          ev.dataTransfer.setData("text/plain", _dragCardId);
          requestAnimationFrame(() => card.classList.add("imsc-captain-card--dragging"));
        });
        card.addEventListener("dragend", () => {
          card.classList.remove("imsc-captain-card--dragging");
          this.element.querySelectorAll(".imsc-captain-card--drag-over").forEach(el => el.classList.remove("imsc-captain-card--drag-over"));
          _dragCardId = null;
        });
        card.addEventListener("dragover", ev => {
          if (!_dragCardId || card.dataset.cardId === _dragCardId) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "move";
          this.element.querySelectorAll(".imsc-captain-card--drag-over").forEach(el => el.classList.remove("imsc-captain-card--drag-over"));
          card.classList.add("imsc-captain-card--drag-over");
        });
        card.addEventListener("dragleave", () => {
          card.classList.remove("imsc-captain-card--drag-over");
        });
        card.addEventListener("drop", ev => {
          ev.preventDefault();
          if (!_dragCardId || card.dataset.cardId === _dragCardId) return;
          const hand = [...(this.actor.system.resources?.captain?.hand ?? [])];
          const fromIdx = hand.indexOf(_dragCardId);
          const toIdx   = hand.indexOf(card.dataset.cardId);
          if (fromIdx === -1 || toIdx === -1) return;
          hand.splice(fromIdx, 1);
          hand.splice(toIdx, 0, _dragCardId);
          _dragCardId = null;
          card.classList.remove("imsc-captain-card--drag-over");
          emitToGM("updateResource", { roleId: "captain", key: "hand", value: hand });
        });
      });
    }

    // Paint the auspex radar canvas on the Sensors tab
    AuspexRadar.attach(this, context.sensorsCtx);

    // ── Radar zoom slider ────────────────────────────────────────────────────
    this.element.querySelectorAll(".imsc-radar-zoom").forEach(slider => {
      slider.addEventListener("input", ev => {
        const val = Math.max(5, Number(ev.target.value) || 5);
        AuspexRadar.radarScale = val;
        const label = ev.target.parentElement?.querySelector(".imsc-radar-zoom-label");
        if (label) label.textContent = String(val);
      });
    });

    // ── Radar scroll-wheel zoom ──────────────────────────────────────────────
    this.element.querySelectorAll("canvas[data-auspex-radar]").forEach(cvs => {
      cvs.addEventListener("wheel", ev => {
        ev.preventDefault();
        const maxR = context.sensorsCtx?.maxScanRange || 30;
        const step = ev.deltaY < 0 ? -1 : 1;
        const cur = AuspexRadar.radarScale || maxR;
        AuspexRadar.radarScale = Math.max(5, Math.min(cur + step, maxR));
        const slider = this.element.querySelector(".imsc-radar-zoom");
        if (slider) slider.value = AuspexRadar.radarScale;
        const label = this.element.querySelector(".imsc-radar-zoom-label");
        if (label) label.textContent = String(AuspexRadar.radarScale);
      }, { passive: false });
    });

    // ── Enginseer section overlay hover: highlight chosen, dim others ─────────
    const sections = [...this.element.querySelectorAll(".imsc-role-section")];
    sections.forEach(section => {
      const btn = section.querySelector(".imsc-section-overlay-btn");
      if (!btn) return;
      btn.addEventListener("mouseenter", () => {
        sections.forEach(s => {
          if (s === section) s.classList.add("imsc-overlay-hover-confirm");
          else if (s.querySelector(".imsc-section-overlay")) s.classList.add("imsc-overlay-hover-deny");
        });
      });
      btn.addEventListener("mouseleave", () => {
        sections.forEach(s => {
          s.classList.remove("imsc-overlay-hover-confirm", "imsc-overlay-hover-deny");
        });
      });
    });

    // ── Macro Cannon tier picker ──────────────────────────────────────────────
    this.element.querySelectorAll(".imsc-macro-tier-picker").forEach(picker => {
      const card        = picker.closest(".imsc-battery-card");
      const fireBtn     = card?.querySelector(".imsc-fire--macro");
      const ammoVal     = card?.querySelector("[data-macro-stat-display='ammo'] .imsc-battery-stat-value");
      const hitVal      = card?.querySelector("[data-macro-stat-display='hit'] .imsc-battery-stat-value");
      const salvoVal    = card?.querySelector("[data-macro-stat-display='salvo'] .imsc-battery-stat-value");
      const fireLabel   = fireBtn?.querySelector(".imsc-macro-fire-label");
      const pips        = [...picker.querySelectorAll(".imsc-macro-tier-pip")];

      function selectTier(pip) {
        pips.forEach(p => p.classList.remove("imsc-macro-pip-selected"));
        pip.classList.add("imsc-macro-pip-selected");
        const hit = parseInt(pip.dataset.tierHit) || 0;
        const hitStr = hit > 0 ? `+${hit}` : hit < 0 ? String(hit) : " - ";
        if (ammoVal)  ammoVal.textContent  = pip.dataset.tierAmmo;
        if (hitVal)   hitVal.textContent   = hitStr;
        if (salvoVal) salvoVal.textContent = pip.dataset.tierSalvo;
        if (fireBtn) {
          fireBtn.dataset.fireMode = pip.dataset.tierId;
          fireBtn.disabled = pip.dataset.canAfford !== "true";
          if (fireLabel) fireLabel.textContent = pip.querySelector(".imsc-macro-pip-label")?.textContent?.trim() ?? "";
        }
      }

      pips.forEach(pip => {
        pip.addEventListener("click", () => {
          if (pip.dataset.canAfford !== "true") return;
          selectTier(pip);
        });
      });

      // Auto-select first affordable tier on render
      const firstAffordable = pips.find(p => p.dataset.canAfford === "true");
      if (firstAffordable) selectTier(firstAffordable);
    });

    // ── Gunner weapon-row hover: show firing-arc cone on canvas ──────────────
    this.element.querySelectorAll("[data-weapon-arc]").forEach(row => {
      row.addEventListener("mouseenter", () => {
        WeaponArcOverlay.showHover(row.dataset.weaponArc);
      });
      row.addEventListener("mouseleave", () => {
        WeaponArcOverlay.hideHover();
      });
    });

    // ── Gunner pin toggle: click thumbtack to lock/unlock an arc ──────────
    this.element.querySelectorAll("[data-pin-weapon]").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const itemId = btn.dataset.pinWeapon;
        const pinned = WeaponArcOverlay.togglePin(itemId);
        btn.classList.toggle("imsc-pin-active", pinned);
      });
      // Restore active state from overlay memory after re-render
      if (WeaponArcOverlay.isPinned(btn.dataset.pinWeapon)) {
        btn.classList.add("imsc-pin-active");
      }
    });

    // ── Ordnance Master recallCraft hover: show 3VU recovery range circle ─────────
    this.element.querySelectorAll("[data-action-id='recallCraft']").forEach(btn => {
      btn.addEventListener("mouseenter", () => {
        const shipToken = this.actor.getActiveTokens()?.[0];
        if (!shipToken || !canvas.stage) return;
        const gs = canvas.grid.size;
        const cx = shipToken.center?.x ?? (shipToken.x + gs / 2);
        const cy = shipToken.center?.y ?? (shipToken.y + gs / 2);
        const radius = 3 * gs;
        if (this._recallRangeGfx) this._recallRangeGfx.destroy();
        const g = new PIXI.Graphics();
        g.beginFill(0x00ff88, 0.04);
        g.lineStyle(2, 0x00ff88, 0.5);
        g.drawCircle(cx, cy, radius);
        g.endFill();
        canvas.stage.addChild(g);
        this._recallRangeGfx = g;
      });
      btn.addEventListener("mouseleave", () => {
        if (this._recallRangeGfx) {
          this._recallRangeGfx.destroy();
          this._recallRangeGfx = null;
        }
      });
    });

    // ── Captain pile widget popups (position:fixed to escape overflow clipping) ──
    this.element.querySelectorAll(".imsc-pile-widget").forEach(widget => {
      const trigger = widget.querySelector(".imsc-pile-trigger");
      const popup   = widget.querySelector(".imsc-pile-popup");
      if (!trigger || !popup) return;
      const isRight = widget.classList.contains("imsc-pile-widget--right");

      const show = () => {
        const r = trigger.getBoundingClientRect();
        popup.style.display = "block";
        // Place popup above the trigger (fixed coords)
        popup.style.bottom = `${window.innerHeight - r.top + 6}px`;
        popup.style.top = "";
        if (isRight) {
          popup.style.left  = "";
          popup.style.right = `${window.innerWidth - r.right}px`;
        } else {
          popup.style.right = "";
          popup.style.left  = `${r.left}px`;
        }
      };
      const hide = ev => {
        if (ev.relatedTarget && popup.contains(ev.relatedTarget)) return;
        popup.style.display = "none";
      };

      trigger.addEventListener("mouseenter", show);
      trigger.addEventListener("mouseleave", hide);
      popup.addEventListener("mouseleave", () => { popup.style.display = "none"; });
    });

    // Sync tab-active state so pinned arcs redraw on re-render.
    // Also keep arcs visible on the Helmsman tab when the Gunner has broadcast them.
    const arcBroadcast = !!(this.actor.system.resources?.gunner?.arcOverlayActive);
    if (this.tabGroups?.primary === "gunner" || arcBroadcast) {
      WeaponArcOverlay.activate(this.actor);
    } else {
      WeaponArcOverlay.deactivate();
    }
  }

  /**
   * Compute the ghost token position from current helm state and update preview.
   * Delegates to pilot role module.
   * Only renders when the pilot tab is active; hides otherwise.
   */
  _updateHelmPreview() {
    if (this.tabGroups?.primary !== "pilot") {
      HelmPreview.hide();
      return;
    }
    const myRole = this._resolveRoleForUser(game.user);
    if (myRole !== "pilot" && !game.user.isGM) return;
    helmUpdatePreview(this);
  }

  /** Hide or restore the helm preview whenever the active tab changes.
   * Override changeTab (not _onChangeTab)  -  ApplicationV2 uses changeTab directly.
   */
  changeTab(tab, group, options = {}) {
    super.changeTab(tab, group, options);
    if (group === "primary") {
      if (tab !== "pilot") HelmPreview.hide();
      else this._updateHelmPreview();

      const arcBroadcast = !!(this.actor.system.resources?.gunner?.arcOverlayActive);
      if (tab === "gunner" || arcBroadcast) WeaponArcOverlay.activate(this.actor);
      else WeaponArcOverlay.deactivate();
    }
  }

  // ── Drop handling ───────────────────────────────────────────────────────

  async _onDropActor(data, event) {
    // ── Ordnance actor drop (torpedo / strikeCraft) ──
    const ordnanceDrop = event.target.closest?.("[data-ordnance-drop]");
    if (ordnanceDrop) {
      const slotType = ordnanceDrop.dataset.ordnanceDrop; // "torpedo" or "strikeCraft"
      const actor = await Actor.fromDropData(data);
      if (!actor) return;
      const expectedType = slotType === "strikeCraft"
        ? `${MODULE_ID}.strikeCraft`
        : `${MODULE_ID}.torpedo`;
      if (actor.type !== expectedType) {
        return ui.notifications.warn(game.i18n.localize("IMSC.Warning.WrongOrdnanceType"));
      }
      // Store full actor data inline so no external actor is required
      const existing = this.actor.system.ordnanceActors?.[slotType] ?? [];
      const actorData = actor.toObject();
      delete actorData._id;
      const embeddedId = foundry.utils.randomID();
      const ref = { id: embeddedId, uuid: actor.uuid ?? null, name: actor.name, img: actor.img, actorData };
      return this.actor.update({ [`system.ordnanceActors.${slotType}`]: [...existing, ref] });
    }

    // ── Role actor drop ──
    const roleDrop = event.target.closest?.("[data-role-drop]");
    if (!roleDrop) return super._onDropActor?.(data, event);

    const roleId = roleDrop.dataset.roleDrop;
    if (!roleId) return;

    const actor = await Actor.fromDropData(data);
    if (!actor) return;

    const userByCharacter = game.users.find(u => !u.isGM && u.character?.id === actor.id);
    const ownerIds = Object.entries(actor.ownership ?? {})
      .filter(([uid, level]) => uid !== "default" && Number(level) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
      .map(([uid]) => uid);
    const userByOwner = game.users.find(u => !u.isGM && ownerIds.includes(u.id));
    const targetUser = userByCharacter ?? userByOwner;

    if (!targetUser) {
      return ui.notifications.warn(game.i18n.localize("IMSC.Warning.NoAssignableUser"));
    }

    emitToGM("assignRole", {
      userId: targetUser.id,
      roleId,
      actorRef: {
        id: actor.id,
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img,
      },
    });
  }

  async _onDropItem(data, event) {
    const dropZone = event.target.closest?.("[data-component-slot]");
    const item = await Item.fromDropData(data);
    if (!item) return;

    // Only voidship components may be dropped on the ship
    if (item.type !== `${MODULE_ID}.component`) {
      return ui.notifications.warn(game.i18n.localize("IMSC.Warning.OnlyComponents"));
    }

    const targetSlot     = dropZone?.dataset.componentSlot;
    const targetPosition = dropZone?.dataset.componentPosition;

    // If this exact item already lives on the ship, just re-slot it
    const sameItem = this.actor.items.get(item.id);
    if (sameItem) {
      if (targetSlot) {
        const update = { "system.slot": targetSlot };
        if (targetSlot === "weapon" && targetPosition) {
          if (targetPosition === "port" || targetPosition === "starboard") {
            update["system.weaponPosition"] = "flank";
            update["system.weaponBay"] = targetPosition;
          } else {
            update["system.weaponPosition"] = targetPosition;
          }
        }
        await sameItem.update(update);
      }
      return;
    }

    // Clone and embed
    const createData = item.toObject();
    delete createData._id;
    if (targetSlot) {
      createData.system.slot = targetSlot;
      if (targetSlot === "weapon" && targetPosition) {
        if (targetPosition === "port" || targetPosition === "starboard") {
          createData.system.weaponPosition = "flank";
          createData.system.weaponBay = targetPosition;
        } else {
          createData.system.weaponPosition = targetPosition;
        }
      }
    }
    await this.actor.createEmbeddedDocuments("Item", [createData]);
  }
}
