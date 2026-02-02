const { createPublicClient, http, parseAbi, formatEther } = require('viem');
const { baseSepolia } = require('viem/chains');
require('dotenv').config({ path: '.env.local' });

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS;
const RPC_URL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;

const ABI = parseAbi([
    'function games(uint256) view returns (uint256 entryFee, uint256 totalPool, uint256 currentRound, uint256 startTime, bool isAcceptingPlayers, bool isCompleted, uint256 activePlayerCount)',
    'function currentGameId() view returns (uint256)'
]);

async function main() {
    console.log(`Checking CashOutOrDie at ${CONTRACT_ADDRESS}...`);

    const client = createPublicClient({
        chain: baseSepolia,
        transport: http(RPC_URL)
    });

    try {
        const gameId = await client.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'currentGameId'
        });
        console.log(`Current Game ID: ${gameId}`);

        if (gameId === 0n) {
            console.log("No games created yet.");
            return;
        }

        const game = await client.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'games',
            args: [1n] // Check Game 1
        });

        console.log("\n=== Game 1 State ===");
        console.log(`Entry Fee: ${formatEther(game[0])} ETH`);
        console.log(`Total Pool: ${formatEther(game[1])} ETH`);
        console.log(`Current Round: ${game[2]}`);
        console.log(`Start Time: ${game[3]}`);
        console.log(`Accepting Players: ${game[4]}`);
        console.log(`Completed: ${game[5]}`);
        console.log(`Active Players: ${game[6]}`);

    } catch (error) {
        console.error("Error:", error);
    }
}

main();
