require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');
const BaseFlipABI = require('../app/lib/BaseFlipABI.json');

async function main() {
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
    const contractAddress = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS;

    if (!contractAddress) {
        console.error("Contract address missing in .env.local");
        process.exit(1);
    }

    console.log(`Connecting to ${rpcUrl}...`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, BaseFlipABI, provider);

    try {
        // Get current round stats to see latest ID
        const currentId = await contract.currentRoundId();
        console.log(`Current Round ID: ${currentId}`);

        if (currentId <= 1n) {
            console.log("No completed rounds yet.");
            return;
        }

        const lastRoundId = currentId - 1n;
        console.log(`Checking result for Round ${lastRoundId}...`);

        const round = await contract.rounds(lastRoundId);
        // round structure: [levelId, poolA, poolB, startTime, createdAt, isActive, isCompleted, isCancelled, winningGroup]

        // winningGroup is at index 8 based on previous discovery, 
        // but let's access by property name if returned as object, 
        // or just print the whole thing to be sure.
        // Ethers returns a Result object which allows array access & property access if ABI names are present.

        const winningGroup = round.winningGroup; // or round[8]
        const isCompleted = round.isCompleted;

        console.log(`\n--- Round ${lastRoundId} Result ---`);
        console.log(`Winner: Group ${winningGroup.toString()}`);
        console.log(`Completed: ${isCompleted}`);

        if (winningGroup == 1n) {
            console.log("🏆 WINNER: POOL A");
        } else if (winningGroup == 2n) {
            console.log("🏆 WINNER: POOL B");
        } else {
            console.log("❓ Winner not declared (Group 0)");
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

main();
