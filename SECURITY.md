# Security Policy

## Audit status

**The SlipGuard contracts are unaudited.** They have not been deployed to
Stellar mainnet, and no third party has reviewed the Rust code. Treat every
contract in this repository as experimental. Do not move assets you cannot
afford to lose.

The TypeScript packages (`@slipguard/sdk`, `@slipguard/solver-bot`) are a
reference implementation. The solver bot handles a secret key; review it before
you run it against a funded account.

## Supported versions

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Pre-release tags | Best effort |
| Anything older | No |

## Scope

In scope:

- `contracts/router`: intent hashing, authorization, settlement, fee and
  slippage math, storage and TTL handling.
- `contracts/mock_token`: only as test infrastructure; it is never intended for
  deployment as a real asset.
- `packages/sdk`: intent validation, canonical encoding and hashing, and the
  RPC client.
- `packages/solver-bot`: profitability checks, authorization handling and key
  management.

Particularly interesting classes of issue:

- A fill that moves funds without both the solver's and the trader's
  authorization.
- A fill that bypasses the deadline, `min_buy_amount`, or `max_slippage_bps`
  check, including through rounding in the basis-point math.
- Replay of an intent through the nonce or the intent hash (for example, two
  distinct intents that collapse to the same hash).
- A way for the solver to make the trader receive less than the terms allow.
- Any mismatch between the SDK's `hashIntent` and the contract's
  `get_intent_hash`, which would break the assumption that the two agree.
- Key leakage or credential handling problems in the solver bot.

Out of scope:

- The absence of an audit (it is documented above).
- Issues in dependencies that are already publicly disclosed.
- Denial of service that requires the ability to fill the ledger with
  transactions.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting on this repository:

1. Go to the **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the affected file or entry point, the exact conditions required to
   trigger the issue, and a proof of concept or failing test if you have one.

If private reporting is unavailable, contact the maintainers through the
[@SlipGuard-HQ](https://github.com/SlipGuard-HQ) organization.

Please include:

- A description of the issue and its impact.
- Steps to reproduce, ideally as a failing test in `contracts/router/src/test.rs`.
- The commit or tag you tested against.
- Whether you intend to publish, and on what timeline.

## What to expect

- We will acknowledge your report within 72 hours.
- We will confirm or reject the finding, with reasoning, within 10 days.
- We will credit you in the release notes unless you ask us not to.
- Please give us 90 days before public disclosure, or less if we agree a fix has
  shipped and an advisory is published.

## Disclosure policy

We publish fixes and advisories together. A fix is not merged silently: the
release notes state what was affected, what changed, and which intent
parameters (if any) traders should re-issue.

## Safe harbour

We will not pursue legal action against researchers who report issues in good
faith, avoid privacy violations and data destruction, and give us a reasonable
window to fix the problem before disclosing it publicly.
