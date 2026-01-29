
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
                            <p><strong>Pick a Side:</strong> Choose Pool A or Pool B.</p>
                        </div>
                        <div className={styles.step}>
                            <span className={styles.stepNumber}>2</span>
                            <p><strong>Place Your Bet:</strong> Stake ETH to join the round.</p>
                        </div>
                        <div className={styles.step}>
                            <span className={styles.stepNumber}>3</span>
                            <p><strong>Win Big:</strong> 50/50 chance. Winners take the losers' pot!</p>
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
