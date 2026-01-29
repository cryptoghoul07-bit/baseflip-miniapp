
require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');
const BaseFlipABI = require('../app/lib/BaseFlipABI.json');

async function main() {
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contract = new ethers.Contract(process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS, BaseFlipABI, wallet);

    const roundId = 5;
    const winningGroup = Math.random() < 0.5 ? 1 : 2;

    console.log(`Forcing winner for Round ${roundId}: Group ${winningGroup}...`);

    try {
        const tx = await contract.declareWinner(roundId, winningGroup);
        console.log("Tx sent:", tx.hash);
        await tx.wait();
        console.log("Winner declared!");
    } catch (e) {
        console.error("Failed to declare winner:", e.message);
    }
}

main();
