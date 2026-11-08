// Condensed reference drawn from the JPI Pilot's Guide EDM-700/800 Rev W (page numbers in brackets).

export const REFERENCE_HTML = `
<div class="cols">
  <div class="card"><h4>Cessna 177B / O-360-A1F6D limits [POH §2, Lycoming OM]</h4>
    <table><tr><td>Power</td><td>180 BHP @ 2700 RPM, take-off and continuous</td></tr>
    <tr><td>Tach</td><td>green 2100–2500 (SL–8000 ft), 2100–2700 above 8000 ft; red 2700; avoid 1700–1900 below 10 inHg</td></tr>
    <tr><td>MAP</td><td>green 15–24 inHg (cruise ≤ 75 %)</td></tr>
    <tr><td>CHT</td><td>red line 500°F; Lycoming: &lt;435°F high-power cruise, &lt;400°F economy cruise; POH cowl flaps for ≈¾ of green (≈425°F)</td></tr>
    <tr><td>Oil temp</td><td>red line 245°F; desired ≈180°F; ≥140°F continuous</td></tr>
    <tr><td>Oil pressure</td><td>25 idle (red) · 60–90 green · 100 max (115 cold start)</td></tr>
    <tr><td>Carb air temp</td><td>yellow arc −15…+5°C (icing)</td></tr>
    <tr><td>Fuel</td><td>100LL; 49 gal usable (60 long range)</td></tr></table>
  </div>
  <div class="card"><h4>Run-up [POH §4]</h4><ul>
    <li>1800 RPM, prop full forward. Magneto drop ≤150 RPM, differential ≤50 RPM.</li>
    <li>EDM: Manual mode + Normalize view; all EGTs rise 50–100°F on a single magneto.</li>
    <li>Carb heat: check for RPM drop. Prop: cycle high → low → high.</li>
    <li>Above 3000 ft field elevation: lean for maximum power in a full-throttle static run-up.</li>
  </ul></div>
  <div class="card"><h4>Leaning the Cardinal [POH p.4-14, SI 1094D]</h4><ul>
    <li>POH "recommended lean" = 50°F rich of peak on the single tailpipe EGT probe (≈ average cylinder).</li>
    <li>With the EDM (leanest cylinder first): leanest at peak ≈ POH recommended-lean fuel flow; EDM "50 ROP" burns ≈0.3–0.7 GPH more.</li>
    <li>Best economy = peak EGT (≤75 % power). Best power ≈100°F ROP. Above 75 %: never leaner than 150°F ROP.</li>
    <li>Float carburetor: roughness may come before peak; lean of peak is not possible / not recommended (Lycoming).</li>
    <li>Re-lean after any change of altitude, power or carb heat.</li>
  </ul></div>
  <div class="card"><h4>Carb ice [POH §3, §4; UK CAA SSL 14]</h4><ul>
    <li>Constant-speed prop: unexplained MAP drop with steady RPM, EGTs dropping, later roughness.</li>
    <li>Full carb heat (expect a further brief drop and roughness as ice melts), then minimum heat to keep CRB out of −15…+5°C.</li>
    <li>Highest risk: OAT −7…+21°C with high humidity, low/descent power. Heat before reducing power for the descent.</li>
  </ul></div>
  <div class="card"><h4>Descent [Lycoming Flyer]</h4><ul>
    <li>Reduce power gradually (≈1 inHg/min), keep CLD slower than −50°F/min.</li>
    <li>The mixture gets leaner as you descend — richen gradually. Go-around: full throttle, carb heat cold, mixture rich.</li>
  </ul></div>
  <div class="card"><h4>Buttons [p.8–9]</h4><ul>
    <li><b>Tap</b> = press momentarily; <b>hold</b> = keep pressed.</li>
    <li>Tap STEP: Auto → Manual; Manual → next parameter; LeanFind → Automatic.</li>
    <li>Hold STEP (Manual): previous parameters, rapidly.</li>
    <li>Tap LF: LeanFind. Hold LF 3 s: Percentage ⇄ Normalize.</li>
    <li>Hold STEP + LF 5 s: pilot programming (on USD: reset fuel used).</li>
    <li>Tap STEP + LF: Manual → exclude/include parameter; LeanFind → SNAP data mark.</li>
    <li>Alarm: tap STEP = off 10 min; hold STEP until OFF = off for the flight.</li>
  </ul></div>
  <div class="card"><h4>Leaning rich of peak [p.13, QR]</h4><ol>
    <li>Cruise 65–75% power; pre-lean ~50°F rich of peak; wait 1 min.</li>
    <li>Tap LF → LEAN R.</li>
    <li>Lean ~10°F/s without pausing; dot blinks after a 15°F rise.</li>
    <li>Column flashes, LEANEST (2 s), then <code>1545 SET</code>.</li>
    <li>Hold LF → peak EGT <code>1560 PK</code>.</li>
    <li>Enrich: peak = best economy; ~100°F rich = best power.</li>
  </ol></div>
  <div class="card"><h4>Leaning lean of peak (GAMI) [p.16, QR]</h4><ol>
    <li>Pre-lean, wait 1 min. Tap LF → LEAN R.</li>
    <li>Hold STEP + LF until LEAN L (before leaning starts).</li>
    <li>Lean: columns invert (5°F/segment below peak); each cylinder number flashes as it peaks.</li>
    <li>Last cylinder peaks → its column flashes; display = °F below its peak + fuel flow.</li>
    <li>Hold LF → richest peak EGT + GAMI spread (Δ fuel flow).</li>
    <li>Tap STEP → scan resumes; tap LF → inverted graph again; tap LF again → new LeanFind.</li>
  </ol></div>
  <div class="card"><h4>Fuel [p.26–28, QR]</h4><ul>
    <li>Power-up: FUEL, then FILL? N flashes. Tap LF: FILL 50 (mains) → FILL 120 (mains + aux) → FILL+ → FILL? N. Tap STEP to confirm.</li>
    <li>In flight: PROGRAM → FUEL? N → tap LF (Y) → STEP → FILL? N …</li>
    <li>FILL+ → <code>.0 GAL</code>: hold LF counts up, tap LF counts down, STEP done.</li>
    <li>Reset USD: Manual, step to USD, hold both until <code>.0 USD</code>.</li>
    <li>Tank capacity: hold STEP while powering on (MAIN=, AUX?, AUX=).</li>
  </ul></div>
  <div class="card"><h4>Phase of flight setup [p.18–19]</h4>
    <table><tr><th>Phase</th><th>View</th><th>Mode</th><th>Watch for</th></tr>
    <tr><td>Run-up</td><td>Normalize</td><td>Manual</td><td>~50°F uniform rise on single mag; one high EGT = fouled plug; low volts; cold oil</td></tr>
    <tr><td>Take-off / climb</td><td>Percentage</td><td>Automatic</td><td>EGTs 1100–1250°F; one EGT 300°F high = plugged injector / manifold leak</td></tr>
    <tr><td>Cruise</td><td>Percentage</td><td>Automatic</td><td>LeanFind after warm-up; uneven EGT/CHT patterns</td></tr>
    <tr><td>Descent</td><td>Percentage</td><td>Manual</td><td>CLD alarm −60°F/min; −40 to −60 normal</td></tr></table>
  </div>
  <div class="card"><h4>Typical normal values [p.21]</h4>
    <table><tr><td>EGT cruise</td><td>1350°F (&lt;200 HP), 1550°F high perf.</td></tr>
    <tr><td>DIF</td><td>70–90°F injected, 120–150°F carbureted</td></tr>
    <tr><td>TIT</td><td>1600°F avg, ~100° above EGT</td></tr>
    <tr><td>CHT</td><td>350°F NA, 410°F turbo; span 50–70°F</td></tr>
    <tr><td>OIL</td><td>200°F</td></tr>
    <tr><td>Shock cooling</td><td>keep slower than −60°F/min</td></tr></table>
  </div>
  <div class="card"><h4>Alarms — priority and factory limits [p.25, p.42]</h4>
    <table><tr><th>#</th><th>Alarm</th><th>Default</th></tr>
    <tr><td>1</td><td>High CHT</td><td>450°F</td></tr><tr><td>2</td><td>High OIL</td><td>230°F</td></tr>
    <tr><td>3</td><td>High TIT</td><td>1650°F</td></tr><tr><td>4</td><td>Low OIL</td><td>90°F</td></tr>
    <tr><td>5</td><td>CLD shock cooling</td><td>−60°F/min</td></tr><tr><td>6</td><td>DIF</td><td>500°F</td></tr>
    <tr><td>7–8</td><td>BAT high / low</td><td>16 / 12 V (32 / 24 V)</td></tr><tr><td>9</td><td>MAP overboost</td><td>42.0 in</td></tr>
    <tr><td>10</td><td>LO FUEL (REM)</td><td>10 units</td></tr><tr><td>11</td><td>LO TIME (H.M)</td><td>45 min</td></tr></table>
  </div>
  <div class="card"><h4>Engine diagnosis (Percentage view) [p.22–24]</h4>
    <table><tr><th>Display</th><th>Probable cause</th></tr>
    <tr><td>75–100° EGT rise, one cylinder</td><td>Spark plug not firing</td></tr>
    <tr><td>Loss of EGT one cyl, rough engine</td><td>Stuck valve</td></tr>
    <tr><td>Loss of EGT one cyl, no digital EGT</td><td>Failed probe / harness</td></tr>
    <tr><td>Lower EGT one cyl at low RPM</td><td>Low compression</td></tr>
    <tr><td>EGT down on all cylinders</td><td>Induction / carb ice</td></tr>
    <tr><td>High CHT one side</td><td>Cowling obstruction</td></tr>
    <tr><td>Rapid CHT rise one cyl</td><td>Detonation</td></tr>
    <tr><td>Sudden off-scale EGT, column flashing</td><td>Pre-ignition (or Normalize view, or probe)</td></tr>
    <tr><td>CHT &gt; 500°, EGT normal</td><td>Exhaust leak on CHT probe</td></tr></table>
  </div>
  <div class="card"><h4>Pilot program list [p.33–34]</h4>
    <p><code>PROGRAM</code> → <code>FUEL? N</code> → <code>RATE 4</code> → <code>OAT F</code> → <code>EGT 1?N</code> → <code>HP-? Y</code> →
    <code>KF-SET</code> → <code>ACCUM?N</code> → <code>GPS-C= 2</code> → <code>DUMP? N</code> → <code>END Y</code>.
    Hold both on END Y → <code>FAC LIM</code> alarm-limit list. Items shown depend on the EGT/ALL/FF select switch.</p>
  </div>
</div>`;
