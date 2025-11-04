# Basic Boop & Heaven Swap Script

Features:
- Buy/sell from on-chain Boop.fun and Heaven pools
- Pool address lookup (via PDAs or Heaven API)
- Token pair swap (WSOL <-> token)
- Slippage control
- Transaction confirmation (waits for confirmed)
 - Price quoting and fee estimation (programmatic)

## Programmatic usage

```ts
import { TradeTest } from './dist';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const trader = new TradeTest(process.env.RPC_URL);
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY_BASE58!));

// Buy 0.1 SOL worth on Boop.fun
await trader.buy({ market: 'BOOP_FUN', wallet, mint: 'TokenMint', amount: 0.1, slippage: 5 });

// Sell 1,000,000 tokens on Heaven
await trader.sell({ market: 'HEAVEN', wallet, mint: 'TokenMint', amount: 1_000_000, slippage: 3 });
```

## Price quoting and fee estimate

```ts
// Price quote (SOL)
const { price, bondingCurvePercent } = await trader.price({ market: 'BOOP_FUN', mint: 'TokenMint', unit: 'SOL' });

// Fee estimate for a buy
const fees = await trader.estimateFees({
	market: 'HEAVEN',
	direction: 'buy',
	wallet,
	mint: 'TokenMint',
	amount: 0.1,
	slippage: 5,
	priorityFeeSol: 0.001,
});
```

Env:
```env
RPC_URL=
```

Core files:
- `src/trader.ts` – buy/sell and confirmation
- `src/builder.ts` – buildTransaction (priority fee optional)
- `src/markets/boop-fun/client.ts` – Boop.fun instructions
- `src/markets/heaven-xyz/client.ts` – Heaven API to instructions

## Run a trade via script

```bash
npm run build
node -r dotenv/config scripts/trade.js \
	--market BOOP_FUN \
	--direction buy \
	--mint <TOKEN_MINT> \
	--amount 0.1 \
	--slippage 5 \
	--private-key <BASE58> \
	--priority-fee 0.001
```