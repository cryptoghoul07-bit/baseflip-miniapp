"use client";
import React from 'react';
import { useAccount } from 'wagmi';
import { useLeaderboard } from '../hooks/useLeaderboard';
import Leaderboard from '../components/Leaderboard';
import styles from './leaderboard.module.css';
import {
    ConnectWallet,
    Wallet,
    WalletDropdown,
    WalletDropdownDisconnect
} from "@coinbase/onchainkit/wallet";
import {
    Address,
    Avatar,
    Name,
    Identity,
} from "@coinbase/onchainkit/identity";

export default function LeaderboardPage() {
    const { address } = useAccount();
    const { leaderboard, currentUserStats, isLoading } = useLeaderboard();

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <button onClick={() => window.location.href = '/'} className={styles.backButton}>
                    ← Back to Tables
                </button>

                <div className={styles.walletButton}>
                    <Wallet>
                        <ConnectWallet className={styles.connectButton}>
                            <Avatar className="h-6 w-6" />
                            <Name />
                        </ConnectWallet>
                        <WalletDropdown>
                            <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                                <Avatar />
                                <Name />
                                <Address />
                            </Identity>
                            <WalletDropdownDisconnect />
                        </WalletDropdown>
                    </Wallet>
                </div>
            </div>

            {isLoading && leaderboard.length === 0 ? (
                <div className={styles.loading}>
                    <div className={styles.spinner} />
                    <p>Loading champions...</p>
                </div>
            ) : (
                <Leaderboard
                    leaderboard={leaderboard}
                    currentUserAddress={address}
                    currentUserStats={currentUserStats}
                />
            )}

            <div className={styles.rulesSection}>
                <h3>🔥 Streak Mode Rules</h3>
                <ul>
                    <li><strong>Win Streak:</strong> Consecutive wins build your streak count. Losing resets it to 0.</li>
                    <li><strong>Bonus Points:</strong> Earn +1 point at 2 wins, +2 at 3 wins, and +5 at 5 wins.</li>
                    <li><strong>Streak Protection:</strong> Pay 0.001 ETH to restore your streak after a loss.</li>
                    <li><strong>Daily Challenge:</strong> Streaks reset every 24h (UTC) for the daily race.</li>
                </ul>
            </div>
        </div>
    );
}
