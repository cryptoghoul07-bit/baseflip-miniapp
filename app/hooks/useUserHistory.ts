
import { useState, useCallback, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther, parseAbiItem } from 'viem';
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
        console.log("[useUserHistory] Starting Hybrid History Sync for:", address);

        try {
            // 1. Get current round ID for the "Direct Scan" range
            const currentId = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'currentRoundId',
            }) as bigint;

            const maxId = Number(currentId);
            const RECENT_SCAN_DEPTH = 150n; // Scan last 150 rounds directly (bulletproof)
            const startScanId = currentId > RECENT_SCAN_DEPTH ? currentId - RECENT_SCAN_DEPTH : 1n;

            console.log(`[useUserHistory] Scanning rounds ${startScanId} to ${currentId} directly...`);

            // 2. Prepare Direct Scans and Log Scans in Parallel
            const stakeEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');
            const latestBlock = await publicClient.getBlockNumber();

            // Multicall contracts for direct round/stake scan
            const directContracts: any[] = [];
            for (let id = currentId; id >= startScanId; id--) {
                directContracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [id, address] });
                directContracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [id] });
            }

            // Parallel Discovery Tasks
            const chunkPromises = [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n].map(i => {
                const to = latestBlock - (i * 500000n);
                const from = to - 500000n > 0n ? to - 500000n : 0n;
                return publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: stakeEvent as any,
                    fromBlock: from,
                    toBlock: to
                }).catch(() => []);
            });

            const [directResults, ...logResults] = await Promise.all([
                publicClient.multicall({ contracts: directContracts as any, allowFailure: true }).catch(() => []),
                ...chunkPromises
            ]);

            const finalHistoryMap = new Map<number, HistoryItem>();

            // 3. Process Direct Scan Results
            if (Array.isArray(directResults)) {
                for (let j = 0; j < directResults.length; j += 2) {
                    const sRes: any = directResults[j];
                    const rRes: any = directResults[j + 1];
                    const rId = Number(currentId - BigInt(Math.floor(j / 2)));

                    if (sRes?.status === 'success' && rRes?.status === 'success' && sRes.result && rRes.result) {
                        const s = sRes.result;
                        const r = rRes.result;
                        const amt = Array.isArray(s) ? s[0] : (s as any).amount;

                        if (amt && amt > 0n) {
                            finalHistoryMap.set(rId, {
                                roundId: rId,
                                amount: formatEther(amt),
                                group: Array.isArray(s) ? Number(s[1]) : Number((s as any).group),
                                winningGroup: Number(Array.isArray(r) ? r[8] : (r as any).winningGroup),
                                isCompleted: Array.isArray(r) ? r[6] : (r as any).isCompleted,
                                timestamp: Number(Array.isArray(r) ? r[4] : (r as any).createdAt)
                            });
                        }
                    }
                }
            }

            // 4. Process Log Results (Bypasses state deletion)
            const allLogs = logResults.flat() as any[];
            const userLogs = allLogs.filter(l => l?.args?.user?.toLowerCase() === address.toLowerCase());

            console.log(`[useUserHistory] Sync found ${userLogs.length} logs for ${address}`);

            if (userLogs.length > 0) {
                // Find IDs not already captured by the direct scan range
                const logRoundIds = Array.from(new Set(userLogs.map(l => BigInt(l.args.roundId))))
                    .filter(id => id < startScanId)
                    .slice(0, 40); // Limit to 40 historical rounds for speed

                if (logRoundIds.length > 0) {
                    const logContracts = logRoundIds.map(id => ({
                        address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [id]
                    }));

                    const logRoundResults = await publicClient.multicall({
                        contracts: logContracts as any,
                        allowFailure: true
                    }).catch(() => []);

                    if (Array.isArray(logRoundResults)) {
                        logRoundResults.forEach((roundRes: any, idx) => {
                            if (roundRes?.status === 'success' && roundRes.result) {
                                const rIdBig = logRoundIds[idx];
                                const rIdNum = Number(rIdBig);
                                const r = roundRes.result;
                                const logsForRound = userLogs.filter(l => BigInt(l.args.roundId) === rIdBig);

                                logsForRound.forEach(l => {
                                    finalHistoryMap.set(rIdNum, {
                                        roundId: rIdNum,
                                        amount: formatEther(l.args.amount),
                                        group: Number(l.args.group),
                                        winningGroup: Number(Array.isArray(r) ? r[8] : (r as any).winningGroup),
                                        isCompleted: Array.isArray(r) ? r[6] : (r as any).isCompleted,
                                        timestamp: Number(Array.isArray(r) ? r[4] : (r as any).createdAt)
                                    });
                                });
                            }
                        });
                    }
                }
            }

            const finalHistoryArray = Array.from(finalHistoryMap.values())
                .sort((a, b) => b.roundId - a.roundId);

            console.log(`[useUserHistory] Final visible history items: ${finalHistoryArray.length}`);
            setHistory(finalHistoryArray);

        } catch (error) {
            console.error("[useUserHistory] Hybrid Sync Failed:", error);
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
