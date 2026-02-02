"use client";
import React, { useState, useEffect } from 'react';
import { formatEther } from 'viem';
import styles from './styles/CashOutDecisionModal.module.css';

interface CashOutDecisionModalProps {
    claimValue: bigint;
    roundsWon: number;
    onCashOut: () => void;
    onContinue: () => void;
    isLoading: boolean;
}

export default function CashOutDecisionModal({
    claimValue,
    roundsWon,
    onCashOut,
    onContinue,
    isLoading
}: CashOutDecisionModalProps) {
    const [countdown, setCountdown] = useState(10);
    const [autoDecided, setAutoDecided] = useState(false);

    const fee = (claimValue * 1n) / 100n;
    const payout = claimValue - fee;

    useEffect(() => {
        // Auto cash-out after 10 seconds for safety
        const interval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    if (!autoDecided) {
                        setAutoDecided(true);
                        onCashOut();
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [autoDecided, onCashOut]);

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <div className={styles.icon}>🏆</div>
                    <h2>YOU SURVIVED!</h2>
                    <div className={styles.rounds}>Round {roundsWon} Complete</div>
                </div>

                <div className={styles.content}>
                    <div className={styles.claimBox}>
                        <div className={styles.claimLabel}>Your Current Claim</div>
                        <div className={styles.claimValue}>{formatEther(claimValue)} ETH</div>
                        <div className={styles.claimSubtext}>
                            Cash out now: {formatEther(payout)} ETH (1% fee)
                        </div>
                    </div>

                    <div className={styles.warning}>
                        <div className={styles.warningIcon}>⚠️</div>
                        <div className={styles.warningText}>
                            <strong>WARNING:</strong> If you continue and lose the next round,
                            <span className={styles.highlight}> you get NOTHING</span>.
                        </div>
                    </div>

                    <div className={styles.buttons}>
                        <button
                            className={`${styles.button} ${styles.cashOutButton}`}
                            onClick={onCashOut}
                            disabled={isLoading}
                        >
                            <div className={styles.buttonIcon}>💰</div>
                            <div className={styles.buttonText}>
                                <div className={styles.buttonLabel}>CASH OUT</div>
                                <div className={styles.buttonValue}>{formatEther(payout)} ETH</div>
                            </div>
                        </button>

                        <button
                            className={`${styles.button} ${styles.continueButton}`}
                            onClick={onContinue}
                            disabled={isLoading}
                        >
                            <div className={styles.buttonIcon}>🔥</div>
                            <div className={styles.buttonText}>
                                <div className={styles.buttonLabel}>CONTINUE</div>
                                <div className={styles.buttonValue}>Risk it all</div>
                            </div>
                        </button>
                    </div>

                    <div className={styles.autoMessage}>
                        Auto cash-out in <strong>{countdown}s</strong> for your safety
                    </div>
                </div>
            </div>
        </div>
    );
}
