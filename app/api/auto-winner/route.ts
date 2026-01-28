import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import BaseFlipABI from '@/app/lib/BaseFlipABI.json';

// Track bot state
let isRunning = false;
let pollingInterval: NodeJS.Timeout | null = null;
let lastCheckedRound = 0;

/**
 * Auto-Winner Bot API (Polling-based - More Reliable)
 * GET /api/auto-winner?action=start - Start the bot
 * GET /api/auto-winner?action=stop - Stop the bot
 * GET /api/auto-winner?action=status - Get bot status
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'status';

    try {
        if (action === 'start') {
            if (isRunning) {
                return NextResponse.json({ success: false, message: 'Bot already running' });
            }

            await startBot();
            return NextResponse.json({ success: true, message: 'Auto-winner bot started' });
        }

        if (action === 'stop') {
            if (!isRunning) {
                return NextResponse.json({ success: false, message: 'Bot not running' });
            }

            stopBot();
            return NextResponse.json({ success: true, message: 'Auto-winner bot stopped' });
        }

        if (action === 'status') {
            return NextResponse.json({
                success: true,
                running: isRunning,
                contractAddress: process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS
            });
        }

        return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('Auto-winner API error:', error);
        return NextResponse.json({
            success: false,
            message: error.message || 'Unknown error'
        }, { status: 500 });
    }
}

async function startBot() {
    const privateKey = process.env.PRIVATE_KEY;
    const contractAddress = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS;
    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

    if (!privateKey) {
        throw new Error('PRIVATE_KEY not found in environment');
    }

    if (!contractAddress) {
        throw new Error('Contract address not found');
    }

    console.log('🤖 Starting Auto-Winner Bot (Polling Mode)...');
    console.log(`📍 Contract: ${contractAddress}`);
    console.log(`🔗 RPC: ${rpcUrl}`);

    // Use HTTP provider (more reliable than WebSocket)
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, BaseFlipABI, wallet);

    isRunning = true;
    console.log('✅ Auto-Winner Bot is now running!');
    console.log('📊 Polling every 10 seconds for started rounds...\n');

    // Poll every 10 seconds
    pollingInterval = setInterval(async () => {
        try {
            // Get current round
            const currentRound = await contract.getCurrentRound();
            const roundId = Number(currentRound[0]);
            const roundStarted = currentRound[5]; // isStarted (index 5)
            const isCompleted = currentRound[6]; // isCompleted (index 6)

            // If this is a new round that just started
            if (roundStarted && !isCompleted && roundId > lastCheckedRound) {
                lastCheckedRound = roundId;

                console.log('\n🎲 Round Started Detected!');
                console.log(`   Round ID: ${roundId}`);

                // Random winner selection (50/50)
                const winningGroup = Math.random() < 0.5 ? 1 : 2;
                const winnerName = winningGroup === 1 ? 'Pool A' : 'Pool B';

                console.log(`   🎯 Selected Winner: ${winnerName} (Group ${winningGroup})`);
                console.log(`   ⏳ Declaring winner...`);

                // Declare winner
                const tx = await contract.declareWinner(roundId, winningGroup);
                console.log(`   📝 Transaction sent: ${tx.hash}`);

                await tx.wait();
                console.log(`   ✅ Winner declared successfully!`);
                console.log(`   🎊 ${winnerName} wins Round ${roundId}!\n`);
            }
        } catch (error: any) {
            // Only log if it's not a "already completed" or "not started" error
            if (!error.message.includes('already')) {
                console.error('⚠️  Bot check error:', error.message);
            }
        }
    }, 10000); // Check every 10 seconds
}

function stopBot() {
    console.log('🛑 Stopping Auto-Winner Bot...');

    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }

    isRunning = false;
    lastCheckedRound = 0;
    console.log('✅ Auto-Winner Bot stopped.\n');
}
