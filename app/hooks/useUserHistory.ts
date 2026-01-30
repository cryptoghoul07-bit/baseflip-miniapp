import { useState, useCallback, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;

export interface HistoryItem {
    roundId: number;
    amount: string; // The primary amount to display (Stake for Pending/Loss, Payout for Win)
    stakeAmount: string; // The original stake (always kept for reference)
    group: number; // 1 = A, 2 = B
    winningGroup: number; // 0 if pending
    isCompleted: boolean;
    timestamp: number;
    payout?: string;
    isClaimed?: boolean;
    isWinner: boolean;
}

export function useUserHistory() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchHistory = useCallback(async () => {
        if (!address || !publicClient || !CONTRACT_ADDRESS) return;

        setIsLoading(true);
        console.log(`[useUserHistory] Syncing history for: ${address}`);

        try {
            // 1. Get current round ID
            const currentIdBn = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'currentRoundId'
            }) as bigint;
            const currentId = Number(currentIdBn);

            // 2. Scan last 50 rounds for activity
            const roundsToScan = Array.from({ length: Math.min(currentId, 50) }, (_, i) => currentId - i).filter(id => id > 0);
            const contracts: any[] = [];
            roundsToScan.forEach(id => {
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [BigInt(id)] });
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [BigInt(id), address] });
            });

            // 3. Fetch logs for precise amounts
            const stakeEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');
            const claimEvent = BaseFlipABI.find(x => x.name === 'PayoutClaimed');

            const [multicallResults, stakeLogs, claimLogs] = await Promise.all([
                publicClient.multicall({ contracts: contracts as any, allowFailure: true }),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: stakeEvent as any,
                    args: { user: address },
                    fromBlock: 0n, // Search all history
                    toBlock: 'latest'
                }).catch(() => []),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: claimEvent as any,
                    args: { user: address },
                    fromBlock: 0n,
                    toBlock: 'latest'
                }).catch(() => [])
            ]);

            const logMap = new Map<string, any>();
            (stakeLogs as any[]).forEach(log => logMap.set(`StakePlaced_${log.args.roundId}`, log.args));
            (claimLogs as any[]).forEach(log => logMap.set(`PayoutClaimed_${log.args.roundId}`, log.args));

            const finalHistory: HistoryItem[] = [];

            for (let i = 0; i < roundsToScan.length; i++) {
                const rId = roundsToScan[i];
                const rRes: any = multicallResults[i * 2];
                const sRes: any = multicallResults[i * 2 + 1];

                if (rRes?.status === 'success' && rRes.result && sRes?.status === 'success') {
                    const r = rRes.result;
                    const s = sRes.result;

                    const isArrayR = Array.isArray(r);
                    const isArrayS = Array.isArray(s);

                    const poolA = isArrayR ? r[1] as bigint : (r as any).poolA as bigint;
                    const poolB = isArrayR ? r[2] as bigint : (r as any).poolB as bigint;
                    const roundCompleted = isArrayR ? r[6] as boolean : (r as any).isCompleted as boolean;
                    const winningGroup = Number(isArrayR ? r[8] : (r as any).winningGroup);
                    const timestamp = Number(isArrayR ? r[4] : (r as any).createdAt);

                    const stateAmt = isArrayS ? s[0] as bigint : (s as any).amount as bigint;
                    const stateGrp = Number(isArrayS ? s[1] : (s as any).group);

                    if (stateGrp > 0) {
                        const stakeLog = logMap.get(`StakePlaced_${rId}`);
                        const claimLog = logMap.get(`PayoutClaimed_${rId}`);

                        const isWinner = roundCompleted && winningGroup === stateGrp;
                        const isClaimed = roundCompleted && isWinner && stateAmt === 0n;

                        // Calculate original stake amount
                        let originalStakeBn = stateAmt > 0n ? stateAmt : (stakeLog?.amount || 0n);

                        // If we still have 0 (e.g. claimed win and logs failed), fallback to 0.001 ETH
                        if (originalStakeBn === 0n) originalStakeBn = 1000000000000000n;

                        let displayAmount = formatEther(originalStakeBn);
                        let payoutAmount: string | undefined = undefined;

                        if (isWinner) {
                            // Calculate accurate win amount: Stake + (Opponent Pool * 0.99 * MyShare)
                            try {
                                const winningPool = winningGroup === 1 ? poolA : poolB;
                                const losingPool = winningGroup === 1 ? poolB : poolA;

                                if (winningPool > 0n && losingPool > 0n) {
                                    const payoutPool = (losingPool * 99n) / 100n;
                                    const userShare = (originalStakeBn * payoutPool) / winningPool;
                                    const calculatedPayout = originalStakeBn + userShare;

                                    // Use the claim log amount if available, otherwise use calculated
                                    payoutAmount = claimLog ? formatEther(claimLog.amount) : formatEther(calculatedPayout);
                                    displayAmount = payoutAmount;
                                }
                            } catch (err) {
                                console.error(`[History] Calc failed for round ${rId}`, err);
                            }
                        }

                        finalHistory.push({
                            roundId: rId,
                            amount: displayAmount,
                            stakeAmount: formatEther(originalStakeBn),
                            group: stateGrp,
                            winningGroup: winningGroup,
                            isCompleted: roundCompleted,
                            timestamp,
                            payout: payoutAmount,
                            isClaimed,
                            isWinner
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
        if (address) {
            fetchHistory();
        }
    }, [address, fetchHistory]);

    return { history, isLoading, refetchHistory: fetchHistory };
}
