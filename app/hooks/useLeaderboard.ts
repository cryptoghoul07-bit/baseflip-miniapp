import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { useAccount } from 'wagmi';
import BaseFlipABI from '../lib/BaseFlipABI.json';

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

            console.log(`[useLeaderboard] Re-indexing for Fair Play (Anti-Farming)...`);

            // Use a block number close to deployment (Mid Jan 2024 is around 16M+)
            // But let's actually just scan the last 100k blocks to be safe and fast.
            const latestBlock = await publicClient.getBlockNumber();
            const fromBlock = latestBlock > 100000n ? latestBlock - 100000n : 0n;

            // 1. Fetch events using the ACTUAL ABI definitions to prevent signature typos
            const stakeEvent = BaseFlipABI.find(x => x.name === 'StakePlaced' && x.type === 'event');
            const winnerEvent = BaseFlipABI.find(x => x.name === 'WinnerDeclared' && x.type === 'event');
            const startedEvent = BaseFlipABI.find(x => x.name === 'RoundStarted' && x.type === 'event');

            const [stakeLogs, winnerLogs, startedLogs] = await Promise.all([
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: stakeEvent as any,
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

            console.log(`[useLeaderboard] Logs synced: Stakes=${stakeLogs.length}, Winners=${winnerLogs.length}, Started=${startedLogs.length}`);

            // 2. Map winners and pool sizes
            const roundWinners = new Map<number, number>();
            winnerLogs.forEach((l: any) => {
                if (l.args) roundWinners.set(Number(l.args.roundId), Number(l.args.winningGroup));
            });

            const roundPools = new Map<number, { a: bigint, b: bigint }>();
            startedLogs.forEach((l: any) => {
                if (l.args) roundPools.set(Number(l.args.roundId), { a: l.args.poolA, b: l.args.poolB });
            });

            // 3. Process every user's participation and apply 80/20 Model
            const pointsMap = new Map<string, number>();

            stakeLogs.forEach((log: any) => {
                if (!log.args) return;

                const rid = Number(log.args.roundId);
                const winnerGroup = roundWinners.get(rid);
                const pools = roundPools.get(rid);
                const user = log.args.user?.toLowerCase();
                const stakeAmt = log.args.amount as bigint;
                const userGroup = Number(log.args.group);

                if (!user) return;

                // Only reward rounds that HAVE finished
                if (winnerGroup !== undefined && pools) {
                    const isWinner = (userGroup === winnerGroup);

                    // Normalize the points pool
                    // Level 1 (~0.1 ETH) = 100 points
                    // Level 10 (~1 ETH) = 1000 points
                    const totalVolume = pools.a + pools.b;
                    const roundBasePoints = Number((totalVolume * 1000n) / BigInt(1e18)); // pts per round

                    const sidePool = userGroup === 1 ? pools.a : pools.b;
                    if (sidePool === 0n) return;

                    let awarded = 0;
                    if (isWinner) {
                        // Winner gets 80% proportional share
                        const winnersPoolPts = roundBasePoints * 0.8;
                        awarded = Math.round((Number(stakeAmt) / Number(sidePool)) * winnersPoolPts);
                    } else {
                        // Loser gets 20% proportional share
                        const losersPoolPts = roundBasePoints * 0.2;
                        awarded = Math.round((Number(stakeAmt) / Number(sidePool)) * losersPoolPts);
                    }

                    awarded = Math.max(awarded, 1);
                    pointsMap.set(user, (pointsMap.get(user) || 0) + awarded);
                }
            });

            // 4. Fallback: If no recent logs, pull from on-chain and normalize
            if (pointsMap.size === 0) {
                console.log("[useLeaderboard] No recent history found, showing all-time rankings...");
                const onChainData = await publicClient.readContract({
                    address: CONTRACT_ADDRESS,
                    abi: BaseFlipABI,
                    functionName: 'getLeaderboardTop',
                    args: [100n]
                }).catch(() => null) as unknown as [string[], bigint[]] | null;

                if (onChainData && onChainData[0]) {
                    onChainData[0].forEach((addr, i) => {
                        if (addr !== '0x0000000000000000000000000000000000000000') {
                            pointsMap.set(addr.toLowerCase(), Number(onChainData[1][i]));
                        }
                    });
                }
            }

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
            console.error('[Leaderboard] Refresh Error:', err);
            setError('Syncing hall of champions...');
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
