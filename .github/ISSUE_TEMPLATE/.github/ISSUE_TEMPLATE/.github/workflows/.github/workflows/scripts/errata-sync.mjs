#!/usr/bin/env node
/**
 * errata-sync.mjs — GitHub Issues are the source of truth; this regenerates
 * errata/backlog.json and errata/BACKLOG.md from them.
 *
 * Runs in CI on every issue event (see .github/workflows/errata-sync.yml).
 * Run it locally any time with `gh` authenticated:
 *
 *   node scripts/errata-sync.mjs                      # uses gh / GITHUB_TOKEN
 *   node scripts/errata-sync.mjs --from=issues.json   # offline, from a saved API dump
 *   node scripts/errata-sync.mjs --check              # verify, write nothing, exit 1 on problems
 *
 * Field precedence: a triage LABEL always wins over what the reporter picked in the
 * form, because triage is where those decisions actually get made.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, "errata", "backlog.json");
const OUT_MD = path.join(ROOT, "errata", "BACKLOG.md");

const TYPES = ["bug", "ux", "feature", "data", "ai", "perf"];
const TYPE_NAME = { bug: "Bug", ux: "UI/UX", feature: "Feature", data: "Data", ai: "AI/Model", perf: "Perf" };
const SEVS = ["p0", "p1", "p2", "p3"];
const SEV_NAME = { p0: "P0 Critical", p1: "P1 High", p2: "P2 Medium", p3: "P3 Low" };
const STATUSES = ["inbox", "triaged", "progress", "review", "done"];
const STATUS_NAME = { inbox: "Inbox", triaged: "Triaged", progress: "In Progress", review: "In Review", done: "Done" };

/* ------------------------------------------------------------- form parsing */

/** GitHub issue forms render as "### Label\n\nvalue\n\n### Label\n\nvalue". */
function parseForm(body) {
  const out = {};
  if (!body) return out;
  const parts = String(body).replace(/\r\n/g, "\n").split(/^### +/m);
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n");
    if (nl === -1) continue;
    const label = part.slice(0, nl).trim();
    let value = part.slice(nl + 1).trim();
    if (value === "_No response_") value = "";
    out[label.toLowerCase()] = value;
  }
  return out;
}

/**
 * The LAST section of a form body also swallows whatever follows it — a `---`
 * footer, the migration marker. Single-value answers are always one line, so
 * take only that.
 */
function firstLine(v) {
  return String(v || "").split("\n")[0].trim();
}

/** Free text: drop HTML comments and a trailing `---` footer, keep the rest. */
function prose(v) {
  let s = String(v || "").replace(/<!--[\s\S]*?-->/g, "");
  const cut = s.search(/\n-{3,}\s*\n[\s\S]*$/);
  if (cut !== -1) s = s.slice(0, cut);
  return s.trim();
}

/** Dropdown answers read like "Bug — something is broken or wrong". Take the head. */
function head(v) {
  return firstLine(v).split(/\s+[—–-]\s+/)[0].trim();
}

function typeFromForm(v) {
  const h = head(v).toLowerCase();
  if (h.startsWith("bug")) return "bug";
  if (h.startsWith("ui")) return "ux";
  if (h.startsWith("feature")) return "feature";
  if (h.startsWith("data")) return "data";
  if (h.startsWith("ai")) return "ai";
  if (h.startsWith("perf")) return "perf";
  return "bug";
}
function sevFromForm(v) {
  const h = head(v).toLowerCase();
  return SEVS.includes(h) ? h : "p2";
}
function slug(s) {
  return String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/* ------------------------------------------------------------ label reading */

function labelValue(labels, prefix) {
  for (const l of labels) {
    const n = typeof l === "string" ? l : l.name;
    if (n && n.toLowerCase().startsWith(prefix)) return n.slice(prefix.length).trim();
  }
  return null;
}

const AREA_BY_SLUG = {};
for (const a of [
  "Command Center", "Market Intelligence", "Agent Profile", "Agent Lineup", "Search & Filters",
  "Switch Risk", "Rookie Potential", "Coaching Cues", "MessageAI", "Alerts", "Office Performance",
  "Reports & Exports", "MLS Data Pipeline", "Home", "Sign-up", "Auth & Accounts", "Apps",
  "Admin Console", "Billing", "Onboarding",
]) AREA_BY_SLUG[slug(a)] = a;

/* --------------------------------------------------------------- conversion */

function toItem(issue) {
  const labels = issue.labels || [];
  const form = parseForm(issue.body);

  const type = labelValue(labels, "type:") || typeFromForm(form["what kind of thing is it?"]);
  const sev = labelValue(labels, "sev:") || sevFromForm(form["how bad is it?"]);

  const areaLabel = labelValue(labels, "area:");
  let area = areaLabel ? AREA_BY_SLUG[areaLabel] || areaLabel : head(form["which part of the platform?"]);
  if (area === "Not sure") area = "";

  let status = labelValue(labels, "status:") || "inbox";
  if (issue.state === "closed") status = "done";

  const env = head(form["staging or production?"]) || "";
  const title = String(issue.title || "").replace(/^\s*\[errata\]\s*/i, "").trim();

  return {
    ref: "#" + issue.number,
    number: issue.number,
    title,
    type: TYPES.includes(type) ? type : "bug",
    severity: SEVS.includes(sev) ? sev : "p2",
    status: STATUSES.includes(status) ? status : "inbox",
    area: area || "",
    environment: env,
    release: labelValue(labels, "release:") ? labelValue(labels, "release:").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "",
    owner: (issue.assignees && issue.assignees[0] && issue.assignees[0].login) || "",
    reporter: (issue.user && issue.user.login) || "",
    url: firstLine(form["where did you see it?"]),
    issue_url: issue.html_url || "",
    legacy_ref: (/<!--\s*legacy:(ERR-\d+)\s*-->/.exec(issue.body || "") || [])[1] || "",
    detail: prose(form["what happened?"]),
    comments: issue.comments || 0,
    created: issue.created_at || "",
    updated: issue.updated_at || "",
  };
}

/* ----------------------------------------------------------------- fetching */

function fetchIssues() {
  const fromArg = process.argv.find((a) => a.startsWith("--from="));
  if (fromArg) return JSON.parse(fs.readFileSync(fromArg.slice(7), "utf8"));

  const repo = process.env.GITHUB_REPOSITORY;
  const args = [
    "api",
    "--paginate",
    `repos/${repo || "{owner}/{repo}"}/issues?state=all&labels=errata&per_page=100`,
  ];
  let raw;
  try {
    raw = execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    console.error("errata-sync: could not reach GitHub. Is `gh` installed and authenticated?");
    console.error(String(e.stderr || e.message).trim());
    process.exit(1);
  }
  // --paginate concatenates JSON arrays; stitch them back together.
  return JSON.parse("[" + raw.trim().replace(/\]\s*\[/g, ",").replace(/^\[|\]$/g, "") + "]");
}

/* ------------------------------------------------------------------ ranking */

const SEV_ORDER = { p0: 0, p1: 1, p2: 2, p3: 3 };
const STATUS_ORDER = { progress: 0, review: 1, triaged: 2, inbox: 3, done: 4 };
function rank(a, b) {
  return (
    (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9) ||
    (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
    a.number - b.number
  );
}

/* -------------------------------------------------------------- BACKLOG.md */

function mdEsc(s) {
  return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderMd(doc) {
  const open = doc.items.filter((i) => i.status !== "done");
  const prod = open.filter((i) => i.environment === "Production");
  const hot = open.filter((i) => i.severity === "p0" || i.severity === "p1");
  const out = [];
  out.push("# Relitix errata backlog");
  out.push("");
  out.push("Generated from GitHub Issues by `scripts/errata-sync.mjs` — **do not edit by hand.**");
  out.push(`Last synced ${doc.generated}.`);
  out.push("");
  out.push(
    `**${open.length} open** · ${hot.length} at P0/P1 · ` +
      `${open.filter((i) => i.status === "progress" || i.status === "review").length} in flight · ` +
      `${prod.length} on production · ${doc.items.length - open.length} done`
  );
  out.push("");
  if (prod.length) {
    out.push("> **On production right now:** " + prod.map((i) => `[${i.ref}](${i.issue_url})`).join(", "));
    out.push("");
  }
  for (const st of STATUSES) {
    const list = doc.items.filter((i) => i.status === st).sort(rank);
    if (!list.length) continue;
    out.push(`## ${STATUS_NAME[st]} (${list.length})`);
    out.push("");
    out.push("| Ref | Sev | Title | Type | Area | Owner | Env | Screen |");
    out.push("| --- | --- | ----- | ---- | ---- | ----- | --- | ------ |");
    for (const i of list) {
      out.push(
        `| [${i.ref}](${i.issue_url}) | ${i.severity.toUpperCase()} | ${mdEsc(i.title)} | ` +
          `${TYPE_NAME[i.type]} | ${mdEsc(i.area)} | ${mdEsc(i.owner || "—")} | ` +
          `${i.environment === "Production" ? "**prod**" : mdEsc(i.environment)} | ` +
          `${i.url ? `[open](${i.url})` : ""} |`
      );
    }
    out.push("");
  }
  return out.join("\n") + "\n";
}

/* --------------------------------------------------------------------- main */

const issues = fetchIssues().filter((i) => !i.pull_request);
const items = issues.map(toItem).sort((a, b) => a.number - b.number);
const doc = {
  format: "relitix-errata/2",
  source: "github-issues",
  repository: process.env.GITHUB_REPOSITORY || "",
  generated: new Date().toISOString(),
  items,
};

if (process.argv.includes("--check")) {
  const problems = [];
  for (const i of items) {
    if (!i.title) problems.push(`${i.ref}: empty title`);
    if (!TYPES.includes(i.type)) problems.push(`${i.ref}: bad type ${i.type}`);
    if (!SEVS.includes(i.severity)) problems.push(`${i.ref}: bad severity ${i.severity}`);
    if (!STATUSES.includes(i.status)) problems.push(`${i.ref}: bad status ${i.status}`);
  }
  if (problems.length) {
    problems.forEach((p) => console.error("  " + p));
    process.exit(1);
  }
  console.log(`OK — ${items.length} item(s), no problems.`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(doc, null, 2) + "\n");
fs.writeFileSync(OUT_MD, renderMd(doc));
console.log(`errata-sync: ${items.length} issue(s) -> errata/backlog.json + errata/BACKLOG.md`);
