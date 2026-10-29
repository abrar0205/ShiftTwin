import { GlassPanel, Icon, SectionHeading } from './ui'

export function MethodPrivacy() {
  return <section id="method" className="content-section method-section">
    <SectionHeading eyebrow="METHOD & GOVERNANCE" title="Built to be challenged." body="The model is intentionally inspectable: synthetic inputs, explicit assumptions, reproducible randomness and aggregate outputs." />

    <div className="method-grid">
      <GlassPanel className="method-card">
        <div className="method-icon"><Icon name="activity"/></div>
        <span>METHOD</span>
        <h3>Qualification matrix → matching → Monte Carlo.</h3>
        <p>A seeded plant of 180 synthetic workers is sampled across 5,000 trials. Each shift is solved with capacitated bipartite matching so one worker cannot cover two stations at once.</p>
        <ul>
          <li>common random numbers for stable comparisons</li>
          <li>station/shift failure probability, not just a score</li>
          <li>optimizer re-simulates real model changes</li>
          <li>limitations documented in <code>docs/METHOD.md</code></li>
        </ul>
      </GlassPanel>

      <GlassPanel className="method-card">
        <div className="method-icon"><Icon name="shield"/></div>
        <span>PRIVACY BY DESIGN</span>
        <h3>Plan capacity, not people.</h3>
        <p>The public interface never names or ranks individuals. It focuses on forward-looking station, skill and shift resilience.</p>
        <ul>
          <li>aggregate views only; groups under 10 are suppressed</li>
          <li>no individual absence prediction or performance scoring</li>
          <li>working-time constraints are planning rules, not legal claims</li>
          <li>designed to be reviewable by privacy and employee-representation stakeholders</li>
        </ul>
      </GlassPanel>
    </div>

    <div className="method-note"><Icon name="lock" size={15}/><span>ShiftTwin is a portfolio simulation with synthetic data. It does not claim legal compliance or make employment decisions.</span></div>
  </section>
}
