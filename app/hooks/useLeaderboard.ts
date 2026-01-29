import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

export interface LeaderboardEntry {
    address: string;
    points: number;
    rank: number;
}

export function useLeaderboard() {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLeaderboard = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Fetch top 10 users from contract
            const publicClient = createPublicClient({
                chain: baseSepolia,
                transport: http(RPC_URL),
            });

            console.log('[Leaderboard] Fetching top players from contract...');

            const data = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: parseAbi(['function getLeaderboardTop(uint256) view returns (address[], uint256[])']),
                functionName: 'getLeaderboardTop',
                args: [100n] // Fetch top 100 for better user ranking context
            });

            console.log('[Leaderboard] Raw Data:', data);

            if (data && Array.isArray(data)) {
                // The contract returns a tuple: [address[], uint256[]]
                const addresses = data[0] as string[];
                const points = data[1] as bigint[];

                if (!addresses || !points || addresses.length === 0) {
                    console.log('[Leaderboard] No addresses found in response');
                    setLeaderboard([]);
                    return;
                }

                const entries: LeaderboardEntry[] = addresses
                    .map((addr, index) => {
                        // Filter out zero addresses if any
                        if (addr === '0x0000000000000000000000000000000000000000') return null;

                        return {
                            address: addr,
                            points: Number(points[index]),
                            rank: 0 // Assign rank later after sort (though contract should be sorted, let's be safe)
                        };
                    })
                    .filter((e): e is LeaderboardEntry => e !== null)
                    .map((entry, index) => ({ ...entry, rank: index + 1 }));

                // Slice to top 10 for main display, but keep full list for user lookup if needed
                // actually Component handles display limit, hook provides data.
                console.log('[Leaderboard] Processed entries:', entries.length);
                setLeaderboard(entries);
            } else {
                console.warn('[Leaderboard] Invalid data format returned:', data);
            }

        } catch (err) {
            console.error('[Leaderboard] Error fetching:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch leaderboard');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLeaderboard();

        // Refresh every 30 seconds
        const interval = setInterval(fetchLeaderboard, 30000);
        return () => clearInterval(interval);
    }, [fetchLeaderboard]);

    return { leaderboard, isLoading, error, refetch: fetchLeaderboard };
}
