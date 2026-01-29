/**
 * BaseFlip Automated Winner Selection Bot
 * 
 * This script monitors the BaseFlip contract for completed rounds
 * and automatically declares winners using secure randomness.
 * 
 * Usage: node scripts/autoWinner.js
 */

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { randomInt } from 'crypto';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config({ path: '.env.local' });

// Configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

if (!CONTRACT_ADDRESS || !PRIVATE_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS and PRIVATE_KEY must be set in .env.local');
    process.exit(1);
}

// Contract ABI (minimal subset for automation)
const ABI = parseAbi([
    'event RoundStarted(uint256 indexed roundId, uint256 poolA, uint256 poolB)',
    'event WinnerDeclared(uint256 indexed roundId, uint8 winningGroup)',
    'function declareWinner(uint256 roundId, uint8 winningGroup) external',
    'function rounds(uint256 roundId) external view returns (uint256 levelId, uint256 poolA, uint256 poolB, uint256 roundStartTime, uint256 createdAt, bool isActive, bool isCompleted, bool isCancelled, uint8 winningGroup)',
    'function currentRoundId() external view returns (uint256)',
    'function collectedFees() external view returns (uint256)',
    'function withdrawFees() external',
]);

// Initialize clients
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

// Store processed rounds to avoid duplicates
const processedRounds = new Set();

/**
 * Generate cryptographically secure random winner (1 or 2)
 */
function generateRandomWinner() {
    const random = randomInt(0, 2); // 0 or 1
    return random + 1; // 1 or 2 (Pool A or Pool B)
}

/**
 * Declare winner for a round
 */
async function declareWinner(roundId, winningGroup) {
    try {
        console.log(`\n🎲 Declaring winner for Round #${roundId}...`);
        console.log(`   Winner: Pool ${winningGroup === 1 ? 'A' : 'B'}`);

        const hash = await walletClient.writeContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'declareWinner',
            args: [BigInt(roundId), winningGroup],
        });

        console.log(`   ✅ Transaction sent: ${hash}`);
        console.log(`   ⏳ Waiting for confirmation...`);

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
            console.log(`   ✅ Winner declared successfully!`);
            console.log(`   🔗 View on BaseScan: https://sepolia.basescan.org/tx/${hash}`);
            processedRounds.add(roundId.toString());

            // Auto-withdraw fees removed to allow manual collection via Admin Panel
            // await autoWithdrawFees();

            return true;
        } else {
            console.error(`   ❌ Transaction failed`);
            return false;
        }
    } catch (error) {
        console.error(`   ❌ Error declaring winner:`, error.message);
        return false;
    }
}

/**
 * Automatically withdraw accumulated fees
 * (Disabled to allow manual collection)
 */
/*
async function autoWithdrawFees() {
    try {
        const fees = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'collectedFees',
        });

        if (fees === 0n) {
            console.log(`   💰 No fees to withdraw yet`);
            return;
        }

        const feesInEth = (Number(fees) / 1e18).toFixed(6);
        console.log(`\n💰 Auto-withdrawing ${feesInEth} ETH in fees...`);

        const hash = await walletClient.writeContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'withdrawFees',
        });

        console.log(`   ✅ Withdrawal sent: ${hash}`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
            console.log(`   ✅ ${feesInEth} ETH withdrawn to ${account.address}`);
            console.log(`   🔗 View on BaseScan: https://sepolia.basescan.org/tx/${hash}`);
        }
    } catch (error) {
        console.error(`   ⚠️  Fee withdrawal failed:`, error.message);
        // Don't stop the bot if fee withdrawal fails
    }
}
*/

/**
 * Check if round needs processing
 */
/**
 * Check if round needs processing
 * Returns object: { exists: boolean, isCompleted: boolean }
 */
async function checkRound(roundId) {
    if (processedRounds.has(roundId.toString())) {
        return { exists: true, isCompleted: true }; // Treat as completed for loop logic
    }

    try {
        const round = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'rounds',
            args: [BigInt(roundId)],
        });

        const [levelId, poolA, poolB, roundStartTime, createdAt, isActive, isCompleted, isCancelled, winningGroup] = round;

        // Check if round has started but not yet completed
        if (roundStartTime > 0n && !isCompleted && winningGroup === 0) {
            console.log(`\n📢 New round ready for winner declaration!`);
            console.log(`   Round ID: ${roundId}`);
            console.log(`   Pool A: ${poolA.toString()} wei`);
            console.log(`   Pool B: ${poolB.toString()} wei`);

            // Generate random winner
            const winner = generateRandomWinner();

            // Declare winner
            const success = await declareWinner(roundId, winner);
            if (success) {
                return { exists: true, isCompleted: true };
            }
        }

        return { exists: true, isCompleted: isCompleted };

    } catch (error) {
        console.error(`⚠️ Error checking Round ${roundId}:`, error.message);
        // Assume error means round doesn't exist (revert) or network issue
        // strict check usually involves checking error string, but for now we assume non-existent if read fails
        return { exists: false, isCompleted: false };
    }
}

/**
 * Main monitoring loop with polling (fixes RPC filter issues)
 */
async function startMonitoring() {
    console.log('🤖 BaseFlip Auto-Winner Bot Started');
    console.log('=====================================');
    console.log(`📍 Contract: ${CONTRACT_ADDRESS}`);
    console.log(`🔗 Network: Base Sepolia`);
    console.log(`👤 Bot Address: ${account.address}`);
    console.log('=====================================\n');

    let processingStartRound = 1n;

    // Get current round to ensure connection
    try {
        await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'rounds',
            args: [1n],
        });
        console.log('✅ Connected to contract successfully\n');
    } catch (error) {
        console.log('⚠️  Could not read Round 1 (might not exist yet). Starting fresh.\n');
    }

    console.log('👀 Polling for completed rounds every 10 seconds...\n');
    console.log('Press Ctrl+C to stop\n');

    // Polling loop
    // Polling loop
    const pollInterval = setInterval(async () => {
        try {
            // Smart Polling: Get the actual current round ID from contract
            const currentRoundId = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: ABI,
                functionName: 'currentRoundId',
            });

            const roundId = Number(currentRoundId);
            console.log(`   🔍 Current Round on Chain: ${roundId}`);

            // Check current round (might be active)
            await checkRound(roundId);

            // Check previous round (might be just finished but not winner declared if logic lagging)
            if (roundId > 1) {
                await checkRound(roundId - 1);
            }

        } catch (error) {
            console.error('Error during polling:', error.message);
        }
    }, 10000); // Check every 10 seconds

    // Keep process running
    process.on('SIGINT', () => {
        console.log('\n\n👋 Shutting down bot...');
        clearInterval(pollInterval);
        process.exit(0);
    });
}

// Start HTTP server for Render/Health Checks
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('BaseFlip Bot is running 🤖');
});

// Helper to keep Render service awake (self-ping if URL provided)
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`\n🌐 Web server listening on port ${PORT}`);

    // Start the bot logic after server is up
    startMonitoring().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
});
