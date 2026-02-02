/**
 * Cash-Out or Die Automated Game Bot
 * 
 * This script monitors the CashOutOrDie contract and automatically:
 * - Starts games when players are ready
 * - Declares round winners using secure randomness
 * - Manages game flow until completion
 * 
 * Usage: node scripts/cashOutAutoBot.js
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { randomInt } from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import CashOutOrDieABI from '../app/lib/CashOutOrDieABI.json' assert { type: 'json' };

dotenv.config({ path: '.env.local' });

// Configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

// Game settings
const MIN_PLAYERS = 3; // Minimum players to start a game
const ROUND_DELAY = 15000; // 15 seconds between rounds for suspense

if (!CONTRACT_ADDRESS || !PRIVATE_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS and PRIVATE_KEY must be set in .env.local');
    process.exit(1);
}

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

// Track active games and their states
const activeGames = new Map();

/**
 * Generate cryptographically secure random winner (1 or 2)
 */
function generateRandomWinner() {
    const random = randomInt(0, 2); // 0 or 1
    return random + 1; // 1 or 2 (Group A or Group B)
}

/**
 * Get game state
 */
async function getGameState(gameId) {
    try {
        const game = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CashOutOrDieABI,
            functionName: 'games',
            args: [gameId],
        });

        const players = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CashOutOrDieABI,
            functionName: 'getGamePlayers',
            args: [gameId],
        });

        return {
            entryFee: game[0],
            totalPool: game[1],
            currentRound: game[2],
            startTime: game[3],
            isAcceptingPlayers: game[4],
            isCompleted: game[5],
            activePlayerCount: game[6],
            playerCount: players.length,
        };
    } catch (error) {
        console.error(`❌ Error fetching game ${gameId} state:`, error.message);
        return null;
    }
}

/**
 * Start a game
 */
async function startGame(gameId) {
    try {
        console.log(`\n🎮 Starting Game #${gameId}...`);

        const hash = await walletClient.writeContract({
            address: CONTRACT_ADDRESS,
            abi: CashOutOrDieABI,
            functionName: 'startGame',
            args: [gameId],
        });

        console.log(`   Tx: ${hash.slice(0, 10)}...${hash.slice(-8)}`);

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
            console.log(`✅ Game #${gameId} started!`);
            activeGames.set(gameId.toString(), { lastRound: 0n });
            return true;
        } else {
            console.log(`❌ Failed to start game #${gameId}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Error starting game ${gameId}:`, error.message);
        return false;
    }
}

/**
 * Declare round winner
 */
async function declareRoundWinner(gameId, round, winningGroup) {
    try {
        console.log(`\n🎲 Declaring Round #${round} winner for Game #${gameId}...`);
        console.log(`   Winner: Group ${winningGroup === 1 ? 'A' : 'B'}`);

        const hash = await walletClient.writeContract({
            address: CONTRACT_ADDRESS,
            abi: CashOutOrDieABI,
            functionName: 'declareRoundWinner',
            args: [gameId, winningGroup],
        });

        console.log(`   Tx: ${hash.slice(0, 10)}...${hash.slice(-8)}`);

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
            console.log(`✅ Round #${round} winner declared!`);
            return true;
        } else {
            console.log(`❌ Failed to declare winner for round #${round}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Error declaring winner:`, error.message);
        return false;
    }
}

/**
 * Monitor and manage a game
 */
async function manageGame(gameId) {
    const state = await getGameState(gameId);

    if (!state) return;

    // If game is completed, remove from active tracking
    if (state.isCompleted) {
        console.log(`🏁 Game #${gameId} completed!`);
        activeGames.delete(gameId.toString());
        return;
    }

    // If accepting players and we have enough, start the game
    if (state.isAcceptingPlayers && state.playerCount >= MIN_PLAYERS) {
        console.log(`\n📢 Game #${gameId} has ${state.playerCount} players - starting...`);
        await startGame(gameId);
        return;
    }

    // If game is active (not accepting players, not completed)
    if (!state.isAcceptingPlayers && !state.isCompleted) {
        const gameTracker = activeGames.get(gameId.toString()) || { lastRound: 0n };

        // If we haven't processed this round yet
        if (state.currentRound > gameTracker.lastRound) {
            console.log(`\n⏳ Waiting ${ROUND_DELAY / 1000}s before declaring Round #${state.currentRound} winner...`);

            // Wait for suspense
            await new Promise(resolve => setTimeout(resolve, ROUND_DELAY));

            // Generate random winner
            const winner = generateRandomWinner();

            // Declare winner
            const success = await declareRoundWinner(gameId, state.currentRound, winner);

            if (success) {
                gameTracker.lastRound = state.currentRound;
                activeGames.set(gameId.toString(), gameTracker);
            }
        }
    }
}

/**
 * Main monitoring loop
 */
async function monitorGames() {
    try {
        // Get current game ID
        const currentGameId = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CashOutOrDieABI,
            functionName: 'currentGameId',
        });

        console.log(`\n🔍 Monitoring games up to Game #${currentGameId}...`);

        // Check all games from 1 to current
        for (let i = 1n; i <= currentGameId; i++) {
            await manageGame(i);
        }

    } catch (error) {
        console.error('❌ Error in monitoring loop:', error.message);
    }
}

/**
 * Health check endpoint for Render
 */
const app = express();
const PORT = process.env.PORT || 3001;

app.get('/', (req, res) => {
    res.json({
        status: 'running',
        service: 'CashOutOrDie Auto-Bot',
        contract: CONTRACT_ADDRESS,
        activeGames: Array.from(activeGames.keys()),
        uptime: process.uptime(),
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`\n🌐 Health check server running on port ${PORT}`);
    console.log(`   Visit http://localhost:${PORT} for status\n`);
});

/**
 * Start the bot
 */
console.log('╔════════════════════════════════════════════════════════╗');
console.log('║     Cash-Out or Die Automated Game Bot Started        ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log(`\n📍 Contract: ${CONTRACT_ADDRESS}`);
console.log(`🔑 Bot Address: ${account.address}`);
console.log(`🌐 Network: Base Sepolia`);
console.log(`⚙️  Settings:`);
console.log(`   - Min Players: ${MIN_PLAYERS}`);
console.log(`   - Round Delay: ${ROUND_DELAY / 1000}s`);
console.log(`\n🤖 Bot is now monitoring for games...\n`);

// Run every 10 seconds
setInterval(monitorGames, 10000);

// Run immediately on start
monitorGames();
