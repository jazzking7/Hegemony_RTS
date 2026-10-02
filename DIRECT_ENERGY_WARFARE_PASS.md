# Direct Energy Warfare Pass

Implemented on top of `rts_missile_battery_ux_pass_3`.

## Doctrine unlock
- Direct Energy Warfare is content-ready and integrated into the existing DR/SR research system.
- Completing the Doctrine Research immediately unlocks the Energy Generator.
- Four SR branches are implemented: Generator, Orbital Direct-Energy, Energy-Field Nodes, and Energy Death Ray.

## Energy Generator
- Utility building: $1,000, 750 HP.
- Base Power Range: 600.
- Base maximum output: 100 Power, freely adjustable from 0 to the researched maximum.
- Operating cost: $0.20 per configured Power per second; 100 Power therefore costs $20/s or $1,200/min.
- Generator operating expense is reflected in the HUD net-income readout.
- Overlapping Generator coverage forms a pooled local power network. Consumers in the connected coverage draw from the shared supply.
- Consumers have High / Normal / Low priority; within a priority tier allocation is deterministic. Under-supplied lower-priority devices shut down rather than flickering.
- Research progression: -7% power cost -> 120 Power -> 750 range -> additional -8% cost -> 150 Power -> 850 range -> additional -10% cost.

## Orbital Direct-Energy Beam System
- Defense/Utility structure: $2,000, 750 HP, requires 60 Power.
- Default build cap: 2; research raises this to 3.
- Base recharge: 50s. Recharge proceeds only while powered, pauses without power, and retains stored charge.
- Global strike: no target-range restriction.
- Dedicated HUD-free aiming mode supports click-to-mark, Space/Confirm to fire, and Esc/Cancel to abort.
- Inner radius 60 receives uniform 750 base damage.
- Outer AOE extends to radius 400 and begins at 500 damage immediately outside the inner radius, then follows the existing AOE falloff law.
- Research can reduce recharge by 15% total, raise inner damage by 25% total, raise outer radius to 500, raise outer starting damage to 700, and raise build cap to 3.
- The field attack bonus is snapshotted from the Orbital structure when the strike is initiated.

## Energy-Field Nodes
- Utility tower: $500, 600 HP, requires 25 Power by default.
- Connection radius: 450. Same-player Nodes must be at least 150 world units apart.
- Around 400 world units between boundary Nodes is the reference spacing for normalized density.
- Nodes can be switched ON/OFF. Powered ON Nodes automatically connect to eligible Nodes inside connection range.
- Open chains do not create a field. Only Nodes participating in enclosed geometry contribute to field density.
- Internal links do not subdivide density; density uses the total enclosed area of the connected closed field while preserving actual concave/gapped geometry rather than granting a convex-hull field.
- Reference density is normalized so a regular field near 400-unit spacing is approximately 1.0 density.
- Default effective density cap: x8; SR raises it to x10 and then x12.
- Default bonus ceilings: +60% attack and 40% damage reduction. SR raises these to +75% / 55%, then +100% / 70%.
- Diminishing returns are applied to density and effective density is clamped by the researched ceiling.
- Node management displays effective density, actual attack bonus, actual damage reduction, and power/network state.
- The first efficiency SR makes a Node consume 20 Power while still contributing 25 Power equivalent to field density; the final efficiency SR lowers actual consumption to 15 while preserving the same 25-Power density contribution.

## Field combat rules
- An allied attack receives the Energy Field attack bonus only if the attacker is inside the field when that attack is initiated.
- The attack multiplier is snapshotted onto projectiles/attacks, so leaving the field after firing does not remove the bonus and flying through a field does not add it retroactively.
- Continuous Death Ray engagements snapshot their field attack multiplier when a beam engagement begins and recalculate on a new engagement.
- Damage reduction is evaluated when damage reaches the allied target, so leaving the field removes protection immediately.
- Field bonuses are integrated with normal weapon fire, aircraft/AA/Loyal Wingman attacks, Loitering Munitions, strategic missiles, landmines, Orbital strikes, Death Rays, and Incendiary-zone DOT where applicable.

## Energy Death Ray Tower
- Defense structure: $1,500, 1,000 HP, requires 40 Power.
- Base range: 500. Base damage: 55 DPS per target.
- Base maximum concurrent targets: 5.
- Valid targets: hostile ground entities/buildings and Loitering Munitions only. It does not target normal aircraft or strategic missiles/projectiles.
- Draws persistent thin direct-energy beam lines to active targets.
- Research: +8% damage -> +5% range -> +1 target -> +12% damage -> +10% range -> 10% Slow Beam -> +1 target.
- Fully researched base values before entity-specific modifiers: 66 DPS, 575 range, 7 concurrent targets.
- Slow Beam does not stack with another Death Ray Slow Beam, but does stack additively with unrelated slowdown sources such as Jamming or Fragmented terrain.

## Missile-zone corrections included in this pass
- High-Explosive Fragmented Zone base radius increased from 50 to 100.
- Incendiary Zone base DOT changed to 5% max HP/s capped at 100 HP/s.
- Its two damage SRs now progress to 5.5% capped at 110 HP/s, then 6% capped at 120 HP/s.
- Burn continues to affect buildings and its incoming-damage vulnerability remains intact.

## AI
- AI doctrine adoption recognizes Direct Energy facilities.
- AI can build Generator/Orbital/Node/Death-Ray facilities after research, assign sensible consumer priorities, set Generator output to current demand, and use charged powered Orbital systems against valid hostile targets.

## Validation
Passing suites:
- Command & Automation smoke/stress.
- Electronic Warfare smoke/stress.
- Missile & Advanced Battery smoke.
- Direct Energy Warfare smoke, including pooled Generator networks, power priority shedding, field geometry/reference density, attack snapshots, impact-time damage reduction, Orbital recharge/strike behavior, and Death Ray targeting.
- UI live-refresh regression.
- UX navigation regression.
- Full architecture regression, including deterministic 200-second simulation signature.
