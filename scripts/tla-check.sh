#!/usr/bin/env bash
# Formal check of the EDM state machine with TLA+ (spec/tla/):
#   1. explore the JavaScript implementation and export what it does (spec/tla/ImplGraph_*.tla)
#   2. TLC: model-check the formal spec, and judge the implementation's states and steps against it
#   3. TLC: liveness — from every implementation state the pilot can get back to the scan
# Needs Java 11+ and the TLA+ tools jar (https://github.com/tlaplus/tlaplus/releases, tla2tools.jar).
set -euo pipefail
JAR="${TLA2TOOLS:-$HOME/.cache/tlaplus/tla2tools.jar}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT/tools/tla-conformance.mjs"
if [[ ! -f "$JAR" ]]; then
  echo "TLA+ tools not found at $JAR — download tla2tools.jar from the tlaplus releases page and set TLA2TOOLS" >&2
  exit 2
fi
cd "$ROOT/spec/tla"
status=0
for m in MC_modes MC_alarms MC_escape_modes MC_escape_alarms; do
  echo "=== $m"
  java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -workers auto -cleanup -config "$m.cfg" "$m.tla" | tee "$m.out" | grep -E "STATE NOT|FORBIDDEN|MISSING|bad states|implementation|Error|violated|is false|distinct states|No error|Finished" || true
  grep -q "No error has been found" "$m.out" || status=1
done
exit $status
