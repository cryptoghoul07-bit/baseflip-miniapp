
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
            // Scan from block 0 for "True All Time" history on Base Sepolia
            const logs = await publicClient.getLogs({
                address: CONTRACT_ADDRESS,
                event: parseAbiItem('event StakePlaced(uint256 indexed roundId, address indexed user, uint8 group, uint256 amount)'),
                args: {
                    user: address
                },
                fromBlock: 0n,
                toBlock: 'latest'
            });

            // 2. Extract unique rounds and details from logs
            // Reverse to show newest first
            const sortedLogs = logs.reverse();

            if (sortedLogs.length === 0) {
                setHistory([]);
                setIsLoading(false);
                return;
            }

            // 3. Batched Multicall to get the STATUS of these rounds
            // Split into batches of 50 to ensure we don't hit RPC limits if user has many bets
            const roundIds = sortedLogs.map(log => (log.args as any).roundId);
            const BATCH_SIZE = 50;
            const foundHistory: HistoryItem[] = [];

            for (let i = 0; i < roundIds.length; i += BATCH_SIZE) {
                const batchIds = roundIds.slice(i, i + BATCH_SIZE);
                const batchLogs = sortedLogs.slice(i, i + BATCH_SIZE);

                const contracts: any[] = batchIds.map(id => ({
                    address: CONTRACT_ADDRESS,
                    abi: BaseFlipABI,
                    functionName: 'rounds',
                    args: [id]
                } as const));

                const batchResults = await publicClient.multicall({
                    contracts,
                    allowFailure: true
                });

                // Process batch
                for (let j = 0; j < batchResults.length; j++) {
                    const log = batchLogs[j];
                    const roundResult = batchResults[j];
                    const args = log.args as any;

                    if (roundResult.status === 'success') {
                        const r: any = roundResult.result;

                        const roundId = Number(args.roundId);
                        const stakeAmount = args.amount;
                        const stakeGroup = args.group;

                        // Round Data
                        const isCompleted = Array.isArray(r) ? r[6] : r.isCompleted;
                        const winningGroup = Number(Array.isArray(r) ? r[8] : r.winningGroup);
                        const createdAt = Number(Array.isArray(r) ? r[4] : r.createdAt);

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
            console.error("Error fetching history via logs:", error);
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
