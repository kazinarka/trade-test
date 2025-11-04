#!/usr/bin/env node
/*
  Minimal trade script for Boop.fun & Heaven

  Usage:
    npm run build
    node -r dotenv/config scripts/trade.js \
      --market BOOP_FUN \
      --direction buy \
      --mint <TOKEN_MINT> \
      --amount 0.1 \
      --slippage 5 \
      --private-key <BASE58> \
      [--priority-fee 0.001] \
      [--pool-address <ADDRESS>] \
      [--quote true] \
      [--estimate-fees true] \
      [--unit SOL|LAMPORTS] \
      [--dry-run true]

  Env:
    RPC_URL=... (optional)
*/

const { Keypair, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const { TradeTest } = require('../dist');
const { markets: Markets, swapDirection: SwapDirection } = require('../dist/helpers/constants');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

function parseBool(v) {
  if (v === undefined) return false;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

(async () => {
  try {
    const args = parseArgs(process.argv);
    const required = ['market', 'direction', 'mint', 'amount', 'slippage', 'private-key'];
    for (const r of required) {
      if (!(r in args)) throw new Error(`Missing required arg --${r}`);
    }

    const market = args['market'];
    const direction = args['direction'];
    const mint = new PublicKey(args['mint']);
    const amount = parseFloat(args['amount']);
    const slippage = parseFloat(args['slippage']);
    const priorityFeeSol = args['priority-fee'] ? parseFloat(args['priority-fee']) : 0;
    const poolAddress = args['pool-address'];
    const wantQuote = parseBool(args['quote']);
    const unit = (args['unit'] || 'SOL').toUpperCase();
    const wantEstimate = parseBool(args['estimate-fees']);
    const dryRun = parseBool(args['dry-run']);

    if (market !== Markets.BOOP_FUN && market !== Markets.HEAVEN) {
      throw new Error('market must be BOOP_FUN or HEAVEN');
    }

    const wallet = Keypair.fromSecretKey(bs58.decode(args['private-key']));
    const trade = new TradeTest(process.env.RPC_URL || undefined);

    // Optional: print price quote
    if (wantQuote) {
      try {
        const { price, bondingCurvePercent } = await trade.price({ market, mint, unit });
        console.log(JSON.stringify({ mode: 'price', market, mint: mint.toBase58(), unit, price, bondingCurvePercent }));
      } catch (e) {
        console.error('Price quote failed:', e?.message || e);
      }
    }

    // Optional: fee estimation
    if (wantEstimate) {
      try {
        const fees = await trade.estimateFees({ market, direction, wallet, mint, amount, slippage, priorityFeeSol });
        console.log(JSON.stringify({ mode: 'estimate-fees', market, direction, fees }));
      } catch (e) {
        console.error('Fee estimate failed:', e?.message || e);
      }
    }

    if (dryRun) {
      // Build but do not send
      if (direction === SwapDirection.BUY) {
        const tx = await trade.buy({ market, wallet, mint, amount, slippage, priorityFeeSol, poolAddress, send: false });
        console.log(JSON.stringify({ mode: 'dry-run', direction, built: !!tx, instructions: tx.instructions?.length ?? undefined }));
        return;
      }
      if (direction === SwapDirection.SELL) {
        const tx = await trade.sell({ market, wallet, mint, amount, slippage, priorityFeeSol, poolAddress, send: false });
        console.log(JSON.stringify({ mode: 'dry-run', direction, built: !!tx, instructions: tx.instructions?.length ?? undefined }));
        return;
      }
    }

    if (direction === SwapDirection.BUY) {
      const sig = await trade.buy({ market, wallet, mint, amount, slippage, priorityFeeSol, poolAddress });
      console.log(sig);
      return;
    }
    if (direction === SwapDirection.SELL) {
      const sig = await trade.sell({ market, wallet, mint, amount, slippage, priorityFeeSol, poolAddress });
      console.log(sig);
      return;
    }

    throw new Error(`Unsupported direction: ${direction}`);
  } catch (e) {
    console.error(e?.message || e);
    process.exit(1);
  }
})();
