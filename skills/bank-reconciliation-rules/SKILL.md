---
display_title: Bank Reconciliation Rules
description: Heuristics for matching bank transactions to GL entries in a community hospital setting — sign conventions, timing windows, common bank batching patterns, and what counts as a true exception vs a posting delay.
---

# Bank Reconciliation Rules

Use this skill when reconciling bank transactions against the general ledger
for a community hospital or similar healthcare org. The user will give you
two streams: bank lines (from a Plaid feed or statement upload) and GL
lines (from the GL Detail table). Your job is to propose matches with a
confidence level, or flag exceptions.

## Sign conventions

- **Bank**: deposits are positive, withdrawals are negative.
- **GL on the cash account**: debits to cash (deposits) are positive,
  credits (withdrawals) are negative.
- Bank `+1,000` should match GL `-1,000` on the cash account in many
  ledgers, and `+1,000` on the contra account. Match on `|amount|`, then
  verify the sign convention is consistent across the batch.

## Timing windows

- ±2 days: same business day or one weekend hop — match without flagging.
- 3–5 days: normal posting lag for ACH or batched deposits — match with
  medium confidence and note the lag in the reason.
- 6+ days: flag as a timing exception unless the reference number matches
  exactly.

## Common patterns

| Pattern | What to look for |
|---|---|
| **Batched insurance payments** | One bank deposit (e.g. BCBS for $42,318.55) ⇄ many GL lines summing to that amount on the same posting date. Look up by amount, then by payor name in description/memo. |
| **Payroll** | Bank withdrawal hits 1–2 days after the GL accrual. Reference: payroll batch # or vendor name (Paychex, ADP, etc.). |
| **Bank fees** | Bank line exists, no GL entry. Propose a JE rather than flagging as a true exception. |
| **Reversed transactions** | Two bank lines: original posting and reversal, same amount opposite signs, within 1–3 days. Match both to the same GL line (or to net-zero). |
| **NSF returns** | Original deposit + a reversal a few days later. Both must be reconciled; the reversal usually has "RTN" / "NSF" / "RETURNED ITEM" in the description. |
| **Wire transfers** | Match on the wire reference number (usually 16+ alphanumeric chars) found in both bank and GL memo. |
| **Sweep accounts** | Daily transfers between operating and investment accounts. If both accounts are reconciled together they net to zero; otherwise treat as a regular transfer. |

## What's a true exception

Flag as `no_gl_match` only when:
- No GL line matches on amount within ±$0.01, **and**
- No reasonable description/reference link can be found within ±5 days, **and**
- It's not an obvious bank-only event (fee, interest, NSF return).

For bank-only events, prefer flagging `kind: "other"` with a recommendation
to post a journal entry, rather than marking it unreconciled.

## Confidence levels

- `high`: exact amount + reference/check# match, or exact amount + ≤2 days
  + strong description match.
- `medium`: exact amount + 3–5 days + reasonable description match, or
  amount-only with no conflicting candidates.
- `low`: amount matches but description is generic ("Deposit", "ACH
  CREDIT") and multiple candidates exist — surface for human review.

## When you're unsure

Always prefer `low` confidence or an exception flag over a high-confidence
guess. A reviewer can promote a `low` match to `high`; an incorrect `high`
match silently breaks the books.
