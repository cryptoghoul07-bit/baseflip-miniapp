import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http, parseAbi } from 'viem';
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

            // 1. Fetch Top 100 Players
            const data = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: parseAbi(['function getLeaderboardTop(uint256) view returns (address[], uint256[])']),
                functionName: 'getLeaderboardTop',
                args: [100n]
            });

            // 2. Fetch Current User Points specifically
            let userPoints = 0n;
            if (currentUserAddress) {
                userPoints = await publicClient.readContract({
                    address: CONTRACT_ADDRESS,
                    abi: parseAbi(['function leaderboardPoints(address) view returns (uint256)']),
                    functionName: 'leaderboardPoints',
                    args: [currentUserAddress as `0x${string}`]
                }).catch(() => 0n);
            }

            if (data && Array.isArray(data)) {
                const addresses = data[0] as string[];
                const points = data[1] as bigint[];

                const entries: LeaderboardEntry[] = (addresses || [])
                    .map((addr, index) => {
                        if (addr === '0x0000000000000000000000000000000000000000') return null;
                        return {
                            address: addr,
                            points: Number(points[index]),
                            rank: index + 1
                        };
                    })
                    .filter((e): e is LeaderboardEntry => e !== null);

                setLeaderboard(entries);

                // Calculate current user rank
                if (currentUserAddress) {
                    const foundIndex = entries.findIndex(e => e.address.toLowerCase() === currentUserAddress.toLowerCase());
                    if (foundIndex !== -1) {
                        setCurrentUserStats({ points: Number(userPoints), rank: foundIndex + 1 });
                    } else if (userPoints > 0n) {
                        setCurrentUserStats({ points: Number(userPoints), rank: '100+' });
                    } else {
                        setCurrentUserStats({ points: 0, rank: 'Unranked' });
                    }
                }
            }
        } catch (err) {
            console.error('[Leaderboard] Error fetching:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch leaderboard');
        } finally {
            setIsLoading(false);
        }
    }, [currentUserAddress]);

    useEffect(() => {
        fetchLeaderboard();
        const interval = setInterval(fetchLeaderboard, 30000);
        return () => clearInterval(interval);
    }, [fetchLeaderboard]);

    return { leaderboard, currentUserStats, isLoading, error, refetch: fetchLeaderboard };
}
