import { useState, useCallback, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';
import CashOutOrDieABI from '../lib/CashOutOrDieABI.json';

const BASEFLIP_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;
const CASHOUT_ADDRESS = (process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS || '0x0') as `0x${string}`;

export interface HistoryItem {
    roundId: number;
    gameType: 'classic' | 'cashout';
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
        const saved = localStorage.getItem(`baseflip_history_v2_${address}`);
        return saved ? JSON.parse(saved) : [];
    }, [address]);

    const saveLocalLog = useCallback((items: HistoryItem[]) => {
        if (typeof window === 'undefined' || !address) return;
        localStorage.setItem(`baseflip_history_v2_${address}`, JSON.stringify(items));
    }, [address]);

    const recordRoundResult = useCallback((item: HistoryItem) => {
        if (!address) return;
        const currentLog = getLocalLog();
        // Avoid duplicates (using combination of type and id)
        if (!currentLog.find(l => l.roundId === item.roundId && l.gameType === item.gameType)) {
            const newLog = [item, ...currentLog].sort((a, b) => b.timestamp - a.timestamp);
            saveLocalLog(newLog);
            setHistory(newLog);
        }
    }, [address, getLocalLog, saveLocalLog]);

    const syncWithBlockchain = useCallback(async () => {
        if (!address || !publicClient) return;

        setIsLoading(true);
        try {
            const currentLog = getLocalLog();

            // --- Sync Classic ---
            const classicIdBn = await publicClient.readContract({
                address: BASEFLIP_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'currentRoundId'
            }) as bigint;
            const classicId = Number(classicIdBn);

            const classicRoundsToScan = Array.from({ length: Math.min(classicId, 30) }, (_, i) => classicId - i)
                .filter(id => id > 0 && !currentLog.find(l => l.roundId === id && l.gameType === 'classic' && l.isCompleted));

            const classicItems: HistoryItem[] = [];
            if (classicRoundsToScan.length > 0) {
                const classicContracts: any[] = [];
                classicRoundsToScan.forEach(id => {
                    classicContracts.push({ address: BASEFLIP_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [BigInt(id)] });
                    classicContracts.push({ address: BASEFLIP_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [BigInt(id), address] });
                });

                const classicRes = await publicClient.multicall({ contracts: classicContracts as any, allowFailure: true });

                for (let i = 0; i < classicRoundsToScan.length; i++) {
                    const rid = classicRoundsToScan[i];
                    const r = classicRes[i * 2]?.result as any;
                    const s = classicRes[i * 2 + 1]?.result as any;

                    if (r && s) {
                        const group = Number(Array.isArray(s) ? s[1] : s.group);
                        if (group === 0) continue;

                        const stakeAmtBn = (Array.isArray(s) ? s[0] : s.amount) as bigint;
                        const isCompleted = Array.isArray(r) ? r[6] : r.isCompleted;
                        const isCancelled = Array.isArray(r) ? r[7] : r.isCancelled;
                        const winningGroup = Number(Array.isArray(r) ? r[8] : r.winningGroup);
                        const createdAt = Number(Array.isArray(r) ? r[4] : r.createdAt);
                        const isWinner = isCompleted && !isCancelled && winningGroup === group;

                        classicItems.push({
                            roundId: rid,
                            gameType: 'classic',
                            amount: formatEther(isWinner ? (stakeAmtBn * 195n) / 100n : stakeAmtBn), // approx
                            stakeAmount: formatEther(stakeAmtBn),
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
            }

            // --- Sync CashOutOrDie ---
            const cashoutItems: HistoryItem[] = [];
            if (CASHOUT_ADDRESS !== '0x0') {
                const cashoutIdBn = await publicClient.readContract({
                    address: CASHOUT_ADDRESS,
                    abi: CashOutOrDieABI,
                    functionName: 'currentGameId'
                }) as bigint;
                const cashoutId = Number(cashoutIdBn);

                const coRoundsToScan = Array.from({ length: Math.min(cashoutId, 30) }, (_, i) => cashoutId - i)
                    .filter(id => id > 0 && !currentLog.find(l => l.roundId === id && l.gameType === 'cashout' && l.isCompleted));

                if (coRoundsToScan.length > 0) {
                    const coContracts: any[] = [];
                    coRoundsToScan.forEach(id => {
                        coContracts.push({ address: CASHOUT_ADDRESS, abi: CashOutOrDieABI, functionName: 'games', args: [BigInt(id)] });
                        coContracts.push({ address: CASHOUT_ADDRESS, abi: CashOutOrDieABI, functionName: 'getPlayerStats', args: [BigInt(id), address] });
                    });

                    const coRes = await publicClient.multicall({ contracts: coContracts as any, allowFailure: true });

                    for (let i = 0; i < coRoundsToScan.length; i++) {
                        const gid = coRoundsToScan[i];
                        const g = coRes[i * 2]?.result as any;
                        const p = coRes[i * 2 + 1]?.result as any;

                        if (g && p) {
                            const group = Number(p[1]);
                            if (group === 0) continue;

                            const entryFeeAmt = g[0] as bigint;
                            const claimValue = p[0] as bigint;
                            const isCompleted = g[5] as boolean;
                            const hasCashedOut = p[3] as boolean;
                            const isAlive = p[2] as boolean;
                            const startTime = Number(g[3]);

                            const isWinner = hasCashedOut || (!isAlive && claimValue > 0n) || (isCompleted && isAlive);
                            const displayAmt = claimValue > 0n ? formatEther(claimValue) : formatEther(entryFeeAmt);

                            cashoutItems.push({
                                roundId: gid,
                                gameType: 'cashout',
                                amount: displayAmt,
                                stakeAmount: formatEther(entryFeeAmt),
                                group,
                                winningGroup: 0, // Not applicable globally
                                isCompleted,
                                isWinner,
                                timestamp: startTime,
                                isClaimed: hasCashedOut
                            });
                        }
                    }
                }
            }

            // Merge everything
            const merged = [...classicItems, ...cashoutItems, ...currentLog]
                .filter((v, i, a) => a.findIndex(t => t.roundId === v.roundId && t.gameType === v.gameType) === i)
                .sort((a, b) => b.timestamp - a.timestamp);

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
            const timer = setTimeout(syncWithBlockchain, 1000);
            const interval = setInterval(syncWithBlockchain, 60000);
            return () => {
                clearTimeout(timer);
                clearInterval(interval);
            };
        }
    }, [address, syncWithBlockchain]);

    const claimArenaWinnings = async (gameId: number) => {
        if (!address || !publicClient || CASHOUT_ADDRESS === '0x0') return;
        // We'll need a wallet client to send the transaction
        // Actually, let's use useWriteContract from wagmi here too
        // But useUserHistory doesn't have it yet. 
    };

    return {
        history,
        isLoading,
        refetchHistory: syncWithBlockchain,
        recordRoundResult
    };
}
