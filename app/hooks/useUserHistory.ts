
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
        setHistory([]); // Reset for fresh state

        try {
            const latestBlock = await publicClient.getBlockNumber();
            const CHUNK_SIZE = 500000n;
            const eventAbi = BaseFlipABI.find(x => x.name === 'StakePlaced');

            console.log(`[useUserHistory] All-Time Discovery Scan started...`);

            // Fetch ALL contract logs in parallel (5 chunks = 2.5M blocks)
            // Local filtering is much more reliable than RPC-side filtering
            const chunkPromises = [0n, 1n, 2n, 3n, 4n].map(i => {
                const to = latestBlock - (i * CHUNK_SIZE);
                const from = to - CHUNK_SIZE > 0n ? to - CHUNK_SIZE : 0n;
                return publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: eventAbi as any,
                    fromBlock: from,
                    toBlock: to
                }).catch(() => []);
            });

            const results = await Promise.all(chunkPromises);
            const allLogs = results.flat() as any[];

            // Filter locally by user address
            const userLogs = allLogs.filter(log =>
                log.args.user?.toLowerCase() === address.toLowerCase()
            );

            if (userLogs.length === 0) {
                console.log("[useUserHistory] No activity found for:", address);
                setHistory([]);
                return;
            }

            // Extract Unique Round IDs
            const roundIds = Array.from(new Set(userLogs.map(log => log.args.roundId)));
            const sortedRoundIds = roundIds.sort((a, b) => Number(BigInt(b) - BigInt(a))); // Newest first

            // Fetch Outcomes for found rounds
            const displayRounds = sortedRoundIds.slice(0, 50);

            const contracts: any[] = displayRounds.map(id => ({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'rounds',
                args: [id]
            } as const));

            const batchResults = await publicClient.multicall({
                contracts,
                allowFailure: true
            });

            const foundHistory: HistoryItem[] = [];

            for (let i = 0; i < batchResults.length; i++) {
                const roundResult = batchResults[i];
                const roundIdBig = displayRounds[i] as bigint;
                const relevantLogs = userLogs.filter(l => BigInt(l.args.roundId) === roundIdBig);

                if (roundResult.status === 'success') {
                    const r: any = roundResult.result;
                    relevantLogs.forEach(log => {
                        const args = log.args;
                        foundHistory.push({
                            roundId: Number(args.roundId),
                            amount: formatEther(args.amount),
                            group: Number(args.group),
                            winningGroup: Number(Array.isArray(r) ? r[8] : r.winningGroup),
                            isCompleted: Array.isArray(r) ? r[6] : r.isCompleted,
                            timestamp: Number(Array.isArray(r) ? r[4] : r.createdAt)
                        });
                    });
                }
            }

            setHistory(foundHistory);

        } catch (error) {
            console.error("[useUserHistory] Discovery Failed:", error);
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
