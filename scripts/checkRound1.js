
const { createPublicClient, http, parseAbi } = require('viem');
const { baseSepolia } = require('viem/chains');
require('dotenv').config({ path: '.env.local' });

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS;
const RPC_URL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

if (!CONTRACT_ADDRESS) {
    console.error('Missing CONTRACT_ADDRESS');
    process.exit(1);
}

const ABI = parseAbi([
    'function rounds(uint256 roundId) external view returns (uint256 levelId, uint256 poolA, uint256 poolB, uint256 roundStartTime, bool isActive, bool isCompleted, uint8 winningGroup)',
]);

const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
});

async function checkRound1() {
    try {
        const round = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'rounds',
            args: [1n],
        });

        const [levelId, poolA, poolB, roundStartTime, isActive, isCompleted, winningGroup] = round;

        const fs = require('fs');
        fs.writeFileSync('result.json', JSON.stringify({
            winner: Number(winningGroup),
            poolA: poolA.toString(),
            poolB: poolB.toString(),
            roundStartTime: roundStartTime.toString(),
            isActive: isActive,
            isCompleted: isCompleted
        }, null, 2));
        console.log("Written to result.json");

    } catch (error) {
        console.error('Error fetching round 1:', error);
    }
}

checkRound1();
