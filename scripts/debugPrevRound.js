require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');
const BaseFlipABI = require('../app/lib/BaseFlipABI.json');

async function main() {
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
    const contractAddress = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS;

    if (!contractAddress) {
        console.error("Contract address missing");
        process.exit(1);
    }

    console.log(`Debug Check: Previous Round Data Logic`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, BaseFlipABI, provider);

    try {
        const currentId = await contract.currentRoundId();
        console.log(`Current Round ID: ${currentId}`);

        if (currentId <= 1n) {
            console.log("No previous rounds available.");
            return;
        }

        const prevRoundId = currentId - 1n;
        console.log(`Fetching Round ${prevRoundId}...`);

        const round = await contract.rounds(prevRoundId);

        // Simulate frontend destructuring
        // The frontend expects array-like access or object access.
        // Ethers Result object supports both.

        console.log("Raw Round Data:", round);

        // Frontend logic copy-paste:
        // const [
        //    lId, pA, pB, sT, cA, iA, isCompleted, isCancelled, winningGroup
        // ] = prevRound as any;

        // Let's print out indices to see what matches
        console.log("\nDestructuring Simulation:");
        console.log(`[0] levelId: ${round[0]}`);
        console.log(`[1] poolA: ${ethers.formatEther(round[1])}`);
        console.log(`[2] poolB: ${ethers.formatEther(round[2])}`);
        console.log(`[3] roundStartTime: ${round[3]}`);
        console.log(`[4] createdAt: ${round[4]}`);
        console.log(`[5] isActive: ${round[5]}`);
        console.log(`[6] isCompleted: ${round[6]}`);
        console.log(`[7] isCancelled: ${round[7]}`);
        console.log(`[8] winningGroup: ${round[8]}`);

        const isCompleted = round[6];
        const winningGroup = round[8];

        console.log(`\nLogic Verification:`);
        console.log(`isCompleted (Index 6): ${isCompleted}`);
        console.log(`winningGroup (Index 8): ${winningGroup}`);

        if (isCompleted && winningGroup > 0n) {
            console.log("✅ SUCCESS: Logic should work. Winner display should trigger.");
        } else {
            console.log("❌ FAILURE: Logic condition not met.");
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

main();
