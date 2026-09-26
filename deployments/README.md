# Deployments

Contract addresses produced by `scripts/deploy.sh`, checked in so that reviewers
and integrators can point at a live deployment without running one themselves.

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

The two demo tokens are `MockToken` instances initialized by the deploy script.
They are not real assets and hold no value. The router is **unaudited**; see
[SECURITY.md](../SECURITY.md).

## Regenerating

`scripts/deploy.sh` creates a new deployment on every run and rewrites the
network-scoped `.env` under `.deploy/`. If you deploy again, update the record
here and in the matching release notes so the checked-in addresses stay current.
