import { Token } from '@uniswap/sdk-core';
import { Pool, FeeAmount } from '@uniswap/v3-sdk';
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { getContract } from 'viem';
import IUniswapV3Pool from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import IUniswapV3Factory from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';


export const UNISWAP_V3_FACTORY_ADDRESS: { [chainId: number]: string } = {
    1: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    43114: '0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD',
    8453: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
};

export const WRAPPED_NATIVE_TOKEN: { [chainId: number]: string } = {
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    43114: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    8453: '0x4200000000000000000000000000000000000006',
};

// Add Uniswap V3 Router addresses for each chain
export const UNISWAP_V3_ROUTER: { [chainId: number]: string } = {
  1: '0xE592427A0AEce92De3Edee1F18E0157C05861564',    // Ethereum
  43114: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Avalanche
  8453: '0x2626664c2603336E57B271c5C0b26F421741e481',  // Base
};

interface Slot0Data {
    sqrtPriceX96: bigint;
    tick: number;
}

export async function getUniswapV3Pool(
    wallet: ZeroXgaslessSmartAccount,
    tokenA: Token,
    tokenB: Token,
    chainId: number
): Promise<{ pool: Pool; fee: FeeAmount }> {
    console.log('Searching pool for tokens:', {
        tokenA: tokenA.address,
        tokenB: tokenB.address,
        chainId
    });

    const factoryAddress = UNISWAP_V3_FACTORY_ADDRESS[chainId];
    if (!factoryAddress) {
        throw new Error(`Uniswap V3 not supported on chain ${chainId}`);
    }

    const factory = getContract({
        address: factoryAddress as `0x${string}`,
        abi: IUniswapV3Factory.abi,
        client: wallet.rpcProvider,
    });

    for (const fee of [FeeAmount.MEDIUM, FeeAmount.LOW, FeeAmount.HIGH]) {
        try {
            console.log(`Trying fee tier: ${fee}`);
            const poolAddress = await factory.read.getPool([
                tokenA.address,
                tokenB.address,
                fee
            ]) as `0x${string}`;

            console.log('Found pool address:', poolAddress);

            if (poolAddress === '0x0000000000000000000000000000000000000000') {
                console.log('No pool for this fee tier');
                continue;
            }

            const pool = await getPool(wallet, poolAddress, tokenA, tokenB, fee);
            return { pool, fee };
        } catch (error) {
            console.error(`Error with fee ${fee}:`, error);
            continue;
        }
    }

    throw new Error(`No active pool found for ${tokenA.symbol}/${tokenB.symbol}`);
}

export async function getPool(
    wallet: ZeroXgaslessSmartAccount,
    poolAddress: string,
    tokenA: Token,
    tokenB: Token,
    fee: FeeAmount
): Promise<Pool> {
    try {
        const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
        
        console.log('Pool Address:', poolAddress);
        console.log('Tokens:', {
            token0: token0.address,
            token1: token1.address,
            decimals0: token0.decimals,
            decimals1: token1.decimals
        });

        const poolContract = getContract({
            address: poolAddress as `0x${string}`,
            abi: IUniswapV3Pool.abi,
            client: wallet.rpcProvider,
        });

        const [slot0Array, liquidity] = await Promise.all([
            poolContract.read.slot0() as Promise<[bigint, number, ...unknown[]]>,
            poolContract.read.liquidity() as Promise<bigint>
        ]);

        const slot0Data: Slot0Data = {
            sqrtPriceX96: slot0Array[0],
            tick: slot0Array[1]
        };

        console.log('Pool Data:', {
            slot0: slot0Data,
            liquidity
        });

        return new Pool(
            token0,
            token1,
            fee,
            slot0Data.sqrtPriceX96.toString(),
            (liquidity as bigint).toString(),
            slot0Data.tick
        );
    } catch (error) {
        console.error('Pool creation error:', error);
        throw new Error(`Failed to create pool: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
} 