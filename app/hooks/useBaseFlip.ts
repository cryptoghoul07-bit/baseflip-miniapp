import { useReadContract, useWriteContract, useWatchContractEvent, useAccount, usePublicClient } from 'wagmi';
import { useEffect, useState } from 'react';
import { parseEther, formatEther } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS as `0x${string}`;

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
    const { data: currentRound, refetch: refetchRound } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: BaseFlipABI,
        functionName: 'getCurrentRound',
    });

    // Read user's stake
    const { data: myStake, refetch: refetchStake } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: BaseFlipABI,
        functionName: 'getMyStake',
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
            setRoundData({
                roundId: currentRound[0] as bigint,
                levelId: currentRound[1] as bigint,
                poolA: currentRound[2] as bigint,
                poolB: currentRound[3] as bigint,
                targetSize: currentRound[4] as bigint,
                isStarted: currentRound[5] as boolean,
                isCompleted: currentRound[6] as boolean,
            });
        }
    }, [currentRound]);

    useEffect(() => {
        if (myStake) {
            setUserStake({
                amount: myStake[0] as bigint,
                group: myStake[1] as number,
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
            const [
                levelId,
                poolA,
                poolB,
                startTime,
                createdAt,
                isActive,
                isCompleted,
                isCancelled,
                winningGroup
            ] = prevRound as any;
            const [amount, group] = prevUserStake as any;

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
        if (prevRound && (prevRound as any).length > 8) {
            const data = prevRound as any;
            // Direct index access: 
            // 6: isCompleted
            // 8: winningGroup
            const isRoundCompleted = data[6];
            const roundWinningGroup = data[8];

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
        refetchRound,
        refetchStake,
        unclaimedRound,
        lastWinner, // Export this
    };
}
