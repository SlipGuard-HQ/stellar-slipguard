# 1. Introduction

## The problem with a market order

When you swap on an automated market maker, you do not get to name your price.
The price you receive is whatever the pool state says at the moment your
transaction is included. Your transaction sits in the queue with a maximum
slippage setting attached, and that setting is the worst price you agreed to
accept. It is a damage cap, not a protection. Any searcher who sees your
pending order can buy ahead of it, let your order move the pool, and sell behind
it. You get filled at your limit, the difference goes to the searcher, and
nothing in the protocol prevents it.

The opposite failure is a limit order. The price is fixed, but nothing
guarantees execution. Someone has to notice the order is fillable and pay to
submit the fill, and if that is not profitable they will not do it. A resting
order with no keeper is a wish.

SlipGuard addresses both. The trader's constraints live in the execution path,
so a fill that breaks them cannot settle. The keeper's compensation is part of
the order, so a solver has a reason to submit it.

## The intent model

A trader writes an order, signs it, and broadcasts it. Nothing is moved. The
order says, in machine-checkable terms:

- Which token is sold, and exactly how much of it.
- Which token is bought, and the minimum gross amount that must arrive.
- How far below that minimum the trader will tolerate, in basis points, after
  the solver's fee.
- The latest unix timestamp at which the order may settle.
- A single-use nonce.
- The solver's fee, in basis points of the fill.

Any solver can then fill it. On fill, four token movements happen in one
transaction:

1. The trader's `sell_token` goes to the solver.
2. The solver's `buy_token` goes to the router.
3. The router sends the trader their net proceeds.
4. The router sends the solver their fee.

The trader's funds never leave their wallet before a fill succeeds, and the
trader's own signature is required to move them. There is no escrow account, no
approval step, and no third party holding anything.

If the ledger timestamp is past the deadline, the fill reverts. If the solver
delivers less than the minimum, the fill reverts. If the solver's fee would push
the trader's net proceeds further below the minimum than their tolerance allows,
the fill reverts. In every case nothing is transferred and nothing is partially
settled.

## Why Stellar and Soroban

Four properties of the chain are load-bearing here, not decorative.

**Soroban checks authorization inside the contract.** `Address::require_auth()`
is enforced by the host when the contract asks for it, and the authorization
entry is bound to a specific invocation. `execute_intent` requires both the
solver and the trader to authorize it, and the trader's authorization covers the
exact token addresses, amounts, deadline and nonce. A trader can hand a
pre-signed authorization entry to a solver they do not trust, because that
solver cannot substitute a different fill amount without invalidating the
signature.

**Fees are not the bottleneck.** Stellar's base fee is 100 stroops, or 0.00001
XLM, per operation. Soroban adds a resource fee priced on the CPU instructions
and I/O the contract actually uses. A solver does not need a large spread to
make a submit worthwhile, which is what makes a small conditional order viable
instead of gas-dominated.

**Ledgers close in about five seconds.** A deadline in seconds is meaningful.
The gap between the trader signing an intent and a solver settling it is short
enough that the price the trader reasoned about is still roughly the price on
screen.

**Tokens are standard.** The router calls the SEP-41 token interface. That
covers the Stellar Asset Contract for XLM and issued assets, and any SEP-41
token deployed on Soroban, so the router does not need asset-specific code.

## What SlipGuard is not

- It is not a DEX. It does not hold liquidity and it does not price anything.
  The solver brings the other side of the trade.
- It is not an order book. There is no on-chain matching engine.
- It cannot guarantee a fill. It guarantees that any fill which happens obeys
  the trader's terms, and it removes the counterparty risk from the fill itself.
- It is not audited. See [SECURITY.md](../SECURITY.md).

Next: [Protocol mechanics](./02-protocol-mechanics.md).
