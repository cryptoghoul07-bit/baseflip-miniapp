
import { useState, useCallback, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;

export interface HistoryItem {
    roundId: number;
    amount: string;
    group: number; // 1 = A, 2 = B
    winningGroup: number; // 0 if pending
    isCompleted: boolean;
    timestamp: number;
    payout?: string;
}

export function useUserHistory() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchHistory = useCallback(async () => {
        if (!address || !publicClient || !CONTRACT_ADDRESS) return;

        setIsLoading(true);
        try {
            // 1. Get current round ID
            const currentId = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'currentRoundId',
            }) as bigint;

            const id = Number(currentId);
            setHistory([]); // Clear previous
            const BATCH_SIZE = 250; // 250 rounds * 2 calls = 500 calls per batch (safe limit)

            // Loop backwards from currentId to 1 in chunks
            for (let end = id; end >= 1; end -= BATCH_SIZE) {
                const start = Math.max(1, end - BATCH_SIZE + 1);
                const contracts: any[] = [];

                // Build batch (reverse order within batch to keep sorting)
                for (let i = end; i >= start; i--) {
                    contracts.push({
                        address: CONTRACT_ADDRESS,
                        abi: BaseFlipABI,
                        functionName: 'rounds',
                        args: [BigInt(i)]
                    });
                    contracts.push({
                        address: CONTRACT_ADDRESS,
                        abi: BaseFlipABI,
                        functionName: 'userStakes',
                        args: [BigInt(i), address]
                    });
                }

                const results = await publicClient.multicall({
                    contracts,
                    allowFailure: true
                });

                const batchFound: HistoryItem[] = [];

                for (let i = 0; i < results.length; i += 2) {
                    const roundResult = results[i];
                    const stakeResult = results[i + 1];

                    // Correct ID calculation
                    // In this inner loop, we pushed: end, end-1, end-2...
                    // So index 0 matches 'end', index 2 matches 'end-1'
                    const offset = i / 2;
                    const roundId = end - offset;

                    if (roundResult.status === 'success' && stakeResult.status === 'success') {
                        const r: any = roundResult.result;
                        const s: any = stakeResult.result;
                        const stakeAmount = Array.isArray(s) ? s[0] : s.amount;

                        if (stakeAmount > 0n) {
                            const stakeGroup = Array.isArray(s) ? s[1] : s.group;
                            const isCompleted = Array.isArray(r) ? r[6] : r.isCompleted;
                            const winningGroup = Number(Array.isArray(r) ? r[8] : r.winningGroup);
                            const createdAt = Number(Array.isArray(r) ? r[4] : r.createdAt);

                            batchFound.push({
                                roundId,
                                amount: formatEther(stakeAmount),
                                group: stakeGroup,
                                winningGroup,
                                isCompleted,
                                timestamp: createdAt
                            });
                        }
                    }
                }

                // Append this batch to history immediately so user sees data loading
                if (batchFound.length > 0) {
                    setHistory(prev => [...prev, ...batchFound]);
                }
            }

        } catch (error) {
            console.error("Error fetching history:", error);
        } finally {
            setIsLoading(false);
        }
    }, [address, publicClient]);

    useEffect(() => {
        if (address) {
            fetchHistory();
        }
    }, [address, fetchHistory]);

    return { history, isLoading, refetchHistory: fetchHistory };
}
