"use client";
import React from 'react';
import styles from './styles/Leaderboard.module.css';

interface LeaderboardEntry {
    address: string;
    points: number;
    rank: number;
}

interface LeaderboardProps {
    leaderboard: LeaderboardEntry[];
    currentUserAddress?: string;
}

export default function Leaderboard({ leaderboard, currentUserAddress }: LeaderboardProps) {
    // Find current user's entry
    const userEntry = currentUserAddress
        ? leaderboard.find(e => e.address.toLowerCase() === currentUserAddress.toLowerCase())
        : null;

    // We only show top 50 in the list to avoid clutter
    const displayList = leaderboard.slice(0, 50);
    const shortenAddress = (addr: string) => {
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    const getRankBadge = (rank: number) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return rank;
    };

    return (
        <div className={styles.leaderboardContainer}>
            <div className={styles.airdropBanner}>
                <div className={styles.airdropIcon}>🪂</div>
                <div className={styles.airdropText}>
                    <h3>💰 Fair Rewards for Everyone</h3>
                    <p>Top players receive Base-ETH airdrops based on points. Everyone earns points — winners AND losers!</p>
                </div>
            </div>

            <div className={styles.leaderboardHeader}>
                <h2>👑 Hall of Champions</h2>
                <p>Participate, stake smart, and win big to maximize your points.</p>
            </div>

            {leaderboard.length === 0 ? (
                <div className={styles.emptyState}>
                    <p>🎰 No players yet. Join a round and start earning points!</p>
                </div>
            ) : (
                <>
                    <div className={styles.leaderboardList}>
                        {displayList.map((entry) => {
                            const isCurrentUser = currentUserAddress?.toLowerCase() === entry.address.toLowerCase();
                            return (
                                <div
                                    key={entry.address}
                                    className={`${styles.leaderboardRow} ${isCurrentUser ? styles.currentUser : ''} ${entry.rank <= 3 ? styles.topThree : ''}`}
                                >
                                    <div className={styles.rank}>
                                        {getRankBadge(entry.rank)}
                                    </div>
                                    <div className={styles.address}>
                                        {shortenAddress(entry.address)}
                                        {isCurrentUser && <span className={styles.youBadge}>You</span>}
                                    </div>
                                    <div className={styles.points}>
                                        {entry.points} {entry.points === 1 ? 'point' : 'points'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Sticky User Stats Bar */}
                    {currentUserAddress && (
                        <div className={styles.userStatsBar}>
                            <div className={styles.userStatsContent}>
                                {userEntry ? (
                                    <>
                                        <div className={styles.rank}>{userEntry.rank}</div>
                                        <div className={styles.address}>
                                            {shortenAddress(userEntry.address)}
                                            <span className={styles.youBadge}>You</span>
                                        </div>
                                        <div className={styles.points}>
                                            {userEntry.points} pts
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className={styles.rank}>-</div>
                                        <div className={styles.address}>
                                            {shortenAddress(currentUserAddress)}
                                            <span className={styles.youBadge}>You</span>
                                        </div>
                                        <div className={styles.points} style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                                            Unranked (Play to join!)
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            <div className={styles.rulesSection}>
                <h3>📋 How Points Work</h3>
                <div className={styles.rulesList}>
                    <div className={styles.ruleItem}>
                        <span className={styles.ruleIcon}>🎯</span>
                        <div className={styles.ruleContent}>
                            <strong>Participation:</strong>
                            <p>Earn 10 base points for joining any completed round, win or lose.</p>
                        </div>
                    </div>
                    <div className={styles.ruleItem}>
                        <span className={styles.ruleIcon}>💎</span>
                        <div className={styles.ruleContent}>
                            <strong>Stake Bonus:</strong>
                            <p>Earn 0-5 bonus points based on your stake amount (capped to prevent whale dominance).</p>
                        </div>
                    </div>
                    <div className={styles.ruleItem}>
                        <span className={styles.ruleIcon}>🏆</span>
                        <div className={styles.ruleContent}>
                            <strong>Outcome Multiplier:</strong>
                            <p>Winners get 2x total points. Losers keep their base + stake bonus points.</p>
                        </div>
                    </div>
                    <div className={styles.ruleItem}>
                        <span className={styles.ruleIcon}>🪂</span>
                        <div className={styles.ruleContent}>
                            <strong>Airdrop Distribution:</strong>
                            <p>Top players receive Base-ETH airdrops proportional to their total points.</p>
                        </div>
                    </div>
                </div>
                <div className={styles.rulesNote}>
                    <p>💡 <strong>Note:</strong> Points are awarded after each round completes. Each wallet can only stake once per round.</p>
                </div>
            </div>
        </div>
    );
}
