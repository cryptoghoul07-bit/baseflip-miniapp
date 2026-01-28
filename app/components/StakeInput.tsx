"use client";
import React, { useState, useEffect } from 'react';
import { formatEther, parseEther } from 'viem';
import styles from './styles/StakeInput.module.css';
import { useEthPrice } from '../hooks/useEthPrice';

interface StakeInputProps {
    poolA: bigint;
    poolB: bigint;
    minStake: number;
    maxStake: number;
    onStake: (group: 1 | 2, amount: string) => void;
    isStaking: boolean;
    hasStaked: boolean;
}

export default function StakeInput({
    poolA,
    poolB,
    minStake,
    maxStake,
    onStake,
    isStaking,
    hasStaked,
}: StakeInputProps) {
    const [selectedGroup, setSelectedGroup] = useState<1 | 2 | null>(null);
    const [amount, setAmount] = useState('');
    const [error, setError] = useState('');
    const [expectedMultiplier, setExpectedMultiplier] = useState<number>(1);

    // ETH Price Hook
    const { convertEthToUsd } = useEthPrice();

    // Determine which side can be staked on
    const canStakeA = poolA <= poolB;
    const canStakeB = poolB <= poolA;

    useEffect(() => {
        // Auto-select the only available side
        if (!canStakeA && canStakeB && selectedGroup !== 2) {
            setSelectedGroup(2);
        } else if (!canStakeB && canStakeA && selectedGroup !== 1) {
            setSelectedGroup(1);
        }
    }, [canStakeA, canStakeB, selectedGroup]);

    useEffect(() => {
        if (selectedGroup && amount) {
            calculateMultiplier();
        }
    }, [selectedGroup, amount, poolA, poolB]);

    const calculateMultiplier = () => {
        try {
            const stakeAmount = parseEther(amount);
            const myPool = selectedGroup === 1 ? poolA + stakeAmount : poolB + stakeAmount;
            const opponentPool = selectedGroup === 1 ? poolB : poolA;

            if (opponentPool === 0n) {
                setExpectedMultiplier(1);
                return;
            }

            const payoutPool = (opponentPool * 99n) / 100n;
            const myShare = (stakeAmount * payoutPool) / myPool;
            const totalReturn = stakeAmount + myShare;
            const multiplier = Number((totalReturn * 100n) / stakeAmount) / 100;

            setExpectedMultiplier(multiplier);
        } catch {
            setExpectedMultiplier(1);
        }
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setAmount(value);
        setError('');

        if (!value) return;

        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            setError('Invalid amount');
        } else if (numValue < minStake) {
            setError(`Minimum stake is ${minStake} ETH`);
        } else if (numValue > maxStake) {
            setError(`Maximum stake is ${maxStake} ETH`);
        }
    };

    const handleStake = () => {
        if (!selectedGroup) {
            setError('Please select a side');
            return;
        }

        const numValue = parseFloat(amount);
        if (isNaN(numValue) || numValue < minStake || numValue > maxStake) {
            setError('Invalid stake amount');
            return;
        }

        onStake(selectedGroup, amount);
    };

    const usdValue = convertEthToUsd(amount);
    const potentialEthReturn = amount ? (parseFloat(amount) * expectedMultiplier).toFixed(4) : '0';
    const potentialUsdReturn = convertEthToUsd(potentialEthReturn);

    if (hasStaked) {
        return (
            <div className={styles.stakeInput}>
                <div className={styles.alreadyStaked}>
                    🎰 Your bet is locked in. Good luck!
                </div>
            </div>
        );
    }

    return (
        <div className={styles.stakeInput}>
            <h3 className={styles.title}>💰 Place Your Bet</h3>

            <div className={styles.groupSelector}>
                <button
                    className={`${styles.groupButton} ${styles.groupA} ${selectedGroup === 1 ? styles.selected : ''
                        } ${!canStakeA ? styles.disabled : ''}`}
                    onClick={() => canStakeA && setSelectedGroup(1)}
                    disabled={!canStakeA}
                >
                    <div className={styles.groupLabel}>🔵 Alpha</div>
                    {!canStakeA && <div className={styles.lockedText}>Table Full</div>}
                </button>

                <button
                    className={`${styles.groupButton} ${styles.groupB} ${selectedGroup === 2 ? styles.selected : ''
                        } ${!canStakeB ? styles.disabled : ''}`}
                    onClick={() => canStakeB && setSelectedGroup(2)}
                    disabled={!canStakeB}
                >
                    <div className={styles.groupLabel}>🔴 Beta</div>
                    {!canStakeB && <div className={styles.lockedText}>Table Full</div>}
                </button>
            </div>

            <div className={styles.amountInput}>
                <label className={styles.label}>
                    Bet Amount (ETH)
                    <span className={styles.range}>
                        Min: {minStake} | Max: {maxStake}
                    </span>
                </label>
                <input
                    type="number"
                    step="0.001"
                    min={minStake}
                    max={maxStake}
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.001"
                    className={styles.input}
                    disabled={!selectedGroup}
                />
                {!error && amount && usdValue && (
                    <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#00D4FF', fontWeight: 600, textAlign: 'right' }}>
                        ≈ {usdValue}
                    </div>
                )}
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {selectedGroup && amount && !error && (
                <div className={styles.multiplier}>
                    Potential Return: <strong>{expectedMultiplier.toFixed(2)}x</strong>
                    <span className={styles.multiplierDetail}>
                        {' '}
                        ({potentialEthReturn} ETH <span style={{ color: '#00D4FF' }}>≈ {potentialUsdReturn}</span>)
                    </span>
                </div>
            )}

            <button
                className={styles.stakeButton}
                onClick={handleStake}
                disabled={!selectedGroup || !amount || !!error || isStaking}
            >
                {isStaking ? '🎲 Placing Bet...' : '🎯 Place Bet'}
            </button>
        </div>
    );
}
