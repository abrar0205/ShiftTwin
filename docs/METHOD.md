# ShiftTwin — Method & assumptions

ShiftTwin is a synthetic, aggregate-only workforce resilience simulator for manufacturing operations.

## Core question

Given a plant qualification matrix, shift assignments, demand requirements, training readiness and uncertain absence, what is the probability that every critical station can be staffed by a qualified person?

## Synthetic plant

The demo uses a deterministic seeded generator:
- 3 manufacturing areas
- 12 critical stations
- 3 shifts
- 180 synthetic workers
- 1–4 station qualifications per worker
- qualification expiry dates across a 12-week horizon
- heterogeneous absence propensity

No real employee data is used.

## Coverage model

Each Monte Carlo trial samples worker presence using common random numbers so scenario comparisons stay stable. For each shift, station demand is converted to required qualified headcount. Active qualifications are filtered by training readiness and certification horizon.

Coverage is solved as a capacitated bipartite matching problem:
- each present worker can be assigned to at most one station;
- each station requires a specified number of qualified workers;
- maximum flow determines whether all critical station requirements can be covered.

A greedy assignment is intentionally not used because assignment order can produce false failures.

## Readiness

Plant readiness is:

**100 × P(all critical stations are covered)**

The headline score is estimated from 5,000 trials. The interface also reports:
- shift-level coverage probability;
- station/shift uncover probability;
- the distribution of uncovered stations;
- recurring bottlenecks;
- an 80% binomial confidence band around the Monte Carlo estimate.

## Scenario inputs

Users can vary:
- absence rate;
- production demand;
- training coverage;
- certification horizon.

A fast 300-trial preview is used while editing. Full scenario runs use 5,000 trials.

## Intervention optimizer

The optimizer evaluates real modifications to the plant model.

### Cross-training
Candidate worker/station qualifications are added greedily using marginal readiness gain under common random numbers. Training has a 2–4 week lead time.

### Shift rebalancing
Qualified workers may be moved from stronger shifts to the bottleneck shift only when the donor shift remains viable under the evaluation scenario.

### Overtime
Overtime is presented as a bounded short-term contingency rather than equivalent full-shift capacity. The demo applies a conservative relief cap and explicitly marks the simplification.

The combined plan ranks interventions by verified readiness improvement and lead time. Candidate evaluation uses fewer trials for responsiveness; the recommended plan is re-verified with a larger sample.

## Explainability

The waterfall is a sequential sensitivity analysis. Scenario drivers are introduced one at a time with common random numbers, then scaled to the full-run readiness change. It is an explanation aid, not a causal estimate.

## Privacy & governance

- no individual names are shown;
- public views are aggregate only;
- small groups are suppressed;
- the model plans capacity rather than predicting individual absence;
- the design is intended to be reviewable by employee representatives and privacy stakeholders.

The demo does **not** claim legal compliance. German working-time and co-determination considerations are represented as planning constraints and governance prompts, not legal advice.

## Limitations

- synthetic data and simplified production logic;
- no stochastic demand process beyond the user-selected scenario;
- training quality and worker preference are not modeled;
- overtime is deliberately conservative and approximate;
- readiness measures staffing feasibility, not production throughput or safety performance.
