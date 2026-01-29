
import { useState, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;

export function usePlatformStats() {
    const [totalVolume, setTotalVolume] = useState<string>('0');
    const [isLoading, setIsLoading] = useState(true);
    const publicClient = usePublicClient();

    useEffect(() => {
        if (!publicClient || !CONTRACT_ADDRESS) return;

        const fetchVolume = async () => {
            try {
                // 1. Get current round ID
                const currentId = await publicClient.readContract({
                    address: CONTRACT_ADDRESS,
                    abi: BaseFlipABI,
                    functionName: 'currentRoundId',
                }) as bigint;

                const id = Number(currentId);
                let volume = 0n;

                // 2. Batch read all rounds (or iterating if batch not supported easily)
                // For simplicity and standard RPCs, we'll iterate parallelized promises
                // Limiting to last 100 rounds to prevent explosion, or until we have an indexer.
                // Since this is a demo/miniapp, fetching all is okay for <500 rounds.

                // 2. Use Multicall for scalable "All-Time" fetching
                // This batches all round reads into a single RPC call (or a few batches)
                // supporting thousands of rounds efficiently.

                const contracts = [];
                for (let i = 1; i <= id; i++) {
                    contracts.push({
                        address: CONTRACT_ADDRESS,
                        abi: BaseFlipABI,
                        functionName: 'rounds',
                        args: [BigInt(i)]
                    } as const);
                }

                // Execute multicall
                const results = await publicClient.multicall({
                    contracts: contracts,
                    allowFailure: true // Continue even if one fails
                });

                results.forEach((result: any) => {
                    if (result.status === 'success') {
                        const round = result.result;
                        // Structure: [levelId, poolA, poolB, ...]
                        // Check if array or object based on wagmi return
                        const poolA = Array.isArray(round) ? round[1] : round.poolA;
                        const poolB = Array.isArray(round) ? round[2] : round.poolB;

                        volume += (poolA + poolB);
                    }
                });

                setTotalVolume(formatEther(volume));
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
