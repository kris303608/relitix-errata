# Errata on GitHub — setup

Replaces the artifact board. Anyone who can see the repo files an item through a form and
it saves immediately. No copying, no pasting, nothing to lose.

Two audiences: **a developer does the install once** (below, ~15 minutes), then **Kris and
the testers just use it** (see the end).

---

## Install (one developer, once)

Copy these into the repo root and commit:

```
.github/ISSUE_TEMPLATE/errata.yml      the form people fill in
.github/ISSUE_TEMPLATE/config.yml      turns off blank issues
.github/workflows/errata-sync.yml      regenerates the backlog on every issue event
scripts/errata-sync.mjs                issues -> errata/backlog.json + BACKLOG.md
scripts/errata-labels.sh               creates the label scheme
scripts/errata-migrate.mjs             one-time import of the existing board items
.claude/skills/errata/SKILL.md         teaches Claude Code the workflow
.claude/commands/errata.md             the /errata command
```

### 1. Create the labels

```bash
chmod +x scripts/errata-labels.sh
./scripts/errata-labels.sh
```

Idempotent — safe to re-run when you add an area.

### 2. Let the workflow write

**Settings → Actions → General → Workflow permissions** → *Read and write permissions*.
Without this the sync runs but can't commit the regenerated files.

### 3. Bring the existing items over

Export from the board (**Data → Copy backlog.json**) into a file, then:

```bash
node scripts/errata-migrate.mjs board-export.json --dry-run   # check first
node scripts/errata-migrate.mjs board-export.json             # create them
node scripts/errata-sync.mjs                                  # build the backlog files
git add errata && git commit -m "errata: migrate board items to issues" && git push
```

Each issue keeps its old `ERR-###` in an HTML comment, so earlier references still resolve.
Re-running skips anything already migrated. Assignee names must be GitHub logins — anything
it can't match is created unassigned and logged.

### 4. Give the testers access

Everyone who files needs a GitHub account and read access to the repo. **Settings → 
Collaborators → Add people.** Read access is enough to open issues, and it's free.

This is the one genuine cost of the move: Adie and anyone else testing needs an account
they didn't need before.

### 5. Add the board view

**Projects → New project → Board**, add a view filtered to `label:errata`, and group by
the `status:*` label. Kris drags cards between columns; the labels change; the sync picks
it up. Add `sev`, `area`, and `release` as visible fields so the board reads like the old
one.

### 6. Point Claude Code at it

Add to the repo's `CLAUDE.md`:

```md
Errata backlog lives in GitHub Issues (label `errata`), mirrored to `errata/backlog.json`.
See the `errata` skill before working any errata issue. Put `#<number>` in the commit and
PR title, and `Fixes #<number>` in the PR body.
```

### 7. Check it works

File a test item through **Issues → New issue → Errata**. Within a minute or so the
workflow should commit an updated `errata/BACKLOG.md` with your item in it. Then close the
test issue and confirm it moves to Done on the next sync.

---

## Using it

**Testers** — Issues → New issue → *Errata — report something*. Fill the form, submit. Done.
It's saved. The only fields that matter are the screen URL and what happened; the dropdowns
are a best guess and get corrected at triage.

**Kris** — triage on the Projects board: set `sev:*`, `type:*`, `area:*`, `release:*` and
move the card. Everything you change is live for everyone immediately.

**Developers** — `/errata` for a readout, `/errata next` to pick up work, `/errata 41` to
read one. `Fixes #41` in the PR body closes it on merge.

---

## How it hangs together

Issues are the truth. The workflow regenerates `errata/backlog.json` (machine-readable, for
Claude Code) and `errata/BACKLOG.md` (human-readable, for a glance at `main`) on every
issue event, plus a daily run in case an event is missed.

A **label always beats the reporter's form answer** for severity, type, and area — reporters
guess, the PM decides. Status comes from the `status:*` label, except a closed issue which
is always Done.

Items filed against **production** are flagged separately at the top of `BACKLOG.md` and
ranked above staging work of the same severity.
