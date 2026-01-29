
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
            const scanDepth = 20; // Last 20 rounds for history
            const startId = Math.max(1, id - scanDepth);

            // 2. Prepare Multicall for User Stakes AND Round Info
            const contracts: any[] = [];

            // For each round, we need 2 calls: rounds(i) and userStakes(i, user)
            for (let i = id; i >= startId; i--) { // Reverse order (newest first)
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

            const foundHistory: HistoryItem[] = [];

            // Process results in pairs
            // Index j = rounds, Index j+1 = userStakes
            for (let i = 0; i < results.length; i += 2) {
                const roundResult = results[i];
                const stakeResult = results[i + 1];

                // Calculate actual round ID based on loop index logic
                // Loop was: i going down from id to startId. 
                // Iteration 0 corresponds to round 'id'.
                // Iteration 1 corresponds to round 'id-1', etc.
                const offset = i / 2;
                const roundId = id - offset;

                if (roundResult.status === 'success' && stakeResult.status === 'success') {
                    const r: any = roundResult.result;
                    const s: any = stakeResult.result;

                    const stakeAmount = Array.isArray(s) ? s[0] : s.amount;

                    // Only show rounds where user participated
                    if (stakeAmount > 0n) {
                        const stakeGroup = Array.isArray(s) ? s[1] : s.group;
                        const isCompleted = Array.isArray(r) ? r[6] : r.isCompleted;
                        const winningGroup = Number(Array.isArray(r) ? r[8] : r.winningGroup);
                        // createdAt is index 4 in struct
                        const createdAt = Number(Array.isArray(r) ? r[4] : r.createdAt);

                        let payout = undefined;
                        if (isCompleted && winningGroup === stakeGroup) {
                            // Rough calculation, or we could fetch claimed events. 
                            // For history, simple 2x approximation or just "Won"
                            // Actually, calculating true payout requires pool sizes.
                            // Let's just return raw data and let UI handle display
                        }

                        foundHistory.push({
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

            setHistory(foundHistory);

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
