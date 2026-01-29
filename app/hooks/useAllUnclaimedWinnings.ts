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
            const currentId = await publicClient.readContract({
                address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'currentRoundId'
            }) as bigint;

            const latestBlock = await publicClient.getBlockNumber();
            const stakeEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');

            // 1. Discovery Scan via Logs (Fast lookup)
            const chunkPromises = [0n, 1n, 2n, 3n, 4n, 5n, 6n].map(i => {
                const to = latestBlock - (i * 500000n);
                const from = to - 500000n > 0n ? to - 500000n : 0n;
                return publicClient.getLogs({
                    address: CONTRACT_ADDRESS,
                    event: stakeEvent as any,
                    args: { user: address },
                    fromBlock: from,
                    toBlock: to
                }).catch(() => []);
            });

            const rawLogs = await Promise.all(chunkPromises);
            const userLogs = rawLogs.flat() as any[];

            // 2. Identify Unique Rounds to Check
            const roundIdsToCheck = Array.from(new Set([
                ...userLogs.map(l => BigInt(l.args.roundId)),
                ...Array.from({ length: 30 }, (_, i) => currentId - BigInt(i)).filter(id => id > 0n)
            ])).sort((a, b) => Number(b - a));

            // 3. Batch Check Status and Stake
            const contracts: any[] = [];
            roundIdsToCheck.forEach(id => {
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [id] });
                contracts.push({ address: CONTRACT_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [id, address] });
            });

            const results = await publicClient.multicall({
                contracts: contracts as any,
                allowFailure: true
            });

            const allClaimable: ClaimableRound[] = [];

            for (let i = 0; i < roundIdsToCheck.length; i++) {
                const rId = roundIdsToCheck[i];
                const rRes: any = results[i * 2];
                const sRes: any = results[i * 2 + 1];

                if (rRes?.status === 'success' && sRes?.status === 'success' && rRes.result && sRes.result) {
                    const r = rRes.result;
                    const s = sRes.result;

                    const isCompleted = Array.isArray(r) ? r[6] : (r as any).isCompleted;
                    const winningGroup = Number(Array.isArray(r) ? r[8] : (r as any).winningGroup);
                    const stakedAmount = Array.isArray(s) ? s[0] : (s as any).amount;
                    const stakedGroup = Number(Array.isArray(s) ? s[1] : (s as any).group);

                    // A win is claimable if: Completed AND winningGroup matches AND amount > 0
                    if (isCompleted && stakedAmount > 0n && stakedGroup === winningGroup && winningGroup > 0) {
                        allClaimable.push({
                            roundId: rId,
                            amount: stakedAmount,
                            winningGroup,
                            userGroup: stakedGroup,
                            isCompleted
                        });
                    }
                }
            }

            setClaimableRounds(allClaimable);

        } catch (error) {
            console.error("Unclaimed Winnings Scan Error:", error);
        } finally {
            setIsScanning(false);
        }
    }, [address, publicClient]);

    useEffect(() => {
        scanForWinnings();
    }, [scanForWinnings]);

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
