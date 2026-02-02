"use client";
import React, { useEffect, useState } from 'react';
import { useUserHistory } from '../../hooks/useUserHistory';
import styles from './StreakPanel.module.css';

export default function StreakPanel() {
    const { history } = useUserHistory();
    const [streak, setStreak] = useState({ type: 'none', count: 0, best: 0 });

    useEffect(() => {
        if (history.length === 0) {
            setStreak({ type: 'none', count: 0, best: 0 });
            return;
        }

        // Calculate current streak from most recent completed rounds
        const completedRounds = history
            .filter(h => h.isCompleted && !h.isCancelled)
            .sort((a, b) => b.roundId - a.roundId);

        if (completedRounds.length === 0) {
            setStreak({ type: 'none', count: 0, best: 0 });
            return;
        }

        let currentStreak = 1;
        let streakType = completedRounds[0].isWinner ? 'win' : 'loss';
        let bestWinStreak = completedRounds[0].isWinner ? 1 : 0;
        let tempWinStreak = completedRounds[0].isWinner ? 1 : 0;

        // Count consecutive wins/losses from most recent
        for (let i = 1; i < completedRounds.length; i++) {
            const currentIsWin = completedRounds[i].isWinner;
            const prevIsWin = completedRounds[i - 1].isWinner;

            if (currentIsWin === prevIsWin) {
                currentStreak++;
                if (currentIsWin) tempWinStreak++;
            } else {
                if (prevIsWin) {
                    bestWinStreak = Math.max(bestWinStreak, tempWinStreak);
                    tempWinStreak = 0;
                }
                break; // Streak broken
            }
        }

        bestWinStreak = Math.max(bestWinStreak, tempWinStreak);

        setStreak({
            type: streakType,
            count: currentStreak,
            best: bestWinStreak
        });
    }, [history]);

    if (streak.type === 'none') return null;

    return (
        <div className={`${styles.streakPanel} ${streak.type === 'win' ? styles.winStreak : styles.lossStreak}`}>
            <div className={styles.streakIcon}>
                {streak.type === 'win' ? '🔥' : '❄️'}
            </div>
            <div className={styles.streakInfo}>
                <div className={styles.streakLabel}>
                    {streak.type === 'win' ? 'HOT STREAK' : 'COLD STREAK'}
                </div>
                <div className={styles.streakCount}>{streak.count}</div>
            </div>
            {streak.best > 0 && (
                <div className={styles.bestStreak}>
                    <span className={styles.bestLabel}>Best</span>
                    <span className={styles.bestCount}>{streak.best}</span>
                </div>
            )}
        </div>
    );
}
