
import { useState, useEffect, useCallback } from 'react';
import { usePublicClient, useAccount, useWriteContract } from 'wagmi';
import { formatEther, parseAbiItem } from 'viem';
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
            const currentBlock = await publicClient.getBlockNumber();
            const fromBlock = currentBlock - 5000000n; // ~4 months

            // 1. Find all rounds the user ever participated in using logs
            // Fetching all and filtering locally for maximum reliability
            const stakePlacedEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');
            const allLogs = await publicClient.getLogs({
                address: CONTRACT_ADDRESS,
                event: stakePlacedEvent as any,
                fromBlock: fromBlock > 0n ? fromBlock : 0n,
                toBlock: 'latest'
            }) as any[];

            // Filter locally by user address
            const userLogs = allLogs.filter(log =>
                log.args.user?.toLowerCase() === address.toLowerCase()
            );

            if (userLogs.length === 0) {
                setClaimableRounds([]);
                return;
            }

            // 2. Get unique round IDs to check
            const roundIds = Array.from(new Set(userLogs.map(l => l.args.roundId)));

            // 3. Batched Multicall check: status of round and current stake mapping
            const BATCH_SIZE = 20;
            const allClaimable: ClaimableRound[] = [];

            for (let i = 0; i < roundIds.length; i += BATCH_SIZE) {
                const batch = roundIds.slice(i, i + BATCH_SIZE) as bigint[];
                const contracts: any[] = [];

                batch.forEach(id => {
                    contracts.push({
                        address: CONTRACT_ADDRESS,
                        abi: BaseFlipABI,
                        functionName: 'rounds',
                        args: [id]
                    });
                    contracts.push({
                        address: CONTRACT_ADDRESS,
                        abi: BaseFlipABI,
                        functionName: 'userStakes',
                        args: [id, address]
                    });
                });

                const results = await publicClient.multicall({
                    contracts,
                    allowFailure: true
                });

                for (let j = 0; j < results.length; j += 2) {
                    const rRes = results[j];
                    const sRes = results[j + 1];
                    const roundId = batch[j / 2];

                    if (rRes.status === 'success' && sRes.status === 'success') {
                        const r: any = rRes.result;
                        const s: any = sRes.result;

                        const isCompleted = Array.isArray(r) ? r[6] : r.isCompleted;
                        const winningGroup = Number(Array.isArray(r) ? r[8] : r.winningGroup);
                        const stakedAmount = Array.isArray(s) ? s[0] : s.amount;
                        const stakedGroup = Array.isArray(s) ? s[1] : s.group;

                        // Unclaimed if: Completed AND winningGroup matched AND amount > 0
                        if (isCompleted && stakedAmount > 0n && stakedGroup === winningGroup) {
                            allClaimable.push({
                                roundId,
                                amount: stakedAmount,
                                winningGroup,
                                userGroup: stakedGroup,
                                isCompleted
                            });
                        }
                    }
                }
            }

            setClaimableRounds(allClaimable);

        } catch (error) {
            console.error("Error scanning for unclaimed winnings:", error);
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
