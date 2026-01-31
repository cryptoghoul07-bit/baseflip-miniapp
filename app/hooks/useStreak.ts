import { useState, useEffect, useCallback } from 'react';

export function useStreak(address: string | undefined) {
    const [streakData, setStreakData] = useState({
        currentStreak: 0,
        maxStreak: 0,
        totalBonusPoints: 0,
        streakAtLoss: 0,
        lastResult: null as 'win' | 'loss' | null
    });

    const fetchStreak = useCallback(async () => {
        if (!address) return;
        try {
            const res = await fetch(`/api/streaks?address=${address}`);
            const data = await res.json();
            if (data && typeof data.currentStreak === 'number') {
                setStreakData(data);
            }
        } catch (error) {
            console.error('Error fetching streak:', error);
        }
    }, [address]);

    useEffect(() => {
        fetchStreak();
        // Poll every 10s to keep in sync with automated updates
        const interval = setInterval(fetchStreak, 10000);
        return () => clearInterval(interval);
    }, [fetchStreak]);

    const recordResult = async (roundId: number, isWin: boolean) => {
        if (!address) return;
        try {
            await fetch('/api/streaks', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'record',
                    address,
                    roundId,
                    isWin
                })
            });
            fetchStreak();
        } catch (error) {
            console.error('Error recording result:', error);
        }
    };

    return {
        ...streakData,
        refetch: fetchStreak,
        recordResult
    };
}
