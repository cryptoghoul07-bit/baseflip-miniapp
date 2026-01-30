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
                    <ConnectWallet>Connect to Play</ConnectWallet>
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
        </div>
    );
}
