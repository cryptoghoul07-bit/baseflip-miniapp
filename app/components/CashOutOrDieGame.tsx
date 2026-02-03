"use client";
import React, { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import { useCashOutOrDie } from '../hooks/useCashOutOrDie';
import { useStreak } from '../hooks/useStreak';
import { useUserHistory } from '../hooks/useUserHistory';
import CashOutDecisionModal from './CashOutDecisionModal';
import CashOutOrDieABI from '../lib/CashOutOrDieABI.json';
import styles from './styles/CashOutOrDie.module.css';

// Internal component for the tournament circuit animation
function ArenaCircuit({ players, survivorsA, survivorsB, currentRound, gameState }: {
    players: string[],
    survivorsA: number,
    survivorsB: number,
    currentRound: number,
    gameState: any
}) {
    // Current bracket depth (0 to 1)
    // R1: 0 (outer), R2: 0.3, R3: 0.6, R4+: 1.0 (inner)
    const depth = Math.min(1, (currentRound - 1) * 0.33);

    return (
        <div className={styles.bracketSection}>
            <div className={styles.bracketTitle}>🏆 ARENA BRACKET</div>
            <div className={styles.circuitContainer}>
                <svg viewBox="0 0 100 100" className={styles.circuitSvg} preserveAspectRatio="none">
                    {/* Background paths */}
                    <path d="M 0 20 H 10 V 35 H 20 V 50 H 50" className={styles.circuitLine} />
                    <path d="M 0 80 H 10 V 65 H 20 V 50" className={styles.circuitLine} />
                    <path d="M 0 50 H 50" className={styles.circuitLine} />
                    <path d="M 100 20 H 90 V 35 H 80 V 50 H 50" className={styles.circuitLine} />
                    <path d="M 100 80 H 90 V 65 H 80 V 50" className={styles.circuitLine} />
                    <path d="M 100 50 H 50" className={styles.circuitLine} />

                    {/* Final Node */}
                    <circle cx="50" cy="50" r="4.5" className={styles.circuitFinalNode} />
                    <circle cx="50" cy="50" r="7" className={styles.circuitFinalRing} />

                    {/* Dynamic Player Nodes - Group A */}
                    {Array.from({ length: Math.min(survivorsA, 10) }).map((_, i) => {
                        const offset = (i - (Math.min(survivorsA, 10) - 1) / 2) * 4;
                        const x = depth * 40;
                        const y = 50 + offset;
                        return (
                            <circle
                                key={`a-${i}`}
                                cx={x} cy={y} r="1.5"
                                className={styles.playerNodeA}
                                style={{ transition: 'cx 1s ease-in-out, cy 1s ease-in-out' }}
                            />
                        );
                    })}

                    {/* Dynamic Player Nodes - Group B */}
                    {Array.from({ length: Math.min(survivorsB, 10) }).map((_, i) => {
                        const offset = (i - (Math.min(survivorsB, 10) - 1) / 2) * 4;
                        const x = 100 - (depth * 40);
                        const y = 50 + offset;
                        return (
                            <circle
                                key={`b-${i}`}
                                cx={x} cy={y} r="1.5"
                                className={styles.playerNodeB}
                                style={{ transition: 'cx 1s ease-in-out, cy 1s ease-in-out' }}
                            />
                        );
                    })}
                </svg>
            </div>
            {gameState.isAcceptingPlayers && (
                <div className={styles.bracketWaiting}>
                    WAITING FOR FIGHTERS... ({players.length})
                </div>
            )}
        </div>
    );
}

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
        lobbyStartTime,
        isLoading,
        error,
        joinGame,
        submitChoice,
        cashOut,
        claimVictory,
    } = useCashOutOrDie(gameId);

    const { recordRoundResult } = useUserHistory();

    const [lobbyCountdown, setLobbyCountdown] = useState<number | null>(null);

    // Lobby Countdown Logic
    useEffect(() => {
        if (!lobbyStartTime || !gameState?.isAcceptingPlayers) {
            setLobbyCountdown(null);
            return;
        }

        const interval = setInterval(() => {
            const now = Math.floor(Date.now() / 1000);
            const elapsed = now - lobbyStartTime;
            const remaining = Math.max(0, 30 - elapsed);
            setLobbyCountdown(remaining);
        }, 1000);

        return () => clearInterval(interval);
    }, [lobbyStartTime, gameState?.isAcceptingPlayers]);

    const { recordResult } = useStreak(address);
    const [lastRecordedGameId, setLastRecordedGameId] = useState<number>(0);

    const [selectedChoice, setSelectedChoice] = useState<1 | 2 | null>(null);

    // Record results to streak system
    useEffect(() => {
        if (!playerState || !gameState || !address) return;
        const gid = Number(gameState.gameId);

        // Detect if player is out (No longer alive)
        const isActuallyOut = !playerState.isAlive;
        const isWinner = playerState.hasCashedOut || (gameState.isCompleted && playerState.isAlive);

        if (gid > lastRecordedGameId) {
            if (isWinner) {
                recordResult(gid + 10000, true);
                setLastRecordedGameId(gid);
            } else if (isActuallyOut) {
                // Instant Streak Reset
                recordResult(gid + 10000, false);
                setLastRecordedGameId(gid);
            }
        }
    }, [playerState, gameState, address, lastRecordedGameId, recordResult]);

    // PERSISTENCE: Record to History Modal (Pending/Won/Lost)
    useEffect(() => {
        if (!playerState || !gameState || !address) return;
        const gid = Number(gameState.gameId);

        const historyItem = {
            roundId: gid,
            gameType: 'cashout' as const,
            amount: formatEther(playerState.claimValue > 0n ? playerState.claimValue : gameState.entryFee),
            stakeAmount: formatEther(gameState.entryFee),
            group: playerState.currentChoice || 1,
            winningGroup: 0,
            timestamp: Number(gameState.startTime) || Math.floor(Date.now() / 1000),
            isClaimed: playerState.hasCashedOut
        };

        const isActuallyOut = !playerState.isAlive;
        const isWinner = playerState.hasCashedOut || (gameState.isCompleted && playerState.isAlive);

        if (isWinner) {
            recordRoundResult({ ...historyItem, isCompleted: true, isWinner: true });
        } else if (isActuallyOut) {
            // Elimination - Instant History Update
            recordRoundResult({ ...historyItem, isCompleted: true, isWinner: false });
        } else if (playerState.claimValue > 0n && !playerState.hasCashedOut && playerState.isAlive) {
            recordRoundResult({ ...historyItem, isCompleted: false, isWinner: false });
        }
    }, [playerState, gameState, address, recordRoundResult]);

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
                    <h2>The Arena</h2>
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

            {/* Lobby Countdown / Recruitment Warning */}
            {gameState.isAcceptingPlayers && players.length >= 2 && (
                <div className={styles.lobbyInfo}>
                    {lobbyCountdown !== null && (
                        <div className={styles.lobbyTimer}>
                            <span className={styles.timerIcon}>⏳</span>
                            Game starting in <strong>{lobbyCountdown}s</strong>
                        </div>
                    )}
                    {(gameState.totalPool > 0n && (formatEther(gameState.totalPool) === formatEther(gameState.entryFee * BigInt(players.length)))) && (
                        // This logic is a bit simplified, but basically if entryFee * players == totalPool, 
                        // it might mean nobody has bet on the OTHER side if we check pools.
                        // Actually, contract doesn't expose poolA/poolB for CashOut. 
                        // But we can check if anyone is on Group B vs Group A if we had that data.
                        // For now, let's just show a general "Invite Opponents" message if players < 4.
                        players.length < 4 && (
                            <div className={styles.lobbyWarning}>
                                ⚠️ Recruit more opponents for a bigger prize!
                            </div>
                        )
                    )}
                </div>
            )}

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
                                    Claim: {formatEther(playerState?.claimValue ?? 0n)} ETH
                                </div>
                            </div>
                            <div className={styles.statusActions}>
                                {gameState.isCompleted ? (
                                    <button
                                        className={styles.statusClaimButton}
                                        onClick={claimVictory}
                                        disabled={isLoading}
                                    >
                                        Claim Victory
                                    </button>
                                ) : (
                                    <button
                                        className={styles.statusCashOutButton}
                                        onClick={handleCashOut}
                                        disabled={isLoading}
                                    >
                                        Cash Out
                                    </button>
                                )}
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

                        <ArenaCircuit
                            players={players}
                            survivorsA={players.length > 0 ? Math.ceil(players.length / 2) : 0}
                            survivorsB={players.length > 0 ? Math.floor(players.length / 2) : 0}
                            currentRound={1}
                            gameState={gameState}
                        />

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
                ) : hasJoined && !isEliminated && !hasCashedOut && !gameState.isCompleted ? (
                    // Submit Choice for Current Round
                    <div className={styles.roundSection}>
                        <h2>Round {gameState.currentRound.toString()}</h2>

                        <ArenaCircuit
                            players={players}
                            survivorsA={Number(gameState.poolACount || 0)}
                            survivorsB={Number(gameState.poolBCount || 0)}
                            currentRound={Number(gameState.currentRound)}
                            gameState={gameState}
                        />

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
