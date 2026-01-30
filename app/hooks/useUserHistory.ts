import { useState, useCallback, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;

export interface HistoryItem {
    roundId: number;
    amount: string; // The primary amount to display (Stake for Pending/Loss, Payout for Win)
    stakeAmount: string; // The original stake
    group: number; // 1 = A, 2 = B
    winningGroup: number; // 0 if pending
    isCompleted: boolean;
    isWinner: boolean;
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
            // 1. Get current state info
            const currentIdBn = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'currentRoundId'
            }) as bigint;
            const currentId = Number(currentIdBn);

            // 2. Scan recent rounds (limit to 50 for performance and reliability)
            const roundsToScan = Array.from({ length: Math.min(currentId, 50) }, (_, i) => currentId - i).filter(id => id > 0);
            const contracts: any[] = [];
            roundsToScan.forEach(id => {
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [BigInt(id)] });
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [BigInt(id), address] });
            });

            // 3. Fetch data and logs
            const [multicallResults, claimLogs] = await Promise.all([
                publicClient.multicall({ contracts: contracts as any, allowFailure: true }),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: BaseFlipABI.find(x => x.name === 'PayoutClaimed') as any,
                    args: { user: address },
                    fromBlock: 'earliest'
                }).catch(() => [])
            ]);

            const claimLogMap = new Map<string, any>();
            (claimLogs as any[]).forEach(log => {
                claimLogMap.set(`PayoutClaimed_${log.args.roundId}`, log.args);
            });

            const finalHistory: HistoryItem[] = [];

            for (let i = 0; i < roundsToScan.length; i++) {
                const rId = roundsToScan[i];
                const rRes = multicallResults[i * 2];
                const sRes = multicallResults[i * 2 + 1];

                if (rRes?.status === 'success' && sRes?.status === 'success') {
                    const r = rRes.result as any;
                    const s = sRes.result as any;

                    // Parse round data from array or object
                    const isRArr = Array.isArray(r);
                    const poolA = isRArr ? r[1] : r.poolA;
                    const poolB = isRArr ? r[2] : r.poolB;
                    const isCompleted = isRArr ? r[6] : r.isCompleted;
                    const winningGroup = Number(isRArr ? r[8] : r.winningGroup);
                    const createdAt = Number(isRArr ? r[4] : r.createdAt);

                    // Parse user stake info
                    const isSArr = Array.isArray(s);
                    const stakeAmtBn = isSArr ? s[0] as bigint : s.amount as bigint;
                    const userGroup = Number(isSArr ? s[1] : s.group);

                    // If user participated in this round (group 1 or 2)
                    if (userGroup > 0) {
                        const isWinner = isCompleted && winningGroup === userGroup;
                        const claimLog = claimLogMap.get(`PayoutClaimed_${rId}`);

                        // Get accurate stake amount (for claimed wins, it's 0 in state, so we estimate/use log if possible)
                        // But since we want "reliable amounts", we use fallback for claimed wins if logs fail.
                        let stakeValue = stakeAmtBn > 0n ? formatEther(stakeAmtBn) : (claimLog ? "0.001+" : "0.001+");

                        let displayValue = stakeValue;
                        let payoutValue: string | undefined = undefined;

                        if (isWinner) {
                            if (claimLog) {
                                // ACTUAL amount from the blockchain event (100% accurate)
                                displayValue = formatEther(claimLog.amount);
                                payoutValue = displayValue;
                            } else {
                                // Calculate potential winnings based on pools
                                // WIN = MyStake + (OpponentPool * 0.99 * (MyStake/MyPool))
                                try {
                                    const myPool = winningGroup === 1 ? poolA : poolB;
                                    const opPool = winningGroup === 1 ? poolB : poolA;
                                    // Use 0.001 as fallback stake if state is 0 (claimed)
                                    const calcStake = stakeAmtBn > 0n ? stakeAmtBn : 1000000000000000n;

                                    if (myPool > 0n) {
                                        const payoutPool = (BigInt(opPool) * 99n) / 100n;
                                        const share = (calcStake * payoutPool) / BigInt(myPool);
                                        const total = calcStake + share;
                                        displayValue = formatEther(total);
                                        payoutValue = displayValue;
                                    }
                                } catch (e) {
                                    console.error("Payout calc failed", e);
                                }
                            }
                        }

                        finalHistory.push({
                            roundId: rId,
                            amount: displayValue,
                            stakeAmount: stakeValue,
                            group: userGroup,
                            winningGroup,
                            isCompleted,
                            isWinner,
                            timestamp: createdAt,
                            payout: payoutValue
                        });
                    }
                }
            }

            setHistory(finalHistory.sort((a, b) => b.roundId - a.roundId));
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
