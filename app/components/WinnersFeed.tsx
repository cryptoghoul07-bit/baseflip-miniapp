"use client";
import React, { useState, useEffect } from 'react';
import { useWatchContractEvent } from 'wagmi';
import { formatEther } from 'viem';
import styles from './styles/WinnersFeed.module.css';
import BaseFlipABI from '../lib/BaseFlipABI.json';
import { useEthPrice } from '../hooks/useEthPrice';

// Use environment variable for contract address
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS as `0x${string}`;

interface WinnerEvent {
    id: string;
    user: string;
    amount: string;
    timestamp: number;
}

export default function WinnersFeed() {
    const [events, setEvents] = useState<WinnerEvent[]>([]);
    const { convertEthToUsd } = useEthPrice();

    // Subscribe to PayoutClaimed events
    useWatchContractEvent({
        address: CONTRACT_ADDRESS,
        abi: BaseFlipABI,
        eventName: 'PayoutClaimed',
        onLogs(logs) {
            const newEvents = logs.map(log => {
                const { user, amount } = log.args;
                return {
                    id: log.transactionHash,
                    user: user as string,
                    amount: formatEther(amount as bigint),
                    timestamp: Date.now()
                };
            });

            // Add new events to the top of the list
            setEvents(prev => [...newEvents, ...prev].slice(0, 10)); // Keep last 10
        },
    });

    // Remove old events after 30 seconds (optional, keeps feed fresh)
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            setEvents(prev => prev.filter(e => now - e.timestamp < 60000)); // Keep for 60s
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Helper to shorten address
    const shortenAddress = (addr: string) => {
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    if (events.length === 0) return null;

    return (
        <div className={styles.feedContainer}>
            <div className={styles.feedTitle}>🏆 Recent Winners</div>
            <div className={styles.feedList}>
                {events.map((event) => (
                    <div key={event.id} className={styles.feedItem}>
                        <span className={styles.user}>{shortenAddress(event.user)}</span>
                        <span className={styles.action}>just won</span>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span className={styles.amount}>{parseFloat(event.amount).toFixed(4)} ETH 💰</span>
                            <span style={{ fontSize: '0.75rem', color: '#00D4FF' }}>≈ {convertEthToUsd(event.amount)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
