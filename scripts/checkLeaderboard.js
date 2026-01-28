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

    console.log(`Checking Leaderboard on ${contractAddress}...`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, BaseFlipABI, provider);

    try {
        // Retrieve top 10
        console.log("Calling getLeaderboardTop(10)...");
        const result = await contract.getLeaderboardTop(10n);

        // Result is [addresses[], points[]]
        const addresses = result[0];
        const points = result[1];

        console.log(`\n🏆 Leaderboard (${addresses.length} entries):`);

        if (addresses.length === 0) {
            console.log("No entries found (empty).");
        } else {
            for (let i = 0; i < addresses.length; i++) {
                if (addresses[i] === '0x0000000000000000000000000000000000000000') continue;
                console.log(`#${i + 1} ${addresses[i]} - ${points[i].toString()} pts`);
            }
        }

        // Also check my points specifically just in case
        // Need a valid address, let's try reading recent event or just skip

    } catch (error) {
        console.error("Error:", error);
    }
}

main();
