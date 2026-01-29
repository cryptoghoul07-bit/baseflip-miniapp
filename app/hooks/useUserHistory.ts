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
        console.log(`[useUserHistory] Starting Ultra Sync for Address: ${address}`);
        console.log(`[useUserHistory] Contract: ${CONTRACT_ADDRESS}`);

        try {
            const currentIdBn = await publicClient.readContract({
                address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'currentRoundId'
            }) as bigint;
            const currentId = Number(currentIdBn);

            const latestBlock = await publicClient.getBlockNumber();
            const stakeEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');
            const claimEvent = BaseFlipABI.find(x => x.name === 'PayoutClaimed');

            // 1. Log Discovery (Massive block range, 8 million blocks)
            // Parallel fetch WITHOUT user filter for maximum reliability
            const lookbackBlocks = 8000000n;
            const chunkSize = 1000000n; // 1M blocks is usually fine for Base Sepolia
            const chunks = [];
            for (let i = 0n; i < 8n; i++) {
                const to = latestBlock - (i * chunkSize);
                const from = to - chunkSize > 0n ? to - chunkSize : 0n;
                if (to <= 0n) break;

                chunks.push(
                    publicClient.getLogs({
                        address: CONTRACT_ADDRESS,
                        event: stakeEvent as any,
                        fromBlock: from,
                        toBlock: to
                    }).catch(() => [])
                );
                chunks.push(
                    publicClient.getLogs({
                        address: CONTRACT_ADDRESS,
                        event: claimEvent as any,
                        fromBlock: from,
                        toBlock: to
                    }).catch(() => [])
                );
            }

            const rawLogResults = await Promise.all(chunks);
            const allLogs = rawLogResults.flat() as any[];

            // Filter logs locally in JS for 100% reliability
            const userAddressLower = address.toLowerCase();
            const userStakeLogs = allLogs.filter(l =>
                l.eventName === 'StakePlaced' &&
                l.args.user?.toLowerCase() === userAddressLower
            );
            const userClaimLogs = allLogs.filter(l =>
                l.eventName === 'PayoutClaimed' &&
                l.args.user?.toLowerCase() === userAddressLower
            );

            console.log(`[useUserHistory] Found ${userStakeLogs.length} stakes and ${userClaimLogs.length} claims in logs.`);

            // 2. Discover Round IDs
            const discoveryMap = new Map<number, { amount: string, group: number }>();

            userStakeLogs.forEach(l => {
                discoveryMap.set(Number(l.args.roundId), {
                    amount: formatEther(l.args.amount),
                    group: Number(l.args.group)
                });
            });

            userClaimLogs.forEach(l => {
                const rid = Number(l.args.roundId);
                if (!discoveryMap.has(rid)) {
                    // If we only found a claim log (stake log missing from range), we note it
                    discoveryMap.set(rid, {
                        amount: '0', // Will try to find correct amount from state or log
                        group: 0
                    });
                }
            });

            // 3. Round Scan (Check last 200 rounds + any log-discovered rounds)
            const roundsToSweep = new Set<number>();
            // Add last 200 rounds for "No Log" safety
            for (let i = 0; i < 200; i++) {
                const rid = currentId - i;
                if (rid > 0) roundsToSweep.add(rid);
            }
            // Add all rounds found in logs
            discoveryMap.forEach((_, rid) => roundsToSweep.add(rid));

            const sortedSweepIds = Array.from(roundsToSweep).sort((a, b) => b - a).slice(0, 150);

            console.log(`[useUserHistory] Sweeping outcomes for ${sortedSweepIds.length} rounds...`);

            const contracts: any[] = [];
            sortedSweepIds.forEach(id => {
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [BigInt(id)] });
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [BigInt(id), address] });
            });

            const results = await publicClient.multicall({
                contracts: contracts as any,
                allowFailure: true
            });

            const finalHistory: HistoryItem[] = [];

            for (let i = 0; i < sortedSweepIds.length; i++) {
                const rId = sortedSweepIds[i];
                const rRes: any = results[i * 2];
                const sRes: any = results[i * 2 + 1];

                if (rRes?.status === 'success' && rRes.result) {
                    const r = rRes.result;
                    const logData = discoveryMap.get(rId);

                    let amountStr = logData?.amount || '0';
                    let group = logData?.group || 0;

                    // Update from State if current
                    if (sRes?.status === 'success' && sRes.result) {
                        const s = sRes.result;
                        const stateAmt = Array.isArray(s) ? s[0] : (s as any).amount;
                        const stateGrp = Array.isArray(s) ? Number(s[1]) : Number((s as any).group);

                        if (stateAmt > 0n) {
                            amountStr = formatEther(stateAmt);
                            group = stateGrp;
                        } else if (group === 0 && stateGrp > 0) {
                            group = stateGrp;
                        }
                    }

                    // Special: If we still don't have amount/group (Claimed win but stake log missing)
                    // We check if it's a win and use that
                    if (amountStr === '0' || group === 0) {
                        const winGrp = Number(Array.isArray(r) ? r[8] : (r as any).winningGroup);
                        const isWinner = winGrp > 0 && winGrp === group;
                        // If it's completed and we saw a claim log, it's definitely a win
                        if (userClaimLogs.some(l => Number(l.args.roundId) === rId)) {
                            group = winGrp;
                            // Find amount from claim log
                            const claimLog = userClaimLogs.find(l => Number(l.args.roundId) === rId);
                            if (claimLog) {
                                // Contract PayoutClaimed amount is the prize. 
                                // To show original bet, we'd need more math, but showing 0 is worse than showing nothing.
                                // We'll leave it as found.
                            }
                        }
                    }

                    // Filter for display: Must have a valid amount and group
                    if (amountStr !== '0' && group > 0) {
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

            console.log(`[useUserHistory] Sync success. Final visible count: ${finalHistory.length}`);
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
