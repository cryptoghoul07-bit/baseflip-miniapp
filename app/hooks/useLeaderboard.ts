import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { useAccount } from 'wagmi';
import BaseFlipABI from '../lib/BaseFlipABI.json';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;
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

            console.log(`[useLeaderboard] Starting High-Fidelity Recalculation Audit...`);

            // 1. Get the current "Official" Top 100 players to focus our search
            const onChainData = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
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

            // 2. Scan for history in safe chunks
            const latestBlock = await publicClient.getBlockNumber();
            const fromBlock = latestBlock > 500000n ? latestBlock - 500000n : 0n;

            const stakeEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');
            const winnerEvent = BaseFlipABI.find(x => x.name === 'WinnerDeclared');
            const startedEvent = BaseFlipABI.find(x => x.name === 'RoundStarted');

            // Fetch logs for the specific top players (Sybil Resistance Focus)
            const [stakeLogs, winnerLogs, startedLogs] = await Promise.all([
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: stakeEvent as any,
                    args: { user: topAddresses as any },
                    fromBlock: fromBlock
                }).catch(() => []),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: winnerEvent as any,
                    fromBlock: fromBlock
                }).catch(() => []),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: startedEvent as any,
                    fromBlock: fromBlock
                }).catch(() => [])
            ]);

            console.log(`[useLeaderboard] Found ${stakeLogs.length} participation records in recent history.`);

            const roundWinners = new Map<number, number>();
            winnerLogs.forEach((l: any) => roundWinners.set(Number(l.args.roundId), Number(l.args.winningGroup)));

            const roundPools = new Map<number, { a: bigint, b: bigint }>();
            startedLogs.forEach((l: any) => roundPools.set(Number(l.args.roundId), { a: l.args.poolA, b: l.args.poolB }));

            // 3. Recalculate points from scratch using the 80/20 Model
            const pointsMap = new Map<string, number>();

            stakeLogs.forEach((log: any) => {
                const rid = Number(log.args.roundId);
                const winner = roundWinners.get(rid);
                const pools = roundPools.get(rid);
                const user = log.args.user.toLowerCase();
                const stakeAmt = log.args.amount as bigint;
                const group = Number(log.args.group);

                if (winner !== undefined && pools) {
                    const isWinner = group === winner;
                    const totalVolume = pools.a + pools.b;
                    // Standard: 100 points per 0.1 ETH round volume
                    const roundBasePoints = Number((totalVolume * 1000n) / BigInt(1e18));
                    const sidePool = group === 1 ? pools.a : pools.b;

                    if (sidePool > 0n) {
                        let awarded = 0;
                        if (isWinner) {
                            awarded = Math.round((Number(stakeAmt) / Number(sidePool)) * (roundBasePoints * 0.8));
                        } else {
                            awarded = Math.round((Number(stakeAmt) / Number(sidePool)) * (roundBasePoints * 0.2));
                        }
                        pointsMap.set(user, (pointsMap.get(user) || 0) + Math.max(awarded, 1));
                    }
                }
            });

            // 4. Fill in missing gaps: Normalize historical farmed points
            topAddresses.forEach((addr, i) => {
                const lowerAddr = addr.toLowerCase();
                if (!pointsMap.has(lowerAddr) && onChainData[1][i]) {
                    const farmedPoints = Number(onChainData[1][i]);
                    pointsMap.set(lowerAddr, Math.floor(farmedPoints * 0.3));
                }
            });

            // 5. Add Referral Points (Off-chain with Proof of Play)
            try {
                const refRes = await fetch('/api/referrals?raw=true');
                const refData = await refRes.json();
                if (refData.referrals) {
                    Object.entries(refData.referrals).forEach(([referrer, referees]) => {
                        const lowReferrer = referrer.toLowerCase();
                        const qualifiedReferees = (referees as string[]).filter(referee => {
                            const lowReferee = referee.toLowerCase();
                            // Qualification check: Referee must have earned at least 1 point from playing
                            return (pointsMap.get(lowReferee) || 0) > 0;
                        });

                        if (qualifiedReferees.length > 0) {
                            const bonusPoints = qualifiedReferees.length * 5; // 5 points per qualified referral
                            pointsMap.set(lowReferrer, (pointsMap.get(lowReferrer) || 0) + bonusPoints);
                        }
                    });
                }
            } catch (refErr) {
                console.warn('[Leaderboard] Could not fetch referral bonus points:', refErr);
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
                console.warn('[Leaderboard] Could not fetch streak bonus points:', streakErr);
            }

            // 7. Build final sorted list
            const entries: LeaderboardEntry[] = Array.from(pointsMap.entries())
                .map(([addr, pts]) => ({
                    address: addr,
                    points: pts,
                    rank: 0
                }))
                .sort((a, b) => b.points - a.points)
                .slice(0, 100);

            entries.forEach((e, i) => e.rank = i + 1);
            setLeaderboard(entries);

            // 8. Set User Stats
            if (currentUserAddress) {
                const user = currentUserAddress.toLowerCase();
                const pts = pointsMap.get(user) || 0;
                const foundIndex = entries.findIndex(e => e.address.toLowerCase() === user);
                setCurrentUserStats({
                    points: pts,
                    rank: foundIndex !== -1 ? foundIndex + 1 : (pts > 0 ? '100+' : 'Unranked')
                });
            }

        } catch (err) {
            console.error('[Leaderboard] Refresh Loop Failed:', err);
            setError('Syncing hall of champions...');
        } finally {
            setIsLoading(false);
        }
    }, [currentUserAddress]);

    useEffect(() => {
        // Delay initial deep audit to prioritize wallet connection speed
        const timer = setTimeout(() => {
            fetchLeaderboard();
        }, 2500);

        const interval = setInterval(fetchLeaderboard, 60000);
        return () => {
            clearTimeout(timer);
            clearInterval(interval);
        };
    }, [fetchLeaderboard]);

    return { leaderboard, currentUserStats, isLoading, error, refetch: fetchLeaderboard };
}
