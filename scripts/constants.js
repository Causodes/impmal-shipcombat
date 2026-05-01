import { THEME, hex } from "./theme.js";

export const MODULE_ID = "impmal-shipcombat";

// ─── Bridge Roles ────────────────────────────────────────────────────────────

export const ROLES = {
  captain: {
    id: "captain",
    label: "IMSC.Role.Captain",
    icon: "fa-solid fa-chess-queen",
    color: hex(THEME.roles.captain),
  },
  enginseer: {
    id: "enginseer",
    label: "IMSC.Role.Enginseer",
    icon: "fa-solid fa-gears",
    color: hex(THEME.roles.enginseer),
  },
  pilot: {
    id: "pilot",
    label: "IMSC.Role.Pilot",
    icon: "fa-solid fa-compass",
    color: hex(THEME.roles.pilot),
  },
  sensors: {
    id: "sensors",
    label: "IMSC.Role.Sensors",
    icon: "fa-solid fa-satellite-dish",
    color: hex(THEME.roles.sensors),
  },
  gunner: {
    id: "gunner",
    label: "IMSC.Role.Gunner",
    icon: "fa-solid fa-crosshairs",
    color: hex(THEME.roles.gunner),
  },
  ordnance: {
    id: "ordnance",
    label: "IMSC.Role.Ordnance",
    icon: "fa-solid fa-rocket",
    color: hex(THEME.roles.ordnance),
  },
};

// ─── Actions (Standard & Overcharged per role) ───────────────────────────────

export const ROLE_ACTIONS = {
  captain: {
    standard:    { label: "IMSC.Action.CaptainStandard",       desc: "IMSC.Action.CaptainStandardDesc" },
    overcharged: { label: "IMSC.Action.CaptainOvercharged",    desc: "IMSC.Action.CaptainOverchargedDesc" },
  },
  enginseer: {
    standard:    { label: "IMSC.Action.EnginseerStandard",     desc: "IMSC.Action.EnginseerStandardDesc" },
    overcharged: { label: "IMSC.Action.EnginseerOvercharged",  desc: "IMSC.Action.EnginseerOverchargedDesc" },
  },
  pilot: {
    standard:    { label: "IMSC.Action.PilotStandard",         desc: "IMSC.Action.PilotStandardDesc" },
    overcharged: { label: "IMSC.Action.PilotOvercharged",      desc: "IMSC.Action.PilotOverchargedDesc" },
  },
  sensors: {
    standard:    { label: "IMSC.Action.SensorsStandard",       desc: "IMSC.Action.SensorsStandardDesc" },
    overcharged: { label: "IMSC.Action.SensorsOvercharged",    desc: "IMSC.Action.SensorsOverchargedDesc" },
  },
  gunner: {
    standard:    { label: "IMSC.Action.GunnerStandard",        desc: "IMSC.Action.GunnerStandardDesc" },
    overcharged: { label: "IMSC.Action.GunnerOvercharged",     desc: "IMSC.Action.GunnerOverchargedDesc" },
  },
  ordnance: {
    standard:    { label: "IMSC.Action.OrdnanceStandard",      desc: "IMSC.Action.OrdnanceStandardDesc" },
    overcharged: { label: "IMSC.Action.OrdnanceOvercharged",   desc: "IMSC.Action.OrdnanceOverchargedDesc" },
  },
};

// ─── Macro Cannon Fire Tiers ──────────────────────────────────────────────────
// salvoMult × weapon.salvoSize = base shots for this tier.
// Firepower bonus (from SL allocation) adds +1 shot per FP.

export const MACRO_FIRE_TIERS = [
  { id: "rangingFire",           label: "IMSC.Gunner.RangingFire",           desc: "IMSC.Gunner.RangingFireDesc",  ammo: 1,  hitMod: -10, salvoMult: 0.5, exclusive: true  },
  { id: "volley",                label: "IMSC.Gunner.Volley",                ammo: 3,  hitMod:   0, salvoMult: 1,   exclusive: false },
  { id: "broadside",             label: "IMSC.Gunner.Broadside",             ammo: 6,  hitMod:   0, salvoMult: 1.5, exclusive: false },
  { id: "fullBroadside",         label: "IMSC.Gunner.FullBroadside",         ammo: 10, hitMod: +10, salvoMult: 2,   exclusive: false },
  { id: "devastatingBroadside",  label: "IMSC.Gunner.DevastatingBroadside",  ammo: 16, hitMod: +20, salvoMult: 3,   exclusive: false },
];

// ─── Lance Damage Tiers ──────────────────────────────────────────────────────
// Lance Battery charge range: 0–20. Does NOT charge passively; only via
// power core (+5) or Augur divert (1:1 Data→Charge).

export const LANCE_CHARGE_TIERS = [
  { min: 1,  max: 5,  label: "IMSC.Gunner.LanceGlancing",       multiplier: 0.5 },
  { min: 6,  max: 10, label: "IMSC.Gunner.LanceStandard",       multiplier: 1   },
  { min: 11, max: 15, label: "IMSC.Gunner.LanceFocused",        multiplier: 1.5 },
  { min: 16, max: 20, label: "IMSC.Gunner.LanceFullDischarge",  multiplier: 2   },
];

// Default charge tier template (labels + multipliers only).
// Boundaries are computed dynamically based on weapon chargeStep.
const CHARGE_TIER_TEMPLATE = [
  { label: "IMSC.Gunner.LanceGlancing",      multiplier: 0.5 },
  { label: "IMSC.Gunner.LanceStandard",       multiplier: 1   },
  { label: "IMSC.Gunner.LanceFocused",        multiplier: 1.5 },
  { label: "IMSC.Gunner.LanceFullDischarge",  multiplier: 2   },
];

/**
 * Build dynamic charge tiers for a given chargeStep.
 * @param {number} step  -  the weapon's chargeStep (default 5)
 * @returns {{ min: number, max: number, label: string, multiplier: number }[]}
 */
export function buildChargeTiers(step = 5) {
  return CHARGE_TIER_TEMPLATE.map((t, i) => ({
    ...t,
    min: i * step + 1,
    max: (i + 1) * step,
  }));
}

// ─── Lock Tier Decay Rounds ───────────────────────────────────────────────────
// When a lock tier's decay counter reaches 0, the tier drops by 1 and the
// counter resets to the new tier's value.  Tier 0 means the lock is removed.

export const LOCK_DECAY_ROUNDS = {
  4: 1,   // Targeting Solution  -  decays after 1 round
  3: 2,   // Deep Scan          -  decays after 2 rounds
  2: 3,   // Breach Analysis    -  decays after 3 rounds
  1: 5,   // Active Ping        -  decays after 5 rounds
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const SHIP_CLASSIFICATIONS = [
  { value: "",              label: "" },
  { value: "fighter",       label: "Fighter" },
  { value: "picket",        label: "Picket Ship" },
  { value: "cutter",        label: "Cutter" },
  { value: "sloop",         label: "Sloop" },
  { value: "destroyer",     label: "Destroyer" },
  { value: "frigate",       label: "Frigate" },
  { value: "lightCruiser",  label: "Light Cruiser" },
  { value: "cruiser",       label: "Cruiser" },
  { value: "battlecruiser", label: "Battlecruiser" },
  { value: "grandCruiser",  label: "Grand Cruiser" },
  { value: "battleship",    label: "Battleship" },
  { value: "capitalShip",   label: "Capital Ship" },
  { value: "planetKiller",  label: "Planet Killer" },
  { value: "other",         label: "Other" },
];

export const DEFAULT_COMBAT_STATE = {
  active: false,
  round: 0,
  assignedCores: {},
  reactions: {},
  roles: {},
  resources: {
    enginseer: { heat: 0, powerCores: 0, auxiliaryPower: 0, actionChoices: [], extraActions: 0, stagedCores: {}, stagedShieldCores: 0, stagedAuxCores: 0, committedAuxCores: 0, heatCoresStaged: 1, fireCoresStaged: 1, payload: "" },
    pilot:     { fuelBurned: 0, bearing: 0, payload: "", coreCount: 0, coreActionsPlayed: [] },
    sensors:   { actionUsed: false, coreActionUsed: false, bdaAvailable: false, bdaCorrectionPending: false, bdaResultSL: 0, bdaTargetTokenId: null, bdaMessageId: null, locks: [], effects: [], fireCorrection: null, payload: "", coreCount: 0, coreActionsPlayed: [] },
    gunner:    { ammo: 0, power: 0, ordnanceSL: 0, allocAccuracy: 0, allocPenetration: 0, allocFirepower: 0, slLocked: false, ordnanceRolled: false, arcOverlayActive: false, payload: "", coreCount: 0, coreActionsPlayed: [] },
    ordnance:  { manpower: 0, manpowerMax: 0, armedTorpedoes: 0, armedCraft: 0, craftDestroyed: 0, craftRecovering: 0, craftPartialRecovery: 0, bosunSL: 0, bosunRolled: false, allocEfficiency: 0, allocExpedience: 0, actionUsed: false, coreActionUsed: false, commitments: [], stagedPayloads: {}, availablePayloads: 0, coreCount: 0, coreActionsPlayed: [] },
    captain:   { stance: "none", pendingStance: "", hand: [], drawPile: [], discardPile: [], triageCount: 2, triageConditionsUsed: [], handCapBonus: 0, playedCards: [], holdTheLineActive: false, payload: "", coreCount: 0, allocInitiative: 0, rolledInitiative: 0 },
  },
  turnDone: {},
  overchargeUsed: {},
};

// ─── Augur Lock Costs (AP-based) ─────────────────────────────────────────────

export const AUGUR_LOCK_COSTS = {
  activePing:        2,   // Lock Tier 1
  breachAnalysis:    4,   // Lock Tier 2
  deepScan:          7,   // Lock Tier 3
  targetingSolution: 10,  // Lock Tier 4
};

// ─── Augur Core Actions (require Power Core + AP) ────────────────────────────

export const AUGUR_CORE_ACTIONS = [
  { id: "signalInversion",  label: "IMSC.Sensors.SignalInversion",  desc: "IMSC.Sensors.SignalInversionDesc",  ap: 25, icon: "fa-solid fa-shuffle", targeted: true, duration: 1 },
  { id: "combatTelemetry",  label: "IMSC.Sensors.CombatTelemetry",  desc: "IMSC.Sensors.CombatTelemetryDesc",  ap: 30, icon: "fa-solid fa-bullseye" },
];

// ─── BDA Fire Corrections ────────────────────────────────────────────────────

export const BDA_CORRECTIONS = [
  { id: "adjustBearing",    label: "IMSC.BDA.AdjustBearing",    desc: "IMSC.BDA.AdjustBearingDesc",    icon: "fa-solid fa-crosshairs" },
  { id: "targetWeakPoint",  label: "IMSC.BDA.TargetWeakPoint",  desc: "IMSC.BDA.TargetWeakPointDesc",  icon: "fa-solid fa-shield-halved" },
  { id: "fireForEffect",    label: "IMSC.BDA.FireForEffect",    desc: "IMSC.BDA.FireForEffectDesc",    icon: "fa-solid fa-fire" },
  { id: "ceaseFireSwitch",  label: "IMSC.BDA.CeaseFireSwitch",  desc: "IMSC.BDA.CeaseFireSwitchDesc",  icon: "fa-solid fa-rotate" },
];

// ─── Ordnance Master / Manpower Actions ──────────────────────────────────────
// crew = base number of crew committed (can be reduced to min 2 via Efficiency SL)
// duration = base turns until crew return (can be reduced to min 1 via Expedience SL)

export const ORDNANCE_MASTER_ACTIONS = {
  // Row 1: Torpedo operations
  armTorpedo:     { id: "armTorpedo",     label: "IMSC.Ordnance.ArmTorpedo",     desc: "IMSC.Ordnance.ArmTorpedoDesc",     crew: 8, duration: 3, icon: "fa-solid fa-bomb",              completionBenefit: true },
  launchTorpedo:  { id: "launchTorpedo",  label: "IMSC.Ordnance.LaunchTorpedo",  desc: "IMSC.Ordnance.LaunchTorpedoDesc",  crew: 4, duration: 2, icon: "fa-solid fa-rocket",            noCancel: true },
  // Row 2: Strike Craft operations (prep → launch → recovery)
  armCraft:       { id: "armCraft",       label: "IMSC.Ordnance.ArmCraft",       desc: "IMSC.Ordnance.ArmCraftDesc",       crew: 9, duration: 3, icon: "fa-solid fa-jet-fighter-up",    completionBenefit: true },
  launchCraft:    { id: "launchCraft",    label: "IMSC.Ordnance.LaunchCraft",    desc: "IMSC.Ordnance.LaunchCraftDesc",    crew: 9, duration: 3, icon: "fa-solid fa-jet-fighter",        noCancel: true },
  recallCraft:    { id: "recallCraft",    label: "IMSC.Ordnance.RecallCraft",    desc: "IMSC.Ordnance.RecallCraftDesc",    crew: 6, duration: 3, icon: "fa-solid fa-plane-arrival",      noCancel: true },
  // Row 3: Support operations
  loadAmmo:       { id: "loadAmmo",       label: "IMSC.Ordnance.LoadAmmo",       desc: "IMSC.Ordnance.LoadAmmoDesc",       crew: 6, duration: 2, icon: "fa-solid fa-boxes-stacked",     completionBenefit: true },
  loadPayload:    { id: "loadPayload",    label: "IMSC.Ordnance.LoadPayload",    desc: "IMSC.Ordnance.LoadPayloadDesc",    crew: 6, duration: 2, icon: "fa-solid fa-box",               completionBenefit: true },
  generatePower:  { id: "generatePower",  label: "IMSC.Ordnance.GeneratePower",  desc: "IMSC.Ordnance.GeneratePowerDesc",  crew: 6, duration: 2, icon: "fa-solid fa-bolt",              completionBenefit: true },
  damageControl:  { id: "damageControl",  label: "IMSC.Ordnance.DamageControl",  desc: "IMSC.Ordnance.DamageControlDesc",  crew: 5, duration: 3, icon: "fa-solid fa-fire-extinguisher", completionBenefit: true },
  hullRepairParty:{ id: "hullRepairParty",label: "IMSC.Ordnance.HullRepairParty",desc: "IMSC.Ordnance.HullRepairPartyDesc",crew: 7, duration: 4, icon: "fa-solid fa-wrench",            completionBenefit: true },
};

// ─── Ordnance Master Logistics Doctrines (Core Actions) ────────────────────────────
// High-impact doctrines that reshape turn economy. One per round.

export const ORDNANCE_MASTER_CORE_ACTIONS = [
  {
    id: "combatRecoveryDoctrine",
    label: "IMSC.Ordnance.CombatRecoveryDoctrine",
    desc: "IMSC.Ordnance.CombatRecoveryDoctrineDesc",
    icon: "fa-solid fa-helicopter",
    effect: "Convert half destroyed craft to recovering, OR 1 recovering to armed",
    tradeoff: "Cannot launch strike craft this round",
  },
  {
    id: "shockLoadingRotation",
    label: "IMSC.Ordnance.ShockLoadingRotation",
    desc: "IMSC.Ordnance.ShockLoadingRotationDesc",
    icon: "fa-solid fa-forward",
    effect: "Instantly complete one active commitment (armTorpedo/armCraft/loadPayload)",
    tradeoff: "Commit 3 manpower for 2 rounds as fatigued crew",
  },
  {
    id: "magazineCrossfeed",
    label: "IMSC.Ordnance.MagazineCrossfeed",
    desc: "IMSC.Ordnance.MagazineCrossfeedDesc",
    icon: "fa-solid fa-arrows-split-up-and-left",
    effect: "Convert gunner ammo to ordnance: spend 6 ammo for +1 torpedo or 4 ammo for +1 payload",
    tradeoff: "Gunner cannot receive ammo reloads until next round",
  },
  {
    id: "deckConsciption",
    label: "IMSC.Ordnance.DeckConsciption",
    desc: "IMSC.Ordnance.DeckConscriptionDesc",
    icon: "fa-solid fa-people-group",
    effect: "Gain +25% of max temporary manpower this round, OR restore 10% of permanently lost crew",
    tradeoff: "Next round manpower regeneration reduced by 4",
  },
];

// ─── Ordnance Master: Payload Types ──────────────────────────────────────────
// Two payloads per receiving role. Cost is in OP. Effects keyed by role.

export const PAYLOAD_TYPES = {
  // ── Captain payloads ──
  cogitatorDataSlate: {
    id: "cogitatorDataSlate",
    label: "IMSC.Payload.CogitatorDataSlate",
    desc:  "IMSC.Payload.CogitatorDataSlateDesc",
    targetRole: "captain",
    cost: 4,
    icon: "fa-solid fa-tablet-screen-button",
  },
  fireSuppression: {
    id: "fireSuppression",
    label: "IMSC.Payload.FireSuppression",
    desc:  "IMSC.Payload.FireSuppressionDesc",
    targetRole: "captain",
    cost: 3,
    icon: "fa-solid fa-fire-extinguisher",
  },
  // ── Enginseer payloads ──
  emergencyCoolant: {
    id: "emergencyCoolant",
    label: "IMSC.Payload.EmergencyCoolant",
    desc:  "IMSC.Payload.EmergencyCoolantDesc",
    targetRole: "enginseer",
    cost: 5,
    icon: "fa-solid fa-snowflake",
  },
  auxCapacitors: {
    id: "auxCapacitors",
    label: "IMSC.Payload.AuxCapacitors",
    desc:  "IMSC.Payload.AuxCapacitorsDesc",
    targetRole: "enginseer",
    cost: 4,
    icon: "fa-solid fa-car-battery",
  },
  // ── Helmsman payloads ──
  fuelCatalyst: {
    id: "fuelCatalyst",
    label: "IMSC.Payload.FuelCatalyst",
    desc:  "IMSC.Payload.FuelCatalystDesc",
    targetRole: "pilot",
    cost: 4,
    icon: "fa-solid fa-gas-pump",
  },
  chaffPods: {
    id: "chaffPods",
    label: "IMSC.Payload.ChaffPods",
    desc:  "IMSC.Payload.ChaffPodsDesc",
    targetRole: "pilot",
    cost: 5,
    icon: "fa-solid fa-arrows-up-down-left-right",
  },
  // ── Augur payloads ──
  sensorBuoy: {
    id: "sensorBuoy",
    label: "IMSC.Payload.SensorBuoy",
    desc:  "IMSC.Payload.SensorBuoyDesc",
    targetRole: "sensors",
    cost: 4,
    icon: "fa-solid fa-tower-broadcast",
  },
  lockStabilizer: {
    id: "lockStabilizer",
    label: "IMSC.Payload.LockStabilizer",
    desc:  "IMSC.Payload.LockStabilizerDesc",
    targetRole: "sensors",
    cost: 5,
    icon: "fa-solid fa-sliders",
  },
  // ── Gunner payloads ──
  apShells: {
    id: "apShells",
    label: "IMSC.Payload.APShells",
    desc:  "IMSC.Payload.APShellsDesc",
    targetRole: "gunner",
    cost: 5,
    icon: "fa-solid fa-circle-radiation",
  },
  scatterShot: {
    id: "scatterShot",
    label: "IMSC.Payload.ScatterShot",
    desc:  "IMSC.Payload.ScatterShotDesc",
    targetRole: "gunner",
    cost: 4,
    icon: "fa-solid fa-burst",
  },
};

// Group payloads by receiving role for dropdown menus
export const PAYLOADS_BY_ROLE = Object.values(PAYLOAD_TYPES).reduce((acc, p) => {
  (acc[p.targetRole] ??= []).push(p);
  return acc;
}, {});

// ─── Crit System ─────────────────────────────────────────────────────────────
// Location: roll d6. Severity: roll d10 (1–5 Low, 6–8 Medium, 9–10 High).

export const CRIT_LOCATIONS = [
  { id: "hull",           rolls: [1, 2], label: "IMSC.Crit.Location.hull",           triageAction: "IMSC.Crit.Triage.hull" },
  { id: "engines",        rolls: [3],    label: "IMSC.Crit.Location.engines",        triageAction: "IMSC.Crit.Triage.engines" },
  { id: "manoeuvring",    rolls: [4],    label: "IMSC.Crit.Location.manoeuvring",    triageAction: "IMSC.Crit.Triage.manoeuvring" },
  { id: "coreSystems",    rolls: [5],    label: "IMSC.Crit.Location.coreSystems",    triageAction: "IMSC.Crit.Triage.coreSystems" },
  { id: "weaponsSensors", rolls: [6],    label: "IMSC.Crit.Location.weaponsSensors", triageAction: "IMSC.Crit.Triage.weaponsSensors" },
];

export const CRIT_SEVERITY_TIERS = [
  { tier: "low",    min: 1,  max: 5  },
  { tier: "medium", min: 6,  max: 8  },
  { tier: "high",   min: 9,  max: 10 },
];

export const CRIT_CONDITIONS = {
  hull: {
    low:    { id: "minorLeak",          label: "IMSC.Crit.Condition.hull.low",             cumulative: false },
    medium: { id: "structuralDamage",   label: "IMSC.Crit.Condition.hull.medium",          cumulative: false },
    high:   { id: "blazingInferno",     label: "IMSC.Crit.Condition.hull.high",            cumulative: false },
  },
  engines: {
    low:    { id: "engineStrain",       label: "IMSC.Crit.Condition.engines.low",          cumulative: false },
    medium: { id: "thrustDamage",       label: "IMSC.Crit.Condition.engines.medium",       cumulative: false },
    high:   { id: "engineFailure",      label: "IMSC.Crit.Condition.engines.high",         cumulative: false },
  },
  manoeuvring: {
    low:    { id: "helmSluggish",       label: "IMSC.Crit.Condition.manoeuvring.low",      cumulative: false },
    medium: { id: "manoFailure",        label: "IMSC.Crit.Condition.manoeuvring.medium",   cumulative: false },
    high:   { id: "helmUnresponsive",   label: "IMSC.Crit.Condition.manoeuvring.high",     cumulative: false },
  },
  coreSystems: {
    low:    { id: "powerFluctuation",   label: "IMSC.Crit.Condition.coreSystems.low",      cumulative: true },
    medium: { id: "heatSurge",          label: "IMSC.Crit.Condition.coreSystems.medium",   cumulative: true },
    high:   { id: "apShutdown",         label: "IMSC.Crit.Condition.coreSystems.high",     cumulative: true },
  },
  weaponsSensors: {
    low:    { id: "weaponJam",          label: "IMSC.Crit.Condition.weaponsSensors.low",    cumulative: true },
    medium: { id: "sensorBlind",        label: "IMSC.Crit.Condition.weaponsSensors.medium", cumulative: true },
    high:   { id: "fireControlFailure", label: "IMSC.Crit.Condition.weaponsSensors.high",   cumulative: true },
  },
};

/** Map a d6 roll to a CRIT_LOCATIONS entry. */
export function critLocationFromRoll(d6) {
  return CRIT_LOCATIONS.find(l => l.rolls.includes(d6)) ?? CRIT_LOCATIONS[0];
}

/** Map a d10 roll to a severity tier string. */
export function critSeverityFromRoll(d10) {
  return CRIT_SEVERITY_TIERS.find(t => d10 >= t.min && d10 <= t.max)?.tier ?? "low";
}

// ─── Gunner: Core Actions ─────────────────────────────────────────────────────

export const GUNNER_CORE_ACTIONS = [
  {
    id:   "extendRange",
    label: "IMSC.Gunner.Core.ExtendRange.label",
    desc:  "IMSC.Gunner.Core.ExtendRange.desc",
    icon:  "fa-solid fa-satellite-dish",
  },
  {
    id:   "chooseCritLoc",
    label: "IMSC.Gunner.Core.ChooseCritLoc.label",
    desc:  "IMSC.Gunner.Core.ChooseCritLoc.desc",
    icon:  "fa-solid fa-bullseye",
  },
  {
    id:   "emergencyResupply",
    label: "IMSC.Gunner.Core.EmergencyResupply.label",
    desc:  "IMSC.Gunner.Core.EmergencyResupply.desc",
    icon:  "fa-solid fa-boxes-stacked",
  },
];

// ─── Captain: Stances ─────────────────────────────────────────────────────────
// ─── Captain: Core Actions ───────────────────────────────────────────────────
// Consumes the assigned Power Core. One per engagement. No manpower cost.

export const CAPTAIN_CORE_ACTIONS = [
  {
    id:   "emergencyProtocols",
    label: "IMSC.Captain.Core.EmergencyProtocols.label",
    desc:  "IMSC.Captain.Core.EmergencyProtocols.desc",
    icon:  "fa-solid fa-broom",
  },
  {
    id:   "ironCommand",
    label: "IMSC.Captain.Core.IronCommand.label",
    desc:  "IMSC.Captain.Core.IronCommand.desc",
    icon:  "fa-solid fa-shield-halved",
  },
  {
    id:   "battleClarity",
    label: "IMSC.Captain.Core.BattleClarity.label",
    desc:  "IMSC.Captain.Core.BattleClarity.desc",
    icon:  "fa-solid fa-crosshairs",
  },
  {
    id:   "emergencySalvage",
    label: "IMSC.Captain.Core.EmergencySalvage.label",
    desc:  "IMSC.Captain.Core.EmergencySalvage.desc",
    icon:  "fa-solid fa-recycle",
  },
  {
    id:   "commandOverride",
    label: "IMSC.Captain.Core.CommandOverride.label",
    desc:  "IMSC.Captain.Core.CommandOverride.desc",
    icon:  "fa-solid fa-forward-fast",
  },
  {
    id:   "deadReckoning",
    label: "IMSC.Captain.Core.DeadReckoning.label",
    desc:  "IMSC.Captain.Core.DeadReckoning.desc",
    icon:  "fa-solid fa-compass-drafting",
  },
];

// ─── Captain: Card Deck ───────────────────────────────────────────────────────
// 22-card deck. copies defaults to 1. Gambits set stance via pendingStance.

export const CAPTAIN_CARDS = [
  // BOOST  -  10 unique cards targeting specific roles
  { id: "inspiredTargeting",  category: "boost",    copies: 1, targetRole: "gunner",    label: "IMSC.Captain.Card.InspiredTargeting" },
  { id: "gunsHot",            category: "boost",    copies: 1, targetRole: "gunner",    label: "IMSC.Captain.Card.GunsHot" },
  { id: "overdriveCommand",   category: "boost",    copies: 1, targetRole: "enginseer", label: "IMSC.Captain.Card.OverdriveCommand" },
  { id: "doubleShift",        category: "boost",    copies: 1, targetRole: "enginseer", label: "IMSC.Captain.Card.DoubleShift" },
  { id: "pressTheAttack",     category: "boost",    copies: 1, targetRole: "pilot",     label: "IMSC.Captain.Card.PressTheAttack" },
  { id: "hardOver",           category: "boost",    copies: 1, targetRole: "pilot",     label: "IMSC.Captain.Card.HardOver" },
  { id: "enhancedAuspex",     category: "boost",    copies: 1, targetRole: "sensors",   label: "IMSC.Captain.Card.EnhancedAuspex" },
  { id: "sensorPriority",     category: "boost",    copies: 1, targetRole: "sensors",   label: "IMSC.Captain.Card.SensorPriority" },
  { id: "armamentOrder",      category: "boost",    copies: 1, targetRole: "ordnance",  label: "IMSC.Captain.Card.ArmamentOrder" },
  { id: "acceleratedLoading", category: "boost",    copies: 1, targetRole: "ordnance",  label: "IMSC.Captain.Card.AcceleratedLoading" },
  // SHIPWIDE  -  4 cards
  { id: "emergencyReserves",  category: "shipwide", copies: 2, label: "IMSC.Captain.Card.EmergencyReserves" },
  { id: "holdTheLine",        category: "shipwide", copies: 1, label: "IMSC.Captain.Card.HoldTheLine" },
  { id: "ventingSequence",    category: "shipwide", copies: 1, label: "IMSC.Captain.Card.VentingSequence" },
  // REACTION  -  3 cards (played in response to enemy actions)
  { id: "hardenShields",      category: "reaction", copies: 2, label: "IMSC.Captain.Card.hardenShields" },
  { id: "repairArmour",      category: "reaction", copies: 1, label: "IMSC.Captain.Card.repairArmour" },
  // GAMBIT  -  5 cards (set pendingStance; promoted to active stance at round end)
  { id: "aggressiveDoctrine", category: "gambit",   copies: 1, setsStance: "aggressive", label: "IMSC.Captain.Card.AggressiveDoctrine" },
  { id: "defensiveFormation", category: "gambit",   copies: 1, setsStance: "defensive",  label: "IMSC.Captain.Card.DefensiveFormation" },
  { id: "redAlert",            category: "gambit",  copies: 1, setsStance: "redAlert",     label: "IMSC.Captain.Card.RedAlert" },
  { id: "devastationProtocol", category: "gambit",  copies: 1, setsStance: "devastation", label: "IMSC.Captain.Card.DevastationProtocol" },
  { id: "standDown",           category: "gambit",  copies: 2, setsStance: "none",        label: "IMSC.Captain.Card.StandDown" },
];

/**
 * Build the shuffled starting deck as an array of card ID strings.
 * Cards with copies > 1 appear that many times. Uses Fisher-Yates shuffle.
 * @returns {string[]}
 */
export function buildCaptainDeck() {
  const deck = [];
  for (const card of CAPTAIN_CARDS) {
    for (let i = 0; i < (card.copies ?? 1); i++) deck.push(card.id);
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
