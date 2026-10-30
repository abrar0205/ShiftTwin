# ShiftTwin

**Workforce Resilience Simulator for manufacturing operations.**

ShiftTwin is an interactive portfolio prototype that asks a different People Analytics question:

> **Can the workforce configuration support the operation under uncertainty — and which intervention improves resilience most?**

**Live demo:** `https://abrar0205.github.io/ShiftTwin/`

All data is synthetic. The project is independent and is not affiliated with any employer.

## Why it is different

A conventional workforce dashboard tells you that absence, training or attrition changed. ShiftTwin connects those changes to a qualification matrix and asks whether every critical station can still be covered by a qualified person.

The product flow is:

```text
change scenario
      ↓
simulate 5,000 workforce states
      ↓
solve qualified station coverage
      ↓
reveal recurring constraint
      ↓
evaluate interventions
      ↓
compare verified resilience
```

The headline score is not scripted. It is the Monte Carlo estimate of full critical-station coverage.

## What is real

- deterministic synthetic plant generation with seeded RNG;
- 180 synthetic workers across three shifts;
- 12 critical stations across three areas;
- qualification expiry and training readiness;
- heterogeneous absence propensity;
- max-flow / bipartite matching for station assignment;
- 5,000-trial Monte Carlo readiness;
- common random numbers for stable scenario comparisons;
- station/shift failure probabilities and uncertainty interval;
- greedy marginal-gain cross-training optimizer;
- constrained shift-rebalancing search;
- eight-week resilience outlook;
- Vitest checks for determinism, matching, monotonicity and line-motion invariants;
- a lazy-loaded 3D Living Factory whose workers, andons, station dwell, queues and starvation states are tied to representative Monte Carlo trials;
- skippable scenario and plan-heal sequences that focus the camera on the actual bottleneck without changing the underlying model state.

## Living Factory

The 3D floor is a model view rather than decorative animation. A selected representative trial drives anonymous worker assignments, station deficits and throughput factors. The line uses a deterministic, time-compressed discrete-event model so constrained station dwell creates upstream queues and downstream starvation.

The scenario sequence spotlights the actual bottleneck, while Apply Plan keeps the scenario visible and animates the verified intervention before committing the new state. Plan comparisons use 5,000 verification samples.

The visual layer uses self-hosted CC0 KayKit worker/animation assets and a generic Kenney sedan, with a procedural industrial hall, reflective concrete and adaptive desktop post-processing. No manufacturer logos or external runtime asset hosts are used.

See [docs/ASSETS.md](docs/ASSETS.md) for provenance and license notes.

## Signature idea: resilience value of skill

The cross-training optimizer estimates the **marginal readiness gain per additional qualification slot**. Instead of saying “training completion is 89%,” ShiftTwin asks:

> Which qualification would add the most operational resilience if we could fund one more training slot?

That connects People Analytics, training strategy and manufacturing capability.

## Privacy and governance

ShiftTwin is designed as capacity planning rather than employee monitoring.

- no individual names appear in the UI;
- aggregate views only;
- small groups are suppressed;
- no individual absence prediction or performance scoring;
- working-time considerations are modeled as planning constraints, not legal claims;
- assumptions and limitations are documented.

See [docs/METHOD.md](docs/METHOD.md).

## Stack

React 18 · TypeScript · Vite · Motion · Zustand · Three.js · React Three Fiber · Drei · React Postprocessing · D3 math utilities · Web Worker · Vitest · GitHub Pages

The simulation and optimization run entirely in the browser. No backend, database, API key or external service is required for the public demo.

## Run locally

```bash
npm ci
npm run dev
```

Quality checks:

```bash
npm test
npm run build
npm run check:assets
npm run check:runtime-assets
```

## Architecture

```text
React UI
  │
  ├── Scenario Studio
  ├── Skill network
  ├── Explainability
  └── Intervention comparison
           │
           ▼
       Web Worker
           │
  ┌────────┼─────────┐
  │        │         │
Monte   Matching   Optimizer
Carlo   max-flow   marginal gain
  │        │         │
  └────────┴─────────┘
           │
           ▼
       SimResult
```

The UI renders simulation outputs; it does not invent KPI values.

## Scope

This is a portfolio simulation, not a production workforce-management or legal-compliance system. It demonstrates a decision-support concept using synthetic data and simplified manufacturing assumptions.
