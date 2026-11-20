# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in innov8, please report it responsibly.

- **Do not** open a public GitHub issue for security vulnerabilities.
- Email the maintainers at the address listed in the repository profile, or use GitHub's private vulnerability reporting feature.
- Include a clear description, reproduction steps, and the potential impact.
- We will acknowledge your report and work with you on a coordinated disclosure.

Please give us a reasonable amount of time to address the issue before any public disclosure.

## Handling Sensitive Data

Never commit secrets, private keys, API tokens, or personal data to the repository. Use the provided `.env.example` files as templates and keep real credentials in your local environment or a secrets manager.

---

# Dispute Participant Evidence Guide

This guide explains what evidence buyers, sellers, and drivers may submit when opening or responding to a dispute, the accepted formats, and how to submit it safely. It applies to the escrow dispute workflow reachable from the relevant order/dispute screens.

## Who can submit evidence

- **Buyers** — evidence that goods or services were not delivered as agreed, were damaged, or did not match the listing.
- **Sellers** — evidence that goods or services were delivered as agreed, or that the buyer's claim is inaccurate.
- **Drivers** — evidence about pickup, transit, and delivery conditions relevant to the dispute.

Only participants to the order may submit evidence for that order's dispute. Submissions from unrelated accounts are rejected.

## What evidence you may submit

- Photos of goods, packaging, labels, or delivery conditions.
- Delivery or pickup receipts and signed handover notes.
- Order, shipment, or tracking references already associated with the order.
- Written statements describing what happened, with dates and times.
- Chat or message excerpts that are directly relevant to the dispute.

## Accepted formats

- Images: JPG, PNG, or PDF.
- Documents: PDF or plain text.
- Keep each file reasonably small and clearly named (for example `delivery-photo-2024-05-01.jpg`).

## How to submit evidence

1. Open the order associated with the dispute.
2. Select the dispute and choose **Submit evidence**.
3. Add a short description and attach the relevant files.
4. Review your submission and confirm.

Submitted evidence is visible to the other participants and to dispute reviewers. Submit only what is necessary to support your case.

## What NOT to submit

To protect yourself and others, **do not** include:

- Passwords, private keys, seed phrases, API tokens, or wallet credentials.
- Full bank account, card, or payment credentials.
- Government ID numbers, full home addresses, or other personal data not needed for the dispute.
- Personal data about people who are not part of the dispute.

If you accidentally submit sensitive information, contact the maintainers immediately so it can be removed.

## Edge cases and failure states

- **Unsupported file type or oversized file** — the submission is rejected; convert or resize the file and try again.
- **Missing description** — a short description is required so reviewers understand the evidence.
- **Submission after the dispute window closes** — late evidence may not be accepted; check the dispute status before submitting.
- **Upload failure** — retry the submission; if it keeps failing, contact support and reference the order ID (never include credentials in the message).
- **Duplicate submissions** — submitting the same evidence again is unnecessary; update your statement instead.
