
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
            const latestBlock = await publicClient.getBlockNumber();
            const CHUNK_SIZE = 100000n; // 100k blocks
            const MAX_BLOCKS = 3000000n; // Scan last ~2 months
            const stopBlock = latestBlock > MAX_BLOCKS ? latestBlock - MAX_BLOCKS : 0n;

            const allUserLogs: any[] = [];
            const stakePlacedEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');

            console.log(`[useUserHistory] Starting Discovery Scan from ${latestBlock}`);

            // Chunked Discovery (Bypasses RPC timeouts)
            for (let to = latestBlock; to > stopBlock; to -= CHUNK_SIZE) {
                const from = to - CHUNK_SIZE > 0n ? to - CHUNK_SIZE : 0n;
                try {
                    const logs = await publicClient.getLogs({
                        address: CONTRACT_ADDRESS,
                        event: stakePlacedEvent as any,
                        args: { user: address },
                        fromBlock: from,
                        toBlock: to
                    });
                    if (logs.length > 0) allUserLogs.push(...logs);
                } catch (e) {
                    console.warn(`[useUserHistory] Skip block range ${from}-${to}`);
                }
                if (from <= stopBlock) break;
            }

            if (allUserLogs.length === 0) {
                setHistory([]);
                return;
            }

            // Group logs by roundId (unique rounds)
            const sortedLogs = allUserLogs.reverse();
            const roundIds = Array.from(new Set(sortedLogs.map(log => log.args.roundId)));

            const BATCH_SIZE = 20;
            const foundHistory: HistoryItem[] = [];

            for (let i = 0; i < roundIds.length; i += BATCH_SIZE) {
                const batch = roundIds.slice(i, i + BATCH_SIZE);
                const contracts: any[] = batch.map(id => ({
                    address: CONTRACT_ADDRESS,
                    abi: BaseFlipABI,
                    functionName: 'rounds',
                    args: [id]
                } as const));

                const batchResults = await publicClient.multicall({
                    contracts,
                    allowFailure: true
                });

                for (let j = 0; j < batchResults.length; j++) {
                    const roundResult = batchResults[j];
                    const roundIdBig = batch[j] as bigint;
                    const relevantLogs = sortedLogs.filter(l => BigInt(l.args.roundId) === roundIdBig);

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
                // Show items progressively
                setHistory([...foundHistory]);
            }

            foundHistory.sort((a, b) => b.roundId - a.roundId);
            setHistory(foundHistory);

        } catch (error) {
            console.error("Discovery error:", error);
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
