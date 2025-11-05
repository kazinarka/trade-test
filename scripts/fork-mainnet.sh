#!/usr/bin/env bash
# Launch a local validator that fetches accounts from mainnet on demand and
# pre-clones the programs/accounts we interact with.
#
# Usage:
#   chmod +x scripts/fork-mainnet.sh
#   MAINNET_RPC_URL=https://api.mainnet-beta.solana.com \
#   RPC_PORT=8899 \
#   LEDGER_DIR=.local-ledger \
#   ./scripts/fork-mainnet.sh
#
# After it starts, point your app to http://127.0.0.1:${RPC_PORT:-8899}

set -euo pipefail

MAINNET_RPC_URL="${MAINNET_RPC_URL:-https://api.mainnet-beta.solana.com}"
RPC_PORT="${RPC_PORT:-8899}"
LEDGER_DIR="${LEDGER_DIR:-.local-ledger}"

# Program IDs we need locally
HEAVEN_PID="HEAVENoP2qxoeuF8Dj2oT1GHEnu49U5mJYkdeC8BAX2o"
BOOP_PID="boop8hVGQGqehUK2iVEMEnMrL5RbjywRzHKBmBE7ry4"
SPL_TOKEN="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
ASSOCIATED_TOKEN="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLjaS"
WSOL_MINT="So11111111111111111111111111111111111111112"

PROGRAMS=("${HEAVEN_PID}" "${BOOP_PID}")
ALWAYS_CLONES=("${SPL_TOKEN}" "${ASSOCIATED_TOKEN}" "${WSOL_MINT}")

function programdata_of() {
  local pid="$1"
  # Parse ProgramData Address from CLI output
  solana -u "$MAINNET_RPC_URL" program show "$pid" 2>/dev/null | awk -F': ' '/ProgramData Address/{print $2}' || true
}

# Build clone args for validator
clone_args=()
for pid in "${PROGRAMS[@]}"; do
  clone_args+=(--clone "$pid")
  pdata="$(programdata_of "$pid")"
  if [[ -n "${pdata:-}" ]]; then
    clone_args+=(--clone "$pdata")
  fi
done
for acc in "${ALWAYS_CLONES[@]}"; do
  clone_args+=(--clone "$acc")
done

# Stop any running validator and reset ledger
pkill -f solana-test-validator || true
rm -rf "$LEDGER_DIR"
mkdir -p "$LEDGER_DIR"

echo "Starting solana-test-validator on port ${RPC_PORT}, sourcing accounts from ${MAINNET_RPC_URL}..."
solana-test-validator \
  --url "$MAINNET_RPC_URL" \
  --reset \
  --limit-ledger-size \
  --ledger "$LEDGER_DIR" \
  --rpc-port "$RPC_PORT" \
  "${clone_args[@]}"