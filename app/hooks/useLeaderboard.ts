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

            console.log(`[useLeaderboard] Starting Virtual Recalculation...`);

            // Use a block number close to deployment to avoid RPC 503 errors
            // If fromBlock is too far back, Base RPC fails.
            const latestBlock = await publicClient.getBlockNumber();
            const fromBlock = latestBlock > 500000n ? latestBlock - 500000n : 0n;

            console.log(`[useLeaderboard] Scanning from block: ${fromBlock.toString()} to ${latestBlock.toString()}`);

            // 1. Fetch events with matched signatures
            const [stakeLogs, winnerLogs, startedLogs] = await Promise.all([
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event StakePlaced(uint256 indexed roundId, address indexed user, uint8 group, uint256 amount)'),
                    fromBlock: fromBlock
                }).catch(() => []),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event WinnerDeclared(uint256 indexed roundId, uint8 winningGroup)'),
                    fromBlock: fromBlock
                }).catch(() => []),
                publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: parseAbiItem('event RoundStarted(uint256 indexed roundId, uint256 poolA, uint256 poolB, uint256 targetSize)'),
                    fromBlock: fromBlock
                }).catch(() => [])
            ]);

            console.log(`[useLeaderboard] Logs found: Stakes=${stakeLogs.length}, Winners=${winnerLogs.length}, Started=${startedLogs.length}`);

            // 2. Map winners and pools
            const roundWinners = new Map<number, number>();
            winnerLogs.forEach((l: any) => {
                if (l.args && l.args.roundId !== undefined) {
                    roundWinners.set(Number(l.args.roundId), Number(l.args.winningGroup));
                }
            });

            const roundPools = new Map<number, { a: bigint, b: bigint }>();
            startedLogs.forEach((l: any) => {
                if (l.args && l.args.roundId !== undefined) {
                    roundPools.set(Number(l.args.roundId), { a: l.args.poolA, b: l.args.poolB });
                }
            });

            // 3. Process points (80/20 model)
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

                if (winner !== undefined && pools) {
                    const isWinner = (group === winner);
                    const totalRoundVolume = pools.a + pools.b;

                    // Base points: 100 pts per 0.1 ETH round volume
                    const roundBasePoints = Number((totalRoundVolume * 100n) / 100000000000000000n);

                    const sidePool = group === 1 ? pools.a : pools.b;
                    if (sidePool === 0n) return;

                    let awarded = 0;
                    if (isWinner) {
                        const winnersTotalPoints = roundBasePoints * 0.8;
                        awarded = Math.round((Number(stakeAmt) / Number(sidePool)) * winnersTotalPoints);
                    } else {
                        const losersTotalPoints = roundBasePoints * 0.2;
                        awarded = Math.round((Number(stakeAmt) / Number(sidePool)) * losersTotalPoints);
                    }

                    awarded = Math.max(awarded, 1);
                    pointsMap.set(user, (pointsMap.get(user) || 0) + awarded);
                }
            });

            // If we found NO data in the last 500k blocks, fallback to a single call to get known on-chain top players
            // so the list isn't empty if the history is older than 500k blocks.
            if (pointsMap.size === 0) {
                console.log("[useLeaderboard] History scan empty, falling back to on-chain top...");
                const onChainData = await publicClient.readContract({
                    address: CONTRACT_ADDRESS,
                    abi: parseAbiItem('function getLeaderboardTop(uint256) view returns (address[], uint256[])') as any,
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
            setLeaderboard(entries);

            // 5. User stats
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
