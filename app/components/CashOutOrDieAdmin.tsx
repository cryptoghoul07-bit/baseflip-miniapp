"use client";
import React, { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import CashOutOrDieABI from '../lib/CashOutOrDieABI.json';
import styles from './styles/CashOutOrDieAdmin.module.css';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS || '0x0') as `0x${string}`;

export default function CashOutOrDieAdmin() {
    const { address } = useAccount();
    const [gameId, setGameId] = useState('1');
    const [winningGroup, setWinningGroup] = useState<1 | 2>(1);

    const { data: hash, writeContract, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    // Read current game state
    const { data: gameData, refetch: refetchGame } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: CashOutOrDieABI,
        functionName: 'games',
        args: [BigInt(gameId)],
    });

    // Read player list
    const { data: players } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: CashOutOrDieABI,
        functionName: 'getGamePlayers',
        args: [BigInt(gameId)],
    });

    const game = gameData as any;

    const handleStartGame = async () => {
        try {
            writeContract({
                address: CONTRACT_ADDRESS,
                abi: CashOutOrDieABI,
                functionName: 'startGame',
                args: [BigInt(gameId)],
            });
        } catch (error) {
            console.error('Error starting game:', error);
        }
    };

    const handleDeclareWinner = async () => {
        try {
            writeContract({
                address: CONTRACT_ADDRESS,
                abi: CashOutOrDieABI,
                functionName: 'declareRoundWinner',
                args: [BigInt(gameId), winningGroup],
            });
        } catch (error) {
            console.error('Error declaring winner:', error);
        }
    };

    React.useEffect(() => {
        if (isSuccess) {
            refetchGame();
        }
    }, [isSuccess, refetchGame]);

    if (!address || CONTRACT_ADDRESS === '0x0') {
        return null;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h4>💀 Cash-Out or Die Admin</h4>
            </div>

            <div className={styles.section}>
                <label className={styles.label}>Game ID:</label>
                <input
                    type="number"
                    value={gameId}
                    onChange={(e) => setGameId(e.target.value)}
                    className={styles.input}
                    min="1"
                />
            </div>

            {game && (
                <div className={styles.gameInfo}>
                    <div className={styles.infoRow}>
                        <span>Status:</span>
                        <span className={styles.value}>
                            {game[5] ? '🏁 Completed' : game[4] ? '🟢 Accepting Players' : '🎮 In Progress'}
                        </span>
                    </div>
                    <div className={styles.infoRow}>
                        <span>Current Round:</span>
                        <span className={styles.value}>{game[2]?.toString() || '0'}</span>
                    </div>
                    <div className={styles.infoRow}>
                        <span>Active Players:</span>
                        <span className={styles.value}>{game[6]?.toString() || '0'}</span>
                    </div>
                    <div className={styles.infoRow}>
                        <span>Total Pool:</span>
                        <span className={styles.value}>
                            {game[1] ? (Number(game[1]) / 1e18).toFixed(4) : '0'} ETH
                        </span>
                    </div>
                </div>
            )}

            {players && players.length > 0 && (
                <div className={styles.playerList}>
                    <div className={styles.label}>Players ({players.length}):</div>
                    {players.slice(0, 5).map((player: string, i: number) => (
                        <div key={i} className={styles.player}>
                            {player.slice(0, 6)}...{player.slice(-4)}
                        </div>
                    ))}
                    {players.length > 5 && (
                        <div className={styles.player}>+{players.length - 5} more</div>
                    )}
                </div>
            )}

            <div className={styles.actions}>
                {game && game[4] && (
                    <button
                        onClick={handleStartGame}
                        disabled={isPending || isConfirming}
                        className={styles.startButton}
                    >
                        {isPending || isConfirming ? 'Starting...' : '🎮 Start Game'}
                    </button>
                )}

                {game && !game[4] && !game[5] && (
                    <>
                        <div className={styles.winnerSelect}>
                            <label className={styles.label}>Winner:</label>
                            <div className={styles.groupButtons}>
                                <button
                                    className={`${styles.groupButton} ${winningGroup === 1 ? styles.active : ''}`}
                                    onClick={() => setWinningGroup(1)}
                                >
                                    Group A
                                </button>
                                <button
                                    className={`${styles.groupButton} ${winningGroup === 2 ? styles.active : ''}`}
                                    onClick={() => setWinningGroup(2)}
                                >
                                    Group B
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={handleDeclareWinner}
                            disabled={isPending || isConfirming}
                            className={styles.declareButton}
                        >
                            {isPending || isConfirming ? 'Declaring...' : '🏆 Declare Winner'}
                        </button>
                    </>
                )}
            </div>

            {isSuccess && (
                <div className={styles.success}>
                    ✅ Transaction successful!
                </div>
            )}

            {hash && (
                <div className={styles.txHash}>
                    Tx: {hash.slice(0, 8)}...{hash.slice(-6)}
                </div>
            )}
        </div>
    );
}
