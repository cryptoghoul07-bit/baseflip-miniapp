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
        console.log(`[useUserHistory] Hybrid Sync Active for: ${address}`);

        try {
            // 1. Get current round ID to know where to start scanning
            const currentIdBn = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'currentRoundId'
            }) as bigint;
            const currentId = Number(currentIdBn);

            // 2. Scan last 100 rounds via Multicall (Hyper-Reliable Discovery)
            // Even if logs fail, this will find your bets.
            const roundsToScan = Array.from({ length: Math.min(currentId, 100) }, (_, i) => currentId - i).filter(id => id > 0);

            const stakeCalls = roundsToScan.map(rid => ({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'userStakes',
                args: [BigInt(rid), address]
            }));

            const stakeResults = await publicClient.multicall({
                contracts: stakeCalls as any,
                allowFailure: true
            });

            // Identify which rounds the user actually participated in
            const participatedRoundIds: number[] = [];
            const stakeDataMap = new Map<number, { amount: bigint, group: number }>();

            for (let i = 0; i < roundsToScan.length; i++) {
                const res = stakeResults[i];
                if (res?.status === 'success' && res.result) {
                    const s = res.result as any;
                    const isArr = Array.isArray(s);
                    const group = Number(isArr ? s[1] : s.group);
                    const amount = (isArr ? s[0] : s.amount) as bigint;

                    // If they have a group assigned OR an amount (amount is 0 if claimed)
                    // We also fetch logs to find historical amounts for claimed wins.
                    if (group > 0) {
                        participatedRoundIds.push(roundsToScan[i]);
                        stakeDataMap.set(roundsToScan[i], { amount, group });
                    }
                }
            }

            if (participatedRoundIds.length === 0) {
                setHistory([]);
                return;
            }

            // 3. Fetch logs ONLY for identified rounds to get precise historical data
            const [roundDataResults, stakeLogs, claimLogs] = await Promise.all([
                publicClient.multicall({
                    contracts: participatedRoundIds.map(rid => ({
                        address: CONTRACT_ADDRESS,
                        abi: BaseFlipABI,
                        functionName: 'rounds',
                        args: [BigInt(rid)]
                    })) as any,
                    allowFailure: true
                }),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event StakePlaced(uint256 indexed roundId, address indexed user, uint8 group, uint256 amount)'),
                    args: { user: address },
                    fromBlock: 0n // Search everything for these specific users
                }).catch(() => []),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event PayoutClaimed(uint256 indexed roundId, address indexed user, uint256 amount)'),
                    args: { user: address },
                    fromBlock: 0n
                }).catch(() => [])
            ]);

            const logMapStake = new Map<number, any>();
            stakeLogs.forEach((l: any) => logMapStake.set(Number(l.args.roundId), l.args));

            const logMapClaim = new Map<number, any>();
            claimLogs.forEach((l: any) => logMapClaim.set(Number(l.args.roundId), l.args));

            const finalHistory: HistoryItem[] = [];

            for (let i = 0; i < participatedRoundIds.length; i++) {
                const rid = participatedRoundIds[i];
                const roundRes = roundDataResults[i];
                const stateStake = stakeDataMap.get(rid);

                if (roundRes?.status === 'success' && roundRes.result && stateStake) {
                    const r = roundRes.result as any;
                    const isRArr = Array.isArray(r);

                    const poolA = isRArr ? r[1] as bigint : r.poolA;
                    const poolB = isRArr ? r[2] as bigint : r.poolB;
                    const isCompleted = isRArr ? r[6] as boolean : r.isCompleted;
                    const isCancelled = isRArr ? r[7] as boolean : r.isCancelled;
                    const winningGroup = Number(isRArr ? r[8] : r.winningGroup);
                    const createdAt = Number(isRArr ? r[4] : r.createdAt);

                    const stakeLog = logMapStake.get(rid);
                    const claimLog = logMapClaim.get(rid);

                    // Logic for "Original Stake"
                    // Use log first (it's the truth), then state (0 if claimed), then fallback
                    let originalStakeBn = stakeLog ? stakeLog.amount : (stateStake.amount > 0n ? stateStake.amount : 1000000000000000n);

                    const isWinner = isCompleted && !isCancelled && winningGroup === stateStake.group;
                    const isClaimed = !!claimLog;

                    let displayAmount = formatEther(originalStakeBn);
                    let payoutValue: string | undefined = undefined;

                    if (isWinner) {
                        if (isClaimed) {
                            displayAmount = formatEther(claimLog.amount);
                            payoutValue = displayAmount;
                        } else {
                            // Calculate expected payout from pools
                            try {
                                const winningPool = winningGroup === 1 ? poolA : poolB;
                                const losingPool = winningGroup === 1 ? poolB : poolA;
                                if (winningPool > 0n) {
                                    const payoutPool = (losingPool * 99n) / 100n;
                                    const userShare = (originalStakeBn * payoutPool) / winningPool;
                                    displayAmount = formatEther(originalStakeBn + userShare);
                                    payoutValue = displayAmount;
                                }
                            } catch (e) {
                                console.error(`[Sync] Calc error for ${rid}`, e);
                            }
                        }
                    }

                    finalHistory.push({
                        roundId: rid,
                        amount: displayAmount,
                        stakeAmount: formatEther(originalStakeBn),
                        group: stateStake.group,
                        winningGroup,
                        isCompleted,
                        isCancelled,
                        isWinner,
                        timestamp: createdAt,
                        payout: payoutValue,
                        isClaimed
                    });
                }
            }

            setHistory(finalHistory);

        } catch (error) {
            console.error("[useUserHistory] Fatal Sync Error:", error);
        } finally {
            setIsLoading(false);
        }
    }, [address, publicClient]);

    useEffect(() => {
        if (address) { fetchHistory(); }
    }, [address, fetchHistory]);

    return { history, isLoading, refetchHistory: fetchHistory };
}
