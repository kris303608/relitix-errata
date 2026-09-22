#!/usr/bin/env node
/**
 * errata-migrate.mjs — one-time: turn the artifact board's backlog.json into
 * GitHub Issues, so nothing filed so far is lost when Issues become the truth.
 *
 *   node scripts/errata-migrate.mjs board-export.json --dry-run   # show what it would do
 *   node scripts/errata-migrate.mjs board-export.json             # actually create them
 *
 * Each issue keeps its original ERR-### in an HTML comment so old references
 * still resolve. Re-running skips anything already migrated.
 * Requires `gh`, authenticated, run from inside the repo.
 */

import fs from "node:fs";
import { execFileSync } from "node:child_process";

const file = process.argv[2];
const DRY = process.argv.includes("--dry-run");
if (!file) {
  console.error("usage: node scripts/errata-migrate.mjs <board-export.json> [--dry-run]");
  process.exit(1);
}

const doc = JSON.parse(fs.readFileSync(file, "utf8"));
const items = Array.isArray(doc) ? doc : doc.items;
if (!Array.isArray(items)) {
  console.error("No items array in that file.");
  process.exit(1);
}

const TYPE_LABEL = { bug: "type:bug", ux: "type:ux", feature: "type:feature", data: "type:data", ai: "type:ai", perf: "type:perf" };
const STATUS_LABEL = { new: "status:inbox", triaged: "status:triaged", progress: "status:progress", review: "status:review" };

function slug(s) {
  return String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
// In GitHub Actions there is no interactive git context to infer the repo from,
// so name it explicitly whenever the environment tells us which repo we are in.
const REPO = process.env.GH_REPO || process.env.GITHUB_REPOSITORY || "";
function gh(args, input) {
  const full = REPO && !args.includes("--repo") ? [...args, "--repo", REPO] : args;
  return execFileSync("gh", full, { encoding: "utf8", input, maxBuffer: 32 * 1024 * 1024 });
}

// Which ERR-### are already in GitHub?
let existing = new Set();
if (!DRY) {
  try {
    const raw = gh(["api", "--paginate",
      `repos/${REPO || "{owner}/{repo}"}/issues?state=all&labels=errata&per_page=100`, "--repo", REPO || ""]
      .filter((a) => a !== "--repo" && a !== ""));
    const arr = JSON.parse("[" + raw.trim().replace(/\]\s*\[/g, ",").replace(/^\[|\]$/g, "") + "]");
    for (const i of arr) {
      const m = /<!--\s*legacy:(ERR-\d+)\s*-->/.exec(i.body || "");
      if (m) existing.add(m[1]);
    }
  } catch {
    console.error("Warning: couldn't list existing issues; duplicates are possible on a re-run.");
  }
}

let made = 0, skipped = 0;
for (const it of items) {
  if (existing.has(it.ref)) { skipped++; continue; }

  const env = /(^|\/\/)app\.relitix\.com/.test(it.url || "") ? "Production" : "Staging";
  const labels = ["errata", `sev:${it.severity || it.sev || "p2"}`, TYPE_LABEL[it.type] || "type:bug"];
  if (it.area) labels.push(`area:${slug(it.area)}`);
  if (it.release) labels.push(`release:${slug(it.release)}`);
  const st = STATUS_LABEL[it.status];
  if (st) labels.push(st);

  const body = [
    `### Where did you see it?`,
    ``,
    it.url || "_No response_",
    ``,
    `### What happened?`,
    ``,
    it.detail || "_No response_",
    ``,
    `### What kind of thing is it?`,
    ``,
    ({ bug: "Bug", ux: "UI/UX", feature: "Feature", data: "Data", ai: "AI/Model", perf: "Performance" }[it.type] || "Bug"),
    ``,
    `### How bad is it?`,
    ``,
    String(it.severity || it.sev || "p2").toUpperCase(),
    ``,
    `### Which part of the platform?`,
    ``,
    it.area || "Not sure",
    ``,
    `### Staging or production?`,
    ``,
    env,
    ``,
    `---`,
    `Migrated from the errata board. Originally reported by **${it.reporter || "unknown"}**` +
      (it.due ? `, due ${it.due}` : "") + `.`,
    `<!-- legacy:${it.ref} -->`,
  ].join("\n");

  const args = ["issue", "create", "--title", `[errata] ${it.title}`, "--body-file", "-"];
  for (const l of labels) { args.push("--label", l); }
  if (it.owner) { args.push("--assignee", it.owner); }

  if (DRY) {
    console.log(`would create: ${it.ref}  [${labels.join(" ")}]${it.owner ? "  @" + it.owner : ""}`);
    console.log(`              ${it.title}`);
    made++;
    continue;
  }

  try {
    const url = gh(args, body).trim();
    console.log(`${it.ref} -> ${url}`);
    made++;
  } catch (e) {
    // An unknown assignee is the usual cause; retry unassigned rather than lose the item.
    console.error(`  ${it.ref}: ${String(e.stderr || e.message).trim().split("\n")[0]}`);
    if (it.owner) {
      const retry = args.filter((a, n) => a !== "--assignee" && args[n - 1] !== "--assignee");
      try {
        const url = gh(retry, body).trim();
        console.log(`${it.ref} -> ${url}  (created unassigned — set the owner in GitHub)`);
        made++;
        continue;
      } catch {}
    }
    console.error(`  ${it.ref}: SKIPPED`);
  }
}

console.log(`\n${DRY ? "Would create" : "Created"} ${made} issue(s)` + (skipped ? `, skipped ${skipped} already migrated.` : "."));
if (!DRY && made) console.log("Now run: node scripts/errata-sync.mjs");
