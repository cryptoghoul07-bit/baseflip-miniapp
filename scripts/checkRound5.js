
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');
const BaseFlipABI = require('../app/lib/BaseFlipABI.json');

async function main() {
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
    const contract = new ethers.Contract(process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS, BaseFlipABI, new ethers.JsonRpcProvider(rpcUrl));

    const roundId = 5;
    console.log(`Checking Round ${roundId} status...`);

    try {
        const round = await contract.rounds(roundId);
        // [levelId, poolA, poolB, roundStartTime, createdAt, isActive, isCompleted, isCancelled, winningGroup]
        console.log("Details:");
        console.log(`- Level ID: ${round[0]}`);
        console.log(`- Pool A: ${ethers.formatEther(round[1])} ETH`);
        console.log(`- Pool B: ${ethers.formatEther(round[2])} ETH`);
        console.log(`- Start Time: ${round[3]}`); // 0 if not started
        console.log(`- Created At: ${round[4]}`);
        console.log(`- Is Active: ${round[5]}`);
        console.log(`- Is Completed: ${round[6]}`);
        console.log(`- Winning Group: ${round[8]}`);

        if (round[3] > 0n && !round[6]) {
            console.log("\n✅ Round is ACTIVE and WAITING for winner.");
        } else if (round[3] == 0n) {
            console.log("\nzzz Round is waiting for first bet.");
        } else if (round[6]) {
            console.log("\n🏁 Round is ALREADY COMPLETED.");
        }

    } catch (e) {
        console.error("Error reading round:", e);
    }
}

main();
