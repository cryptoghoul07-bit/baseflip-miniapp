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
import CashOutOrDieABI from '../app/lib/CashOutOrDieABI.json' with { type: 'json' };

dotenv.config({ path: '.env.local' });

// Configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

// Game settings
const MIN_PLAYERS = 2; // Minimum players to start a game (match contract)
const ROUND_DELAY = 45000; // 45 seconds between rounds for suspense and submission time
const GRACE_PERIOD = 30000; // 30 seconds extra grace if players haven't submitted

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

const lobbyTimers = new Map(); // gameId -> startTime

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
        lobbyTimers.delete(gameId.toString());
        return;
    }

    // LOBBY PHASE: If accepting players and we have at least 2 players
    if (state.isAcceptingPlayers && state.playerCount >= MIN_PLAYERS) {
        if (!lobbyTimers.has(gameId.toString())) {
            console.log(`\n🔔 Game #${gameId} lobby reached 2 players! Starting 30s countdown...`);
            lobbyTimers.set(gameId.toString(), Date.now());
        }

        const startTime = lobbyTimers.get(gameId.toString());
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, Math.ceil(30 - elapsed));

        process.stdout.write(`\r⏳ Lobby #${gameId}: ${remaining}s remaining... (${state.playerCount} players)   `);

        if (elapsed >= 30) {
            console.log(`\n📢 Lobby countdown finished for Game #${gameId}. Starting now!`);
            await startGame(gameId);
            lobbyTimers.delete(gameId.toString());
        }
        return;
    } else if (state.isAcceptingPlayers) {
        // Reset timer if player count falls below 2 (e.g. if someone could leave, though contract might not allow)
        lobbyTimers.delete(gameId.toString());
    }

    // If game is active (not accepting players, not completed)
    if (!state.isAcceptingPlayers && !state.isCompleted) {
        const gameTracker = activeGames.get(gameId.toString()) || { lastRound: 0n, roundStartTime: 0 };

        // If we haven't processed this round yet
        if (state.currentRound > gameTracker.lastRound) {
            // New round detected, track start time
            if (gameTracker.roundStartTime === 0) {
                gameTracker.roundStartTime = Date.now();
                activeGames.set(gameId.toString(), gameTracker);
            }

            // Fetch player details to check submissions
            const playerList = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: CashOutOrDieABI,
                functionName: 'getGamePlayers',
                args: [gameId],
            });

            let alivePlayers = 0;
            let submittedPlayers = 0;

            for (const playerAddr of playerList) {
                const stats = await publicClient.readContract({
                    address: CONTRACT_ADDRESS,
                    abi: CashOutOrDieABI,
                    functionName: 'getPlayerStats',
                    args: [gameId, playerAddr],
                });

                // stats: claimValue, currentChoice, isAlive, hasCashedOut, roundsWon
                if (stats[2] && !stats[3]) { // isAlive && !hasCashedOut
                    alivePlayers++;
                    if (stats[1] !== 0) { // currentChoice != 0
                        submittedPlayers++;
                    }
                }
            }

            const elapsed = Date.now() - gameTracker.roundStartTime;
            const allSubmitted = submittedPlayers >= alivePlayers && alivePlayers > 0;

            // LOGGING
            if (elapsed % 10000 < 2000) { // Log every ~10s
                console.log(`\r⏳ Round #${state.currentRound}: ${submittedPlayers}/${alivePlayers} submitted. Elapsed: ${Math.floor(elapsed / 1000)}s   `);
            }

            // DECISION: Process winner if...
            // 1. Everyone has submitted
            // 2. OR elapsed >= ROUND_DELAY + GRACE_PERIOD (Time's up)
            // 3. OR elapsed >= ROUND_DELAY AND at least one person has submitted (avoiding total freeze)

            let shouldProcess = false;
            if (allSubmitted) {
                console.log(`\n✨ All players submitted for Round #${state.currentRound}! Processing...`);
                shouldProcess = true;
            } else if (elapsed >= (ROUND_DELAY + GRACE_PERIOD)) {
                console.log(`\n⏰ Timeout reached for Round #${state.currentRound}. Processing survivors...`);
                shouldProcess = true;
            }

            if (shouldProcess) {
                // Generate random winner
                const winner = generateRandomWinner();

                // Declare winner
                const success = await declareRoundWinner(gameId, state.currentRound, winner);

                if (success) {
                    gameTracker.lastRound = state.currentRound;
                    gameTracker.roundStartTime = 0; // Reset for next round
                    activeGames.set(gameId.toString(), gameTracker);
                }
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
