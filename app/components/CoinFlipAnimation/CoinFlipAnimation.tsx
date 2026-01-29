
"use client";
import React, { useEffect, useState } from 'react';
import styles from './CoinFlipAnimation.module.css';

interface CoinFlipAnimationProps {
    isFlipping: boolean;
    winningGroup: number | null; // 1 (Pool A) or 2 (Pool B)
    onAnimationComplete?: () => void;
}

export default function CoinFlipAnimation({ isFlipping, winningGroup, onAnimationComplete }: CoinFlipAnimationProps) {
    const [animationState, setAnimationState] = useState<'idle' | 'flipping' | 'result'>('idle');

    useEffect(() => {
        if (isFlipping) {
            setAnimationState('flipping');
        } else if (winningGroup && animationState === 'flipping') {
            // When flipping stops and we have a winner
            setAnimationState('result');

            // Allow time for the result animation to show before callback
            const timer = setTimeout(() => {
                onAnimationComplete?.();
            }, 2000);
            return () => clearTimeout(timer);
        } else if (!isFlipping && !winningGroup) {
            setAnimationState('idle');
        }
    }, [isFlipping, winningGroup]);

    if (animationState === 'idle') return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.container}>
                <div className={`${styles.coin} ${animationState === 'flipping' ? styles.spinning : ''} ${animationState === 'result' ? styles.landed : ''}`}
                    style={{ '--winner': winningGroup === 1 ? '0deg' : '180deg' } as React.CSSProperties}
                >
                    <div className={`${styles.side} ${styles.heads}`}>
                        <span>A</span>
                        <div className={styles.glow}></div>
                    </div>
                    <div className={`${styles.side} ${styles.tails}`}>
                        <span>B</span>
                        <div className={styles.glow}></div>
                    </div>
                </div>

                {animationState === 'flipping' && (
                    <div className={styles.text}>Flipping...</div>
                )}

                {animationState === 'result' && (
                    <div className={styles.resultText}>
                        {winningGroup === 1 ? 'POOL A WINS!' : 'POOL B WINS!'}
                    </div>
                )}
            </div>
        </div>
    );
}
