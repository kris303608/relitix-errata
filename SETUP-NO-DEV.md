# Setting this up yourself

No terminal, no developer, no access to the code repo. Everything below happens on the
GitHub website. About 30 minutes, once.

You'll make **your own repository** for errata. It doesn't need to be the same one your
code lives in — issues work perfectly well in a repo of their own, and your devs can read
them from theirs. Moving it into the main repo later is a menu option, not a migration.

---

## 1. Get a GitHub account — 2 min

[github.com/signup](https://github.com/signup). Free. Use your work email.

## 2. Make the repository — 2 min

Top right **+** → **New repository**.

- **Name:** `relitix-errata`
- **Private** (it names staging URLs and internal problems)
- Tick **Add a README file**
- **Create repository**

## 3. Add the files — 15 min

This is the tedious part. For each file below: **Add file → Create new file**, type the
**whole path including slashes** into the name box — GitHub makes the folders for you —
then paste the contents from the zip and click **Commit changes**.

Do these five first. They're all you need to start:

| Type this as the file name | Paste the contents of |
| --- | --- |
| `.github/ISSUE_TEMPLATE/errata.yml` | the same file in the zip |
| `.github/ISSUE_TEMPLATE/config.yml` | same |
| `.github/workflows/errata-setup.yml` | same |
| `.github/workflows/errata-sync.yml` | same |
| `scripts/errata-sync.mjs` | same |

Two more only if you want to bring the 15 existing board items across:

| `.github/workflows/errata-import.yml` | same |
| `scripts/errata-migrate.mjs` | same |

And two that only matter once developers are involved — skip for now:

| `.claude/skills/errata/SKILL.md` | same |
| `.claude/commands/errata.md` | same |

> The leading dot in `.github` is deliberate. GitHub only looks in that exact folder.

## 4. Let the robot write — 1 min

**Settings → Actions → General**, scroll to **Workflow permissions**, choose
**Read and write permissions**, **Save**.

Without this the sync runs but can't save its results.

## 5. Create the labels — 1 min

**Actions** tab → **Errata setup — create labels** in the left sidebar → **Run workflow**
→ **Run workflow**.

Wait for the green tick. Check **Issues → Labels** — you should see about forty.

## 6. File a test item — 2 min

**Issues → New issue → Errata — report something.** Fill it in with anything. Submit.

Within a minute or two, **Actions** should show a second run that committed an updated
`errata/BACKLOG.md`. Open that file and confirm your test item is in the table.

**That's the whole thing working.** Close the test issue when you're satisfied.

## 7. Bring the old items over — 5 min, optional

In the artifact board: **Data → Copy backlog.json**.

In GitHub: **Add file → Create new file**, name it `errata/board-export.json`, paste,
commit.

**Actions → Errata import → Run workflow.** Leave **dry run** ticked the first time — it
lists what it would create without creating anything. Read the list, then run it again
with dry run **unticked**.

Assignee names have to be GitHub usernames. Anything it can't match gets created
unassigned and says so — set the owner by hand afterwards.

## 8. Invite Adie — 2 min

**Settings → Collaborators → Add people.** She needs a free GitHub account; **Read**
access is enough to file issues.

## 9. Make yourself a board — 5 min

**Projects → New project → Board.** Add a view filtered to `label:errata`, group by the
`status:` label, and show `sev`, `area`, and `release` as fields.

Drag cards between columns to change status. That's your triage pass, same as before.

---

## What to tell Adie

> New place for errata — it saves properly this time, no copying anything to me.
>
> 1. Make a free GitHub account if you don't have one, and accept my invite
> 2. Go to the repo → **Issues** → **New issue** → **Errata — report something**
> 3. Fill it in and submit. That's it — it's saved the moment you hit the button.
>
> The two fields that matter are the screen URL and what happened. The dropdowns are a
> best guess; I fix those during triage. One item per report.

---

## What your devs do later

Nothing urgent. When they're ready, they add the two `.claude/` files to **their** repo
and point the skill at this one. Claude Code reads issues across repos, so the backlog
being in a separate repo costs them nothing.

If you'd rather it all live in the code repo eventually, GitHub can transfer issues
between repos one at a time, or a dev can move the whole setup in ten minutes.

---

## If something doesn't work

**The setup workflow failed** — almost always step 4. Check Workflow permissions is on
*Read and write*, then re-run it from the Actions tab.

**An item was filed but `BACKLOG.md` didn't change** — open Actions and look at the most
recent *Errata sync* run. The log says what it did. You can always re-run it by hand.

**The form doesn't appear under New issue** — the file has to be at exactly
`.github/ISSUE_TEMPLATE/errata.yml`. Check the spelling and the leading dot.

**Everything looks right but nothing runs** — Actions may be disabled on a new private
repo. **Settings → Actions → General → Allow all actions**.
