"use client";
import React, { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import { useCashOutOrDie } from '../hooks/useCashOutOrDie';
import { useStreak } from '../hooks/useStreak';
import CashOutDecisionModal from './CashOutDecisionModal';
import CashOutOrDieABI from '../lib/CashOutOrDieABI.json';
import styles from './styles/CashOutOrDie.module.css';

interface CashOutOrDieGameProps {
    onElimination?: (loss: { roundId: number; amount: string }) => void;
}

export default function CashOutOrDieGame({ onElimination }: CashOutOrDieGameProps) {
    const { address, isConnected } = useAccount();
    const [showCashOutModal, setShowCashOutModal] = useState(false);
    const [lastModalRound, setLastModalRound] = useState<bigint>(0n);
    const [outcome, setOutcome] = useState<'eliminated' | 'survival' | 'victory' | 'cashedOut' | null>(null);
    const [gameId, setGameId] = useState<bigint>(1n);

    // Fetch latest game ID on mount
    const publicClient = usePublicClient();
    useEffect(() => {
        const fetchLatestGameId = async () => {
            if (!publicClient) return;
            try {
                const cid = await publicClient.readContract({
                    address: (process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS || '0x0') as `0x${string}`,
                    abi: CashOutOrDieABI,
                    functionName: 'currentGameId'
                }) as bigint;
                if (cid > 0n) setGameId(cid);
            } catch (err) {
                console.error('Error fetching latest gameId:', err);
            }
        };
        fetchLatestGameId();
    }, [publicClient]);

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
            const currentRound = gameState.currentRound;
            if (currentRound > 1n && playerState.currentChoice === 0 && lastModalRound < currentRound) {
                // Player survived last round and hasn't submitted choice for new round
                setShowCashOutModal(true);
                setLastModalRound(currentRound);
            }
        }
    }, [playerState, gameState, lastModalRound]);

    // Track outcome animations
    const prevRoundRef = React.useRef<bigint>(0n);
    const prevAliveRef = React.useRef<boolean>(true);
    const isFirstLoad = React.useRef<boolean>(true);

    useEffect(() => {
        if (!gameState || !playerState) return;

        // On first load, just sync refs and don't play animations
        if (isFirstLoad.current) {
            prevRoundRef.current = gameState.currentRound;
            prevAliveRef.current = playerState.isAlive;
            isFirstLoad.current = false;
            return;
        }

        // Detection: Elimination
        if (prevAliveRef.current && !playerState.isAlive && !playerState.hasCashedOut) {
            setOutcome('eliminated');

            // Trigger streak protection callback
            if (onElimination) {
                const gid = Number(gameState.gameId);
                const rid = gid + 10000; // Offset to avoid collision with classic rounds
                // Use entry fee as the "lost amount" for the banner
                onElimination({
                    roundId: rid,
                    amount: formatEther(gameState.entryFee)
                });
            }

            setTimeout(() => setOutcome(null), 4000);
        }

        // Detection: Survival (Next round reached)
        if (gameState.currentRound > prevRoundRef.current && playerState.isAlive && prevRoundRef.current > 0n) {
            setOutcome('survival');
            setTimeout(() => setOutcome(null), 4000);
        }

        // Detection: Grand Victory
        if (gameState.isCompleted && playerState.isAlive && !playerState.hasCashedOut) {
            setOutcome('victory');
            setTimeout(() => setOutcome(null), 4000);
        }

        prevRoundRef.current = gameState.currentRound;
        prevAliveRef.current = playerState.isAlive;
    }, [gameState?.currentRound, gameState?.isCompleted, playerState?.isAlive]);

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
            setOutcome('cashedOut');
            setTimeout(() => setOutcome(null), 4000);
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

    // Check if user is in the players list effectively
    const isParticipating = address && players.some(p => p.toLowerCase() === (address ? address.toLowerCase() : ''));
    const hasJoined = isParticipating || (playerState && playerState.claimValue > 0n);

    const isEliminated = playerState && !playerState.isAlive && hasJoined && !playerState.hasCashedOut;
    const hasCashedOut = playerState && playerState.hasCashedOut;

    return (
        <div className={styles.container}>
            {/* Outcome Overlays */}
            {outcome === 'eliminated' && (
                <div className={`${styles.outcomeOverlay} ${styles.eliminatedOverlay}`}>
                    <div className={styles.outcomeIcon + ' ' + styles.shakingIcon}>💀</div>
                    <div className={`${styles.outcomeTitle} ${styles.eliminatedTitle}`}>Eliminated</div>
                </div>
            )}
            {outcome === 'survival' && (
                <div className={`${styles.outcomeOverlay} ${styles.survivalOverlay}`}>
                    <div className={styles.outcomeIcon + ' ' + styles.glowingIcon}>🛡️</div>
                    <div className={`${styles.outcomeTitle} ${styles.survivalTitle}`}>Survived</div>
                </div>
            )}
            {outcome === 'victory' && (
                <div className={`${styles.outcomeOverlay} ${styles.victoryOverlay}`}>
                    <div className={styles.outcomeIcon + ' ' + styles.glowingIcon}>👑</div>
                    <div className={`${styles.outcomeTitle} ${styles.victoryTitle}`}>Victory</div>
                </div>
            )}
            {outcome === 'cashedOut' && (
                <div className={`${styles.outcomeOverlay} ${styles.cashedOutOverlay}`}>
                    <div className={styles.outcomeIcon + ' ' + styles.glowingIcon}>💰</div>
                    <div className={`${styles.outcomeTitle} ${styles.cashedOutTitle}`}>Cashed Out</div>
                </div>
            )}

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
                                    You survived {playerState?.roundsWon?.toString() ?? '0'} rounds
                                </div>
                            </div>
                        </>
                    ) : hasCashedOut ? (
                        <>
                            <div className={styles.statusIcon}>💰</div>
                            <div className={styles.statusText}>
                                <div className={styles.statusTitle}>CASHED OUT</div>
                                <div className={styles.statusDesc}>
                                    Smart move! You survived {playerState?.roundsWon?.toString() ?? '0'} rounds
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={styles.statusIcon}>🔥</div>
                            <div className={styles.statusText}>
                                <div className={styles.statusTitle}>ALIVE</div>
                                <div className={styles.statusDesc}>
                                    Current Claim: {formatEther(playerState?.claimValue ?? 0n)} ETH
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

                        {playerState?.hasSubmittedChoice ? (
                            <div className={styles.waitingState}>
                                <div className={styles.waitingIcon}>⏳</div>
                                <div>Waiting for round to complete...</div>
                                <div className={styles.yourChoice}>
                                    Your choice: <strong>Group {playerState?.currentChoice === 1 ? 'A' : 'B'}</strong>
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
                        {gameState.isCompleted && playerState?.isAlive && !playerState.hasCashedOut ? (
                            <div className={styles.victoryClaimSection}>
                                <div className={styles.spectatorIcon}>👑</div>
                                <div className={styles.spectatorText}>YOU ARE THE VICTOR!</div>
                                <div className={styles.payoutAmount}>
                                    Winnings: {formatEther(playerState.claimValue)} ETH
                                </div>
                                <button
                                    className={styles.claimVictoryButton}
                                    onClick={claimVictory}
                                    disabled={isLoading}
                                >
                                    {isLoading ? 'Claiming...' : 'Claim Final Winnings'}
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className={styles.spectatorIcon}>👀</div>
                                <div className={styles.spectatorText}>
                                    {gameState.isCompleted ? 'Game Complete' : 'Spectating...'}
                                </div>
                            </>
                        )}
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
                    <li>👑 <strong>Rewards:</strong> 20 pts for entry + 100 pts for total victory</li>
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
