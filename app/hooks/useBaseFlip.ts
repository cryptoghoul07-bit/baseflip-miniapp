import { useReadContract, useWriteContract, useWatchContractEvent, useAccount, usePublicClient } from 'wagmi';
import { useEffect, useState } from 'react';
import { parseEther, formatEther } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;

console.log('Contract Address:', CONTRACT_ADDRESS);
console.log('API Key:', process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY ? 'Present' : 'Missing');

export interface RoundData {
    roundId: bigint;
    levelId: bigint;
    poolA: bigint;
    poolB: bigint;
    targetSize: bigint;
    isStarted: boolean;
    isCompleted: boolean;
    winningGroup: number;
}


export interface UserStake {
    amount: bigint;
    group: number;
}

export function useBaseFlip() {
    const [roundData, setRoundData] = useState<RoundData | null>(null);
    const [userStake, setUserStake] = useState<UserStake | null>(null);
    const { address } = useAccount();

    // Read current round data
    const {
        data: currentRound,
        refetch: refetchRound,
        isLoading: isLoadingRound,
        error: roundError
    } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: BaseFlipABI,
        functionName: 'getCurrentRound',
        query: {
            enabled: !!CONTRACT_ADDRESS,
            refetchInterval: 10000, // Poll every 10s as a fallback
        }
    });

    // Read user's stake
    const {
        data: myStake,
        refetch: refetchStake,
        isLoading: isLoadingStake
    } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: BaseFlipABI,
        functionName: 'getMyStake',
        query: {
            enabled: !!CONTRACT_ADDRESS && !!address,
        }
    });

    // Write contract functions
    const { writeContract: stakeWrite, isPending: isStaking } = useWriteContract();
    const { writeContract: claimWrite, isPending: isClaiming } = useWriteContract();

    // Watch for events
    useWatchContractEvent({
        address: CONTRACT_ADDRESS,
        abi: BaseFlipABI,
        eventName: 'StakePlaced',
        onLogs() {
            refetchRound();
            refetchStake();
        },
    });

    useWatchContractEvent({
        address: CONTRACT_ADDRESS,
        abi: BaseFlipABI,
        eventName: 'RoundStarted',
        onLogs() {
            refetchRound();
        },
    });

    useWatchContractEvent({
        address: CONTRACT_ADDRESS,
        abi: BaseFlipABI,
        eventName: 'WinnerDeclared',
        onLogs() {
            refetchRound();
        },
    });

    // Update state when data changes
    useEffect(() => {
        if (currentRound) {
            console.log('[useBaseFlip] currentRound data:', currentRound);

            // Handle both array and object formats from wagmi/viem
            const data = currentRound as any;
            const isArray = Array.isArray(data);

            setRoundData({
                roundId: (isArray ? data[0] : data.roundId) as bigint,
                levelId: (isArray ? data[1] : data.levelId) as bigint,
                poolA: (isArray ? data[2] : data.poolA) as bigint,
                poolB: (isArray ? data[3] : data.poolB) as bigint,
                targetSize: (isArray ? data[4] : data.targetSize) as bigint,
                isStarted: (isArray ? data[5] : data.isStarted) as boolean,
                isCompleted: (isArray ? data[6] : data.isCompleted) as boolean,
                winningGroup: Number(isArray ? data[8] ?? 0 : data.winningGroup ?? 0),
            });
        }
    }, [currentRound]);

    useEffect(() => {
        if (myStake) {
            const data = myStake as any;
            const isArray = Array.isArray(data);

            setUserStake({
                amount: (isArray ? data[0] : data.amount) as bigint,
                group: (isArray ? data[1] : data.group) as number,
            });
        }
    }, [myStake]);

    // Stake function
    const stake = async (group: 1 | 2, amount: string) => {
        try {
            stakeWrite({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'stake',
                args: [group],
                value: parseEther(amount),
            });
        } catch (error) {
            console.error('Error staking:', error);
            throw error;
        }
    };

    // Claim winnings function
    const claimWinnings = async (roundId: bigint) => {
        try {
            claimWrite({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'claimWinnings',
                args: [roundId],
            });
        } catch (error) {
            console.error('Error claiming winnings:', error);
            throw error;
        }
    };

    // Calculate expected multiplier
    const { data: expectedMultiplier } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: BaseFlipABI,
        functionName: 'getExpectedMultiplier',
        args: [parseEther('0.001'), 1], // Default args, will be overridden
    });

    const publicClient = usePublicClient();

    const getExpectedMultiplier = async (amount: string, group: 1 | 2): Promise<number> => {
        if (!publicClient) return 1;
        try {
            const data = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'getExpectedMultiplier',
                args: [parseEther(amount), group],
            });
            return data ? Number(data) / 100 : 1;
        } catch (error) {
            console.error('Error getting multiplier:', error);
            return 1;
        }
    };

    const [unclaimedRound, setUnclaimedRound] = useState<bigint | null>(null);



    // Better approach: Use wagmi hooks at top level
    const prevRoundId = roundData ? roundData.roundId - 1n : 0n;

    const { data: prevRound } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: BaseFlipABI,
        functionName: 'rounds',
        args: [prevRoundId],
        query: {
            enabled: prevRoundId > 0n,
        }
    });

    const { data: prevUserStake } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: BaseFlipABI,
        functionName: 'userStakes',
        args: [prevRoundId, address],
        query: {
            enabled: prevRoundId > 0n && !!address,
        }
    });

    useEffect(() => {
        if (prevRound && prevUserStake) {
            const rowData = prevRound as any;
            const stakeData = prevUserStake as any;
            const isRowArray = Array.isArray(rowData);
            const isStakeArray = Array.isArray(stakeData);

            const levelId = isRowArray ? rowData[0] : rowData.levelId;
            const poolA = isRowArray ? rowData[1] : rowData.poolA;
            const poolB = isRowArray ? rowData[2] : rowData.poolB;
            const roundStartTime = isRowArray ? rowData[3] : rowData.roundStartTime;
            const createdAt = isRowArray ? rowData[4] : rowData.createdAt;
            const isActive = isRowArray ? rowData[5] : rowData.isActive;
            const isCompleted = isRowArray ? rowData[6] : rowData.isCompleted;
            const isCancelled = isRowArray ? rowData[7] : rowData.isCancelled;
            const winningGroup = isRowArray ? rowData[8] : rowData.winningGroup;

            const amount = isStakeArray ? stakeData[0] : stakeData.amount;
            const group = isStakeArray ? stakeData[1] : stakeData.group;

            // If round completed, user staked, group matches winner, and amount > 0 (not claimed)
            if (isCompleted && amount > 0n && winningGroup === group) {
                setUnclaimedRound(prevRoundId);
            } else {
                setUnclaimedRound(null);
            }
        }
    }, [prevRound, prevUserStake, prevRoundId]);


    const [lastWinner, setLastWinner] = useState<{ id: bigint, group: number } | null>(null);

    useEffect(() => {
        if (prevRound) {
            const data = prevRound as any;
            const isArray = Array.isArray(data);

            // 6: isCompleted
            // 8: winningGroup
            const isRoundCompleted = isArray ? data[6] : data.isCompleted;
            const roundWinningGroup = isArray ? data[8] : data.winningGroup;

            console.log(`[useBaseFlip] PrevRound Update: ID=${prevRoundId}, Completed=${isRoundCompleted}, Winner=${roundWinningGroup}`);

            if (isRoundCompleted && Number(roundWinningGroup) > 0) {
                setLastWinner({
                    id: prevRoundId,
                    group: Number(roundWinningGroup)
                });
            }
        }
    }, [prevRound, prevRoundId]);

    return {
        roundData,
        userStake,
        stake,
        claimWinnings,
        getExpectedMultiplier,
        isStaking,
        isClaiming,
        isLoading: isLoadingRound || isLoadingStake,
        error: roundError,
        refetchRound,
        refetchStake,
        unclaimedRound,
        lastWinner, // Export this
    };
}
