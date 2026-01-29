
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
        if (!isFlipping) {
            setAnimationState('idle');
            return;
        }

        // 1. Start Flipping
        setAnimationState('flipping');

        // 2. Wait for spin (1.5s), then show result
        const spinTimer = setTimeout(() => {
            if (winningGroup) {
                setAnimationState('result');

                // 3. Wait for result display (2.5s), then close
                const closeTimer = setTimeout(() => {
                    onAnimationComplete?.();
                }, 2500);
                return () => clearTimeout(closeTimer);
            } else {
                // Should not happen, but safe exit
                onAnimationComplete?.();
            }
        }, 1500);

        return () => clearTimeout(spinTimer);
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
