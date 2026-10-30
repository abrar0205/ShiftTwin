# ShiftTwin — operating model for a real plant

ShiftTwin is a synthetic workforce-resilience demonstration, not an employee monitoring or personnel-decision product. Its current production-floor and staffing scenarios are generated in code. The HR data integration below is a proposed architecture, not a deployed integration.

## The decision

**Next-week operational decision:** Which critical stations are at risk of inadequate qualified coverage, and which feasible combination of cross-training, reassignment and temporary capacity protection should shift leads consider?

**HR planning decision:** Which certifications should be renewed or cross-training slots funded, subject to costs, fairness, qualification lead time, and works-council agreements?

## Source-system contracts

| Source | Minimum data | Cadence | Owner |
| --- | --- | --- | --- |
| HRIS | Pseudonymous worker key, active employment and shift assignment, cost center | Daily changes | HR data steward |
| Time and attendance | Planned shift, aggregated present / sick / leave / training status | Daily, with ingestion latency declared | Attendance process owner |
| Learning / qualification system (LMS) | Qualified station or skill, certification date, expiry, training completion | Daily changes | Training coordinator |
| Production planning | Station headcount demand, planned shifts, target rate, outage windows | Weekly plan, daily adjustments | Production planner |

Records must be joined on a restricted pseudonymous key in a controlled transformation environment. The public interface consumes **aggregate station-shift metrics**, not row-level HR records. Do not export employee-level health or absence records to a browser.

## ETL and quality gates

1. Ingest source snapshots into access-controlled staging, preserving ingestion timestamps and source lineage.
2. Normalize shift calendars and station taxonomy; resolve late and corrected source records.
3. Validate uniqueness of (worker, planned shift, calendar date) and prohibit overlapping shift assignments.
4. Count a qualification only if completed and valid on the **planned work date** (not merely valid on ingestion day).
5. Check attendance coverage of scheduled operating dates and report missing or stale sources as **unknown**, never as present.
6. Produce daily aggregated station-shift staffing capacity, qualification coverage and denominator counts with an explicit reference period.
7. Version the derived plant inputs; retain the generator for the clearly labelled synthetic demonstration.

## Intended users and measurable outcomes

- **Shift leads** use next-week shortfall projections to prepare safe redeployment, not to make automated worker judgments.
- **HR business partners** compare cross-training budget allocation and staffing resilience at the team/station level.
- **Training coordinators** prioritize renewals before expiry, accounting for lead time and staff availability.

Success should be evaluated prospectively against staffing-related line stops, unfilled qualified positions, overtime hours, certification lapse counts, and training cost per **measured** resilience-point improvement. Display forecast intervals and a baseline; never claim causality from an observational dashboard.

## Governance and privacy

- Use aggregate-only reporting with a configurable minimum-group-size suppression threshold (for example, 10) agreed with local data protection and employee representatives.
- Avoid individual absence prediction, health inference, performance ranking, and automated personnel decisions.
- Establish lawful basis, purpose limitation, retention, role-based access, audit logging, and consultation with the works council (Betriebsrat) before using real workforce records in Germany.
- Prepare a DPIA screening documenting processing purposes, personal data categories, necessity, proportionality, risks, mitigations, recipients and retention. Carry out a full DPIA when indicated.
- Before pilot use, validate scheduling constraints (working-time caps, rest periods, qualification safety requirements), collective agreements, and user access.

## Known limitations

Current ShiftTwin outputs derive from simulated qualifications, attendance likelihood and production dynamics. Absence parameters, training response, operational constraints and worker pools are illustrative. Model accuracy on real sites is **not established**. The optimization is a decision-support experiment, not a recommended automated HR action. No personal HR data is distributed in the public GitHub Pages demonstration.
