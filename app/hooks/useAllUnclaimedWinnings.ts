
import { useState, useEffect, useCallback } from 'react';
import { usePublicClient, useAccount, useWriteContract } from 'wagmi';
import { formatEther } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;

export interface ClaimableRound {
    roundId: bigint;
    amount: bigint;
    winningGroup: number;
    userGroup: number;
    isCompleted: boolean;
}

export function useAllUnclaimedWinnings() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { writeContract: claimWrite, isPending: isClaiming } = useWriteContract();

    const [claimableRounds, setClaimableRounds] = useState<ClaimableRound[]>([]);
    const [isScanning, setIsScanning] = useState(false);

    const scanForWinnings = useCallback(async () => {
        if (!publicClient || !address || !CONTRACT_ADDRESS) return;

        setIsScanning(true);
        try {
            // 1. Get current round ID to know where to start scanning backwards from
            const currentId = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'currentRoundId',
            }) as bigint;

            const id = Number(currentId);
            // Scan last 50 rounds (practical limit for MVP without subgraph)
            const scanDepth = 50;
            const startId = Math.max(1, id - scanDepth);

            const checks = [];

            // We need to check: 
            // 1. Did the user stake? (userStakes[roundId][user])
            // 2. Is the round completed? (rounds[roundId])
            // 3. Did they win?
            // 4. Have they NOT claimed yet? (stake.amount > 0)

            // We can batch these reads using multicall if available, or parallel promises
            for (let i = startId; i < id; i++) { // Strictly less than currentId (current is playing)
                const roundId = BigInt(i);

                checks.push(
                    Promise.all([
                        publicClient.readContract({
                            address: CONTRACT_ADDRESS,
                            abi: BaseFlipABI,
                            functionName: 'rounds',
                            args: [roundId]
                        }),
                        publicClient.readContract({
                            address: CONTRACT_ADDRESS,
                            abi: BaseFlipABI,
                            functionName: 'userStakes',
                            args: [roundId, address]
                        })
                    ]).then(([roundData, userStake]) => ({ roundId, roundData, userStake }))
                );
            }

            const results = await Promise.all(checks);
            const found: ClaimableRound[] = [];

            results.forEach(({ roundId, roundData, userStake }) => {
                const r: any = roundData;
                const s: any = userStake;

                // Parse Round Data
                const isCompleted = Array.isArray(r) ? r[6] : r.isCompleted;
                const winningGroup = Number(Array.isArray(r) ? r[8] : r.winningGroup);

                // Parse Stake Data
                const stakedAmount = Array.isArray(s) ? s[0] : s.amount;
                const stakedGroup = Array.isArray(s) ? s[1] : s.group;

                // CONDITION: Round Completed AND User Staked > 0 AND User Picked Winner
                // If they claimed, stakedAmount would be 0.
                if (isCompleted && stakedAmount > 0n && stakedGroup === winningGroup) {
                    found.push({
                        roundId,
                        amount: stakedAmount,
                        winningGroup,
                        userGroup: stakedGroup,
                        isCompleted
                    });
                }
            });

            console.log("Unclaimed winnings scan complete. Found:", found.length);
            setClaimableRounds(found);

        } catch (error) {
            console.error("Error scanning for winnings:", error);
        } finally {
            setIsScanning(false);
        }
    }, [address, publicClient]);

    // Scan on load and when address changes
    useEffect(() => {
        scanForWinnings();
    }, [scanForWinnings]);

    const claimAll = async (roundIds: bigint[]) => {
        // Contract doesn't support batch claim, so we loop or pick one.
        // For simpler UX, we'll claim the first one or let user pick.
        // Here we expose the raw write for the UI to handle individual claims.
    };

    const claimRound = (roundId: bigint) => {
        claimWrite({
            address: CONTRACT_ADDRESS,
            abi: BaseFlipABI,
            functionName: 'claimWinnings',
            args: [roundId],
        });
    }

    return {
        claimableRounds,
        isScanning,
        scanForWinnings,
        claimRound,
        isClaiming
    };
}
