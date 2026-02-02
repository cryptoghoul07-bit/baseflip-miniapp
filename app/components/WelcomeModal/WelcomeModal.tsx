
"use client";
import { useState, useEffect } from 'react';
import styles from './WelcomeModal.module.css';

interface WelcomeModalProps {
    address: string | undefined;
}

export default function WelcomeModal({ address }: WelcomeModalProps) {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!address) return;

        // Check if user has seen welcome message
        const hasSeenWelcome = localStorage.getItem(`hasSeenWelcome_${address}`);

        if (!hasSeenWelcome) {
            setIsOpen(true);
        }
    }, [address]);

    const handleClose = () => {
        setIsOpen(false);
        if (address) {
            localStorage.setItem(`hasSeenWelcome_${address}`, 'true');
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <button className={styles.closeButton} onClick={handleClose}>×</button>

                <div className={styles.content}>
                    <div className={styles.icon}>🎰</div>
                    <h2>Welcome to BaseFlip!</h2>
                    <p className={styles.subtitle}>The Ultimate Onchain Prediction Game</p>

                    <div className={styles.steps}>
                        <div className={styles.step}>
                            <span className={styles.stepNumber}>1</span>
                            <p><strong>Choose Your Arena:</strong> Play Classic BaseFlip or the high-stakes "Cash-Out or Die".</p>
                        </div>
                        <div className={styles.step}>
                            <span className={styles.stepNumber}>2</span>
                            <p><strong>Stake & Survive:</strong> Predict the flip or outlast your rivals in survivor rounds.</p>
                        </div>
                        <div className={styles.step}>
                            <span className={styles.stepNumber}>3</span>
                            <p><strong>Rule the Leaderboard:</strong> Every win or survival earns you points toward the Season Airdrop!</p>
                        </div>
                    </div>

                    <p className={styles.note}>
                        💡 Earn points for every game to climb the leaderboard and win airdrops!
                    </p>

                    <button className={styles.ctaButton} onClick={handleClose}>
                        Let's Play! 🚀
                    </button>
                </div>
            </div>
        </div>
    );
}
