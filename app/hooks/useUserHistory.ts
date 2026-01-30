import { useState, useCallback, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;

export interface HistoryItem {
    roundId: number;
    amount: string; // The primary display amount
    stakeAmount: string; // The original stake
    group: number; // 1 = A, 2 = B
    winningGroup: number; // 0 if pending
    isCompleted: boolean;
    isCancelled: boolean;
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
            const currentIdBn = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'currentRoundId'
            }) as bigint;
            const currentId = Number(currentIdBn);

            // Scan last 50 rounds
            const roundsToScan = Array.from({ length: Math.min(currentId, 50) }, (_, i) => currentId - i).filter(id => id > 0);
            const contracts: any[] = [];
            roundsToScan.forEach(id => {
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [BigInt(id)] });
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [BigInt(id), address] });
            });

            // Fetch only necessary logs (Claim logs for exact payouts)
            // Use a block from ~3 days ago (Base block time ~2s, so ~130k blocks) to be safe and fast
            const latestBlock = await publicClient.getBlockNumber();
            const fromBlock = latestBlock > 200000n ? latestBlock - 200000n : 0n;

            const [multicallResults, claimLogs] = await Promise.all([
                publicClient.multicall({ contracts: contracts as any, allowFailure: true }),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: BaseFlipABI.find(x => x.name === 'PayoutClaimed') as any,
                    args: { user: address },
                    fromBlock: fromBlock
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

                    const isRArr = Array.isArray(r);
                    const poolA = isRArr ? r[1] : (r as any).poolA;
                    const poolB = isRArr ? r[2] : (r as any).poolB;
                    const isCompleted = isRArr ? r[6] : (r as any).isCompleted;
                    const isCancelled = isRArr ? r[7] : (r as any).isCancelled;
                    const winningGroup = Number(isRArr ? r[8] : (r as any).winningGroup);
                    const timestamp = Number(isRArr ? r[4] : (r as any).createdAt);

                    const isSArr = Array.isArray(s);
                    const stakeAmtBn = isSArr ? s[0] as bigint : (s as any).amount as bigint;
                    const userGroup = Number(isSArr ? s[1] : (s as any).group);

                    if (userGroup > 0) {
                        const isWinner = isCompleted && !isCancelled && winningGroup === userGroup;
                        const claimLog = claimLogMap.get(`PayoutClaimed_${rId}`);

                        // Get accurate stake from log or state (state is 0 if claimed, fallback to 0.001 but usually logs work)
                        let stakeValue = (stakeAmtBn > 0n) ? formatEther(stakeAmtBn) : "0.001+";

                        let displayValue = stakeValue;
                        let payoutValue: string | undefined = undefined;

                        if (isWinner) {
                            if (claimLog) {
                                displayValue = formatEther(claimLog.amount);
                            } else {
                                // Calculate pro-rata payout matching contract logic
                                // totalPayout = userStake.amount + ((userStake.amount * (losingPool * 0.99)) / winningPool)
                                try {
                                    const winningPool = winningGroup === 1 ? poolA : poolB;
                                    const losingPool = winningGroup === 1 ? poolB : poolA;
                                    const calcStake = stakeAmtBn > 0n ? stakeAmtBn : 1000000000000000n; // fallback min-bet

                                    if (winningPool > 0n) {
                                        const payoutTotalPool = (BigInt(losingPool) * 99n) / 100n;
                                        const userShare = (calcStake * payoutTotalPool) / BigInt(winningPool);
                                        displayValue = formatEther(calcStake + userShare);
                                    }
                                } catch (e) { console.error(e); }
                            }
                            payoutValue = displayValue;
                        }

                        finalHistory.push({
                            roundId: rId,
                            amount: displayValue,
                            stakeAmount: stakeValue,
                            group: userGroup,
                            winningGroup,
                            isCompleted,
                            isCancelled,
                            isWinner,
                            timestamp,
                            payout: payoutValue
                        });
                    }
                }
            }
            setHistory(finalHistory.sort((a, b) => b.roundId - a.roundId));
        } catch (error) {
            console.error("[useUserHistory] Sync Error:", error);
        } finally {
            setIsLoading(false);
        }
    }, [address, publicClient]);

    useEffect(() => {
        if (address) { fetchHistory(); }
    }, [address, fetchHistory]);

    return { history, isLoading, refetchHistory: fetchHistory };
}
