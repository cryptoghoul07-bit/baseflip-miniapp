import { useState, useCallback, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
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
    isClaimed?: boolean;
}

export function useUserHistory() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchHistory = useCallback(async () => {
        if (!address || !publicClient || !CONTRACT_ADDRESS) return;

        setIsLoading(true);
        console.log(`[useUserHistory] Deep Recon for: ${address}`);

        try {
            // 1. Get current round ID
            const currentIdBn = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'currentRoundId'
            }) as bigint;
            const currentId = Number(currentIdBn);

            // 2. State Sweep (Bulletproof discovery of groups)
            const roundsToScan = Array.from({ length: Math.min(currentId, 250) }, (_, i) => currentId - i).filter(id => id > 0);
            const contracts: any[] = [];
            roundsToScan.forEach(id => {
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [BigInt(id)] });
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [BigInt(id), address] });
            });

            // 3. Wide Block Range Discovery (10 Million Blocks)
            const latestBlock = await publicClient.getBlockNumber();
            const stakeEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');
            const claimEvent = BaseFlipABI.find(x => x.name === 'PayoutClaimed');

            const logPromises = [];
            const CHUNK_SIZE = 1000000n;
            for (let i = 0n; i < 10n; i++) { // 10 million block lookback
                const to = latestBlock - (i * CHUNK_SIZE);
                const from = to - CHUNK_SIZE > 0n ? to - CHUNK_SIZE : 0n;
                if (to <= 0n) break;

                logPromises.push(publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: stakeEvent as any,
                    args: { user: address },
                    fromBlock: from,
                    toBlock: to
                }).catch(() => []));

                logPromises.push(publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: claimEvent as any,
                    args: { user: address },
                    fromBlock: from,
                    toBlock: to
                }).catch(() => []));
            }

            const [multicallResults, ...logChunks] = await Promise.all([
                publicClient.multicall({ contracts: contracts as any, allowFailure: true }),
                ...logPromises
            ]);

            const allLogs = logChunks.flat() as any[];
            const logMap = new Map<string, any>();
            allLogs.forEach(log => {
                const key = `${log.eventName}_${log.args.roundId}`;
                logMap.set(key, log.args);
            });

            const finalHistory: HistoryItem[] = [];

            for (let i = 0; i < roundsToScan.length; i++) {
                const rId = roundsToScan[i];
                const rRes: any = multicallResults[i * 2];
                const sRes: any = multicallResults[i * 2 + 1];

                if (rRes?.status === 'success' && rRes.result) {
                    const r = rRes.result;
                    const s = sRes?.status === 'success' ? sRes.result : null;

                    const roundCompleted = Array.isArray(r) ? r[6] : (r as any).isCompleted;
                    const roundWinningGroup = Number(Array.isArray(r) ? r[8] : (r as any).winningGroup);
                    const roundTimestamp = Number(Array.isArray(r) ? r[4] : (r as any).createdAt);

                    const stateAmt = s ? (Array.isArray(s) ? s[0] : (s as any).amount) : 0n;
                    const stateGrp = s ? (Array.isArray(s) ? Number(s[1]) : Number((s as any).group)) : 0;

                    if (stateGrp > 0) {
                        const stakeLog = logMap.get(`StakePlaced_${rId}`);
                        const claimLog = logMap.get(`PayoutClaimed_${rId}`);

                        let stakeAmt = "0.001+";
                        if (stateAmt > 0n) {
                            stakeAmt = formatEther(stateAmt);
                        } else if (stakeLog?.amount) {
                            stakeAmt = formatEther(stakeLog.amount);
                        }

                        let payoutAmt = claimLog ? formatEther(claimLog.amount) : undefined;
                        let isClaimed = stateAmt === 0n && roundCompleted && stateGrp === roundWinningGroup;

                        // The primary 'amount' to display:
                        // If it's a win and we have a payout log, show the PAYOUT.
                        // Otherwise (loss, pending, or unclaimed win) show the STAKE.
                        let displayAmount = stakeAmt;
                        if (isClaimed && payoutAmt) {
                            displayAmount = payoutAmt;
                        }

                        finalHistory.push({
                            roundId: rId,
                            amount: displayAmount,
                            group: stateGrp,
                            winningGroup: roundWinningGroup,
                            isCompleted: roundCompleted,
                            timestamp: roundTimestamp,
                            payout: payoutAmt,
                            isClaimed: isClaimed
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
