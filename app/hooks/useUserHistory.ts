
import { useState, useCallback, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther, parseAbiItem } from 'viem';
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

            const maxId = Number(currentId);
            const scanDepth = 1000; // Scan last 1000 rounds (very reliable via multicall)
            const startId = Math.max(1, maxId - scanDepth);

            console.log(`[useUserHistory] Starting scan from ${maxId} down to ${startId}`);

            const foundHistory: HistoryItem[] = [];
            const BATCH_SIZE = 100;

            // Scan backwards in batches of 100
            for (let end = maxId; end >= startId; end -= BATCH_SIZE) {
                const batchStart = Math.max(startId, end - BATCH_SIZE + 1);
                const contracts: any[] = [];

                for (let id = end; id >= batchStart; id--) {
                    // Check user stake
                    contracts.push({
                        address: CONTRACT_ADDRESS,
                        abi: BaseFlipABI,
                        functionName: 'userStakes',
                        args: [BigInt(id), address]
                    });
                    // Get round info (needed for status/time)
                    contracts.push({
                        address: CONTRACT_ADDRESS,
                        abi: BaseFlipABI,
                        functionName: 'rounds',
                        args: [BigInt(id)]
                    });
                }

                const results = await publicClient.multicall({
                    contracts,
                    allowFailure: true
                });

                // Results are in pairs: [Stake, Round], [Stake, Round]...
                for (let j = 0; j < results.length; j += 2) {
                    const stakeRes = results[j];
                    const roundRes = results[j + 1];
                    const roundId = end - (j / 2);

                    if (stakeRes.status === 'success' && roundRes.status === 'success') {
                        const s: any = stakeRes.result;
                        const r: any = roundRes.result;

                        const amountBn = Array.isArray(s) ? s[0] : s.amount;

                        // If amount > 0, they participated and haven't claimed yet
                        // (If it's 0, they either didn't play OR already claimed)
                        if (amountBn > 0n) {
                            const group = Array.isArray(s) ? Number(s[1]) : Number(s.group);
                            const isCompleted = Array.isArray(r) ? r[6] : r.isCompleted;
                            const winningGroup = Number(Array.isArray(r) ? r[8] : r.winningGroup);
                            const createdAt = Number(Array.isArray(r) ? r[4] : r.createdAt);

                            foundHistory.push({
                                roundId,
                                amount: formatEther(amountBn),
                                group,
                                winningGroup,
                                isCompleted,
                                timestamp: createdAt
                            });
                        }
                    }
                }

                // Set intermediate results so user sees something quickly
                if (foundHistory.length > 0) {
                    setHistory([...foundHistory]);
                }
            }

            console.log(`[useUserHistory] Final found items: ${foundHistory.length}`);
            setHistory(foundHistory);

        } catch (error) {
            console.error("Error scanning history:", error);
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
