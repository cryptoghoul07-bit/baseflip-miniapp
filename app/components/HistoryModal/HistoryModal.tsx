
import styles from './HistoryModal.module.css';
import { useUserHistory, HistoryItem } from '../../hooks/useUserHistory';

interface HistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function HistoryModal({ isOpen, onClose }: HistoryModalProps) {
    const { history, isLoading, refetchHistory } = useUserHistory();

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2>📜 My Betting History</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>

                <div className={styles.content}>
                    {isLoading && history.length === 0 ? (
                        <div className={styles.loading}>Loading history...</div>
                    ) : history.length === 0 ? (
                        <p className={styles.empty}>No recent bets found.</p>
                    ) : (
                        <div className={styles.list}>
                            {history.map((item) => (
                                <HistoryRow key={item.roundId} item={item} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function HistoryRow({ item }: { item: HistoryItem }) {
    const isPending = !item.isCompleted;
    const isWon = item.isCompleted && item.winningGroup === item.group;

    return (
        <div className={`${styles.row} ${isPending ? styles.pending : isWon ? styles.won : styles.lost}`}>
            <div className={styles.rowLeft}>
                <span className={styles.roundId}>#{item.roundId}</span>
                <span className={styles.timestamp}>
                    {new Date(item.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>

            <div className={styles.rowCenter}>
                <span className={styles.amount}>
                    {item.amount.includes('+') ? item.amount : Number(item.amount).toFixed(3)} ETH
                </span>
                <span className={item.group === 1 ? styles.groupA : styles.groupB}>
                    on {item.group === 1 ? 'Pool A (Blue)' : 'Pool B (Red)'}
                </span>
            </div>

            <div className={styles.rowRight}>
                {isPending ? (
                    <span className={styles.statusPending}>⏳ Pending</span>
                ) : isWon ? (
                    <span className={styles.statusWon}>🏆 WON</span>
                ) : (
                    <span className={styles.statusLost}>💀 Lost</span>
                )}
            </div>
        </div>
    );
}
