"use client";
import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { useCashOutOrDie } from '../hooks/useCashOutOrDie';
import { useStreak } from '../hooks/useStreak';
import CashOutDecisionModal from './CashOutDecisionModal';
import styles from './styles/CashOutOrDie.module.css';

export default function CashOutOrDieGame() {
    const { address, isConnected } = useAccount();
    const [showCashOutModal, setShowCashOutModal] = useState(false);

    // TODO: Get current game ID from contract or admin
    const gameId = 1n;

    const {
        gameState,
        playerState,
        players,
        isLoading,
        error,
        joinGame,
        submitChoice,
        cashOut,
        claimVictory,
    } = useCashOutOrDie(gameId);

    const { recordResult } = useStreak(address);
    const [lastRecordedGameId, setLastRecordedGameId] = useState<number>(0);

    const [selectedChoice, setSelectedChoice] = useState<1 | 2 | null>(null);

    // Record results to streak system
    useEffect(() => {
        if (!playerState || !gameState || !address) return;
        const gid = Number(gameState.gameId);

        // If game is completed or player is out, record the result once
        if (gid > lastRecordedGameId) {
            if (playerState.hasCashedOut || (gameState.isCompleted && playerState.isAlive)) {
                // Success
                recordResult(gid + 10000, true); // Offset to avoid collision with classic rounds
                setLastRecordedGameId(gid);
            } else if (!playerState.isAlive) {
                // Elimination
                recordResult(gid + 10000, false);
                setLastRecordedGameId(gid);
            }
        }
    }, [playerState, gameState, address, lastRecordedGameId, recordResult]);

    // Check if player just won a round and should see cash-out modal
    useEffect(() => {
        if (playerState?.isAlive && !playerState.hasCashedOut && gameState) {
            if (gameState.currentRound > 1n && playerState.currentChoice === 0) {
                // Player survived last round and hasn't submitted choice for new round
                setShowCashOutModal(true);
            }
        }
    }, [playerState, gameState]);

    const handleJoinGame = async () => {
        if (!selectedChoice) return;
        await joinGame(selectedChoice);
        setSelectedChoice(null);
    };

    const handleSubmitChoice = async () => {
        if (!selectedChoice) return;
        await submitChoice(selectedChoice);
        setSelectedChoice(null);
    };

    const handleCashOut = async () => {
        const success = await cashOut();
        if (success) {
            setShowCashOutModal(false);
        }
    };

    const handleContinue = () => {
        setShowCashOutModal(false);
    };

    if (!isConnected) {
        return (
            <div className={styles.container}>
                <div className={styles.connectPrompt}>
                    <div className={styles.promptIcon}>💀</div>
                    <h2>Cash-Out or Die</h2>
                    <p>Connect your wallet to enter the elimination arena</p>
                </div>
            </div>
        );
    }

    if (!gameState) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>Loading game...</div>
            </div>
        );
    }

    const hasJoined = playerState && playerState.claimValue > 0n;
    const isEliminated = playerState && !playerState.isAlive;
    const hasCashedOut = playerState && playerState.hasCashedOut;

    return (
        <div className={styles.container}>
            {/* Header Stats */}
            <div className={styles.header}>
                <div className={styles.statBox}>
                    <div className={styles.statLabel}>Total Pool</div>
                    <div className={styles.statValue}>
                        {formatEther(gameState.totalPool)} ETH
                    </div>
                </div>
                <div className={styles.statBox}>
                    <div className={styles.statLabel}>Players Alive</div>
                    <div className={styles.statValue}>
                        {gameState.activePlayerCount.toString()}
                    </div>
                </div>
                <div className={styles.statBox}>
                    <div className={styles.statLabel}>Current Round</div>
                    <div className={styles.statValue}>
                        {gameState.currentRound.toString()}
                    </div>
                </div>
            </div>

            {/* Player Status */}
            {hasJoined && (
                <div className={`${styles.playerStatus} ${isEliminated ? styles.eliminated : styles.alive}`}>
                    {isEliminated ? (
                        <>
                            <div className={styles.statusIcon}>💀</div>
                            <div className={styles.statusText}>
                                <div className={styles.statusTitle}>ELIMINATED</div>
                                <div className={styles.statusDesc}>
                                    You survived {playerState.roundsWon.toString()} rounds
                                </div>
                            </div>
                        </>
                    ) : hasCashedOut ? (
                        <>
                            <div className={styles.statusIcon}>💰</div>
                            <div className={styles.statusText}>
                                <div className={styles.statusTitle}>CASHED OUT</div>
                                <div className={styles.statusDesc}>
                                    Smart move! You survived {playerState.roundsWon.toString()} rounds
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={styles.statusIcon}>🔥</div>
                            <div className={styles.statusText}>
                                <div className={styles.statusTitle}>ALIVE</div>
                                <div className={styles.statusDesc}>
                                    Current Claim: {formatEther(playerState.claimValue)} ETH
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Main Content */}
            <div className={styles.mainContent}>
                {!hasJoined && gameState.isAcceptingPlayers ? (
                    // Join Game
                    <div className={styles.joinSection}>
                        <h2>Enter the Arena</h2>
                        <div className={styles.entryFee}>
                            Entry Fee: {formatEther(gameState.entryFee)} ETH
                        </div>

                        <div className={styles.choiceButtons}>
                            <button
                                className={`${styles.choiceButton} ${styles.groupA} ${selectedChoice === 1 ? styles.selected : ''}`}
                                onClick={() => setSelectedChoice(1)}
                            >
                                <div className={styles.choiceLabel}>GROUP A</div>
                                <div className={styles.choiceIcon}>🅰️</div>
                            </button>
                            <button
                                className={`${styles.choiceButton} ${styles.groupB} ${selectedChoice === 2 ? styles.selected : ''}`}
                                onClick={() => setSelectedChoice(2)}
                            >
                                <div className={styles.choiceLabel}>GROUP B</div>
                                <div className={styles.choiceIcon}>🅱️</div>
                            </button>
                        </div>

                        <button
                            className={styles.joinButton}
                            onClick={handleJoinGame}
                            disabled={!selectedChoice || isLoading}
                        >
                            {isLoading ? 'Joining...' : `Join Game (${formatEther(gameState.entryFee)} ETH)`}
                        </button>
                    </div>
                ) : hasJoined && !isEliminated && !hasCashedOut ? (
                    // Submit Choice for Current Round
                    <div className={styles.roundSection}>
                        <h2>Round {gameState.currentRound.toString()}</h2>
                        <div className={styles.roundDesc}>
                            Make your prediction. Win or lose it all.
                        </div>

                        {playerState.hasSubmittedChoice ? (
                            <div className={styles.waitingState}>
                                <div className={styles.waitingIcon}>⏳</div>
                                <div>Waiting for round to complete...</div>
                                <div className={styles.yourChoice}>
                                    Your choice: <strong>Group {playerState.currentChoice === 1 ? 'A' : 'B'}</strong>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className={styles.choiceButtons}>
                                    <button
                                        className={`${styles.choiceButton} ${styles.groupA} ${selectedChoice === 1 ? styles.selected : ''}`}
                                        onClick={() => setSelectedChoice(1)}
                                    >
                                        <div className={styles.choiceLabel}>GROUP A</div>
                                        <div className={styles.choiceIcon}>🅰️</div>
                                    </button>
                                    <button
                                        className={`${styles.choiceButton} ${styles.groupB} ${selectedChoice === 2 ? styles.selected : ''}`}
                                        onClick={() => setSelectedChoice(2)}
                                    >
                                        <div className={styles.choiceLabel}>GROUP B</div>
                                        <div className={styles.choiceIcon}>🅱️</div>
                                    </button>
                                </div>

                                <button
                                    className={styles.submitButton}
                                    onClick={handleSubmitChoice}
                                    disabled={!selectedChoice || isLoading}
                                >
                                    {isLoading ? 'Submitting...' : 'Submit Choice'}
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    // Game Over / Spectator View
                    <div className={styles.spectatorView}>
                        <div className={styles.spectatorIcon}>👀</div>
                        <div className={styles.spectatorText}>
                            {gameState.isCompleted ? 'Game Complete' : 'Spectating...'}
                        </div>
                    </div>
                )}
            </div>

            {/* Game Rules */}
            <div className={styles.rules}>
                <h3>📋 How It Works</h3>
                <ul>
                    <li>🎰 Each round: predict A or B (like BaseFlip)</li>
                    <li>💀 Lose = Eliminated. Your stake goes to survivors</li>
                    <li>🏆 Win = Your claim grows. Choose: Cash Out or Continue</li>
                    <li>💰 Cash out anytime = take 99% of your claim (1% fee)</li>
                    <li>🔥 Last survivor wins the entire pool</li>
                </ul>
            </div>

            {/* Cash Out Decision Modal */}
            {showCashOutModal && playerState && (
                <CashOutDecisionModal
                    claimValue={playerState.claimValue}
                    roundsWon={Number(playerState.roundsWon)}
                    onCashOut={handleCashOut}
                    onContinue={handleContinue}
                    isLoading={isLoading}
                />
            )}

            {error && (
                <div className={styles.error}>{error}</div>
            )}
        </div>
    );
}
