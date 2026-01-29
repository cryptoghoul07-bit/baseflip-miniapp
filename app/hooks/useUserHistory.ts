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
        console.log(`[useUserHistory] Final Reconstruction Sequence. User: ${address}`);

        try {
            // 1. Get current state
            const currentIdBn = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'currentRoundId'
            }) as bigint;
            const currentId = Number(currentIdBn);

            // 2. Scan ALL rounds in contract (1 to latest)
            // Since currentId is very low (~13), this is the fastest and most reliable method
            const roundsToScan = Array.from({ length: Math.min(currentId, 500) }, (_, i) => currentId - i).filter(id => id > 0);

            // 3. Batch fetch round info and user stakes
            const contracts: any[] = [];
            roundsToScan.forEach(id => {
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [BigInt(id)] });
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [BigInt(id), address] });
            });

            // 4. Parallel Logs Scan (Searching for historical interaction trails)
            const latestBlock = await publicClient.getBlockNumber();
            const stakeEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');
            const claimEvent = BaseFlipABI.find(x => x.name === 'PayoutClaimed');

            const logPromises = [];
            // Scan last 5 million blocks in 10 chunks (very thorough)
            const CHUNK_SIZE = 500000n;
            for (let i = 0n; i < 10n; i++) {
                const to = latestBlock - (i * CHUNK_SIZE);
                const from = to - CHUNK_SIZE > 0n ? to - CHUNK_SIZE : 0n;
                if (to <= 0n) break;

                logPromises.push(publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: stakeEvent as any,
                    fromBlock: from,
                    toBlock: to
                }).catch(() => []));

                logPromises.push(publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: claimEvent as any,
                    fromBlock: from,
                    toBlock: to
                }).catch(() => []));
            }

            const [multicallResults, ...logChunks] = await Promise.all([
                publicClient.multicall({ contracts: contracts as any, allowFailure: true }),
                ...logPromises
            ]);

            const allLogs = logChunks.flat() as any[];
            const userAddressLower = address.toLowerCase();

            // 5. Build History Map
            const finalMap = new Map<number, HistoryItem>();

            // First: Process Logs (Captures "amount" and "group" even for deleted state items)
            allLogs.forEach(log => {
                if (!log?.args?.user || log.args.user.toLowerCase() !== userAddressLower) return;

                const rid = Number(log.args.roundId);
                const existing = finalMap.get(rid);

                if (log.eventName === 'StakePlaced') {
                    finalMap.set(rid, {
                        roundId: rid,
                        amount: formatEther(log.args.amount),
                        group: Number(log.args.group),
                        winningGroup: existing?.winningGroup || 0,
                        isCompleted: existing?.isCompleted || false,
                        timestamp: existing?.timestamp || 0,
                        payout: existing?.payout
                    });
                } else if (log.eventName === 'PayoutClaimed') {
                    finalMap.set(rid, {
                        ...existing,
                        roundId: rid,
                        amount: existing?.amount || '0',
                        group: existing?.group || 0,
                        winningGroup: existing?.winningGroup || 0,
                        isCompleted: true,
                        timestamp: existing?.timestamp || 0,
                        payout: formatEther(log.args.amount)
                    });
                }
            });

            // Second: Merge with State Data (Verifies logs and adds missing outcomes)
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

                    // User stake from current contract memory
                    const stateAmt = s ? (Array.isArray(s) ? s[0] : (s as any).amount) : 0n;
                    const stateGrp = s ? (Array.isArray(s) ? Number(s[1]) : Number((s as any).group)) : 0;

                    const existing = finalMap.get(rId);

                    // Intersection logic: If they are in logs OR have an active stake in memory
                    if (stateAmt > 0n || existing) {
                        const finalItem: HistoryItem = {
                            roundId: rId,
                            amount: stateAmt > 0n ? formatEther(stateAmt) : (existing?.amount || '0'),
                            group: stateGrp > 0 ? stateGrp : (existing?.group || 0),
                            winningGroup: roundWinningGroup,
                            isCompleted: roundCompleted,
                            timestamp: roundTimestamp,
                            payout: existing?.payout
                        };

                        // Fallback: If we know they claimed but stake log was missed, they MUST have beta on winningGroup
                        if (finalItem.payout && finalItem.group === 0) {
                            finalItem.group = finalItem.winningGroup;
                        }

                        // Sanity Check: If we have an amount or a group, this is a real record
                        if (Number(finalItem.amount) > 0 || finalItem.group > 0 || finalItem.payout) {
                            finalMap.set(rId, finalItem);
                        }
                    }
                }
            }

            // 6. Convert to List and Filter out empty glitched entries
            const historyList = Array.from(finalMap.values())
                .filter(item => (Number(item.amount) > 0 || (item.payout && Number(item.payout) > 0)))
                .sort((a, b) => b.roundId - a.roundId);

            console.log(`[useUserHistory] Sync Complete. Items reconstructed: ${historyList.length}`);
            setHistory(historyList);

        } catch (error) {
            console.error("[useUserHistory] Recon Failure:", error);
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
