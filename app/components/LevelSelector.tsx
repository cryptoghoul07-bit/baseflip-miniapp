"use client";
import React from 'react';
import styles from './styles/LevelSelector.module.css';

interface Level {
    id: number;
    targetPool: string;
    minStake: string;
    maxStake: string;
    isActive: boolean;
}

interface LevelSelectorProps {
    selectedLevel: number;
    onSelectLevel: (levelId: number) => void;
}

const LEVELS: Level[] = [
    { id: 1, targetPool: '0.1', minStake: '0.001', maxStake: '0.05', isActive: true },
    { id: 2, targetPool: '0.5', minStake: '0.005', maxStake: '0.25', isActive: false },
    { id: 3, targetPool: '1.0', minStake: '0.01', maxStake: '0.5', isActive: false },
];

const LEVEL_NAMES: Record<number, { name: string; icon: string }> = {
    1: { name: 'Low Roller', icon: '🎲' },
    2: { name: 'High Stakes', icon: '💎' },
    3: { name: 'Whale Club', icon: '🐋' },
};

export default function LevelSelector({ selectedLevel, onSelectLevel }: LevelSelectorProps) {
    return (
        <div className={styles.levelSelector}>
            <h2 className={styles.title}>⚡ Choose Your Stakes</h2>
            <div className={styles.levels}>
                {LEVELS.map((level) => (
                    <button
                        key={level.id}
                        className={`${styles.levelCard} ${selectedLevel === level.id ? styles.selected : ''
                            } ${!level.isActive ? styles.locked : ''}`}
                        onClick={() => level.isActive && onSelectLevel(level.id)}
                        disabled={!level.isActive}
                    >
                        <div className={styles.levelIcon}>{LEVEL_NAMES[level.id].icon}</div>
                        <div className={styles.levelNumber}>{LEVEL_NAMES[level.id].name}</div>
                        <div className={styles.poolSize}>{level.targetPool} ETH Pool</div>
                        <div className={styles.stakeRange}>
                            Bets: {level.minStake} - {level.maxStake} ETH
                        </div>
                        {!level.isActive && (
                            <div className={styles.comingSoon}>🔒 Locked</div>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
