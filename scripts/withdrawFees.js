/**
 * Withdraw accumulated fees from BaseFlip contract
 * Usage: node scripts/withdrawFees.js
 */

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

if (!CONTRACT_ADDRESS || !PRIVATE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
}

const ABI = parseAbi([
    'function collectedFees() external view returns (uint256)',
    'function withdrawFees() external',
]);

const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
});

const account = privateKeyToAccount(`0x${PRIVATE_KEY.replace(/^0x/, '')}`);

const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC_URL),
});

async function withdrawFees() {
    try {
        console.log('💰 BaseFlip Fee Withdrawal');
        console.log('=====================================');
        console.log(`📍 Contract: ${CONTRACT_ADDRESS}`);
        console.log(`👤 Owner: ${account.address}\n`);

        // Check current fee balance
        const fees = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'collectedFees',
        });

        const feesInEth = Number(fees) / 1e18;

        console.log(`💵 Accumulated Fees: ${feesInEth} ETH\n`);

        if (fees === 0n) {
            console.log('ℹ️  No fees to withdraw yet.');
            process.exit(0);
        }

        console.log('🔄 Withdrawing fees...');

        const hash = await walletClient.writeContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'withdrawFees',
        });

        console.log(`✅ Transaction sent: ${hash}`);
        console.log(`⏳ Waiting for confirmation...\n`);

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
            console.log(`✅ Fees withdrawn successfully!`);
            console.log(`💰 ${feesInEth} ETH sent to ${account.address}`);
            console.log(`🔗 View on BaseScan: https://sepolia.basescan.org/tx/${hash}`);
        } else {
            console.error(`❌ Transaction failed`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

withdrawFees();
