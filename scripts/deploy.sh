#!/usr/bin/env bash
#
# Deploy SlipGuard to a Stellar network in dependency order.
#
# Two modes, chosen by whether you name Stellar assets:
#
#   SAC mode (default for real deployments)
#     SELL_ASSET / BUY_ASSET resolve to Stellar Asset Contracts with
#     `stellar contract asset deploy`. Use "native" for XLM, or CODE:ISSUER for
#     an issued asset. The router settles against the contracts that already
#     hold those assets.
#
#   Mock mode (test only)
#     With no asset selectors set, the script deploys two SEP-41 MockToken
#     instances from this repository. They are not real Stellar assets.
#
# In both modes the router is deployed, initialized with an admin, and every
# contract id is printed and written to a network-scoped env file.
#
# Usage:
#   SELL_ASSET=native BUY_ASSET=USDC:G... ./scripts/deploy.sh
#   DEPLOY_MOCK_TOKENS=true ./scripts/deploy.sh          # offline / test only
#   DRY_RUN=true ./scripts/deploy.sh                     # print the plan
#
# Environment:
#   NETWORK               Stellar network name understood by the CLI (default: testnet)
#   SOURCE                CLI key name or secret to sign with (default: slipguard-deployer)
#   ADMIN_ADDRESS         Router admin. Defaults to SOURCE's address.
#   SELL_ASSET            Stellar asset for the sell side: "native" or CODE:ISSUER
#   BUY_ASSET             Stellar asset for the buy side: "native" or CODE:ISSUER
#   DEPLOY_MOCK_TOKENS     Deploy SEP-41 demo tokens when no assets are named (default: true)
#   WASM_DIR              Directory holding the built WASM (default: target/wasm32v1-none/release)
#   OUT_FILE              Where to write the resolved ids (default: .deploy/contracts.<network>.env)
#   SEED_DEMO             Mint demo balances for SEED_ADDRESS (mock mode only, default: false)
#   SEED_ADDRESS          Account to receive demo balances
#   SEED_AMOUNT           Demo balance per token (default: 1000000000)
#   DRY_RUN               Print commands without executing them (default: false)
#
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
SOURCE="${SOURCE:-slipguard-deployer}"
WASM_DIR="${WASM_DIR:-target/wasm32v1-none/release}"
OUT_FILE="${OUT_FILE:-}"
SELL_ASSET="${SELL_ASSET:-}"
BUY_ASSET="${BUY_ASSET:-}"
SEED_DEMO="${SEED_DEMO:-false}"
SEED_ADDRESS="${SEED_ADDRESS:-}"
SEED_AMOUNT="${SEED_AMOUNT:-1000000000}"
DRY_RUN="${DRY_RUN:-false}"

OUT_FILE="${OUT_FILE:-.deploy/contracts.${NETWORK}.env}"

# SAC mode is chosen as soon as either asset selector is set. Requiring both
# keeps the deployment symmetric: a router pair with one real asset and one mock
# token is almost never what you want.
if [[ -n "$SELL_ASSET" || -n "$BUY_ASSET" ]]; then
  SAC_MODE=true
  DEPLOY_MOCK_TOKENS="false"
else
  SAC_MODE=false
  DEPLOY_MOCK_TOKENS="${DEPLOY_MOCK_TOKENS:-true}"
fi

log() { printf '\033[1m==>\033[0m %s\n' "$*"; }
fail() {
  printf '\033[31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '  [dry-run] %s\n' "$*"
    return 0
  fi
  "$@"
}

# Capture stdout only, so CLI logging on stderr stays visible.
capture() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf 'DRY_RUN_%s' "$RANDOM"
    return 0
  fi
  "$@"
}

require_tools() {
  if [[ "$DRY_RUN" == "true" ]]; then
    command -v stellar >/dev/null 2>&1 ||
      printf 'warning: stellar CLI not found, continuing because DRY_RUN=true\n' >&2
    return 0
  fi
  command -v stellar >/dev/null 2>&1 ||
    fail "the 'stellar' CLI is not on PATH. Install it from https://github.com/stellar/stellar-cli"
}

check_wasm() {
  local artifacts=(slipguard_router)
  if [[ "$DEPLOY_MOCK_TOKENS" == "true" ]]; then
    artifacts+=(slipguard_mock_token)
  fi

  local missing=0
  for artifact in "${artifacts[@]}"; do
    if [[ ! -f "$WASM_DIR/$artifact.wasm" ]]; then
      printf 'missing: %s\n' "$WASM_DIR/$artifact.wasm" >&2
      missing=1
    fi
  done
  if [[ "$missing" -eq 1 ]]; then
    fail "run 'pnpm build:contracts' first (or set WASM_DIR)"
  fi
}

deploy() {
  local wasm="$1" alias="$2"
  capture stellar contract deploy \
    --wasm "$wasm" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    --alias "$alias"
}

# Resolves a Stellar asset to the id of its Stellar Asset Contract.
deploy_asset_contract() {
  local asset="$1" alias="$2"
  capture stellar contract asset deploy \
    --asset "$asset" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    --alias "$alias"
}

invoke() {
  local id="$1"
  shift
  run stellar contract invoke \
    --id "$id" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- "$@"
}

main() {
  require_tools
  log "network:  $NETWORK"
  log "source:   $SOURCE"
  log "wasm dir: $WASM_DIR"

  if [[ "$SAC_MODE" == "true" ]]; then
    [[ -n "$SELL_ASSET" && -n "$BUY_ASSET" ]] ||
      fail "set SELL_ASSET and BUY_ASSET together, or neither (mock mode)"
    log "assets:   SAC (sell: $SELL_ASSET, buy: $BUY_ASSET)"
  else
    log "assets:   SEP-41 demo tokens (test only)"
  fi

  if [[ "$DRY_RUN" != "true" ]]; then
    check_wasm
  fi

  if [[ -z "${ADMIN_ADDRESS:-}" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      ADMIN_ADDRESS="GDRY_RUN_ADMIN"
    else
      ADMIN_ADDRESS="$(stellar keys address "$SOURCE")"
    fi
  fi
  log "admin:    $ADMIN_ADDRESS"

  # 1. Router. Deployed first because everything else references it.
  log "deploying slipguard_router"
  ROUTER_ID="$(deploy "$WASM_DIR/slipguard_router.wasm" slipguard-router)"

  # 2. Initialize the router exactly once, with the admin as the sole signer.
  log "initializing router"
  invoke "$ROUTER_ID" init --admin "$ADMIN_ADDRESS"

  SELL_TOKEN_ID=""
  BUY_TOKEN_ID=""
  if [[ "$SAC_MODE" == "true" ]]; then
    # 3a. Stellar Asset Contracts for the pair. `contract asset deploy` is
    # idempotent: it returns the existing SAC id when the asset already has one.
    log "resolving sell Stellar Asset Contract ($SELL_ASSET)"
    SELL_TOKEN_ID="$(deploy_asset_contract "$SELL_ASSET" slipguard-sell-sac)"

    log "resolving buy Stellar Asset Contract ($BUY_ASSET)"
    BUY_TOKEN_ID="$(deploy_asset_contract "$BUY_ASSET" slipguard-buy-sac)"
  elif [[ "$DEPLOY_MOCK_TOKENS" == "true" ]]; then
    # 3b. Test-only SEP-41 tokens, for sandboxes with no real assets.
    log "deploying demo XLM token"
    SELL_TOKEN_ID="$(deploy "$WASM_DIR/slipguard_mock_token.wasm" slipguard-demo-xlm)"
    invoke "$SELL_TOKEN_ID" initialize \
      --admin "$ADMIN_ADDRESS" \
      --decimals 7 \
      --name "SlipGuard Demo XLM" \
      --symbol XLM

    log "deploying demo USDC token"
    BUY_TOKEN_ID="$(deploy "$WASM_DIR/slipguard_mock_token.wasm" slipguard-demo-usdc)"
    invoke "$BUY_TOKEN_ID" initialize \
      --admin "$ADMIN_ADDRESS" \
      --decimals 6 \
      --name "SlipGuard Demo USDC" \
      --symbol USDC

    if [[ "$SEED_DEMO" == "true" ]]; then
      [[ -n "$SEED_ADDRESS" ]] || fail "SEED_DEMO=true requires SEED_ADDRESS"
      log "minting demo balances for $SEED_ADDRESS"
      invoke "$SELL_TOKEN_ID" mint --to "$SEED_ADDRESS" --amount "$SEED_AMOUNT"
      invoke "$BUY_TOKEN_ID" mint --to "$SEED_ADDRESS" --amount "$SEED_AMOUNT"
    fi
  fi

  # 4. Persist the resolved ids for the app layer.
  if [[ "$DRY_RUN" != "true" ]]; then
    mkdir -p "$(dirname "$OUT_FILE")"
    {
      printf '# Generated by scripts/deploy.sh on %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      printf 'STELLAR_NETWORK=%s\n' "$NETWORK"
      printf 'ROUTER_CONTRACT_ID=%s\n' "$ROUTER_ID"
      printf 'SELL_TOKEN_CONTRACT_ID=%s\n' "$SELL_TOKEN_ID"
      printf 'BUY_TOKEN_CONTRACT_ID=%s\n' "$BUY_TOKEN_ID"
      printf 'ADMIN_ADDRESS=%s\n' "$ADMIN_ADDRESS"
      if [[ "$SAC_MODE" == "true" ]]; then
        printf 'SELL_ASSET=%s\n' "$SELL_ASSET"
        printf 'BUY_ASSET=%s\n' "$BUY_ASSET"
      fi
    } >"$OUT_FILE"
    log "wrote $OUT_FILE"
  fi

  printf '\n'
  printf '================================================================\n'
  printf ' SlipGuard deployment summary (%s)\n' "$NETWORK"
  printf '================================================================\n'
  printf 'ROUTER_CONTRACT_ID=%s\n' "$ROUTER_ID"
  if [[ "$SAC_MODE" == "true" ]]; then
    printf 'SELL_ASSET=%s\n' "$SELL_ASSET"
    printf 'BUY_ASSET=%s\n' "$BUY_ASSET"
  fi
  printf 'SELL_TOKEN_CONTRACT_ID=%s\n' "$SELL_TOKEN_ID"
  printf 'BUY_TOKEN_CONTRACT_ID=%s\n' "$BUY_TOKEN_ID"
  printf 'ADMIN_ADDRESS=%s\n' "$ADMIN_ADDRESS"
  printf '================================================================\n'
  printf '\nNext steps:\n'
  printf '  1. Point the solver at the router:\n'
  printf '       ROUTER_CONTRACT_ID=%s\n' "$ROUTER_ID"
  printf '  2. Verify the deployment on Stellar:\n'
  printf '       stellar contract invoke --id %s --network %s -- get_admin\n' "$ROUTER_ID" "$NETWORK"
  printf '  3. Query the explorer:\n'
  printf '       https://stellar.expert/explorer/%s/contract/%s\n' "$NETWORK" "$ROUTER_ID"
  if [[ "$SAC_MODE" != "true" ]]; then
    printf '\n'
    printf 'Note: the two token ids above are MockToken instances, not Stellar\n'
    printf 'assets. Re-run with SELL_ASSET and BUY_ASSET to settle against Stellar\n'
    printf 'Asset Contracts.\n'
  fi
  printf '\n'
}

main "$@"
