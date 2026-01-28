"use client";
import React from 'react';
import { formatEther } from 'viem';
import styles from './styles/PoolDisplay.module.css';
import { useEthPrice } from '../hooks/useEthPrice';

interface PoolDisplayProps {
    poolA: bigint;
    poolB: bigint;
    targetSize: bigint;
    userGroup: number | null;
}

export default function PoolDisplay({
    poolA,
    poolB,
    targetSize,
    userGroup,
}: PoolDisplayProps) {
    const { convertEthToUsd } = useEthPrice();
    const poolAPercent = targetSize > 0n ? Number((poolA * 100n) / targetSize) : 0;
    const poolBPercent = targetSize > 0n ? Number((poolB * 100n) / targetSize) : 0;

    const poolAValue = formatEther(poolA);
    const poolBValue = formatEther(poolB);
    const targetValue = formatEther(targetSize);

    return (
        <div className={styles.poolDisplay}>
            <div className={`${styles.pool} ${styles.poolA} ${userGroup === 1 ? styles.userPool : ''}`}>
                <div className={styles.poolHeader}>
                    <h3>🔵 Pool Alpha</h3>
                    {userGroup === 1 && <span className={styles.badge}>Your Bet</span>}
                </div>

                <div className={styles.poolAmount}>
                    {poolAValue}
                    <span className={styles.eth}>ETH</span>
                    <div style={{ fontSize: '1rem', color: '#00D4FF', marginTop: '4px' }}>
                        ≈ {convertEthToUsd(poolAValue)}
                    </div>
                </div>

                <div className={styles.progressBar}>
                    <div
                        className={styles.progressFill}
                        style={{ width: `${Math.min(poolAPercent, 100)}%` }}
                    />
                </div>

                <div className={styles.target}>
                    {poolAPercent.toFixed(0)}% to target
                </div>
            </div>

            <div className={styles.vs}>⚡</div>

            <div className={`${styles.pool} ${styles.poolB} ${userGroup === 2 ? styles.userPool : ''}`}>
                <div className={styles.poolHeader}>
                    <h3>🔴 Pool Beta</h3>
                    {userGroup === 2 && <span className={styles.badge}>Your Bet</span>}
                </div>

                <div className={styles.poolAmount}>
                    {poolBValue}
                    <span className={styles.eth}>ETH</span>
                    <div style={{ fontSize: '1rem', color: '#00D4FF', marginTop: '4px' }}>
                        ≈ {convertEthToUsd(poolBValue)}
                    </div>
                </div>

                <div className={styles.progressBar}>
                    <div
                        className={styles.progressFill}
                        style={{ width: `${Math.min(poolBPercent, 100)}%` }}
                    />
                </div>

                <div className={styles.target}>
                    {poolBPercent.toFixed(0)}% to target
                </div>
            </div>
        </div>
    );
}
