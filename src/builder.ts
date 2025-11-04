import { Connection, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { markets as Markets, swapDirection as SwapDirection } from './helpers/constants';
import { BoopFunClient } from './markets/boop-fun/client';
import { HeavenClient } from './markets/heaven-xyz/client';

/**
 * Builds a Transaction with compute budget (priority fees), optional tip, and market buy/sell instructions.
 * Does not send the transaction.
 */
export async function buildTransaction(params: {
  connection: Connection;
  market: string;
  direction: string;
  wallet: { publicKey: PublicKey };
  mint: PublicKey;
  amount: number;
  slippage: number; // 0..1
  priorityFeeSol?: number;
  poolAddress?: PublicKey;
  additionalInstructions?: TransactionInstruction[];
}): Promise<Transaction> {
  const { connection, market, direction, wallet, mint, amount, slippage, priorityFeeSol = 0, poolAddress, additionalInstructions = [] } = params;

  if (slippage < 0 || slippage > 1) throw new Error('slippage must be between 0 and 1');

  const tx = new Transaction();

  // Optional compute budget: simple 300k CU target with proportional microLamports price
  if (priorityFeeSol > 0) {
    const computeUnits = 300_000;
    const microLamportsPerCU = Math.max(1, Math.floor((priorityFeeSol * LAMPORTS_PER_SOL) / computeUnits));
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: microLamportsPerCU })
    );
  }

  // Market-specific instructions (Boop.fun or Heaven)
  const client = createMarketClient(connection, market);
  const invocation = createDirectionInvoker(client, direction);
  const marketInstructions = await invocation({
    mintAddress: mint,
    wallet: wallet.publicKey,
    solAmount: amount,
    tokenAmount: amount,
    slippage,
    poolAddress,
  });

  for (const ix of marketInstructions) tx.add(ix);
  for (const ix of additionalInstructions) tx.add(ix);

  tx.feePayer = wallet.publicKey;
  return tx;
}

type MarketClient = {
  getBuyInstructions: (args: {
    mintAddress: PublicKey;
    wallet: PublicKey;
    solAmount: number;
    slippage: number;
    poolAddress?: PublicKey;
  }) => Promise<TransactionInstruction[]>;
  getSellInstructions: (args: {
    mintAddress: PublicKey;
    wallet: PublicKey;
    tokenAmount: number;
    slippage: number;
    poolAddress?: PublicKey;
  }) => Promise<TransactionInstruction[]>;
};

function createMarketClient(connection: Connection, market: string): MarketClient {
  switch (market) {
    case Markets.BOOP_FUN:
      return new BoopFunClient(connection) as unknown as MarketClient;
    case Markets.HEAVEN:
      return new HeavenClient(connection) as unknown as MarketClient;
    default:
      throw new Error(`Unsupported market: ${market}`);
  }
}

function createDirectionInvoker(client: MarketClient, direction: string) {
  if (direction === SwapDirection.BUY) {
    return async ({ mintAddress, wallet, solAmount, slippage, poolAddress }: { 
      mintAddress: PublicKey; 
      wallet: PublicKey; 
      solAmount: number; 
      slippage: number; 
      poolAddress?: PublicKey;
    }) => {
      return client.getBuyInstructions({ mintAddress, wallet, solAmount, slippage, poolAddress });
    }
  }
  if (direction === SwapDirection.SELL) {
    return async ({ mintAddress, wallet, tokenAmount, slippage, poolAddress }: { 
      mintAddress: PublicKey; 
      wallet: PublicKey; 
      tokenAmount: number; 
      slippage: number; 
      poolAddress?: PublicKey;
    }) => {
      return client.getSellInstructions({ mintAddress, wallet, tokenAmount, slippage, poolAddress });
    }
  }
  throw new Error(`Unsupported direction: ${direction}`);
}


