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

# Test suits
### Devnet Boop.fun buy dry-run
> node -r dotenv/config scripts/trade.js --rpc-url https://api.devnet.solana.com --market BOOP_FUN --direction buy --mint 14aNJ54sZsAhaeoKKMNSYQGMC47wETzYcKX5ePJSboop --amount 0.05 --slippage 5 --keypair ~/.config/solana/id.json --quote true --estimate-fees true --dry-run true

### Devnet Boop.fun sell dry-run
> node -r dotenv/config scripts/trade.js --rpc-url https://api.devnet.solana.com --market BOOP_FUN --direction sell --mint 14aNJ54sZsAhaeoKKMNSYQGMC47wETzYcKX5ePJSboop --amount 1000 --slippage 5 --keypair ~/.config/solana/id.json --quote true --estimate-fees true --dry-run true

### Devnet Boop.fun buy with priority fee
https://explorer.solana.com/tx/ANVacunaAT2JeARr555dExcH4isTzwc1fA7UJRFoSRx8td8yhFyDpoMfmotpe3ws8kfXbM7ckqnFdU2uTR5wLvc?cluster=devnet
> node -r dotenv/config scripts/trade.js --rpc-url https://api.devnet.solana.com --market BOOP_FUN --direction buy --mint 14aNJ54sZsAhaeoKKMNSYQGMC47wETzYcKX5ePJSboop --amount 0.05 --slippage 5 --keypair ~/.config/solana/id.json --priority-fee 0.001

### Devnet Boop.fun sell with priority fee
https://explorer.solana.com/tx/674utHMJ9w3yLUrEHnmWas26HFoKe5tmea7xs7NWks81dP9xvLPx5TDncjLuUqCNTAzCeGq2uJCJF9Pkqmysr6jF?cluster=devnet
> node -r dotenv/config scripts/trade.js --rpc-url https://api.devnet.solana.com --market BOOP_FUN --direction sell --mint 14aNJ54sZsAhaeoKKMNSYQGMC47wETzYcKX5ePJSboop --amount 1000 --slippage 5 --keypair ~/.config/solana/id.json --priority-fee 0.001

### Mainnet Heaven.xyz buy
https://explorer.solana.com/tx/GqecC6axuzRvbbyfuWsW3yE24DSdaeGMbt3hk2B8iwdkpYMkGWgDH41gbvrncNv5g2FmkdgRWVu3JaQS9FPQc4p
> node -r dotenv/config scripts/trade.js --rpc-url https://api.mainnet-beta.solana.com --market HEAVEN --direction buy --mint GrpzwPGEDwojuTUZ6UN1XJWhV2Y9MFk2vLbT2Dy8z777 --amount 0.001 --slippage 5 --keypair ~/.config/solana/id.json

> solana confirm GqecC6axuzRvbbyfuWsW3yE24DSdaeGMbt3hk2B8iwdkpYMkGWgDH41gbvrncNv5g2FmkdgRWVu3JaQS9FPQc4p -u https://api.mainnet-beta.solana.com

### Mainnet Heaven.xyz sell
https://explorer.solana.com/tx/2sKtGuLNudK3gj5MT7k1DQscyJkjcFQ93ssAxiXXczQPJo9VQrM3J9YSQL9EARcjVbU4xdKZ3QZhphcbMq8ZtsRy
> node -r dotenv/config scripts/trade.js --rpc-url https://api.mainnet-beta.solana.com --market HEAVEN --direction sell --mint GrpzwPGEDwojuTUZ6UN1XJWhV2Y9MFk2vLbT2Dy8z777 --amount 1 --slippage 5 --keypair ~/.config/solana/id.json

> solana confirm 2sKtGuLNudK3gj5MT7k1DQscyJkjcFQ93ssAxiXXczQPJo9VQrM3J9YSQL9EARcjVbU4xdKZ3QZhphcbMq8ZtsRy -u https://api.mainnet-beta.solana.com
