import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { buildTransaction } from './builder';
import { markets as Markets, swapDirection as SwapDirection } from './helpers/constants';
import { getPriceForMarket, PriceUnit } from './helpers/price';

export class TradeTest {
  private readonly connection: Connection;

  constructor(rpcUrl?: string) {
    const url = rpcUrl || process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(url, 'confirmed');
  }

  async price(params: { market: string; mint: PublicKey | string; unit?: PriceUnit }): Promise<{ price: number; bondingCurvePercent: number | null }> {
    const market = params.market;
    const mint = this.normalizeMint(params.mint);
    const unit: PriceUnit = (params.unit || 'SOL').toUpperCase() === 'LAMPORTS' ? 'LAMPORTS' : 'SOL';
    const { lamportsPerToken, bondingCurvePercent } = await getPriceForMarket(this.connection, market, mint);
    const price = unit === 'LAMPORTS' ? lamportsPerToken : lamportsPerToken / LAMPORTS_PER_SOL;
    return { price, bondingCurvePercent };
  }

  async buy(params: {
    market: string;
    wallet: Keypair;
    mint: PublicKey | string;
    amount: number;
    slippage: number; // 0..100
    priorityFeeSol?: number;
    poolAddress?: PublicKey | string;
    send?: boolean;
    additionalInstructions?: TransactionInstruction[];
  }): Promise<string | Transaction> {
    return this.trade({ ...params, direction: SwapDirection.BUY });
  }

  async sell(params: {
    market: string;
    wallet: Keypair;
    mint: PublicKey | string;
    amount: number;
    slippage: number; // 0..100
    priorityFeeSol?: number;
    poolAddress?: PublicKey | string;
    send?: boolean;
    additionalInstructions?: TransactionInstruction[];
  }): Promise<string | Transaction> {
    return this.trade({ ...params, direction: SwapDirection.SELL });
  }

  private async trade(params: {
    market: string;
    direction: string;
    wallet: Keypair;
    mint: PublicKey | string;
    amount: number;
    slippage: number; // 0..100
    priorityFeeSol?: number;
    poolAddress?: PublicKey | string;
    send?: boolean;
    additionalInstructions?: TransactionInstruction[];
  }): Promise<string | Transaction> {
    const { market, direction, wallet, amount, priorityFeeSol = 0, send = true, additionalInstructions } = params;

    const mint = this.normalizeMint(params.mint);
    const poolAddress = this.normalizePoolAddress(params.poolAddress);
    const slippageFraction = this.normalizeSlippage(params.slippage);

    const tx = await buildTransaction({
      connection: this.connection,
      market,
      direction,
      wallet,
      mint,
      poolAddress,
      amount,
      slippage: slippageFraction,
      priorityFeeSol,
      additionalInstructions,
    });

    if (!send) {
      return tx;
    }

    // Standard send and confirm
    const latest = await this.connection.getLatestBlockhash('finalized');
    tx.recentBlockhash = latest.blockhash;
    tx.feePayer = wallet.publicKey;
    const sig = await this.connection.sendTransaction(tx, [wallet], { skipPreflight: false, preflightCommitment: 'processed' });
    await this.connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
    return sig;
  }

  async estimateFees(params: {
    market: string;
    direction: string; // 'buy' | 'sell'
    wallet: Keypair;
    mint: PublicKey | string;
    amount: number;
    slippage: number; // 0..100
    priorityFeeSol?: number; // optional tip in SOL
    poolAddress?: PublicKey | string;
    additionalInstructions?: TransactionInstruction[];
  }): Promise<{
    baseFeeLamports: number;
    priorityFeeLamports: number;
    totalLamports: number;
    totalSol: number;
    unitsConsumed?: number;
    microLamportsPerCU: number;
  }> {
    const { market, direction, wallet, amount, priorityFeeSol = 0, additionalInstructions } = params;
    const mint = this.normalizeMint(params.mint);
    const poolAddress = this.normalizePoolAddress(params.poolAddress);
    const slippageFraction = this.normalizeSlippage(params.slippage);

    const tx = await buildTransaction({
      connection: this.connection,
      market,
      direction,
      wallet,
      mint,
      poolAddress,
      amount,
      slippage: slippageFraction,
      priorityFeeSol,
      additionalInstructions,
    });

    // Prepare for simulation / fee estimation
    const latest = await this.connection.getLatestBlockhash('processed');
    tx.recentBlockhash = latest.blockhash;
    tx.feePayer = wallet.publicKey;

    // Base fee
    const message = tx.compileMessage();
    const baseFeeResp = await this.connection.getFeeForMessage(message, 'processed' as any);
    const baseFeeLamports = (baseFeeResp as any)?.value ?? baseFeeResp ?? 0;

    // Estimate compute units consumed (optional info)
    // Sign for simulation to avoid sigVerify issues
    tx.sign(wallet);
    const sim = await this.connection.simulateTransaction(tx as any);
    const unitsConsumed: number | undefined = (sim as any)?.value?.unitsConsumed;

    // Compute microLamportsPerCU as builder does (if priorityFeeSol provided)
    const computeUnits = 300_000;
    const microLamportsPerCU = priorityFeeSol > 0 ? Math.max(1, Math.floor((priorityFeeSol * LAMPORTS_PER_SOL) / computeUnits)) : 0;
    const priorityFeeLamports = unitsConsumed && microLamportsPerCU > 0
      ? Math.floor((unitsConsumed * microLamportsPerCU) / 1_000_000)
      : 0;

    const totalLamports = (baseFeeLamports || 0) + priorityFeeLamports;
    const totalSol = totalLamports / LAMPORTS_PER_SOL;
    return { baseFeeLamports: baseFeeLamports || 0, priorityFeeLamports, totalLamports, totalSol, unitsConsumed, microLamportsPerCU };
  }

  private normalizeMint(mint: PublicKey | string): PublicKey {
    if (mint instanceof PublicKey) return mint;
    return new PublicKey(mint);
  }

  private normalizeSlippage(slippagePercent: number): number {
    if (!Number.isFinite(slippagePercent)) throw new Error('Invalid slippage');
    const clamped = Math.max(0, Math.min(100, slippagePercent));
    return clamped / 100;
  }

  private normalizePoolAddress(pool?: PublicKey | string): PublicKey | undefined {
    if (pool === undefined || pool === null) return undefined;
    if (pool instanceof PublicKey) return pool;
    try {
      return new PublicKey(pool);
    } catch (_) {
      throw new Error('Invalid poolAddress');
    }
  }
}


