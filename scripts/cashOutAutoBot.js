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
const MIN_PLAYERS = 2; // Minimum players to start a game
const LOBBY_COUNTDOWN = 30000; // 30s lobby for recruitment
const MIN_ROUND_TIME = 30000; // Minimum 30s per round for suspense/decisions
const SUBMISSION_TIMEOUT = 120000; // 2 minutes max to wait for everyone
const SUSPENSE_DELAY = 10000; // 10s extra wait after everyone submits

if (!CONTRACT_ADDRESS || !PRIVATE_KEY) {
    console.error('❌ Missing required environment variables');
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
const lobbyTimers = new Map(); // gameId -> startTime

/**
 * Generate secure random winner
 */
function generateRandomWinner() {
    return randomInt(0, 2) + 1;
}

/**
 * Get game state helper
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
            gameId: BigInt(gameId),
            entryFee: game[0],
            totalPool: game[1],
            currentRound: game[2],
            startTime: game[3],
            isAcceptingPlayers: game[4],
            isCompleted: game[5],
            activePlayerCount: game[6],
            playerList: players
        };
    } catch (error) {
        return null;
    }
}

/**
 * Create a new game
 */
async function createNewGame() {
    console.log(`\n🏗️  Creating new Arena Game (0.01 ETH)...`);
    try {
        const hash = await walletClient.writeContract({
            address: CONTRACT_ADDRESS,
            abi: CashOutOrDieABI,
            functionName: 'createGame',
            args: [BigInt(10000000000000000n)], // 0.01 ETH
        });
        console.log(`   Tx: ${hash.slice(0, 10)}...`);
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`✅ New game created!`);
    } catch (error) {
        console.error(`❌ Failed to create game:`, error.message);
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
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === 'success') {
            console.log(`✅ Game #${gameId} started!`);
            activeGames.set(gameId.toString(), { lastRound: 0n, roundStartTime: 0 });
            return true;
        }
    } catch (error) {
        console.error(`❌ Error starting game:`, error.message);
    }
    return false;
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

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === 'success') {
            console.log(`✅ Round #${round} complete!`);
            return true;
        }
    } catch (error) {
        console.error(`❌ Error declaring winner:`, error.message);
    }
    return false;
}

/**
 * Process a specific game
 */
async function manageGame(gameId) {
    const state = await getGameState(gameId);
    if (!state) return;

    const gid = state.gameId.toString();

    // 🏆 Game Completed
    if (state.isCompleted) {
        if (!activeGames.get(gid)?.loggedComplete) {
            console.log(`\n🏁 Game #${gid} is FINISHED.`);
            activeGames.set(gid, { loggedComplete: true });
        }
        return;
    }

    // 🚪 Lobby Phase
    if (state.isAcceptingPlayers) {
        const playerCount = state.playerList.length;

        if (playerCount >= MIN_PLAYERS) {
            if (!lobbyTimers.has(gid)) {
                console.log(`\n🔔 Game #${gid} reachable! Waiting 30s recruitment window...`);
                lobbyTimers.set(gid, Date.now());
            }

            const elapsed = Date.now() - lobbyTimers.get(gid);
            if (elapsed >= LOBBY_COUNTDOWN) {
                await startGame(state.gameId);
                lobbyTimers.delete(gid);
            } else {
                const rem = Math.ceil((LOBBY_COUNTDOWN - elapsed) / 1000);
                process.stdout.write(`\r⏳ Game #${gid} starts in ${rem}s... (${playerCount} players)   `);
            }
        } else {
            lobbyTimers.delete(gid);
        }
        return;
    }

    // ⚔️ Active Round Phase
    if (!state.isAcceptingPlayers && !state.isCompleted) {
        let gameTracker = activeGames.get(gid) || { lastRound: 0n, roundStartTime: 0 };

        if (state.currentRound > gameTracker.lastRound) {
            // New round initialized!
            if (gameTracker.roundStartTime === 0) {
                console.log(`\n⚔️ Round #${state.currentRound} began for Game #${gid}.`);
                gameTracker.roundStartTime = Date.now();
                activeGames.set(gid, gameTracker);
            }

            // Check alive players and their submissions
            let aliveCount = 0;
            let submittedCount = 0;

            for (const addr of state.playerList) {
                const p = await publicClient.readContract({
                    address: CONTRACT_ADDRESS,
                    abi: CashOutOrDieABI,
                    functionName: 'getPlayerStats',
                    args: [state.gameId, addr],
                });
                if (p[2] && !p[3]) { // isAlive && !hasCashedOut
                    aliveCount++;
                    if (p[1] !== 0) submittedCount++; // choice submitted
                }
            }

            const elapsed = Date.now() - gameTracker.roundStartTime;
            const allSubmitted = submittedCount >= aliveCount && aliveCount > 0;
            const timedOut = elapsed >= SUBMISSION_TIMEOUT;
            const metMinTime = elapsed >= MIN_ROUND_TIME;

            // Log status
            if (Date.now() % 10000 < 500) {
                console.log(`\r   Game #${gid} R${state.currentRound}: ${submittedCount}/${aliveCount} submitted (${Math.floor(elapsed / 1000)}s)   `);
            }

            // DECISION
            let shouldExecute = false;

            if (allSubmitted && metMinTime) {
                console.log(`\n✨ All players submitted for Game #${gid} R${state.currentRound}.`);
                console.log(`   Waiting 10s suspense delay...`);
                await new Promise(r => setTimeout(r, SUSPENSE_DELAY));
                shouldExecute = true;
            } else if (timedOut) {
                console.log(`\n⏰ Timeout reached for Game #${gid} R${state.currentRound}. Proceeding...`);
                shouldExecute = true;
            }

            if (shouldExecute) {
                const winnerGroup = generateRandomWinner();
                const success = await declareRoundWinner(state.gameId, state.currentRound, winnerGroup);
                if (success) {
                    gameTracker.lastRound = state.currentRound;
                    gameTracker.roundStartTime = 0;
                    activeGames.set(gid, gameTracker);
                }
            }
        }
    }
}

/**
 * Main Loop
 */
async function monitorGames() {
    try {
        const currentGameId = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CashOutOrDieABI,
            functionName: 'currentGameId',
        });

        // Check for needing a new game
        let needsNew = true;
        for (let i = 1n; i <= currentGameId; i++) {
            const state = await getGameState(i);
            if (state && (state.isAcceptingPlayers || (!state.isCompleted && state.activePlayerCount > 0))) {
                needsNew = false;
                break;
            }
        }

        if (needsNew) {
            await createNewGame();
        }

        // Manage all games
        for (let i = 1n; i <= currentGameId; i++) {
            await manageGame(i);
        }

    } catch (error) {
        console.error('❌ Loop error:', error.message);
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
