#!/usr/bin/env bash
# Creates the errata label scheme. Idempotent — safe to re-run.
# Requires the `gh` CLI, authenticated, run from inside the repo.
set -euo pipefail

mk() { gh label create "$1" --color "$2" --description "$3" --force >/dev/null && echo "  $1"; }

echo "Base"
mk "errata"                 "0E6E76" "Filed through the errata form"

echo "Severity — blast radius, not effort"
mk "sev:p0"                 "B23A2D" "Critical — customers are hitting this now"
mk "sev:p1"                 "BE6E22" "High — blocks a real workflow"
mk "sev:p2"                 "93801E" "Medium — should be fixed"
mk "sev:p3"                 "67797F" "Low — cosmetic or nice to have"

echo "Type"
mk "type:bug"               "D73A4A" "Something is broken or wrong"
mk "type:ux"                "C2A5F0" "Confusing, awkward, or badly laid out"
mk "type:feature"           "0E8A16" "Something missing that should exist"
mk "type:data"              "1D76DB" "Numbers or records look wrong"
mk "type:ai"                "5319E7" "A score or generated text is wrong, not broken"
mk "type:perf"              "FBCA04" "Slow, hangs, or times out"

echo "Status — Inbox is implied by the absence of the others"
mk "status:inbox"           "EEEEEE" "Not yet triaged"
mk "status:triaged"         "C5DEF5" "Triaged, not started"
mk "status:progress"        "0E8A16" "Being worked on"
mk "status:review"          "FBCA04" "In review / PR open"

echo "Area"
for a in "command-center" "market-intelligence" "agent-profile" "agent-lineup" \
         "search-and-filters" "switch-risk" "rookie-potential" "coaching-cues" \
         "messageai" "alerts" "office-performance" "reports-and-exports" \
         "mls-data-pipeline" "home" "sign-up" "auth-and-accounts" "apps" \
         "admin-console" "billing" "onboarding"; do
  mk "area:$a" "DDE3DE" "Platform area"
done

echo "Release"
for r in 1 2 3 4 5; do mk "release:group-$r" "EFF2EE" "Delivery batch"; done

echo
echo "Done. Triage by swapping labels; the sync workflow picks it up automatically."
