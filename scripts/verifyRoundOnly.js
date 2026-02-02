const { createPublicClient, http, parseAbi } = require('viem');
const { baseSepolia } = require('viem/chains');
require('dotenv').config({ path: '.env.local' });

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS;
const RPC_URL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;

const ABI = parseAbi([
    'function games(uint256) view returns (uint256 entryFee, uint256 totalPool, uint256 currentRound, uint256 startTime, bool isAcceptingPlayers, bool isCompleted, uint256 activePlayerCount)'
]);

async function main() {
    const client = createPublicClient({
        chain: baseSepolia,
        transport: http(RPC_URL)
    });

    const game = await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'games',
        args: [1n]
    });

    // ONLY PRINT ROUND NUMBER
    console.log(`ROUND:${game[2]}`);
    console.log(`ACTIVE:${game[6]}`);
}

main();
