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
        console.log("[useUserHistory] Deep Intelligence Sync started for:", address);

        try {
            const currentId = await publicClient.readContract({
                address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'currentRoundId'
            }) as bigint;

            const latestBlock = await publicClient.getBlockNumber();
            const stakeEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');
            const claimEvent = BaseFlipABI.find(x => x.name === 'PayoutClaimed');

            // 1. Parallel Task: Scan for both Placement and Claims (High Reliability)
            const chunkCount = 12; // ~140 days
            const chunkSize = 500000n;

            const logPromises = [];
            for (let i = 0n; i < BigInt(chunkCount); i++) {
                const to = latestBlock - (i * chunkSize);
                const from = to - chunkSize > 0n ? to - chunkSize : 0n;

                // Fetch Stake events with address filter (very fast on most RPCs)
                logPromises.push(
                    publicClient.getLogs({
                        address: CONTRACT_ADDRESS,
                        event: stakeEvent as any,
                        args: { user: address },
                        fromBlock: from,
                        toBlock: to
                    }).catch(() => [])
                );
                // Fetch Claim events with address filter
                logPromises.push(
                    publicClient.getLogs({
                        address: CONTRACT_ADDRESS,
                        event: claimEvent as any,
                        args: { user: address },
                        fromBlock: from,
                        toBlock: to
                    }).catch(() => [])
                );
            }

            const rawChunks = await Promise.all(logPromises);
            const allLogs = rawChunks.flat() as any[];

            // 2. Map of Round Discovery
            const discoveryMap = new Map<number, { amount: string, group: number }>();

            // First pass: Process stakes
            allLogs.filter(l => l.eventName === 'StakePlaced').forEach(l => {
                discoveryMap.set(Number(l.args.roundId), {
                    amount: formatEther(l.args.amount),
                    group: Number(l.args.group)
                });
            });

            // Second pass: Ensure claimed wins are noted even if stake log failed
            allLogs.filter(l => l.eventName === 'PayoutClaimed').forEach(l => {
                const rid = Number(l.args.roundId);
                if (!discoveryMap.has(rid)) {
                    discoveryMap.set(rid, {
                        amount: formatEther(l.args.amount), // Note: amount in claim is payout
                        group: 0 // Will try to find group in state/outcome
                    });
                }
            });

            // 3. Supplement with Direct Scan of last 100 rounds
            const allUniqueIds = Array.from(new Set([
                ...Array.from({ length: 100 }, (_, i) => Number(currentId) - i).filter(id => id > 0),
                ...Array.from(discoveryMap.keys())
            ])).sort((a, b) => b - a).slice(0, 100);

            // Fetch Outcomes + Stakes for all discovered rounds
            const contracts: any[] = [];
            allUniqueIds.forEach(id => {
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [BigInt(id)] });
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [BigInt(id), address] });
            });

            const results = await publicClient.multicall({
                contracts: contracts as any,
                allowFailure: true
            });

            const finalHistory: HistoryItem[] = [];

            for (let i = 0; i < allUniqueIds.length; i++) {
                const rId = allUniqueIds[i];
                const rRes: any = results[i * 2];
                const sRes: any = results[i * 2 + 1];

                if (rRes?.status === 'success' && rRes.result) {
                    const r = rRes.result;
                    const logData = discoveryMap.get(rId);

                    let amountStr = logData?.amount;
                    let group = logData?.group;

                    // Deep fallback for missing logs
                    if (sRes?.status === 'success' && sRes.result) {
                        const s = sRes.result;
                        const amt = Array.isArray(s) ? s[0] : (s as any).amount;
                        const grp = Array.isArray(s) ? Number(s[1]) : Number((s as any).group);

                        // If we found a stake in state, use it (handles current bets/unclaimed wins)
                        if (amt > 0n) {
                            amountStr = formatEther(amt);
                            group = grp;
                        }
                        // If we had a log but group was 0 (from claim log), try to find group in state
                        else if (group === 0 && grp > 0) {
                            group = grp;
                        }
                    }

                    // Special case: If it was a claim, the group might be missing from both logs and state
                    // In that case, we can assume group was the winningGroup if it's completed
                    if (amountStr && (group === undefined || group === 0)) {
                        const winGrp = Number(Array.isArray(r) ? r[8] : (r as any).winningGroup);
                        if (winGrp > 0) group = winGrp;
                    }

                    if (amountStr && group && group > 0) {
                        finalHistory.push({
                            roundId: rId,
                            amount: amountStr,
                            group: group,
                            winningGroup: Number(Array.isArray(r) ? r[8] : (r as any).winningGroup),
                            isCompleted: Array.isArray(r) ? r[6] : (r as any).isCompleted,
                            timestamp: Number(Array.isArray(r) ? r[4] : (r as any).createdAt)
                        });
                    }
                }
            }

            console.log(`[useUserHistory] Intelligence Sync Complete. Found ${finalHistory.length} items.`);
            setHistory(finalHistory);

        } catch (error) {
            console.error("[useUserHistory] Global Sync Error:", error);
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
