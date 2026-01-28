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
        const fees = await contract.collectedFees();
        const owner = await contract.owner();

        console.log(`\n💰 Contract Status Check:`);
        console.log(`------------------------`);
        console.log(`Contract: ${contractAddress}`);
        console.log(`Owner:    ${owner}`);
        console.log(`Collected Fees: ${ethers.formatEther(fees)} ETH`);

        if (fees > 0n) {
            console.log(`\n✅ Fees available for withdrawal!`);
        } else {
            console.log(`\nℹ️  No fees collected yet.`);
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

main();
