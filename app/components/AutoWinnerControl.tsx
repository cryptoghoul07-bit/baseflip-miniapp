'use client';

import { useState, useEffect } from 'react';
import styles from './styles/AutoWinnerControl.module.css';

export default function AutoWinnerControl() {
    const [isRunning, setIsRunning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        autoStartBot();
    }, []);

    const autoStartBot = async () => {
        try {
            // Check current status
            const statusRes = await fetch('/api/auto-winner?action=status');
            const statusData = await statusRes.json();

            // If not running, start it automatically
            if (!statusData.running) {
                console.log('Auto-starting winner bot...');
                const startRes = await fetch('/api/auto-winner?action=start');
                const startData = await startRes.json();

                if (startData.success) {
                    setIsRunning(true);
                    console.log('✅ Bot auto-started successfully');
                }
            } else {
                setIsRunning(true);
            }
        } catch (error) {
            console.error('Failed to auto-start bot:', error);
        }
    };

    const toggleBot = async () => {
        setLoading(true);
        setMessage('');

        try {
            const action = isRunning ? 'stop' : 'start';
            const res = await fetch(`/api/auto-winner?action=${action}`);
            const data = await res.json();

            if (data.success) {
                setIsRunning(!isRunning);
                setMessage(data.message);
            } else {
                setMessage(`Error: ${data.message}`);
            }
        } catch (error: any) {
            setMessage(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.title}>
                    <span className={styles.icon}>🤖</span>
                    Auto-Winner Bot
                </div>
                <div className={isRunning ? styles.statusActive : styles.statusInactive}>
                    {isRunning ? '● Running' : '○ Stopped'}
                </div>
            </div>

            <p className={styles.description}>
                Auto-starts when admin loads. Automatically declares winners when rounds complete (50/50 random).
            </p>

            <button
                onClick={toggleBot}
                disabled={loading}
                className={isRunning ? styles.buttonStop : styles.buttonStart}
            >
                {loading ? 'Processing...' : isRunning ? 'Stop Bot' : 'Start Bot'}
            </button>

            {message && (
                <div className={styles.message}>
                    {message}
                </div>
            )}
        </div>
    );
}
