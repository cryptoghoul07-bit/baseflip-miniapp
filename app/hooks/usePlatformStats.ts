import { useState, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';
import CashOutOrDieABI from '../lib/CashOutOrDieABI.json';

const BASEFLIP_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;
const CASHOUT_ADDRESS = (process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS || '0x7134eaE427260946898E6B1cFeA5036415c97AEd') as `0x${string}`;

export function usePlatformStats() {
    const [totalVolume, setTotalVolume] = useState<string>('0');
    const [isLoading, setIsLoading] = useState(true);
    const publicClient = usePublicClient();

    useEffect(() => {
        if (!publicClient || !BASEFLIP_ADDRESS) return;

        const fetchVolume = async () => {
            // Suspense for initial load
            await new Promise(resolve => setTimeout(resolve, 3000));
            if (!publicClient) return;

            try {
                let totalVolumeBn = 0n;

                // 1. --- Sync BaseFlip (Classic) ---
                const classicId = await publicClient.readContract({
                    address: BASEFLIP_ADDRESS,
                    abi: BaseFlipABI,
                    functionName: 'currentRoundId',
                }) as bigint;

                const cId = Number(classicId);
                const BATCH_SIZE = 500;

                for (let start = 1; start <= cId; start += BATCH_SIZE) {
                    const end = Math.min(start + BATCH_SIZE - 1, cId);
                    const contracts: any[] = [];
                    for (let i = start; i <= end; i++) {
                        contracts.push({
                            address: BASEFLIP_ADDRESS,
                            abi: BaseFlipABI,
                            functionName: 'rounds',
                            args: [BigInt(i)]
                        });
                    }
                    const results = await publicClient.multicall({ contracts, allowFailure: true });
                    results.forEach((r: any) => {
                        if (r.status === 'success') {
                            const round = r.result;
                            totalVolumeBn += (Array.isArray(round) ? (round[1] + round[2]) : (round.poolA + round.poolB));
                        }
                    });
                }

                // 2. --- Sync CashOutOrDie (The Arena) ---
                if (CASHOUT_ADDRESS && CASHOUT_ADDRESS !== '0x0') {
                    const arenaId = await publicClient.readContract({
                        address: CASHOUT_ADDRESS,
                        abi: CashOutOrDieABI,
                        functionName: 'currentGameId',
                    }) as bigint;

                    const aId = Number(arenaId);
                    for (let start = 1; start <= aId; start += BATCH_SIZE) {
                        const end = Math.min(start + BATCH_SIZE - 1, aId);
                        const contracts: any[] = [];
                        for (let i = start; i <= end; i++) {
                            contracts.push({
                                address: CASHOUT_ADDRESS,
                                abi: CashOutOrDieABI,
                                functionName: 'games',
                                args: [BigInt(i)]
                            });
                        }
                        const results = await publicClient.multicall({ contracts, allowFailure: true });
                        results.forEach((r: any) => {
                            if (r.status === 'success') {
                                const game = r.result;
                                totalVolumeBn += (Array.isArray(game) ? game[1] : (game as any).totalPool);
                            }
                        });
                    }
                }

                setTotalVolume(formatEther(totalVolumeBn));
            } catch (error) {
                console.error("Error fetching platform stats:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchVolume();
    }, [publicClient]);

    return { totalVolume, isLoading };
}
