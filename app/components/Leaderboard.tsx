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
    currentUserStats?: { points: number, rank: number | string } | null;
}

export default function Leaderboard({ leaderboard, currentUserAddress, currentUserStats }: LeaderboardProps) {
    const [currentPage, setCurrentPage] = React.useState(0);
    const ITEMS_PER_PAGE = 10;
    const TOTAL_LIST_LIMIT = 100; // Increased to 100 as per common request

    // Filter to limit and then paginate
    const baseList = leaderboard.slice(0, TOTAL_LIST_LIMIT);
    const totalPages = Math.ceil(baseList.length / ITEMS_PER_PAGE);

    const displayList = baseList.slice(
        currentPage * ITEMS_PER_PAGE,
        (currentPage + 1) * ITEMS_PER_PAGE
    );

    const shortenAddress = (addr: string) => {
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    const getRankBadge = (rank: number) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return <span className={styles.rankNumber}>{rank}</span>;
    };

    const nextPage = () => {
        if (currentPage < totalPages - 1) {
            setCurrentPage(prev => prev + 1);
        }
    };

    const prevPage = () => {
        if (currentPage > 0) {
            setCurrentPage(prev => prev - 1);
        }
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

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className={styles.pagination}>
                            <button
                                onClick={prevPage}
                                disabled={currentPage === 0}
                                className={styles.pageButton}
                            >
                                ← Previous
                            </button>
                            <span className={styles.pageIndicator}>
                                Page {currentPage + 1} of {totalPages}
                            </span>
                            <button
                                onClick={nextPage}
                                disabled={currentPage === totalPages - 1}
                                className={styles.pageButton}
                            >
                                Next →
                            </button>
                        </div>
                    )}

                    {/* Sticky User Stats Bar */}
                    {currentUserAddress && (
                        <div className={styles.userStatsBar}>
                            <div className={styles.userStatsContent}>
                                {currentUserStats ? (
                                    <>
                                        <div className={styles.rank}>{currentUserStats.rank}</div>
                                        <div className={styles.address}>
                                            {shortenAddress(currentUserAddress)}
                                            <span className={styles.youBadge}>You</span>
                                        </div>
                                        <div className={styles.points}>
                                            {currentUserStats.points} pts
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
                                            Calculating...
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            <div className={styles.rulesSection}>
                <h3>📋 Fair Play & Multi-Game Point System</h3>
                <div className={styles.rulesList}>
                    <div className={styles.ruleItem}>
                        <span className={styles.ruleIcon}>🍕</span>
                        <div className={styles.ruleContent}>
                            <strong>Classic Flip (Capped):</strong>
                            <p>Points are based on volume but <strong>capped at 100 per round</strong> to prevent whale farming. Winners take 80% (up to 80 pts), Losers take 20% (up to 20 pts).</p>
                        </div>
                    </div>
                    <div className={styles.ruleItem}>
                        <span className={styles.ruleIcon}>💀</span>
                        <div className={styles.ruleContent}>
                            <strong>Cash-Out or Die:</strong>
                            <p>Earn <strong>20 points</strong> just for entering the arena. Survive as the last player to claim a massive <strong>100 point Victory Bonus</strong>.</p>
                        </div>
                    </div>
                    <div className={styles.ruleItem}>
                        <span className={styles.ruleIcon}>🔥</span>
                        <div className={styles.ruleContent}>
                            <strong>Streak Bonuses:</strong>
                            <p>Global streaks track across ALL games. Every milestone (2, 3, 5+ wins) awards bonus points to your total rank.</p>
                        </div>
                    </div>
                    <div className={styles.ruleItem}>
                        <span className={styles.ruleIcon}>🚫</span>
                        <div className={styles.ruleContent}>
                            <strong>Anti-Farming Protection:</strong>
                            <p>With the 1% fee and point caps, wash-trading is mathematically net-negative. Farmers lose ETH; real players gain rank. Historical farmed points are also normalized by 70%.</p>
                        </div>
                    </div>
                    <div className={styles.ruleItem}>
                        <span className={styles.ruleIcon}>🪂</span>
                        <div className={styles.ruleContent}>
                            <strong>Airdrop Distribution:</strong>
                            <p>Season rewards are distributed proportional to total points. Play any game mode to climb the Hall of Champions!</p>
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
