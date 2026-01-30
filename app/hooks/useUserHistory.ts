import { useState, useCallback, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther, parseAbiItem } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;

export interface HistoryItem {
    roundId: number;
    amount: string;
    stakeAmount: string;
    group: number;
    winningGroup: number;
    isCompleted: boolean;
    isCancelled: boolean;
    isWinner: boolean;
    timestamp: number;
    payout?: string;
    isClaimed: boolean;
}

export function useUserHistory() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchHistory = useCallback(async () => {
        if (!address || !publicClient || !CONTRACT_ADDRESS) return;

        setIsLoading(true);
        console.log(`[useUserHistory] Starting High-Fidelity Sync for: ${address}`);

        try {
            // 1. Fetch ALL relevant logs for this user (Stake and Payout)
            // We search from a reasonable block height to save time, or 0n if necessary.
            // Base Sepolia is fast, searching last 1M blocks is usually safe.
            const latestBlock = await publicClient.getBlockNumber();
            const fromBlock = latestBlock > 1000000n ? latestBlock - 1000000n : 0n;

            const [stakeLogs, claimLogs] = await Promise.all([
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event StakePlaced(uint256 indexed roundId, address indexed user, uint8 group, uint256 amount)'),
                    args: { user: address },
                    fromBlock: fromBlock,
                    toBlock: 'latest'
                }).catch(() => []),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event PayoutClaimed(uint256 indexed roundId, address indexed user, uint256 amount)'),
                    args: { user: address },
                    fromBlock: fromBlock,
                    toBlock: 'latest'
                }).catch(() => [])
            ]);

            const logRounds = new Set<number>();
            const stakeLogMap = new Map<number, any>();
            const claimLogMap = new Map<number, any>();

            stakeLogs.forEach((log: any) => {
                const rid = Number(log.args.roundId);
                logRounds.add(rid);
                stakeLogMap.set(rid, log.args);
            });

            claimLogs.forEach((log: any) => {
                const rid = Number(log.args.roundId);
                logRounds.add(rid); // Just in case, though stake should precede
                claimLogMap.set(rid, log.args);
            });

            const sortedRoundIds = Array.from(logRounds).sort((a, b) => b - a);

            // 2. Multicall to get Round Data for all involved rounds
            const roundCalls = sortedRoundIds.map(rid => ({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'rounds',
                args: [BigInt(rid)]
            }));

            const roundResults = await publicClient.multicall({
                contracts: roundCalls as any,
                allowFailure: true
            });

            const finalHistory: HistoryItem[] = [];

            for (let i = 0; i < sortedRoundIds.length; i++) {
                const roundId = sortedRoundIds[i];
                const roundDataRes = roundResults[i];
                const stakeInfo = stakeLogMap.get(roundId);
                const claimInfo = claimLogMap.get(roundId);

                if (roundDataRes?.status === 'success' && roundDataRes.result && stakeInfo) {
                    const r = roundDataRes.result as any;
                    const isArr = Array.isArray(r);

                    const poolA = isArr ? r[1] as bigint : r.poolA;
                    const poolB = isArr ? r[2] as bigint : r.poolB;
                    const isCompleted = isArr ? r[6] as boolean : r.isCompleted;
                    const isCancelled = isArr ? r[7] as boolean : r.isCancelled;
                    const winningGroup = Number(isArr ? r[8] : r.winningGroup);
                    const timestamp = Number(isArr ? r[4] : r.createdAt);

                    const userGroup = Number(stakeInfo.group);
                    const userStakeAmt = stakeInfo.amount as bigint;

                    const isWinner = isCompleted && !isCancelled && winningGroup === userGroup;
                    const isClaimed = !!claimInfo;

                    let displayAmount = formatEther(userStakeAmt);
                    let payoutValue: string | undefined = undefined;

                    if (isWinner) {
                        if (isClaimed) {
                            // 100% accurate amount from the actual claim transaction
                            displayAmount = formatEther(claimInfo.amount);
                            payoutValue = displayAmount;
                        } else {
                            // Round is completed but not claimed yet.
                            // Calculate exactly what the contract WILL pay out.
                            try {
                                const winningPool = winningGroup === 1 ? poolA : poolB;
                                const losingPool = winningGroup === 1 ? poolB : poolA;

                                if (winningPool > 0n) {
                                    const payoutPool = (losingPool * 99n) / 100n;
                                    const userShare = (userStakeAmt * payoutPool) / winningPool;
                                    const totalPayout = userStakeAmt + userShare;
                                    displayAmount = formatEther(totalPayout);
                                    payoutValue = displayAmount;
                                }
                            } catch (err) {
                                console.error(`[Sync] Calc failed for round ${roundId}`, err);
                            }
                        }
                    }

                    finalHistory.push({
                        roundId,
                        amount: displayAmount,
                        stakeAmount: formatEther(userStakeAmt),
                        group: userGroup,
                        winningGroup,
                        isCompleted,
                        isCancelled,
                        isWinner,
                        timestamp,
                        payout: payoutValue,
                        isClaimed
                    });
                }
            }

            setHistory(finalHistory);

        } catch (error) {
            console.error("[useUserHistory] Sync Failure:", error);
        } finally {
            setIsLoading(false);
        }
    }, [address, publicClient]);

    useEffect(() => {
        if (address) { fetchHistory(); }
    }, [address, fetchHistory]);

    return { history, isLoading, refetchHistory: fetchHistory };
}
