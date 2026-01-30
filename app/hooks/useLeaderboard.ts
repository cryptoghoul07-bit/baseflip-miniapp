import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http, parseAbiItem, formatEther } from 'viem';
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

            // 1. Fetch all relevant events to reconstruct history
            const [stakeLogs, winnerLogs, startedLogs] = await Promise.all([
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event StakePlaced(uint256 indexed roundId, address indexed user, uint8 group, uint256 amount)'),
                    fromBlock: 0n
                }).catch(() => []),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event WinnerDeclared(uint256 indexed roundId, uint8 winningGroup)'),
                    fromBlock: 0n
                }).catch(() => []),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event RoundStarted(uint256 indexed roundId, uint256 poolA, uint256 poolB)'),
                    fromBlock: 0n
                }).catch(() => [])
            ]);

            // 2. Map winners and pool sizes
            const roundWinners = new Map<number, number>();
            winnerLogs.forEach((l: any) => roundWinners.set(Number(l.args.roundId), Number(l.args.winningGroup)));

            const roundPools = new Map<number, { a: bigint, b: bigint }>();
            startedLogs.forEach((l: any) => roundPools.set(Number(l.args.roundId), { a: l.args.poolA, b: l.args.poolB }));

            // 3. Process every user's participation and apply Fair Point Model (80/20)
            const pointsMap = new Map<string, number>();

            stakeLogs.forEach((log: any) => {
                const rid = Number(log.args.roundId);
                const winner = roundWinners.get(rid);
                const pools = roundPools.get(rid);
                const user = log.args.user.toLowerCase();
                const stakeAmt = log.args.amount as bigint;
                const group = Number(log.args.group);

                // For Points, assume Level 1 targets (0.1 ETH) if pools missing, or use actual pools
                // We use the same formula as the new contract update
                if (winner && pools) {
                    const winningPool = winner === 1 ? pools.a : pools.b;
                    const losingPool = winner === 1 ? pools.b : pools.a;
                    const isWinner = group === winner;

                    // Fixed Pizza Size based on total liquidity: (PoolA + PoolB) normalized to 100pts per 0.1 ETH
                    const totalLiquidity = pools.a + pools.b;
                    const pizzaPoints = Number((totalLiquidity * 1000n) / 2n / 1000000000000000000n) * 100; // 100 pts per 0.1 ETH target

                    // Normalized to 100 points per 0.1 ETH total round volume
                    const pointsPool = 100; // Let's simplify to 100 points per round level 1 for standard display

                    // Calculate Share
                    const roundTarget = 100000000000000000n; // 0.1 ETH
                    const userShare = Number((stakeAmt * 100n) / roundTarget); // % of a single pool

                    let awarded = 0;
                    if (isWinner) {
                        awarded = Math.round(userShare * 1.6); // 80% of total 2-side pool
                    } else {
                        awarded = Math.round(userShare * 0.4); // 20% of total 2-side pool
                    }

                    pointsMap.set(user, (pointsMap.get(user) || 0) + awarded);
                }
            });

            // 4. Sort and build leaderboard
            const entries: LeaderboardEntry[] = Array.from(pointsMap.entries())
                .map(([addr, pts]) => ({
                    address: addr,
                    points: pts,
                    rank: 0 // Settled below
                }))
                .sort((a, b) => b.points - a.points)
                .slice(0, 100);

            entries.forEach((e, i) => e.rank = i + 1);

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
        const interval = setInterval(fetchLeaderboard, 45000); // Indexing takes longer, poll slower
        return () => clearInterval(interval);
    }, [fetchLeaderboard]);

    return { leaderboard, currentUserStats, isLoading, error, refetch: fetchLeaderboard };
}
