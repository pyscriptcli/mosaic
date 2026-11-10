# Decision records

Decision records preserve choices that should guide future changes. Keep each record short, factual, and linked to the code or documentation that supports it.

## When to add a record

Record a decision when repository evidence shows that a choice is settled and likely to affect future design or maintenance. A proposal, a plan that has not been implemented, or a temporary workaround is not by itself evidence of an accepted decision. Do not invent the original motivation. Write **Not documented** when the reason, date, or approver cannot be established.

## Format

Add one Markdown file per decision, named `NNNN-short-title.md`, with:

- Status: accepted, superseded, or under review
- Date: use the documented date, otherwise say `Not recorded`
- Context and evidence: concise description and links to repository evidence
- Decision: the specific rule future contributors should follow
- Rationale: only what the evidence supports; otherwise say `Not documented`
- Consequences: practical effects and follow-up, if known

Link superseding records to the earlier record. Update the status of the older record; do not silently rewrite the history. Keep active decisions listed below.

## Current records

- [0001 — Project Atlas snapshot source](0001-project-atlas-snapshot-source.md)
