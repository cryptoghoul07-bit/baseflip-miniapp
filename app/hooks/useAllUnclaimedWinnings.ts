import { useState, useEffect, useCallback } from 'react';
import { usePublicClient, useAccount, useWriteContract } from 'wagmi';
import { formatEther } from 'viem';
import BaseFlipABI from '../lib/BaseFlipABI.json';
import CashOutOrDieABI from '../lib/CashOutOrDieABI.json';

const BASEFLIP_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;
const CASHOUT_ADDRESS = (process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS || '0x6D89f694C6004Ab85abB9883eBdB21221D0AA340') as `0x${string}`;

export interface ClaimableRound {
    roundId: bigint;
    amount: bigint;
    winningGroup: number;
    userGroup: number;
    isCompleted: boolean;
    gameType: 'classic' | 'cashout';
}

export function useAllUnclaimedWinnings() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { writeContract: claimWrite, isPending: isClaiming } = useWriteContract();

    const [claimableRounds, setClaimableRounds] = useState<ClaimableRound[]>([]);
    const [isScanning, setIsScanning] = useState(false);

    const scanForWinnings = useCallback(async () => {
        if (!publicClient || !address) return;

        setIsScanning(true);
        try {
            const allClaimable: ClaimableRound[] = [];

            // 1. SCAN CLASSIC BASEFLIP
            if (BASEFLIP_ADDRESS) {
                const currentId = await publicClient.readContract({
                    address: BASEFLIP_ADDRESS, abi: BaseFlipABI, functionName: 'currentRoundId'
                }) as bigint;

                const latestBlock = await publicClient.getBlockNumber();
                const stakeEvent = BaseFlipABI.find(x => x.name === 'StakePlaced');

                const chunkPromises = [0n, 1n, 2n].map(i => {
                    const to = latestBlock - (i * 200000n);
                    const from = to - 200000n > 0n ? to - 200000n : 0n;
                    return publicClient.getLogs({
                        address: BASEFLIP_ADDRESS,
                        event: stakeEvent as any,
                        args: { user: address },
                        fromBlock: from,
                        toBlock: to
                    }).catch(() => []);
                });

                const rawLogs = await Promise.all(chunkPromises);
                const userLogs = rawLogs.flat() as any[];

                const classicIdsToCheck = Array.from(new Set([
                    ...userLogs.map(l => BigInt(l.args.roundId)),
                    ...Array.from({ length: 10 }, (_, i) => currentId - BigInt(i)).filter(id => id > 0n)
                ])).sort((a, b) => Number(b - a));

                const classicContracts: any[] = [];
                classicIdsToCheck.forEach(id => {
                    classicContracts.push({ address: BASEFLIP_ADDRESS, abi: BaseFlipABI, functionName: 'rounds', args: [id] });
                    classicContracts.push({ address: BASEFLIP_ADDRESS, abi: BaseFlipABI, functionName: 'userStakes', args: [id, address] });
                });

                const classicRes = await publicClient.multicall({
                    contracts: classicContracts as any,
                    allowFailure: true
                });

                for (let i = 0; i < classicIdsToCheck.length; i++) {
                    const rId = classicIdsToCheck[i];
                    const rRes: any = classicRes[i * 2];
                    const sRes: any = classicRes[i * 2 + 1];

                    if (rRes?.status === 'success' && sRes?.status === 'success' && rRes.result && sRes.result) {
                        const r = rRes.result;
                        const s = sRes.result;
                        const isCompleted = Array.isArray(r) ? r[6] : (r as any).isCompleted;
                        const winningGroup = Number(Array.isArray(r) ? r[8] : (r as any).winningGroup);
                        const stakedAmount = Array.isArray(s) ? s[0] : (s as any).amount;
                        const stakedGroup = Number(Array.isArray(s) ? s[1] : (s as any).group);

                        if (isCompleted && stakedAmount > 0n && stakedGroup === winningGroup && winningGroup > 0) {
                            allClaimable.push({
                                roundId: rId,
                                amount: stakedAmount,
                                winningGroup,
                                userGroup: stakedGroup,
                                isCompleted,
                                gameType: 'classic'
                            });
                        }
                    }
                }
            }

            // 2. SCAN CASHOUT OR DIE
            if (CASHOUT_ADDRESS && CASHOUT_ADDRESS !== '0x0') {
                const currentGid = await publicClient.readContract({
                    address: CASHOUT_ADDRESS, abi: CashOutOrDieABI, functionName: 'currentGameId'
                }) as bigint;

                // Check last 5 arena sessions
                const gidsToCheck = Array.from({ length: 5 }, (_, i) => currentGid - BigInt(i)).filter(id => id > 0n);
                const coContracts: any[] = [];
                gidsToCheck.forEach(gid => {
                    coContracts.push({ address: CASHOUT_ADDRESS, abi: CashOutOrDieABI, functionName: 'games', args: [gid] });
                    coContracts.push({ address: CASHOUT_ADDRESS, abi: CashOutOrDieABI, functionName: 'getPlayerStats', args: [gid, address] });
                });

                const coRes = await publicClient.multicall({
                    contracts: coContracts as any,
                    allowFailure: true
                });

                for (let i = 0; i < gidsToCheck.length; i++) {
                    const gid = gidsToCheck[i];
                    const gRes = coRes[i * 2];
                    const pRes = coRes[i * 2 + 1];

                    if (gRes?.status === 'success' && pRes?.status === 'success' && gRes.result && pRes.result) {
                        const g = gRes.result as any;
                        const p = pRes.result as any;

                        const isCompleted = g[5];
                        const claimValue = p[0];
                        const isAlive = p[2];
                        const hasCashedOut = p[3];

                        // Can claim if: Alive AND claimValue > 0 AND (Cashing out during game OR Winner of completed game)
                        // If it's a victory claim, game must be completed.
                        if (isAlive && !hasCashedOut && claimValue > 0n && isCompleted) {
                            allClaimable.push({
                                roundId: gid,
                                amount: claimValue,
                                winningGroup: 0,
                                userGroup: 0,
                                isCompleted: true,
                                gameType: 'cashout'
                            });
                        }
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
        const interval = setInterval(scanForWinnings, 15000);
        return () => clearInterval(interval);
    }, [scanForWinnings]);

    const claimRound = (roundId: bigint, gameType: 'classic' | 'cashout' = 'classic') => {
        if (gameType === 'cashout') {
            claimWrite({
                address: CASHOUT_ADDRESS,
                abi: CashOutOrDieABI,
                functionName: 'claimVictory',
                args: [roundId],
            });
        } else {
            claimWrite({
                address: BASEFLIP_ADDRESS,
                abi: BaseFlipABI,
                functionName: 'claimWinnings',
                args: [roundId],
            });
        }
    }

    return {
        claimableRounds,
        isScanning,
        scanForWinnings,
        claimRound,
        isClaiming
    };
}
