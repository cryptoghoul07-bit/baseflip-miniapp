import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import CashOutOrDieABI from '../lib/CashOutOrDieABI.json';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS || '0x0') as `0x${string}`;

export interface GameState {
    gameId: bigint;
    entryFee: bigint;
    totalPool: bigint;
    currentRound: bigint;
    startTime: bigint;
    isAcceptingPlayers: boolean;
    isCompleted: boolean;
    activePlayerCount: bigint;
}

export interface PlayerState {
    claimValue: bigint;
    currentChoice: number;
    isAlive: boolean;
    hasCashedOut: boolean;
    roundsWon: bigint;
}

export function useCashOutOrDie(gameId: bigint) {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();

    const [gameState, setGameState] = useState<GameState | null>(null);
    const [playerState, setPlayerState] = useState<PlayerState | null>(null);
    const [players, setPlayers] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchGameState = useCallback(async () => {
        if (!publicClient || gameId === 0n) return;

        try {
            const game = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: CashOutOrDieABI,
                functionName: 'games',
                args: [gameId],
            }) as any;

            setGameState({
                gameId,
                entryFee: game[0],
                totalPool: game[1],
                currentRound: game[2],
                startTime: game[3],
                isAcceptingPlayers: game[4],
                isCompleted: game[5],
                activePlayerCount: game[6],
            });

            // Fetch player list
            const playerList = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: CashOutOrDieABI,
                functionName: 'getGamePlayers',
                args: [gameId],
            }) as string[];

            setPlayers(playerList);

        } catch (err) {
            console.error('Error fetching game state:', err);
            setError('Failed to load game state');
        }
    }, [publicClient, gameId]);

    const fetchPlayerState = useCallback(async () => {
        if (!publicClient || !address || gameId === 0n) return;

        try {
            const player = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: CashOutOrDieABI,
                functionName: 'getPlayerStats',
                args: [gameId, address],
            }) as any;

            setPlayerState({
                claimValue: player[0],
                currentChoice: player[1],
                isAlive: player[2],
                hasCashedOut: player[3],
                roundsWon: player[4],
            });
        } catch (err) {
            console.error('Error fetching player state:', err);
        }
    }, [publicClient, address, gameId]);

    useEffect(() => {
        fetchGameState();
        fetchPlayerState();

        // Poll for updates
        const interval = setInterval(() => {
            fetchGameState();
            fetchPlayerState();
        }, 5000);

        return () => clearInterval(interval);
    }, [fetchGameState, fetchPlayerState]);

    const joinGame = async (choice: 1 | 2) => {
        if (!walletClient || !address || !gameState) return;

        setIsLoading(true);
        setError(null);

        try {
            const { request } = await publicClient!.simulateContract({
                address: CONTRACT_ADDRESS,
                abi: CashOutOrDieABI,
                functionName: 'joinGame',
                args: [gameId, choice],
                value: gameState.entryFee,
                account: address,
            });

            const hash = await walletClient.writeContract(request);
            await publicClient!.waitForTransactionReceipt({ hash });

            await fetchGameState();
            await fetchPlayerState();
        } catch (err: any) {
            console.error('Error joining game:', err);
            setError(err.message || 'Failed to join game');
        } finally {
            setIsLoading(false);
        }
    };

    const submitChoice = async (choice: 1 | 2) => {
        if (!walletClient || !address) return;

        setIsLoading(true);
        setError(null);

        try {
            const { request } = await publicClient!.simulateContract({
                address: CONTRACT_ADDRESS,
                abi: CashOutOrDieABI,
                functionName: 'submitChoice',
                args: [gameId, choice],
                account: address,
            });

            const hash = await walletClient.writeContract(request);
            await publicClient!.waitForTransactionReceipt({ hash });

            await fetchPlayerState();
        } catch (err: any) {
            console.error('Error submitting choice:', err);
            setError(err.message || 'Failed to submit choice');
        } finally {
            setIsLoading(false);
        }
    };

    const cashOut = async () => {
        if (!walletClient || !address) return;

        setIsLoading(true);
        setError(null);

        try {
            const { request } = await publicClient!.simulateContract({
                address: CONTRACT_ADDRESS,
                abi: CashOutOrDieABI,
                functionName: 'cashOut',
                args: [gameId],
                account: address,
            });

            const hash = await walletClient.writeContract(request);
            await publicClient!.waitForTransactionReceipt({ hash });

            await fetchGameState();
            await fetchPlayerState();

            return true;
        } catch (err: any) {
            console.error('Error cashing out:', err);
            setError(err.message || 'Failed to cash out');
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const claimVictory = async () => {
        if (!walletClient || !address) return;

        setIsLoading(true);
        setError(null);

        try {
            const { request } = await publicClient!.simulateContract({
                address: CONTRACT_ADDRESS,
                abi: CashOutOrDieABI,
                functionName: 'claimVictory',
                args: [gameId],
                account: address,
            });

            const hash = await walletClient.writeContract(request);
            await publicClient!.waitForTransactionReceipt({ hash });

            await fetchGameState();
            await fetchPlayerState();

            return true;
        } catch (err: any) {
            console.error('Error claiming victory:', err);
            setError(err.message || 'Failed to claim victory');
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    return {
        gameState,
        playerState,
        players,
        isLoading,
        error,
        joinGame,
        submitChoice,
        cashOut,
        claimVictory,
        refetch: () => {
            fetchGameState();
            fetchPlayerState();
        },
    };
}
