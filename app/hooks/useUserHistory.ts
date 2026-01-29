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
}

export function useUserHistory() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchHistory = useCallback(async () => {
        if (!address || !publicClient || !CONTRACT_ADDRESS) return;

        setIsLoading(true);
        console.log(`[useUserHistory] Final Recon Sync. User: ${address}`);

        try {
            // 1. Get current round ID
            const currentIdBn = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'currentRoundId'
            }) as bigint;
            const currentId = Number(currentIdBn);

            // 2. Discovery Phase: Collect all points of interaction
            // Since the contract has < 1000 rounds (currently ~13), we can scan EVERY round from memory
            // This is 100% reliable for current state.
            const roundsToScan = Array.from({ length: Math.min(currentId, 1000) }, (_, i) => currentId - i).filter(id => id > 0);

            // 3. Parallel Logs Scan (for archival data / already claimed wins)
            const latestBlock = await publicClient.getBlockNumber();
            const stakeEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');
            const claimEvent = BaseFlipABI.find(x => x.name === 'PayoutClaimed');

            const logChunks = [];
            const CHUNK_SIZE = 250000n; // 250k is very safe
            for (let i = 0n; i < 8n; i++) {
                const to = latestBlock - (i * CHUNK_SIZE);
                const from = to - CHUNK_SIZE > 0n ? to - CHUNK_SIZE : 0n;
                if (to <= 0n) break;

                logChunks.push(publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: stakeEvent as any,
                    fromBlock: from,
                    toBlock: to
                }).catch(() => []));

                logChunks.push(publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: claimEvent as any,
                    fromBlock: from,
                    toBlock: to
                }).catch(() => []));
            }

            // 4. Multicall for round state + user stakes
            const contracts: any[] = [];
            roundsToScan.forEach(id => {
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [BigInt(id)] });
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [BigInt(id), address] });
            });

            const [allLogsResults, multicallResults] = await Promise.all([
                Promise.all(logChunks),
                publicClient.multicall({ contracts: contracts as any, allowFailure: true })
            ]);

            const allLogs = allLogsResults.flat() as any[];
            const userAddressLower = address.toLowerCase();

            // 5. Data Processing
            const finalMap = new Map<number, HistoryItem>();

            // Process log data first (discovery of historical bets)
            allLogs.forEach(log => {
                if (!log?.args?.user || log.args.user.toLowerCase() !== userAddressLower) return;

                const rid = Number(log.args.roundId);
                const existing = finalMap.get(rid);

                if (log.eventName === 'StakePlaced') {
                    finalMap.set(rid, {
                        ...existing,
                        roundId: rid,
                        amount: formatEther(log.args.amount),
                        group: Number(log.args.group),
                        winningGroup: existing?.winningGroup || 0,
                        isCompleted: existing?.isCompleted || false,
                        timestamp: existing?.timestamp || 0
                    });
                } else if (log.eventName === 'PayoutClaimed') {
                    // If we found a claim, the user definitely won this round
                    finalMap.set(rid, {
                        ...existing,
                        roundId: rid,
                        amount: existing?.amount || '0', // Fallback if stake log missing
                        group: existing?.group || 0, // Fallback
                        winningGroup: existing?.winningGroup || 0,
                        isCompleted: true,
                        timestamp: existing?.timestamp || 0,
                        payout: formatEther(log.args.amount)
                    });
                }
            });

            // Augment and Verify with State Data
            for (let i = 0; i < roundsToScan.length; i++) {
                const rId = roundsToScan[i];
                const rRes: any = multicallResults[i * 2];
                const sRes: any = multicallResults[i * 2 + 1];

                if (rRes?.status === 'success' && rRes.result) {
                    const r = rRes.result;
                    const s = sRes?.status === 'success' ? sRes.result : null;

                    const curRoundId = rId;
                    const roundCompleted = Array.isArray(r) ? r[6] : (r as any).isCompleted;
                    const roundWinningGroup = Number(Array.isArray(r) ? r[8] : (r as any).winningGroup);
                    const roundTimestamp = Number(Array.isArray(r) ? r[4] : (r as any).createdAt);

                    // Check if user has active/archived stake in current state
                    const stateAmt = s ? (Array.isArray(s) ? s[0] : (s as any).amount) : 0n;
                    const stateGrp = s ? (Array.isArray(s) ? Number(s[1]) : Number((s as any).group)) : 0;

                    const existing = finalMap.get(rId);

                    // If user has a stake in state, OR they were in our logs
                    if (stateAmt > 0n || existing) {
                        const finalItem: HistoryItem = {
                            roundId: rId,
                            amount: stateAmt > 0n ? formatEther(stateAmt) : (existing?.amount || '0'),
                            group: stateGrp > 0 ? stateGrp : (existing?.group || roundWinningGroup), // Assume winningGroup if they claimed
                            winningGroup: roundWinningGroup,
                            isCompleted: roundCompleted,
                            timestamp: roundTimestamp
                        };

                        // Final check: Only add if we have some evidence of group/amount
                        if (Number(finalItem.amount) > 0 || finalItem.group > 0) {
                            finalMap.set(rId, finalItem);
                        }
                    }
                }
            }

            const historyList = Array.from(finalMap.values())
                .filter(item => Number(item.amount) > 0) // Hide zero-amount glitches
                .sort((a, b) => b.roundId - a.roundId);

            console.log(`[useUserHistory] Recon complete. Showing ${historyList.length} items.`);
            setHistory(historyList);

        } catch (error) {
            console.error("[useUserHistory] Fatal Sync Error:", error);
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
