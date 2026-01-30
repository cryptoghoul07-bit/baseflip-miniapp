import { useState, useCallback, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;

export interface HistoryItem {
    roundId: number;
    amount: string; // The primary display amount (Payout for won, Stake for lost/pending)
    stakeAmount: string; // Original bet
    group: number;
    winningGroup: number;
    isCompleted: boolean;
    isCancelled?: boolean;
    isWinner: boolean;
    timestamp: number;
    isClaimed: boolean;
}

export function useUserHistory() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // KEY IMPROVEMENT: Persistent "Rounds Log" in localStorage
    const getLocalLog = useCallback((): HistoryItem[] => {
        if (typeof window === 'undefined' || !address) return [];
        const saved = localStorage.getItem(`baseflip_history_${address}`);
        return saved ? JSON.parse(saved) : [];
    }, [address]);

    const saveLocalLog = useCallback((items: HistoryItem[]) => {
        if (typeof window === 'undefined' || !address) return;
        localStorage.setItem(`baseflip_history_${address}`, JSON.stringify(items));
    }, [address]);

    /**
     * Public method to capture a round result into the local log.
     * This should be called when a round completes.
     */
    const recordRoundResult = useCallback((item: HistoryItem) => {
        if (!address) return;
        const currentLog = getLocalLog();
        // Avoid duplicates
        if (!currentLog.find(l => l.roundId === item.roundId)) {
            const newLog = [item, ...currentLog].sort((a, b) => b.roundId - a.roundId);
            saveLocalLog(newLog);
            setHistory(newLog);
        }
    }, [address, getLocalLog, saveLocalLog]);

    const syncWithBlockchain = useCallback(async () => {
        if (!address || !publicClient || !CONTRACT_ADDRESS) return;

        setIsLoading(true);
        try {
            const currentLog = getLocalLog();
            const currentIdBn = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'currentRoundId'
            }) as bigint;
            const currentId = Number(currentIdBn);

            // Scan last 50 rounds, but skip ones we already have accurate persistent data for
            const roundsToScan = Array.from({ length: Math.min(currentId, 50) }, (_, i) => currentId - i)
                .filter(id => id > 0 && !currentLog.find(l => l.roundId === id && l.isCompleted));

            if (roundsToScan.length === 0) {
                setHistory(currentLog);
                setIsLoading(false);
                return;
            }

            const contracts: any[] = [];
            roundsToScan.forEach(id => {
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [BigInt(id)] });
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [BigInt(id), address] });
            });

            const results = await publicClient.multicall({
                contracts: contracts as any,
                allowFailure: true
            });

            const discoveredItems: HistoryItem[] = [];

            for (let i = 0; i < roundsToScan.length; i++) {
                const rid = roundsToScan[i];
                const rRes = results[i * 2];
                const sRes = results[i * 2 + 1];

                if (rRes?.status === 'success' && sRes?.status === 'success') {
                    const r = rRes.result as any;
                    const s = sRes.result as any;
                    const isRArr = Array.isArray(r);
                    const isSArr = Array.isArray(s);

                    const group = Number(isSArr ? s[1] : s.group);
                    if (group === 0) continue;

                    const stakeAmtBn = (isSArr ? s[0] : s.amount) as bigint;
                    const isCompleted = isRArr ? r[6] : (r as any).isCompleted;
                    const isCancelled = isRArr ? r[7] : (r as any).isCancelled;
                    const winningGroup = Number(isRArr ? r[8] : (r as any).winningGroup);
                    const createdAt = Number(isRArr ? r[4] : (r as any).createdAt);

                    const poolA = isRArr ? r[1] : (r as any).poolA;
                    const poolB = isRArr ? r[2] : (r as any).poolB;

                    const isWinner = isCompleted && !isCancelled && winningGroup === group;

                    let displayAmt = formatEther(stakeAmtBn);
                    if (isWinner) {
                        const winningPool = winningGroup === 1 ? poolA : poolB;
                        const losingPool = winningGroup === 1 ? poolB : poolA;
                        if (winningPool > 0n) {
                            const payoutPool = (BigInt(losingPool) * 99n) / 100n;
                            const share = (stakeAmtBn * payoutPool) / BigInt(winningPool);
                            displayAmt = formatEther(stakeAmtBn + share);
                        }
                    }

                    discoveredItems.push({
                        roundId: rid,
                        amount: displayAmt,
                        stakeAmount: formatEther(stakeAmtBn > 0n ? stakeAmtBn : 1000000000000000n),
                        group,
                        winningGroup,
                        isCompleted,
                        isCancelled,
                        isWinner,
                        timestamp: createdAt,
                        isClaimed: isCompleted && isWinner && stakeAmtBn === 0n
                    });
                }
            }

            // Merge discovered with local log and persist
            const merged = [...discoveredItems, ...currentLog]
                .filter((v, i, a) => a.findIndex(t => t.roundId === v.roundId) === i)
                .sort((a, b) => b.roundId - a.roundId);

            saveLocalLog(merged);
            setHistory(merged);

        } catch (error) {
            console.error("[useUserHistory] Sync Error:", error);
            setHistory(getLocalLog());
        } finally {
            setIsLoading(false);
        }
    }, [address, publicClient, getLocalLog, saveLocalLog]);

    useEffect(() => {
        if (address) {
            syncWithBlockchain();
        }
    }, [address, syncWithBlockchain]);

    return { history, isLoading, refetchHistory: syncWithBlockchain, recordRoundResult };
}
