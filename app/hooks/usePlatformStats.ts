
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
            // Wait 3s before starting heavy stats calculation
            await new Promise(resolve => setTimeout(resolve, 3000));
            if (!publicClient) return;

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

                // 2. Use Multicall for scalable "All-Time" fetching
                // This batches all round reads into a single RPC call (or a few batches)
                // supporting thousands of rounds efficiently.

                const BATCH_SIZE = 500;
                let totalVolumeBn = 0n;

                // Process in chunks to support infinite scalability (Pagination)
                for (let start = 1; start <= id; start += BATCH_SIZE) {
                    const end = Math.min(start + BATCH_SIZE - 1, id);
                    const contracts: any[] = [];

                    for (let i = start; i <= end; i++) {
                        contracts.push({
                            address: CONTRACT_ADDRESS,
                            abi: BaseFlipABI,
                            functionName: 'rounds',
                            args: [BigInt(i)]
                        } as const);
                    }

                    // Execute batch
                    const results = await publicClient.multicall({
                        contracts: contracts,
                        allowFailure: true
                    });

                    results.forEach((result: any) => {
                        if (result.status === 'success') {
                            const round = result.result;
                            const poolA = Array.isArray(round) ? round[1] : round.poolA;
                            const poolB = Array.isArray(round) ? round[2] : round.poolB;
                            totalVolumeBn += (poolA + poolB);
                        }
                    });
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
