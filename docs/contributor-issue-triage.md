# Contributor Issue Triage Guide

This guide explains how an issue moves from "someone opened it" to a
reproducible, owned, and appropriately prioritised work item — and when it is
closed as stale, duplicate, or out of scope. It applies to every issue in the
`Happybello365/innov8` repository, across the contract, backend, frontend,
mobile, infrastructure, and documentation stacks.

The machine-readable definitions live in
[`.github/issue-triage-policy.json`](../.github/issue-triage-policy.json).
`node scripts/validate-issue-triage-policy.mjs` checks that the policy is
structurally valid and that every configured label is documented here. The
`Validate issue triage policy` CI job runs the same check on every pull request
so labels, severity targets, and stale rules cannot drift from this guide.

Triage is a shared maintenance duty, not a gate that contributors have to fight
through. Clear labels and response targets help contributors decide what to
work on without waiting for a maintainer to explain the whole backlog.

## Scope

In scope:

- Classifying and prioritising issues.
- Assigning an accountable area owner.
- Setting response and update expectations.
- Keeping the backlog free of abandoned, duplicate, or unactionable issues.

Out of scope:

- Security vulnerability handling. Report vulnerabilities privately through
  [SECURITY.md](../SECURITY.md), never in a public issue.
- Pull request review policy. See the
  [branch protection policy](./branch-protection-policy.md) and the repository
  pull request template.
- Product roadmap commitments. A severity label describes impact, not a promise
  that work ships in a particular release.

## Ownership

Triage ownership is organised by area so every issue has one accountable role.
When `.github/CODEOWNERS` is added, it must mirror this table; until then the
roles below are the source of truth for routing.

| Area | Label | Accountable role | Paths |
|---|---|---|---|
| Smart contracts | `area:contracts` | Contracts maintainer | `contracts/**` |
| Backend/API | `area:backend` | Backend maintainer | `backend/**` |
| Web frontend | `area:frontend` | Frontend maintainer | `frontend/**` |
| Mobile | `area:mobile` | Mobile maintainer | `mobile/**` |
| Infrastructure and CI | `area:infra` | Infrastructure maintainer | `infra/**`, `.github/workflows/**`, `scripts/**` |
| Documentation | `documentation` | Documentation maintainer | `docs/**`, `README.md`, `SECURITY.md` |

### Roles and responsibilities

| Role | Responsibilities |
|---|---|
| **Triage lead** (weekly rotation among maintainers) | Applies `needs-triage`, assigns type/area/severity, routes to an area owner, runs the stale sweep, and records escalations. |
| **Area owner** | Confirms or rejects the reproduction, adds `confirmed`, breaks down the work, and owns status updates within the response targets. |
| **Repository maintainer** | Resolves severity disputes, approves scope changes, handles `blocked` decisions, and owns final closure decisions. |
| **Reporter** | Provides a minimal reproduction, environment/version, expected vs actual behaviour, and any logs with secrets and PII removed. |
| **Contributor** | Claims an issue in a comment, waits for assignment, and links the pull request with `Closes #<issue>`. |

The triage lead must not assign an issue to an external contributor until the
area owner has confirmed the reproduction and scope. This prevents two people
from building the same fix and prevents work on an issue that is actually a
duplicate or a support question.

### Escalation

1. Area owner cannot reproduce or scope the issue → apply `needs-info` and ask
   the reporter for the missing detail.
2. Area owner and reporter disagree on severity → triage lead decides using the
   severity matrix below; the repository maintainer breaks ties.
3. Work is waiting on another team, release, or decision → apply `blocked` and
   link the dependency. `blocked` must name what would unblock it.
4. A public issue contains a vulnerability, credential, private key, personal
   data, or production customer data → do not discuss it in the issue. Redact
   the sensitive content, tell the reporter to use
   [private vulnerability reporting](../SECURITY.md), rotate exposed
   credentials, and notify the repository maintainers.

## Labels

Every triaged issue should have exactly one type, one area (when the affected
stack is known), one severity, and one status label. Contributor and resolution
labels are added only when they apply. Labels never replace a written
explanation of the decision.

### Type — what kind of work is this?

| Label | Use when |
|---|---|
| `bug` | Existing behaviour is broken or incorrect. |
| `enhancement` | A new capability, improvement, or refactor is requested. |
| `documentation` | Docs, runbooks, comments, or contributor guidance need work. |
| `question` | The reporter needs an answer rather than a code change. Convert to a bug or enhancement once the answer reveals work. |
| `security` | Non-sensitive security hardening or a concern that is safe to discuss publicly. Vulnerabilities belong in the private channel. |
| `accessibility` | A barrier affecting people with disabilities, including keyboard, screen-reader, contrast, or motion issues. |

### Area — which stack owns the work?

| Label | Use when |
|---|---|
| `area:contracts` | Soroban contracts, storage, events, or contract tests. |
| `area:backend` | API routes, services, workers, database, or backend tests. |
| `area:frontend` | Web UI, client state, browser tests, or web build. |
| `area:mobile` | React Native screens, mobile builds, or device-specific behaviour. |
| `area:infra` | Deployment, Terraform, CI workflows, repository tooling, or observability configuration. |

Documentation issues use the `documentation` type label instead of a separate
area label. If an issue spans stacks, apply the label for the stack that must
change first and mention the other stacks in the issue body.

### Severity — how much does it hurt?

| Label | Definition | Typical examples |
|---|---|---|
| `severity:critical` | Fund loss, data loss, active exploit, or a total outage of the escrow journey. | Escrow funds can be drained; deposits are accepted but never credited; production API is down. |
| `severity:high` | A core workflow is broken or blocked with no reasonable workaround. | Release cannot be completed; users cannot withdraw; contract upgrade path is blocked. |
| `severity:medium` | Degraded behaviour with a documented workaround, or a contained correctness bug. | A dashboard total is wrong but can be recomputed; one non-critical route fails. |
| `severity:low` | Documentation, cosmetic, developer-experience, or low-impact request. | Typo, unclear error message, missing example, minor UI polish. |

Severity is about impact and urgency, not effort. A one-line fix can be
`severity:critical`; a large refactor can be `severity:low`. When in doubt,
triage high and let the area owner downgrade with a comment explaining why.

### Status — where is it in the workflow?

| Label | Meaning |
|---|---|
| `needs-triage` | Newly opened and not yet classified. The triage lead owns removal of this label. |
| `needs-info` | Waiting on the reporter. The issue is paused, not rejected. |
| `confirmed` | A maintainer reproduced or validated the issue and scope is agreed. |
| `blocked` | Waiting on a linked dependency or maintainer decision; the blocker must be named. |
| `stale` | No recent activity and scheduled for closure. See [stale-issue handling](#stale-issue-handling). |

### Contributor and resolution labels

| Label | Meaning |
|---|---|
| `good first issue` | Small, well-scoped, and safe for a first-time contributor. Must include file pointers and a test expectation. |
| `help wanted` | Maintainers want external help but the issue is not necessarily beginner-friendly. |
| `Stellar Wave` | Issue is part of the Stellar Wave program. Keep its due date and programme rules visible in the issue. |
| `duplicate` | Another issue or pull request already tracks the work. Link the canonical item before closing. |
| `invalid` | The report is not reproducible, is not about this repository, or is based on a misunderstanding. Explain why. |
| `wontfix` | The team has decided not to do the work. Record the rationale and any accepted alternative. |

Resolution labels are mutually exclusive. Closing as `duplicate`, `invalid`, or
`wontfix` requires a comment with the reason and, for duplicates, a link to the
canonical issue. Security reports must never be closed publicly as `invalid`
without first moving the discussion to the private channel.

### Changing the label set

The policy file is the reviewable definition; it does not create labels through
the GitHub API. When a label is added, renamed, or recoloured:

1. Update `.github/issue-triage-policy.json` and the tables in this guide in the
   same pull request.
2. Run `node scripts/validate-issue-triage-policy.mjs` locally.
3. A maintainer applies the matching name, colour, and description in
   **Settings → Labels** after the pull request merges. Until that is done, the
   label exists in the policy but cannot be applied to an issue.
4. Do not delete a label that is still applied to open issues. Rename it in
   GitHub first, or migrate the affected issues, then remove the old entry.

## Expected response times

Response targets are measured in **business hours**: Monday–Friday,
09:00–17:00 UTC, excluding published holidays. They are targets, not guarantees.
An issue that misses a target should receive an honest update rather than
silence.

| Severity | First human response | Triage complete | Status update cadence | Target resolution |
|---|---|---|---|---|
| `severity:critical` | 4 business hours | 1 business day | Every 24 hours while open | 3 calendar days |
| `severity:high` | 8 business hours | 2 business days | Every 2 calendar days | 7 calendar days |
| `severity:medium` | 16 business hours (2 business days) | 5 business days | Every 7 calendar days | 30 calendar days |
| `severity:low` | 24 business hours (3 business days) | 10 business days | Every 14 calendar days | 90 calendar days |

Rules for applying the table:

- The first response must be a human response that acknowledges the report and
  states the next step. An automated label or bot comment does not count.
- Triage complete means the issue has type, area, severity, status, and an
  accountable area owner.
- Target resolution may be extended once, with a comment naming the new date
  and the reason. Repeated extensions are an escalation to the repository
  maintainer.
- `blocked` issues are exempt from the resolution target but not from the update
  cadence. The owner must still comment when the blocker changes.
- Security vulnerabilities follow the response times in
  [SECURITY.md](../SECURITY.md), not this table, and are not labelled or
  discussed publicly before coordinated disclosure.
- `question` issues are answered, then closed when the reporter confirms the
  answer. They do not need a resolution target.

## Triage workflow

1. **Intake.** A new issue should receive `needs-triage` within one business day.
   Do not add severity before reading the report.
2. **Safety check.** If the issue contains a secret, private key, wallet seed,
   personal data, or exploit detail, stop public triage immediately and follow
   the escalation path above.
3. **Duplicate search.** Search open and closed issues and pull requests for the
   same symptom. If a canonical item exists, link it and close as `duplicate`.
4. **Reproduce.** The area owner follows the report using the smallest relevant
   stack command from the README. Record the commit, environment, and result. If
   detail is missing, apply `needs-info` and ask specific questions.
5. **Classify.** Add one type, one area, one severity, and the appropriate
   status. Remove `needs-triage`. Add `confirmed` once reproduction succeeds.
6. **Assign.** Assign the area owner or an accepted contributor. Contributors
   should comment before starting and wait for assignment, especially for
   `Stellar Wave` work.
7. **Track.** Keep the status label current and post updates at the cadence in
   the table. Link the pull request with `Closes #<issue>` so closure is
   automatic and auditable.
8. **Close.** Use a resolution label plus a comment for duplicates, invalid, and
   wontfix. Otherwise close only after the fix is merged, the answer is
   confirmed, or the stale policy below is satisfied.

### Triage checklist

- [ ] No secrets, private keys, PII, or exploit details are visible.
- [ ] Duplicate search completed and linked where applicable.
- [ ] Reproduction steps are sufficient for a different maintainer to follow.
- [ ] Exactly one type, area, severity, and status label applied.
- [ ] Area owner assigned and `needs-triage` removed.
- [ ] Response target met or an update posted explaining the delay.
- [ ] For `good first issue`, file pointers and a test expectation are present.
- [ ] For `Stellar Wave`, the programme due date and rules are visible.

## Stale-issue handling

Stale handling keeps the backlog honest without closing work that is still
wanted. It applies to issues, not pull requests. The triage lead runs the sweep
weekly and records the result in the maintainer log or weekly update.

### Needs-information issues

1. After **14 days** with no response to a `needs-info` request, add `stale` and
   post one comment naming the missing information and the closure date.
2. If there is still no response **7 days later** (21 days total), close the
   issue as not planned. The reporter can reopen it with the requested detail.
3. A reply before closure removes `stale` and returns the issue to the area
   owner for triage. A reply after closure triggers a reopen and a fresh
   `needs-info` window; do not leave the reporter without an answer.

### Inactive issues

1. After **60 days** without a comment, assignment change, label change, or
   linked pull request, add `stale` and ask whether the issue is still wanted.
2. If there is no activity **14 days later** (74 days total), close the issue as
   not planned and explain how to reopen it.
3. Any meaningful activity before closure removes `stale` and resets the clock.
   A maintainer comment counts; a bot or reaction alone does not.

### Exemptions

Do not mark or close the following as stale:

- `security` issues, including any issue awaiting private coordination.
- `severity:critical` or `severity:high` issues.
- `blocked` issues with a named dependency.
- `good first issue`, `help wanted`, or `Stellar Wave` issues while the
  programme or contribution window is active.
- Issues with an open linked pull request or an assigned contributor who has
  posted an update within the stale window.

If an issue should be exempt but lacks the label, fix the label rather than
closing it. When in doubt, leave it open and ask the area owner.

### Stale comment template

```text
This issue has had no activity for <N> days. Is it still relevant?

- If yes: comment with the current status or remove the stale label.
- If no: it will be closed as not planned after <date>.
- If you need more time: say so and name a date.

This issue will not be closed if it is security-sensitive, high severity,
blocked on a named dependency, or part of an active Stellar Wave contribution.
```

## Edge cases and failure states

| Situation | Action |
|---|---|
| Report contains a credential or seed phrase | Redact it, rotate the credential, move the report to private disclosure, and do not quote the value in follow-up comments. |
| Reporter cannot share production logs | Ask for a minimal redacted reproduction or a local/testnet case. Never request customer data in a public issue. |
| Issue affects multiple stacks | Label the first stack that must change and name the other owners in the body; split into linked issues when the work can ship independently. |
| Severity is disputed | Apply the higher severity until the triage lead or maintainer records a decision with rationale. |
| Contributor stops responding | After the `needs-info` window, follow the stale process. Reassign only after confirming with the triage lead. |
| Duplicate is found after work started | Link the canonical issue, move useful reproduction details there, and close with `duplicate`. Do not discard working code without telling the contributor. |
| Feature request is out of scope | Explain the product boundary, apply `wontfix`, and point to the closest supported alternative or discussion channel. |
| Security report was opened publicly | Ask the reporter to use private reporting, redact sensitive details, and notify maintainers before any public labelling. |

## Metrics and review

The triage lead reports these monthly:

- Median time to first human response, by severity.
- Percentage of issues triaged within target.
- Number of issues closed as stale and reopened within 30 days.
- Duplicate and invalid closure rate.
- Count of `needs-triage` issues older than one business day.

A rising stale-close or reopen rate means the policy is closing work too
aggressively; adjust the windows in the policy and this guide together. A
falling first-response rate means triage coverage needs another maintainer in
the rotation. Record policy changes in the pull request description with the
reason and the validation output from
`node scripts/validate-issue-triage-policy.mjs`.

## References

- [Issue triage policy](../.github/issue-triage-policy.json) — machine-readable
  labels, severity targets, ownership, and stale thresholds.
- [Security policy](../SECURITY.md) — private vulnerability reporting and
  security response times.
- [Branch protection policy](./branch-protection-policy.md) — required CI gates
  and pull request rules.
- [Flaky tests policy](./flaky-tests-policy.md) — example of a policy backed by
  a validated registry and CI gate.
