require('dotenv').config({ path: '.env.local' });
const { ethers } = require('ethers');
const fs = require('fs');
const BaseFlipABI = require('../app/lib/BaseFlipABI.json');

async function main() {
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
    const contractAddress = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS;

    if (!contractAddress) {
        console.error("Contract address missing");
        process.exit(1);
    }

    console.log(`📸 Taking Airdrop Snapshot...`);
    console.log(`📍 Contract: ${contractAddress}`);

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, BaseFlipABI, provider);

    try {
        // Fetch Top 100 Users
        const limit = 100;
        console.log(`📡 Fetching Top ${limit} players...`);
        const result = await contract.getLeaderboardTop(limit);

        const addresses = result[0];
        const points = result[1];

        if (addresses.length === 0) {
            console.log("⚠️ No players found on leaderboard.");
            return;
        }

        const snapshot = addresses
            .map((addr, index) => {
                if (addr === '0x0000000000000000000000000000000000000000') return null;
                return {
                    address: addr,
                    points: Number(points[index]),
                    tier: 'TBD' // Placeholder for future tier logic
                }
            })
            .filter(entry => entry !== null);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `snapshot_${timestamp}.json`;

        const output = {
            snapshot_date: new Date().toISOString(),
            contract: contractAddress,
            total_players: snapshot.length,
            players: snapshot
        };

        fs.writeFileSync(filename, JSON.stringify(output, null, 2));

        console.log(`\n✅ Snapshot saved to: ${filename}`);
        console.log(`📊 Total Players: ${snapshot.length}`);

    } catch (error) {
        console.error("❌ Snapshot failed:", error);
    }
}

main();
