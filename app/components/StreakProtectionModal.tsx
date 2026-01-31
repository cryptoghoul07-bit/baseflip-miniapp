import React from 'react';
import styles from './styles/ReferralModal.module.css'; // Reusing modal styles for consistency

interface StreakProtectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onProtect: () => void;
    streakLost: number;
    isProtecting: boolean;
}

export default function StreakProtectionModal({
    isOpen,
    onClose,
    onProtect,
    streakLost,
    isProtecting
}: StreakProtectionModalProps) {
    if (!isOpen) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <button className={styles.closeButton} onClick={onClose}>×</button>

                <div className={styles.content} style={{ padding: '40px 24px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>💔</div>
                    <h2 style={{ color: '#FF5D5D' }}>Streak Broken!</h2>

                    <p className={styles.subtitle} style={{ marginBottom: '12px' }}>
                        You just lost your <strong>{streakLost} round streak</strong>.
                    </p>

                    <p style={{ color: '#94A3B8', fontSize: '0.9rem', marginBottom: '32px' }}>
                        Don't lose your progress! You can restore your streak for a small fee.
                    </p>

                    <div className={styles.statsRow}>
                        <div className={styles.statCard} style={{ borderColor: 'rgba(255, 93, 93, 0.2)' }}>
                            <span className={styles.statValue} style={{ color: '#FF5D5D' }}>0</span>
                            <span className={styles.statLabel}>Current</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', color: '#94A3B8' }}>
                            ➞
                        </div>
                        <div className={styles.statCard} style={{ borderColor: 'rgba(0, 212, 255, 0.2)', background: 'rgba(0, 212, 255, 0.05)' }}>
                            <span className={styles.statValue} style={{ color: '#00D4FF' }}>{streakLost}</span>
                            <span className={styles.statLabel}>Restored</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
                        <button
                            className={styles.ctaButton}
                            onClick={onProtect}
                            disabled={isProtecting}
                            style={{
                                background: 'linear-gradient(to right, #00D4FF, #0055FF)',
                                opacity: isProtecting ? 0.7 : 1
                            }}
                        >
                            {isProtecting ? 'Protecting...' : '🛡️ Protect Streak (0.001 ETH)'}
                        </button>

                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: '#94A3B8',
                                padding: '12px',
                                borderRadius: '16px',
                                cursor: 'pointer',
                                fontSize: '0.9rem'
                            }}
                        >
                            Accept Loss
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
