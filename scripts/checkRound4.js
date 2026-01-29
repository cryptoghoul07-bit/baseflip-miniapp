
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');
const BaseFlipABI = require('../app/lib/BaseFlipABI.json');

async function main() {
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
    const contract = new ethers.Contract(process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS, BaseFlipABI, new ethers.JsonRpcProvider(rpcUrl));

    const round4 = await contract.rounds(4);
    console.log("Round 4 Status:", round4);

    // [levelId, poolA, poolB, roundStartTime, createdAt, isActive, isCompleted, isCancelled, winningGroup]
    console.log("Started?", round4[3] > 0n);
    console.log("Pool A:", ethers.formatEther(round4[1]));
    console.log("Pool B:", ethers.formatEther(round4[2]));
}

main();
