
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
            const currentBlock = await publicClient.getBlockNumber();
            const fromBlock = currentBlock - 5000000n; // ~4 months

            const stakePlacedEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');

            // Fetch ALL stake logs for the contract and filter locally to 
            // bypass any potential RPC indexing/casing issues
            const allLogs = await publicClient.getLogs({
                address: CONTRACT_ADDRESS,
                event: stakePlacedEvent as any,
                fromBlock: fromBlock > 0n ? fromBlock : 0n,
                toBlock: 'latest'
            }) as any[];

            // Filter locally by user address
            const userLogs = allLogs.filter(log =>
                log.args.user?.toLowerCase() === address.toLowerCase()
            ).reverse();

            if (userLogs.length === 0) {
                console.log("[useUserHistory] No logs found in range for:", address);
                setHistory([]);
                setIsLoading(false);
                return;
            }

            const roundIds = Array.from(new Set(userLogs.map(log => log.args.roundId)));
            const BATCH_SIZE = 20; // Super safe batch size
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
            }

            foundHistory.sort((a, b) => b.roundId - a.roundId);
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
