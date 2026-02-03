"use client";
import React from 'react';
import styles from './GameModeSelector.module.css';

interface GameModeSelectorProps {
    currentMode: 'classic' | 'cashout';
    onModeChange: (mode: 'classic' | 'cashout') => void;
}

export default function GameModeSelector({ currentMode, onModeChange }: GameModeSelectorProps) {
    return (
        <div className={styles.selector}>
            <div className={styles.selectorInner}>
                <button
                    className={`${styles.modeButton} ${currentMode === 'classic' ? styles.active : ''}`}
                    onClick={() => onModeChange('classic')}
                >
                    <div className={styles.modeIcon}>🎰</div>
                    <div className={styles.modeDetails}>
                        <div className={styles.modeName}>BaseFlip Classic</div>
                        <div className={styles.modeDesc}>Traditional pool-based betting</div>
                    </div>
                </button>

                <div className={styles.divider} />

                <button
                    className={`${styles.modeButton} ${currentMode === 'cashout' ? styles.active : ''}`}
                    onClick={() => onModeChange('cashout')}
                >
                    <div className={styles.modeIcon}>💀</div>
                    <div className={styles.modeDetails}>
                        <div className={styles.modeName}>The Arena</div>
                        <div className={styles.modeDesc}>
                            Elimination survival game
                        </div>
                    </div>
                </button>
            </div>
        </div>
    );
}
