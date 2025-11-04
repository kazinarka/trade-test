import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { markets as Markets, mints as MintConstants } from './constants';
import { PROGRAM_IDS } from './program-ids';

export type PriceUnit = 'SOL' | 'LAMPORTS';

export async function getPriceForMarket(
  connection: Connection,
  market: string,
  mint: PublicKey,
): Promise<{ lamportsPerToken: number; bondingCurvePercent: number | null }> {
  const key = (market || '').toUpperCase();
  if (key === Markets.BOOP_FUN) return getBoopFunPrice(connection, mint);
  if (key === Markets.HEAVEN) return getHeavenPrice(connection, mint);
  throw new Error(`Price resolver not implemented for market ${market}`);
}

export async function readMintDecimals(connection: Connection, mint: PublicKey): Promise<number> {
  const info = await connection.getParsedAccountInfo(mint, 'processed');
  const parsed: any = (info.value as any)?.data?.parsed;
  const decimals = Number(parsed?.info?.decimals ?? parsed?.parsed?.info?.decimals);
  return Number.isFinite(decimals) ? decimals : 9;
}

function roundLamports(v: number): number {
  const f = Math.floor(v);
  const frac = v - f;
  if (frac > 0.5) return f + 1;
  return f;
}

function roundPercent(v: number): number {
  return Math.round(v * 100) / 100;
}

// -------- Heaven.xyz ---------
export async function getHeavenPrice(connection: Connection, mint: PublicKey): Promise<{ lamportsPerToken: number; bondingCurvePercent: number | null }> {
  const programId = new PublicKey(PROGRAM_IDS.HEAVEN_PROGRAM_ID);
  const wsol = new PublicKey(MintConstants.WSOL);
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('liquidity_pool_state'), mint.toBuffer(), wsol.toBuffer()],
    programId,
  );
  const acc = await connection.getAccountInfo(poolPda, 'processed');
  if (!acc || !acc.data) throw new Error('Heaven liquidity pool state not found');

  const reserve = decodeHeavenReserve(acc.data);
  if (!reserve) throw new Error('Failed to decode Heaven LiquidityPoolReserve');

  const decimals = await readMintDecimals(connection, mint);
  const tokenA = Number(reserve.tokenA);
  const tokenB = Number(reserve.tokenB);
  const lamportsPerToken = tokenA > 0 ? roundLamports((tokenB * Math.pow(10, decimals)) / tokenA) : 0;

  const initialA = Number(reserve.initialA);
  let bondingCurvePercent = 0;
  if (initialA > 0) {
    const sold = Math.max(0, initialA - tokenA);
    bondingCurvePercent = roundPercent(Math.max(0, Math.min(1, sold / initialA)) * 100);
  }
  return { lamportsPerToken, bondingCurvePercent };
}

function decodeHeavenReserve(data: Buffer): { tokenA: bigint; tokenB: bigint; initialA: bigint; initialB: bigint } | null {
  try {
    // Anchor discriminator (8) + LiquidityPoolInfo (88) + LiquidityPoolMarketCapBasedFees (360)
    const base = 8 + 88 + 360;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const tokenA = readU64LE(dv, base + 0);
    const tokenB = readU64LE(dv, base + 8);
    const initialA = readU64LE(dv, base + 48);
    const initialB = readU64LE(dv, base + 56);
    return { tokenA, tokenB, initialA, initialB };
  } catch {
    return null;
  }
}

// -------- Boop.fun ---------
export async function getBoopFunPrice(connection: Connection, mint: PublicKey): Promise<{ lamportsPerToken: number; bondingCurvePercent: number | null }> {
  const programId = new PublicKey(PROGRAM_IDS.BOOP_FUN_PROGRAM_ID);
  const bondingCurvePda = PublicKey.findProgramAddressSync([Buffer.from('bonding_curve'), mint.toBuffer()], programId)[0];
  const accInfo = await connection.getAccountInfo(bondingCurvePda, 'processed');
  if (!accInfo) throw new Error('Boop bonding curve account not found');
  const parsed = decodeBoopBondingCurve(accInfo.data);
  if (!parsed) throw new Error('Boop bonding curve decode failed');

  const decimals = await readMintDecimals(connection, mint);
  const xLamports = Number(parsed.virtualSolReserves) + Number(parsed.solReserves);
  const yBaseUnits = Number(parsed.tokenReserves);
  const priceSol = yBaseUnits > 0 ? (xLamports / LAMPORTS_PER_SOL) / (yBaseUnits / Math.pow(10, decimals)) : 0;
  const lamportsPerToken = roundLamports(Math.max(0, priceSol * LAMPORTS_PER_SOL));

  let bondingCurvePercent: number | null = null;
  if (parsed.graduationTarget && Number(parsed.graduationTarget) > 0) {
    const ratio = Math.max(0, Math.min(1, Number(parsed.solReserves) / Number(parsed.graduationTarget)));
    bondingCurvePercent = roundPercent(ratio * 100);
  }
  return { lamportsPerToken, bondingCurvePercent };
}

function decodeBoopBondingCurve(data: Buffer): {
  dampingTerm: number;
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  solReserves: bigint;
  tokenReserves: bigint;
  swapFeeBasisPoints: number;
  graduationTarget: bigint;
} | null {
  try {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let o = 0;
    o += 8; // anchor discriminator
    // creator(32) + mint(32)
    o += 64;
    const virtualSolReserves = readU64LE(dv, o); o += 8;
    const virtualTokenReserves = readU64LE(dv, o); o += 8;
    const graduationTarget = readU64LE(dv, o); o += 8;
    o += 8; // graduationFee u64 (skip)
    const solReserves = readU64LE(dv, o); o += 8;
    const tokenReserves = readU64LE(dv, o); o += 8;
    const dampingTerm = dv.getUint8(o); o += 1;
    const swapFeeBasisPoints = dv.getUint16(o, true); o += 2;
    return { dampingTerm, virtualTokenReserves, virtualSolReserves, solReserves, tokenReserves, swapFeeBasisPoints, graduationTarget } as any;
  } catch {
    return null;
  }
}

function readU64LE(dv: DataView, o: number): bigint {
  const lo = BigInt(dv.getUint32(o, true));
  const hi = BigInt(dv.getUint32(o + 4, true));
  return (hi << 32n) + lo;
}
