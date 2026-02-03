"use client";

import React, { useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from 'wagmi';
import { formatEther, parseAbi } from 'viem';
import styles from './styles/AdminPanel.module.css';
import AutoWinnerControl from './AutoWinnerControl';
import CashOutOrDieAdmin from './CashOutOrDieAdmin';
import { useEthPrice } from '../hooks/useEthPrice';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS || '0x999Dc642ed4223631A86a5d2e84fE302906eDA76') as `0x${string}`;
const ABI = parseAbi([
    'function owner() view returns (address)',
    'function collectedFees() view returns (uint256)',
    'function withdrawFees() external'
]);

const CASHOUT_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS || '0x7134eaE427260946898E6B1cFeA5036415c97AEd') as `0x${string}`;

export default function AdminPanel() {
    const { address } = useAccount();
    const { data: hash, writeContract, isPending } = useWriteContract();
    const [isMinimized, setIsMinimized] = React.useState(false);

    // ETH Price Hook
    const { convertEthToUsd } = useEthPrice();

    // Read owner
    const { data: ownerAddress, isLoading: isLoadingOwner } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'owner',
    });

    // Read accumulated fees (BaseFlip)
    const { data: fees, refetch: refetchFees } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'collectedFees',
    });

    // Read accumulated fees (CashOut)
    const { data: cashOutFees, refetch: refetchCashOutFees } = useReadContract({
        address: CASHOUT_CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'collectedFees',
    });

    // Watch for new fees (when winner declared)
    useWatchContractEvent({
        address: CONTRACT_ADDRESS,
        abi: parseAbi(['event WinnerDeclared(uint256 indexed roundId, uint8 winningGroup)']),
        eventName: 'WinnerDeclared',
        onLogs() {
            console.log('Winner declared! Refreshing fees...');
            refetchFees();
        },
    });

    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
        hash,
    });

    // Refetch fees when withdrawal succeeds
    useEffect(() => {
        if (isSuccess) {
            refetchFees();
            refetchCashOutFees();
        }
    }, [isSuccess, refetchFees, refetchCashOutFees]);

    // Debugging Owner Check
    useEffect(() => {
        if (address && ownerAddress) {
            console.log('[AdminPanel] Connected User:', address);
            console.log('[AdminPanel] Contract Owner:', ownerAddress);
            console.log('[AdminPanel] Match?', address.toLowerCase() === ownerAddress.toLowerCase());
        }
    }, [address, ownerAddress]);

    // Don't render while loading owner
    if (isLoadingOwner) {
        // Optional: Show a tiny indicator for debugging
        return <div style={{ position: 'fixed', bottom: 10, right: 10, fontSize: '0.7rem', opacity: 0.5 }}>Checking permissions...</div>;
    }

    // Only show if connected user is owner
    if (!address || !ownerAddress || address.toLowerCase() !== ownerAddress.toLowerCase()) {
        console.warn('[AdminPanel] Access Denied. User:', address, 'Owner:', ownerAddress);
        return null; // Return null to hide completely if not owner
    }

    const feesEth = fees ? formatEther(fees) : '0';
    const hasFees = fees && fees > 0n;

    const handleWithdraw = () => {
        writeContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'withdrawFees',
        });
    };

    const handleWithdrawCashOut = () => {
        writeContract({
            address: CASHOUT_CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'withdrawFees',
        });
    };

    if (isMinimized) {
        return (
            <button
                className={styles.minimizeButton}
                onClick={() => setIsMinimized(false)}
            >
                👑
            </button>
        );
    }

    return (
        <div className={styles.adminPanel}>
            <div className={styles.header}>
                <h3>
                    👑 Admin Controls
                    <button
                        className={styles.closeButton}
                        onClick={() => setIsMinimized(true)}
                    >
                        _
                    </button>
                </h3>
            </div>

            <div className={styles.stats}>
                <div className={styles.statLabel}>Flip (Classic) Fees:</div>
                <div className={styles.statValue}>
                    {parseFloat(feesEth).toFixed(6)} ETH
                    <div style={{ fontSize: '0.8rem', color: '#00D4FF', marginTop: '2px', fontWeight: 'normal' }}>
                        ≈ {convertEthToUsd(feesEth)}
                    </div>
                </div>
            </div>

            <button
                className={styles.withdrawButton}
                onClick={handleWithdraw}
                disabled={!hasFees || isPending || isConfirming}
                style={{ marginBottom: '20px' }}
            >
                {isPending || isConfirming ? 'Extracting...' : '💸 Withdraw Classic Fees'}
            </button>

            <div className={styles.stats}>
                <div className={styles.statLabel}>Arena (CashOut) Fees:</div>
                <div className={styles.statValue}>
                    {(parseFloat(cashOutFees ? formatEther(cashOutFees) : '0')).toFixed(6)} ETH
                    <div style={{ fontSize: '0.8rem', color: '#00D4FF', marginTop: '2px', fontWeight: 'normal' }}>
                        ≈ {convertEthToUsd(cashOutFees ? formatEther(cashOutFees) : '0')}
                    </div>
                </div>
            </div>

            <button
                className={styles.withdrawButton}
                onClick={handleWithdrawCashOut}
                disabled={!(cashOutFees && cashOutFees > 0n) || isPending || isConfirming}
            >
                {isPending || isConfirming ? 'Extracting...' : '💀 Withdraw Arena Fees'}
            </button>

            {isSuccess && (
                <div className={styles.success}>
                    ✅ Fees withdrawn successfully!
                </div>
            )}

            {hash && <div className={styles.txHash}>Tx: {hash.slice(0, 8)}...{hash.slice(-6)}</div>}

            <AutoWinnerControl />

            <CashOutOrDieAdmin />
        </div>
    );
}
