import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { baseSepolia } from 'viem/chains';
import { useAccount } from 'wagmi';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

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

            console.log(`[useLeaderboard] Starting Virtual Recalculation (Anti-Farming)...`);

            // Use a safe starting block to avoid RPC timeouts (Base Sepolia deployment era)
            const fromBlock = 16000000n;

            // 1. Fetch all relevant events (Corrected signatures)
            const [stakeLogs, winnerLogs, startedLogs] = await Promise.all([
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event StakePlaced(uint256 indexed roundId, address indexed user, uint8 group, uint256 amount)'),
                    fromBlock: fromBlock
                }).catch(e => { console.error("Stake Logs Error:", e); return []; }),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event WinnerDeclared(uint256 indexed roundId, uint8 winningGroup)'),
                    fromBlock: fromBlock
                }).catch(e => { console.error("Winner Logs Error:", e); return []; }),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event RoundStarted(uint256 indexed roundId, uint256 poolA, uint256 poolB, uint256 targetSize)'),
                    fromBlock: fromBlock
                }).catch(e => { console.error("Started Logs Error:", e); return []; })
            ]);

            console.log(`[useLeaderboard] Logs found: Stakes=${stakeLogs.length}, Winners=${winnerLogs.length}, Started=${startedLogs.length}`);

            // 2. Map winners and pool sizes
            const roundWinners = new Map<number, number>();
            winnerLogs.forEach((l: any) => {
                if (l.args && l.args.roundId) {
                    roundWinners.set(Number(l.args.roundId), Number(l.args.winningGroup));
                }
            });

            const roundPools = new Map<number, { a: bigint, b: bigint }>();
            startedLogs.forEach((l: any) => {
                if (l.args && l.args.roundId) {
                    roundPools.set(Number(l.args.roundId), { a: l.args.poolA, b: l.args.poolB });
                }
            });

            // 3. Process participation and apply 80/20 Point Model
            const pointsMap = new Map<string, number>();

            stakeLogs.forEach((log: any) => {
                if (!log.args) return;

                const rid = Number(log.args.roundId);
                const winner = roundWinners.get(rid);
                const pools = roundPools.get(rid);
                const user = log.args.user?.toLowerCase();
                const stakeAmt = log.args.amount as bigint;
                const group = Number(log.args.group);

                if (!user) return;

                // Points are ONLY awarded for COMPLETED rounds (winner declared)
                if (winner !== undefined && pools) {
                    const isWinner = (group === winner);

                    // Total available points for level: 100 points per 0.1 ETH total pool
                    // targetPoolSize is usually pools.a + pools.b or fixed by level
                    const totalRoundVolume = pools.a + pools.b;

                    // 100 points per 0.1 ETH round volume (normalized)
                    const roundBasePoints = Number((totalRoundVolume * 100n) / 100000000000000000n);

                    // User share of their pool
                    const sidePool = group === 1 ? pools.a : pools.b;
                    if (sidePool === 0n) return;

                    let awarded = 0;
                    if (isWinner) {
                        // Winner gets 80% proportional to their share of the winning side
                        const winnersTotalPoints = roundBasePoints * 0.8;
                        awarded = Math.round((Number(stakeAmt) / Number(sidePool)) * winnersTotalPoints);
                    } else {
                        // Loser gets 20% proportional to their share of the losing side
                        const losersTotalPoints = roundBasePoints * 0.2;
                        awarded = Math.round((Number(stakeAmt) / Number(sidePool)) * losersTotalPoints);
                    }

                    // Add a tiny minimum if they participated at all in a completed round
                    awarded = Math.max(awarded, 1);

                    pointsMap.set(user, (pointsMap.get(user) || 0) + awarded);
                }
            });

            // 4. Sort and build leaderboard
            const entries: LeaderboardEntry[] = Array.from(pointsMap.entries())
                .map(([addr, pts]) => ({
                    address: addr,
                    points: pts,
                    rank: 0
                }))
                .sort((a, b) => b.points - a.points)
                .slice(0, 100);

            entries.forEach((e, i) => e.rank = i + 1);

            console.log(`[useLeaderboard] Final Leaderboard Size: ${entries.length}`);
            setLeaderboard(entries);

            // 5. Calculate current user stats
            if (currentUserAddress) {
                const user = currentUserAddress.toLowerCase();
                const pts = pointsMap.get(user) || 0;
                const foundIndex = entries.findIndex(e => e.address.toLowerCase() === user);

                if (foundIndex !== -1) {
                    setCurrentUserStats({ points: pts, rank: foundIndex + 1 });
                } else if (pts > 0) {
                    setCurrentUserStats({ points: pts, rank: '100+' });
                } else {
                    setCurrentUserStats({ points: 0, rank: 'Unranked' });
                }
            }

        } catch (err) {
            console.error('[Leaderboard] Recalculation Error:', err);
            setError('Failed to recalculate fair points.');
        } finally {
            setIsLoading(false);
        }
    }, [currentUserAddress]);

    useEffect(() => {
        fetchLeaderboard();
        const interval = setInterval(fetchLeaderboard, 60000);
        return () => clearInterval(interval);
    }, [fetchLeaderboard]);

    return { leaderboard, currentUserStats, isLoading, error, refetch: fetchLeaderboard };
}
