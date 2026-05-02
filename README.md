# Imperium Maledictum Voidship Combat

A FoundryVTT module for **Imperium Maledictum** that adds a full voidship combat system. Up to six players each claim a named bridge station and execute their role's mechanics from a dedicated tab on the shared ship sheet. The crew size is adjustable; roles collapse and merge as headcount drops. All players take their turns simultaneously on the player ship's turn in the combat tracker.

See the role-specific reference documents for full details on what each station does:

- [README_3.md](README_3.md) — 3-player crew
- [README_4.md](README_4.md) — 4-player crew
- [README_5.md](README_5.md) — 5-player crew
- [README_6.md](README_6.md) — 6-player crew

---

## Dependencies

- warhammer-lib
- socketlib

**Optional (for combat animations):**
- Sequencer
- JB2A Patreon (Jules and Ben's Animated Assets - Patreon version required for the full animation set)

---

## The Ship Sheet

Each player sees only their own station tab. The GM sees all tabs simultaneously. Players with full ownership of the actor can additionally see the Configuration tab.

### Header

The Header shows a snapshot of ship status visible to all crew: hull integrity, void shields, internal fire, and armour status. 

### Overview Tab

Players can view and claim roles as well as view and equip various voidship components on this tab. The "Ready" column on the Bridge Crew table indicates that status of the role; players who have marked their turn as "Done" will have the status update to "Yes". Once all roles are ready, the GM can advance the turn in the combat tracker.

---

## Configuration Tab

The Configuration tab is where role count, weapon configuration, and the ship component inventory is managed. It is only accessible to players with Owner-level permission and to the GM.

### Ship Configuration

| Setting | Values | Notes |
|---------|--------|-------|
| Active Roles | 3 – 6 | Number of active player stations; see crew reference READMEs for per-size layouts |
| Strike Craft | Yes / No | Show or hide the Strike Craft ordnance column and actor template drop target |
| Movement | Simplified / Realistic | Simplified is the current model (bow-aligned travel, immediate bearing changes). Realistic (Newtonian) is planned for a future update and is currently disabled |

### Torpedo / Strike Craft Launch Directions

Pill toggles for each direction (Bow, Port, Starboard, Stern) control which sides are valid launch origins for torpedoes and strike craft. At least one direction must be active; if all are deselected for a type the launch action returns an error.

### Hull Max

**Hull maximum is set directly on the ship actor** — it is the only stat not derived from a component. Set it in the header bar at the top of the sheet.

### Weapon Slots

Set the slot count for each weapon position. Only positions with at least one slot are shown in the active station tabs.

| Position | Notes |
|----------|-------|
| Prow | Forward-facing fixed mount |
| Dorsal | Forward-facing fixed mount |
| Port | Port broadside |
| Starboard | Starboard broadside |
| Stern | Rear-facing fixed mount |
| Ordnance | Number of simultaneously loadable ordnance bays |

### Equipment Slots (Component Inventory)

All ship stats other than hull max are derived from installed **Voidship Component** items. Only components with the equipped flag active are read.

| Slot | Drives |
|------|--------|
| Voidshields | Max void flux, shield strength per core, sector zone thresholds |
| Armour | Armour value per sector (Bow, Stern, Port, Starboard) |
| Engine | Base speed, base maneuverability, Auxiliary Power conversion rate |
| Auspex Array | Rating (accuracy), band size (accuracy decay), auto-scan range, max detection range |
| Reactor Core | Core output, heat capacity, Auxiliary Power capacity, Auxiliary Power generated per core dispatched |
| Ordnance Bay | Torpedo salvo size, strike craft flight size, available payload count, manpower |

Only one component per equipment slot type is active at a time; switching the dropdown unequips the previous one.

### Ordnance Actor Templates

Torpedoes and strike craft are separate **actors** (types `impmal-shipcombat.torpedo` and `impmal-shipcombat.strikeCraft`) that live outside the ship sheet. They are registered as launch templates by dragging them into the two drop targets on the Config tab:

- **Torpedo Actors** — drag one or more torpedo actors here; the Ordnance Master selects which type to arm/launch each round
- **Strike Craft Actors** — drag one or more strike craft actors here; same selection logic

Each template actor carries all stats for that ordnance type: speed, maneuverability, fuel, warhead damage and blast radius (torpedoes), hull, auspex rating, weapon load (strike craft). When a torpedo or flight is launched, a new token is spawned on the canvas using the template actor's stats. The original template actor is never modified during play.

The health of an ordnance actor template should be 0/1; this will be multiplied accordingly by the Ordnance Bay's salvo/flight size stat. Upon taking damage from any source, an ordnance actor will lose exactly 1 hitpoint; multiple hits from a salvo will deduct multiple hitpoints.

---

## Minimum Move

To simulate momentum in space, all craft have a minimum move obligation. This obligation is represented by the yellow portion of the Power slider on the movement controls. This is equal to half the distance the craft traveled its previous turn (half of speed for the first turn of combat). A craft must move this distance; if the craft has moved less than its minimum move by the end of the craft's turn, it will automatically drift forward to the minimum move distance.

---

## Void Shields and Armour

The angle of incoming damage is calculated and assigned to the appropriate sector that is hit (Bow, Stern, Port, Starboard). 

For every point of active void shield, 1 incoming hit is fully nullified, regardless of damage. Void shields can be overcharged above the sector's maximum; however, any void shields over the maximum are lost at the start of the following turn.

Armour negates 1 point of damage per point of armour. 

---

## Internal Fire

Deals passive hull damage each round and reduces available manpower.

---

## Critical Hits

A crit is scored whenever an attack deals net hull damage after shields and armour. Any damaging hit scores at least a **Low** tier crit. Hits exceeding **10% of hull max** in a single roll also trigger a **d10 severity roll** (1–5 Low, 6–8 Medium, 9–10 High).

Location is determined by a **d6** (or Gunner's choice with **Directed Fire** active). Crits landing on an already-damaged location trigger an escalation roll: 4+ on a d6 steps it up one tier; a High-tier location that would escalate further deals –3 hull damage instead.

| Location | Low | Medium | High |
|----------|-----|--------|------|
| Hull | +1 hull damage/round | +2 hull damage/round | +3 hull damage/round + +5 internal fire/round |
| Engines | –1 Speed | –2 Speed | –4 Speed |
| Manoeuvring Thrusters | –1 Maneuverability | –2 Maneuverability | –4 Maneuverability |
| Core Systems | Core distribution disabled | Core distribution disabled + 5 heat/round | Core distribution disabled + 5 heat/round + AP generation disabled |
| Weapons & Sensors | One weapon jammed | One weapon jammed + sensor disruption (–10 Augur) | All weapons –20 to hit + jammed + sensor disruption |

Certain actions, such as repair actions, step down conditions.

---

## Ordnance

### Torpedoes

Torpedo tokens are manually controlled by the owning player. Each torpedo has hull (warhead count), speed, maneuverability, and fuel. They must be moved each round; the controlling player issues helm orders. On detonation, the warhead deals area damage falling off with distance from the blast centre, multiplied by the number of intact warhead sections (hull integrity). All ships, torpedoes, and strike craft within the blast radius are affected regardless of allegiance.

The turn a torpedo is launched it drifts automatically and cannot be given orders — it acts normally from the following round.

### Strike Craft

Strike craft flight tokens are manually controlled. Each flight has hull, fuel, an auspex rating, and an optional weapon. Fighters make attack runs against ships, other craft, or torpedoes; bombers attack ships only. Flights that run out of fuel before returning to the mothership are lost.

---

## Weapon Traits

| Trait | Effect |
|-------|--------|
| Shield Bypass | Hits ignore void shields entirely |
| Shield Burn | Each hit absorbed by shields drains additional void flux |
| Rend | Each hit permanently reduces sector armour regardless of hull damage dealt |
| Armour Penetration | Reduces effective sector armour per hit |
| Devastating | Doubles (11, 22, etc.) that hit deal bonus damage equal to this value |
| Unreliable | Roll 1d10 before firing; on a 1 the weapon jams and the salvo is lost |
| Overcharge | When fired overcharged: 2 heat per shot, triple weapon trait values |
| Hit Rating | Flat bonus or penalty to base hit chance for all shots |

---

## NPC Ships

NPC ships use a separate actor type (`impmal-shipcombat.npcShip`) with simplified GM-only controls: weapon batteries, armour, shields, hull, and condition tracking without the full player-facing station UI.

---

## Module Settings

| Setting | Description |
|---------|-------------|
| Contact Designation | Label style for unidentified Auspex blips: Greek letters, numeric, or naval callsigns |
| Sweep-Gated Radar Positions | Blip positions only update when the radar sweep arm passes over them |
| Flavor Pack | Role name and UI label convention: Warhammer 40k, Naval, or Military |