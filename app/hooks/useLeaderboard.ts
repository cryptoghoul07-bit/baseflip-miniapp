import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { useAccount } from 'wagmi';
import BaseFlipABI from '../lib/BaseFlipABI.json';
import CashOutOrDieABI from '../lib/CashOutOrDieABI.json';

const BASEFLIP_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;
const CASHOUT_ADDRESS = (process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS || '0x0') as `0x${string}`;
const RPC_URL = 'https://sepolia.base.org';

export interface LeaderboardEntry {
    address: string;
    points: number;
    rank: number;
}

export function useLeaderboard() {
    const { address: currentUserAddress } = useAccount();
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [currentUserStats, setCurrentUserStats] = useState<{ points: number, rank: number | string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLeaderboard = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const publicClient = createPublicClient({
                chain: baseSepolia,
                transport: http(RPC_URL),
            });

            console.log(`[useLeaderboard] Starting High-Fidelity Multi-Contract Audit...`);

            // 1. Get Top Players from BaseFlip (System of Record)
            const onChainData = await publicClient.readContract({
                address: BASEFLIP_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'getLeaderboardTop',
                args: [100n]
            }).catch(() => null) as unknown as [string[], bigint[]] | null;

            if (!onChainData || !onChainData[0]) {
                throw new Error("Could not fetch player list");
            }

            const topAddresses = onChainData[0].filter(a => a !== '0x0000000000000000000000000000000000000000');
            if (currentUserAddress && !topAddresses.includes(currentUserAddress)) {
                topAddresses.push(currentUserAddress);
            }

            const pointsMap = new Map<string, number>();

            // --- ANTI-FARMING: Normalize historical farmed points (30% value) ---
            onChainData[0].forEach((addr, i) => {
                if (addr !== '0x0000000000000000000000000000000000000000') {
                    const farmedPoints = Number(onChainData[1][i]);
                    pointsMap.set(addr.toLowerCase(), Math.floor(farmedPoints * 0.3));
                }
            });

            // 2. Scan Recent History (Deep Audit)
            const latestBlock = await publicClient.getBlockNumber();
            const fromBlock = latestBlock > 500000n ? latestBlock - 500000n : 0n;

            // --- BaseFlip Scanning ---
            const stakeEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');
            const winnerEvent = BaseFlipABI.find(x => x.name === 'WinnerDeclared');
            const startedEvent = BaseFlipABI.find(x => x.name === 'RoundStarted');

            const [stakeLogs, winnerLogs, startedLogs] = await Promise.all([
                publicClient.getLogs({ address: BASEFLIP_ADDRESS, event: stakeEvent as any, fromBlock: fromBlock }).catch(() => []),
                publicClient.getLogs({ address: BASEFLIP_ADDRESS, event: winnerEvent as any, fromBlock: fromBlock }).catch(() => []),
                publicClient.getLogs({ address: BASEFLIP_ADDRESS, event: startedEvent as any, fromBlock: fromBlock }).catch(() => [])
            ]);

            const classicWinners = new Map<number, number>();
            winnerLogs.forEach((l: any) => classicWinners.set(Number(l.args.roundId), Number(l.args.winningGroup)));
            const classicPools = new Map<number, { a: bigint, b: bigint }>();
            startedLogs.forEach((l: any) => classicPools.set(Number(l.args.roundId), { a: l.args.poolA, b: l.args.poolB }));

            // 3. Add Classic Points (Real-time Audit)
            stakeLogs.forEach((log: any) => {
                const user = log.args.user.toLowerCase();
                const rid = Number(log.args.roundId);
                const winner = classicWinners.get(rid);
                const pools = classicPools.get(rid);
                if (winner !== undefined && pools) {
                    const group = Number(log.args.group);
                    const stakeAmt = log.args.amount as bigint;
                    const totalVolume = pools.a + pools.b;
                    const roundBasePoints = Number((totalVolume * 1000n) / BigInt(1e18));
                    const sidePool = group === 1 ? pools.a : pools.b;
                    if (sidePool > 0n) {
                        const awarded = Math.round((Number(stakeAmt) / Number(sidePool)) * (roundBasePoints * (group === winner ? 0.8 : 0.2)));
                        pointsMap.set(user, (pointsMap.get(user) || 0) + Math.max(awarded, 1));
                    }
                }
            });

            // 4. Add Cash-Out or Die Points
            if (CASHOUT_ADDRESS !== '0x0') {
                const coJoinedEvent = CashOutOrDieABI.find(x => x.name === 'PlayerJoined');
                const coCompletedEvent = CashOutOrDieABI.find(x => x.name === 'GameCompleted');

                const [coJoinedLogs, coCompletedLogs] = await Promise.all([
                    publicClient.getLogs({ address: CASHOUT_ADDRESS, event: coJoinedEvent as any, fromBlock: fromBlock }).catch(() => []),
                    publicClient.getLogs({ address: CASHOUT_ADDRESS, event: coCompletedEvent as any, fromBlock: fromBlock }).catch(() => [])
                ]);

                coJoinedLogs.forEach((log: any) => {
                    const user = log.args.player.toLowerCase();
                    pointsMap.set(user, (pointsMap.get(user) || 0) + 20); // Base participation
                });

                coCompletedLogs.forEach((log: any) => {
                    const winner = log.args.winner.toLowerCase();
                    if (winner !== '0x0000000000000000000000000000000000000000') {
                        pointsMap.set(winner, (pointsMap.get(winner) || 0) + 100); // 100 point Victory Bonus
                    }
                });
            }

            // 5. Add Referral Points (Off-chain with Anti-Sybil Filtering)
            try {
                const refRes = await fetch('/api/referrals?raw=true');
                const refData = await refRes.json();
                if (refData.referrals) {
                    Object.entries(refData.referrals).forEach(([referrer, referees]) => {
                        const lowReferrer = referrer.toLowerCase();
                        const qualifiedReferees = (referees as string[]).filter(referee => {
                            const lowReferee = referee.toLowerCase();
                            // RULE: Referee must have earned at least 1 REAL point from playing
                            return (pointsMap.get(lowReferee) || 0) > 0;
                        });

                        if (qualifiedReferees.length > 0) {
                            const bonusPoints = qualifiedReferees.length * 5; // 5 points per active referee
                            pointsMap.set(lowReferrer, (pointsMap.get(lowReferrer) || 0) + bonusPoints);
                        }
                    });
                }
            } catch (refErr) {
                console.warn('[Leaderboard] Referral audit failed:', refErr);
            }

            // 6. Add Streak Bonus Points (Off-chain)
            try {
                const streakRes = await fetch('/api/streaks?all=true');
                const streakData = await streakRes.json();
                if (streakData) {
                    Object.entries(streakData).forEach(([addr, data]: [string, any]) => {
                        const lowAddr = addr.toLowerCase();
                        if (data.totalBonusPoints > 0) {
                            pointsMap.set(lowAddr, (pointsMap.get(lowAddr) || 0) + data.totalBonusPoints);
                        }
                    });
                }
            } catch (streakErr) {
                console.warn('[Leaderboard] Streak audit failed:', streakErr);
            }

            // 7. Sort and Format
            const sortedEntries: LeaderboardEntry[] = Array.from(pointsMap.entries())
                .map(([addr, pts]) => ({ address: addr, points: pts, rank: 0 }))
                .sort((a, b) => b.points - a.points)
                .slice(0, 100);

            sortedEntries.forEach((e, i) => e.rank = i + 1);
            setLeaderboard(sortedEntries);

            if (currentUserAddress) {
                const user = currentUserAddress.toLowerCase();
                const pts = pointsMap.get(user) || 0;
                const foundIndex = sortedEntries.findIndex(e => e.address.toLowerCase() === user);
                setCurrentUserStats({
                    points: pts,
                    rank: foundIndex !== -1 ? foundIndex + 1 : (pts > 0 ? '100+' : 'Unranked')
                });
            }

        } catch (err) {
            console.error('[Leaderboard] Sync Error:', err);
            setError('Syncing halls of fame...');
        } finally {
            setIsLoading(false);
        }
    }, [currentUserAddress]);

    useEffect(() => {
        const timer = setTimeout(fetchLeaderboard, 2000);
        const interval = setInterval(fetchLeaderboard, 60000);
        return () => {
            clearTimeout(timer);
            clearInterval(interval);
        };
    }, [fetchLeaderboard]);

    return { leaderboard, currentUserStats, isLoading, error, refetch: fetchLeaderboard };
}
