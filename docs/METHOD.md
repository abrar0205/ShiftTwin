# ShiftTwin — Method & assumptions

ShiftTwin is a synthetic, aggregate-only workforce resilience simulator for manufacturing operations.

## Core question

Given a plant qualification matrix, shift assignments, demand requirements, training readiness, certification renewals and uncertain absence, what is the probability that every critical station can be staffed by a qualified person?

## Synthetic plant

The demo uses a deterministic seeded generator:
- 3 manufacturing areas
- 12 critical stations
- 3 shifts
- 180 synthetic workers
- 1–4 station qualifications per worker
- seeded station/shift scarcity rather than a hard-coded named bottleneck
- qualification expiry dates across a 12-week horizon
- deterministic seeded renewal propensity
- heterogeneous absence propensity

No real employee data is used. The Method section can regenerate the plant with a new seed to demonstrate that bottlenecks are outputs of the generated qualification matrix rather than scripted labels.

## Certification renewal

Expiring qualifications are not assumed to lapse automatically. Each synthetic qualification receives a seeded renewal rank. A scenario-level renewal-rate control determines which expiring qualifications are renewed. The baseline uses an 85% renewal rate; the certification-wave preset deliberately introduces a larger renewal backlog.

## Coverage model

Each Monte Carlo trial samples worker presence using common random numbers so scenario comparisons stay stable. For each shift, station demand is converted to required qualified headcount. Active qualifications are filtered by training readiness, certification horizon and renewal outcome.

Coverage is solved as a capacitated bipartite matching problem:
- each present worker can be assigned to at most one station;
- each station requires a specified number of qualified workers;
- maximum flow determines whether all critical station requirements can be covered;
- the solver retains the anonymous worker-slot assignment for representative-trial rendering.

A greedy assignment is intentionally not used because assignment order can produce false failures.

## Readiness

Plant readiness is:

**100 × P(all critical stations are covered)**

The headline score is estimated from 5,000 trials. The interface also reports shift-level coverage probability, station/shift uncover probability, the distribution of uncovered stations and recurring bottlenecks.

## Representative trials

For each shift, ShiftTwin records total staffing shortfall in every Monte Carlo trial and exposes two reproducible views:

- **Typical trial:** closest to the median shortfall across all trials.
- **Failing trial:** among trials with shortfall greater than zero, closest to the median shortfall of failing trials.

The UI also reports the shift failure rate. If failure rate is at least 5%, the factory defaults to the failing view so a materially risky scenario does not render as an all-green floor merely because the overall median shortfall is zero.

These are representative simulation states, not worst-case selections.

Each trial contains:
- anonymous worker slots and presence state;
- active and lapsed qualifications;
- max-flow station assignment;
- assigned headcount and deficit per station;
- station throughput factor;
- target and realized line rate;
- cars lost over an 8-hour shift.

## Simplified bottleneck throughput model

The Living Factory uses a deliberately simple bottleneck model:

**station throughput factor = min(1, assigned / required)**

**target JPH = 60 × (1 + demand uplift)**

**line rate JPH = target JPH × minimum station throughput factor**

**cars lost per shift = (target JPH − line rate JPH) × 8 hours**

This is a visualization model for staffing feasibility, not a production-engineering throughput model. It does not model stochastic equipment downtime, rework routing or detailed industrial line balancing.

## Living Factory motion and story sequences

The 3D floor uses one deterministic scene clock with 18× visual time compression. Vehicle dwell is derived from station throughput factor; a zero-capacity station holds indefinitely; vehicles advance only when the next slot is free. Upstream queueing and downstream starvation therefore emerge from slot availability rather than scripted animation.

The v1.3 story sequence does not alter simulation outputs:

- RUN SCENARIO scrolls to the floor and stages worker loss, ordered andon changes, queue formation, bottleneck camera focus and HUD counter transitions.
- The bottleneck remains highlighted with a floor ring, focused light and persistent callout containing the station deficit, throughput factor and simulated failure frequency.
- Apply Plan keeps the scenario state visible while an accent worker moves into the gap, the bottleneck andon transitions toward the verified plan state, and the queue drains using the plan trial's throughput factors.
- The optimizer verifies intervention results with 5,000 Monte Carlo samples, matching the scenario basis before the plan state is committed.
- Sequences can be skipped with click or Escape; reduced-motion mode jumps directly to the end state.

The 12 full station cards were replaced by compact status chips with details on hover/focus. STARVED labels are updated in one batched frame loop, and Three.js color/vector temporaries used in frame loops are preallocated.

## Intervention comparison

Every displayed before/after intervention pair is re-simulated:
- at the same target week;
- with the same sample count;
- using the same underlying common random numbers.

The optimizer evaluates cross-training, safe shift rebalancing, temporary relief and a combined plan. The recommendation is the highest verified readiness result, with shorter lead time used only as a tie-break.

Phase 1 retains the conservative demand-relief approximation for overtime. A later model revision replaces it with explicit holdover hours.

## Shapley attribution

The explainability waterfall uses exact Shapley attribution across four driver groups:
- absence;
- demand;
- training;
- certification (horizon + renewal rate).

With four drivers there are 16 subsets. Every subset is simulated with common random numbers, then each driver's marginal contribution is averaged across all possible orderings. This removes the order-dependence of the previous sequential waterfall.

Shapley values explain the model's score change; they are not causal estimates.

## Privacy & governance

- no individual names are shown;
- worker identifiers shown internally are anonymous within-shift slots, not identities;
- public views focus on operational capacity, not individual absence behavior;
- no individual absence prediction or performance scoring;
- working-time constraints are planning rules rather than legal claims;
- the design is intended to be reviewable by employee representatives and privacy stakeholders.

The demo does **not** claim legal compliance.

## Limitations

- synthetic data and simplified production logic;
- representative trial is selected by median staffing shortfall, not by production loss;
- the headline line-rate metric remains a simplified bottleneck estimate; the animated line is a time-compressed discrete-event visualization of those same station throughput factors;
- no stochastic demand process beyond the user-selected scenario;
- renewal rate is a scenario assumption, not an empirical forecast;
- training quality and worker preference are not modeled;
- overtime remains deliberately approximate in v1.1 Phase 1;
- readiness measures staffing feasibility, not production throughput or safety performance.
