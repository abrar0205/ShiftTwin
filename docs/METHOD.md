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

## Representative trial

For each shift, ShiftTwin records total staffing shortfall in every Monte Carlo trial. It then selects the trial whose shortfall is closest to the median shortfall for that shift. Ties resolve to the earliest trial index.

This is deliberately not the worst case. It is a reproducible typical staffing state for the selected scenario.

The representative trial contains:
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

This is a visualization model for staffing feasibility, not a production-engineering throughput model. It does not model buffers, stochastic cycle time, equipment downtime, rework or line balancing.

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
- the Living Factory Phase 2 line rate is a static bottleneck estimate; queue dynamics are added separately;
- no stochastic demand process beyond the user-selected scenario;
- renewal rate is a scenario assumption, not an empirical forecast;
- training quality and worker preference are not modeled;
- overtime remains deliberately approximate in v1.1 Phase 1;
- readiness measures staffing feasibility, not production throughput or safety performance.
