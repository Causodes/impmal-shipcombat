# Imperium Maledictum Voidship Combat

A module for **Imperium Maledictum** that adds a full voidship combat system for up to 6 players. Each player claims a named bridge station and executes their role's mechanics from a dedicated tab on the shared ship sheet.

## Dependencies

- warhammer-lib
- socketlib

---

## Crew Roles

Six roles cover the full bridge crew. The GM has access to all tabs simultaneously. Players see only their own station unless they also hold ownership.

---

### Supreme Commander
*Skill: Presence (Leadership)*

The Captain manages a **Standing Orders** deck - a hand of tactical order cards drawn each round.

**Initiative** - click the d20 icon to roll the ship's initiative for the combat tracker: `1d10 + Leadership skill total / 100`. The decimal fraction acts as a tiebreaker. Additional SL can be allocated to the Initiative track each round to boost the result by +1 per SL for that turn only.

Rolling Presence (Leadership) allocates SL to:
- **Inspire** - draw extra cards and increase maximum hand size this round per SL
- **Resolve** - gain extra damage control actions this round per SL
- **Initiative** - boost this round's combat initiative by +1 per SL allocated

Order cards fall into four categories:

- **Boost** - grant Power Cores or bonuses to a specific role
- **Shipwide** - broad tactical effects
- **Reaction** - played in response to incoming threats
- **Gambit** - set a combat doctrine that applies ship-wide modifiers each round

**Combat stances** set by Gambit cards:

| Stance | Effect |
|--------|--------|
| Aggressive Doctrine | +10 to hit both ways, -1 Speed, -1 Maneuverability |
| Defensive Formation | -10 to hit both ways, +1 Speed, +1 Maneuverability |
| Red Alert | Each role receives a free Power Core per round; +5 internal fire per round |
| Devastation Protocol | All outgoing and incoming hits are automatic critical hits |

**Damage control** - each damage control action steps one ship condition down one tier, costing 10% of maximum Auxiliary Power. Resolve SL adds extra damage control actions beyond the base allotment.

**Voidshield Flux** - the Captain allocates the ship's available void flux to the four voidshield sectors (Bow, Stern, Port, Starboard) each round.

*Flux to Auxiliary Power* - spend 1 void flux to gain 1 Auxiliary Power (free action).

**Power Core actions:**
- **Battle Clarity** - all weapons targeting a nominated enemy gain +10 accuracy and pierce 2 void shields this round
- **Emergency Protocols** - discard entire hand, clear all Low-tier ship conditions
- **Iron Command** - discard entire hand, step every Medium and High condition down one tier
- **Emergency Salvage** - retrieve any one order from the discard pile and return it to hand
- **Command Override** - immediately promote a queued stance change into the active stance, skipping the normal round delay
- **Dead Reckoning** - view and reorder the top 12 orders in the draw pile; blocks the mulligan for this round

---

### Enginseer
*Skill: Tech (Engineering)*

The Enginseer manages reactor output, distributing **Power Cores** to the other roles at the start of each round. Cores are staged individually against each role and dispatched in bulk; receiving roles spend their core to unlock Power Core actions.

The Enginseer also manages two reactor resources:

**System Heat** - accumulates from weapon fire and overload events.
- *Rite of Cooling* - spend Auxiliary Power and roll Engineering to vent heat (power spent + SL, minimum 1)
- *Emergency Vent* - instantly clear all heat, but start Internal Fire equal to heat vented and lock core distribution the following round
- *Hull Repair* - spend AP and roll Engineering to restore hull; costs +1 heat per HP restored; blocked while internal fire is active

**Internal Fire** - deals passive hull damage each round and reduces manpower.
- *Suppress Fire* - spend AP and roll Engineering to reduce fire (power spent + SL, minimum 1)

**Voidshield Flux** - each Power Core dispatched generates void flux the following round, which the Captain allocates to voidshield sectors each round.

*Overclock* - roll Engineering at +1 heat to gain a bonus Power Core.

---

### Helmsman
*Skill: Reflexes (Major Voidship)*

The Pilot controls movement through the **Helm Control** panel with a real-time canvas overlay showing the projected path, turning arc, and minimum-move zone.

Rolling Piloting (Major Voidship) allocates SL to:
- **Speed** - extra void units of movement this turn
- **Maneuverability** - extra degrees of bearing change

Movement rules:
- The Pilot commits thrust with a power bar slider. Auxiliary Power can be diverted to increase the power bar maximum at a rate determined by the engine component
- A minimum-move obligation (half last round's movement, rounded up) must be satisfied each turn

**Power Core action:**
- **Full Plasma Burn** - redline the plasma manifolds, granting +100% power bar capacity
- **Strafe** - translate sideways using attitude thrusters without changing heading
- **Retrograde** - fire bow thrusters to cancel forward momentum or propel the ship sternward

---

### Augur
*Skill: Intuition (Surroundings)*

The Augur operates the **Auspex Radar** - an interactive canvas overlay that plots all ship tokens as blips. The primary task is building and maintaining **Sensor Locks** on enemy contacts.

**Lock tiers:**

| Tier | Action | AP Cost | Information revealed |
|------|--------|---------|----------------------|
| 0 | Passive trace | - | Bearing only; not visible to other crew |
| 1 | Active Ping | 3 | Ship class; enables Gunner targeting |
| 2 | Breach Analysis | 6 | Shield percentages per sector |
| 3 | Deep Scan | 10 | Armour, shields, hull, and weapon fire arcs per sector |
| 4 | Targeting Solution | 15 | +10 accuracy bonus for the Gunner; reveals active conditions on the target |

Locks decay each round.

> **Autoscan bonus:** Targets within the Auspex's auto-scan range are automatically locked at Tier 2. They also receive a **doubled base hit chance** on the weapon roll (e.g. a 50% hit chance becomes 75%).

After the Gunner fires
- Adjust Bearing (+10 to hit next attack)
- Target Weak Point (+SL armour penetration next attack)
- Fire for Effect (crit threshold reduced by SL percentage points — e.g. SL 3 drops threshold from 10% to 7% of hull max)
- Cease Fire, Switch Target (free Tier 1 lock on a different contact + 20% of max Auxiliary Power)

**Utility actions (targeted; require Lock 1):**
- *Sensor Disruption* — designated enemy suffers -10 to all rolls for 1 round
- *Sensor Overcharge* — target weapon accuracy -20 for 2 rounds
- *Designate Torpedo* — freeze a hostile torpedo's helming for 1 round, or designate a friendly torpedo to double its speed this turn

**Global actions — accessed by clicking your own ship (centre of the Auspex Radar); no lock required:**
- *Lock Harmonics* — freeze all current lock decay timers for 1 round
- *Range Amplifier* — double auto-scan range for 2 rounds

**Power Core actions:**
- **Signal Inversion** — requires Lock 1; strip all shields from the nearest quadrant of a designated enemy
- **Combat Telemetry** — upgrade all currently locked targets to Tier 4 (Targeting Solution); accessed by clicking your own ship on the Auspex Radar

---

### Gunnery Officer
*Skill: Ranged (Ordnance)*

The Gunner fires the ship's weapon batteries. Rolling Ranged (Ordnance) allocates SL to:
- **Accuracy** - +5 to hit per SL
- **Penetration** - +1 armour penetration per SL
- **Firepower** - +1 damage per hit per SL

**Weapon battery types:**

| Resource | Notes |
|----------|-------|
| Ammo | Multiple fire modes from Salvo to Devastating Broadside |
| Auxiliary Power | Draws from Auxiliary Power; 4 tiers |
| Heat | Shares the heat track with the Enginseer |

** Auxiliary Power tiers:**

| Tier | Description | Damage multiplier |
|--------|------|-------------------|
| 1 | Glancing | 0.5x |
| 2 | Standard | 1x |
| 3 | Focused | 1.5x |
| 4 | Full Discharge | 2x |

**Weapon traits:**

| Trait | Effect |
|-------|--------|
| Shield Bypass | Hits ignore void shields entirely |
| Shield Burn | Each hit absorbed by shields drains additional void flux |
| Rend | Each hit permanently reduces sector armour regardless of hull damage dealt |
| Armour Penetration | Reduces effective sector armour per hit |
| Devastating | Lowers the critical hit threshold |
| Unreliable | Roll 1d10 before firing; on a 1 the weapon jams and the salvo is lost |
| Overcharge | When fired overcharged: 2 heat per shot, triple weapon trait values |
| Hit Rating | Flat bonus or penalty to base hit chance for all shots |

**Power Core actions:**
- *Directed Fire* - for every crit scored this round, the Gunner nominates the hit location
- *Extend Range* - double the auspex band size for the next weapon attack
- *Emergency Resupply* - immediately restore 20% of maximum ready rounds

---

### Ordnance Master
*Skill: Athletics (Might)*

The Ordnance Master manages crew logistics and ordnance deployment. Rolling Athletics (Might) once per turn generates SL to allocate to:
- **Efficiency** - reduce crew cost by 1 per SL (minimum 2 crew per action)
- **Expedience** - reduce action duration by 1 turn per SL (minimum 1 turn)

**Crew commitment actions** (commit crew to a task that completes after N turns):

| Action | Effect |
|--------|--------|
| Arm Torpedo | Prepares one torpedo for launch |
| Arm Strike Craft | Prepares one strike craft for launch |
| Launch Torpedo | Deploys one armed torpedo immediately |
| Launch Strike Craft | Deploys one ready strike craft immediately |
| Recall Craft | Recovers a strike craft within 3 VU |
| Load Payload | Prepares a specialist payload for delivery to another station |
| Load Ammo | Restores 20% of maximum ready rounds |
| Generate Power | Produces +5 Auxiliary Power |
| Damage Control | Reduces internal fire by 1 |
| Hull Repair Party | Restores +2 hull integrity |

**Ordnance Controls:** control deployed torpedoes and strike craft.

**Payloads** are staged effects delivered to another role's station, arriving the following round:

| Target role | Option A | Option B |
|-------------|----------|----------|
| Gunnery Officer | AP Shells (+2 AP on macro cannons) | Shield-Flensing Shot (+1 shield burn per shot) |
| Helmsman | Helm Burn Injector (+50% base speed) | Maneuvering Thrusters (+50% base maneuverability) |
| Augur | Telemetry Buoy (-20% AP costs, rounded up) | Lock Stabilizer (freeze all lock decay timers) |
| Enginseer | Emergency Coolant (reduce heat by 3) | Aux Capacitors (+1 core output this round) |
| Supreme Commander | Cogitator Data-Slate (draw 2 extra orders, +2 hand size) | Fire Suppression Canisters (step one active condition down) |

**Power Core actions:**
- *Combat Recovery Doctrine* - step destroyed, partial, or recovering strike craft airframes forward through repair stages; cannot launch strike craft this round
- *Shock Loading Rotation* - instantly complete one active crew commitment; effect applied immediately
- *Magazine Crossfeed* - spend 6 ammo for +1 armed torpedo, or 4 ammo for +1 available payload
- *Deck Conscription* - gain +25% of max manpower as temporary crew this round, OR restore 10% of permanently lost crew

---

## Ordnance

### Torpedoes
Torpedo actors are manually controlled by the Ordnance Master. Each has hitpoints, speed, maneuverability, fuel, and a warhead with damage, radius, and optional traits. They move each round; the Ordnance Master can issue control orders from the Ordnance Deck panel. Upon detonation, it deals area damage, multiplied by the number of surviving warheads.

### Strike Craft
Strike craft flight actors are manually controlled by the Ordnance Master. Each flight has hull, fuel, an auspex rating, and can carry a weapon. Fighters make attack runs against enemy voidships, strike craft, or torpedoes; bombers deliver payload attacks only against enemy voidships. If a strike craft does not return to the ship before it runs out of fuel, it is considered lost.

---

## Power Core Economy

Power Cores flow through a chain each round:

1. The Enginseer stages cores against various sinks and dispatches them
2. Receiving roles spend their core to unlock a **Power Core action**
3. Surplus cores at end of turn convert to Auxiliary Power

Auxiliary Power is a shared pool used by all roles.

---

## Critical Hits

A crit is triggered whenever an attack deals net hull damage. Any hit that deals damage (even below the threshold) scores a guaranteed Low tier crit. Hits that deal more than **10% of hull max** in a single attack roll a **d10 for severity** (1-5 Low, 6-8 Medium, 9-10 High). The **Devastation Protocol** stance forces the d10 roll regardless of damage level. The **Fire for Effect** BDA correction lowers the threshold by the Augur's SL (in percentage points).

Location is determined by a **d6**, or the Gunner's choice if **Directed Fire** is active. If a crit lands on a location that already has a condition, an escalation d6 is rolled: 4+ escalates one tier; already at High and escalation succeeds - deals -3 hull damage instead.

Crits resolve against one of five locations. Each escalates through Low, Medium, and High tiers:

| Location | Low | Medium | High |
|----------|-----|--------|------|
| Hull | +1 hull damage/round | +2 hull damage/round | +3 hull damage/round + +5 internal fire/round |
| Engines | -1 Speed | -2 Speed | -4 Speed |
| Manoeuvring Thrusters | -1 Maneuverability | -2 Maneuverability | -4 Maneuverability |
| Core Systems | Core distribution disabled | Core distribution disabled + 5 heat/round | Core distribution disabled + 5 heat/round + AP generation disabled |
| Weapons & Sensors | One weapon jammed | One weapon jammed + sensor disruption (-10 Augur) | All weapons -20 to hit + jammed + sensor disruption |

The Captain steps them down via triage actions; certain order cards clear them outright. The Gunner's **Directed Fire** core action lets the Gunner choose which location is struck instead of rolling randomly.

---

## Installed Components

All ship systems are **Voidship Component** items assigned from the Configuration tab. Component types and their relevant stats:

| Type | Key stats |
|------|-----------|
| Weapon Battery | Salvo size, range, degree of fire, resource type, traits, position |
| Voidshields | Max void flux, shield strength per core, zone thresholds |
| Armour | Armour values per sector |
| Engine | Speed, maneuverability, power-per-AP |
| Auspex Array | Rating, band size, auto-scan range, max detection range |
| Reactor Core | Core output, max void flux, heat capacity, AP capacity, AP per core |
| Ordnance Bay | Torpedo salvo size, strike craft flight size, payload count |

Weapon batteries are mounted at a position (Prow, Dorsal, Flank) and optionally a bay (Port, Starboard for Flank batteries). Slot counts are configured per position on the Configuration tab.

---

## NPC Ships

NPC ships use a separate actor type with simplified GM-only controls.

---

## Module Settings

| Setting | Description |
|---------|-------------|
| Contact Designation | How unidentified blips are labelled on the Auspex Radar (Greek/Numeric/Naval variants) |
| Sweep-Gated Radar Positions | Blip positions only update when the radar sweep arm passes over them |
| Flavor Pack | Label convention for role names and UI text: Warhammer 40k, Naval, or Military |