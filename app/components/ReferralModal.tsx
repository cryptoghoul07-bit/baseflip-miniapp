
"use client";
import { useState } from 'react';
import { useReferrals } from '../hooks/useReferrals';
import styles from './styles/ReferralModal.module.css';

interface ReferralModalProps {
    isOpen: boolean;
    onClose: () => void;
    address: string | undefined;
}

export default function ReferralModal({ isOpen, onClose, address }: ReferralModalProps) {
    const { getReferralLink, referralCount, referralPoints } = useReferrals(address);
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const referralLink = getReferralLink();

    const handleCopy = () => {
        navigator.clipboard.writeText(referralLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <button className={styles.closeButton} onClick={onClose}>×</button>

                <div className={styles.content}>
                    <div className={styles.icon}>🔗</div>
                    <h2>Refer & Earn Points</h2>
                    <p className={styles.subtitle}>Invite friends and climb the leaderboard!</p>

                    <div className={styles.statsRow}>
                        <div className={styles.statCard}>
                            <span className={styles.statValue}>{referralCount}</span>
                            <span className={styles.statLabel}>Friends Referred</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statValue}>{referralPoints}</span>
                            <span className={styles.statLabel}>Points Earned</span>
                        </div>
                    </div>

                    <div className={styles.referralSection}>
                        <p className={styles.label}>Your Referral Link</p>
                        <div className={styles.linkContainer}>
                            <input
                                type="text"
                                value={referralLink}
                                readOnly
                                className={styles.linkInput}
                            />
                            <button
                                className={styles.copyButton}
                                onClick={handleCopy}
                            >
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                    </div>

                    <div className={styles.infoBox}>
                        <p>💡 You earn <strong>5 points</strong> for every friend who joins using your link <strong>and places their first stake</strong>.</p>
                    </div>

                    <button className={styles.ctaButton} onClick={onClose}>
                        Keep Sharing! 🚀
                    </button>
                </div>
            </div>
        </div>
    );
}
