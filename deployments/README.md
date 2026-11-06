# Deployments

Stellar contract addresses produced by `scripts/deploy.sh`, checked in so that
reviewers and integrators can point at a live testnet deployment without running
one themselves. Each record pins the network passphrase and Stellar RPC endpoint
it was deployed against, because a contract id is only meaningful on one network.

| Network | File | Router |
| --- | --- | --- |
| Testnet | [`testnet.json`](./testnet.json) | `CBNWLNZKYA2FASRFVURBBX4JGHXJAZGJAKCKANB4MQGIKI7NXBFB5HON` |

## Testnet

```env
STELLAR_NETWORK=testnet
ROUTER_CONTRACT_ID=CBNWLNZKYA2FASRFVURBBX4JGHXJAZGJAKCKANB4MQGIKI7NXBFB5HON
SELL_TOKEN_CONTRACT_ID=CBW2W4NQ4IY23DH4NCB2YZBNKLWNQPDR53HDBYHM256BLXQZ5ZLR5MFM
BUY_TOKEN_CONTRACT_ID=CB37MCA7VBKY3WFBK2SXLJROT2HTSL4HK4HSX62PT6A5SWVDFYJ2K7PB
ADMIN_ADDRESS=GBBCRFFACYJAJDPV4MGVRSDYSDZKL5AAI3FG2KB454OPWNENWLMN5LB3
```

Explorer: <https://stellar.expert/explorer/testnet/contract/CBNWLNZKYA2FASRFVURBBX4JGHXJAZGJAKCKANB4MQGIKI7NXBFB5HON>

Verify the deployment yourself:

```bash
stellar contract invoke \
  --id CBNWLNZKYA2FASRFVURBBX4JGHXJAZGJAKCKANB4MQGIKI7NXBFB5HON \
  --network testnet -- get_admin
```

It returns `GBBCRFFACYJAJDPV4MGVRSDYSDZKL5AAI3FG2KB454OPWNENWLMN5LB3`.

The two demo tokens are `MockToken` instances, a local SEP-41 implementation
initialized by the deploy script. They are not real Stellar assets and hold no
value. A production deployment passes `SELL_ASSET` and `BUY_ASSET` to
`scripts/deploy.sh` instead, which resolves the real Stellar Asset Contract for
each asset with `stellar contract asset deploy`.

The router is **unaudited**; see [SECURITY.md](../SECURITY.md).

## Regenerating

`scripts/deploy.sh` creates a new deployment on every run and rewrites the
network-scoped `.env` under `.deploy/`. If you deploy again, update the record
here and in the matching release notes so the checked-in addresses stay current.

```bash
SELL_ASSET=native BUY_ASSET="USDC:<issuer>" ./scripts/deploy.sh
```

Then re-run the verification invoke above against the new router id.
