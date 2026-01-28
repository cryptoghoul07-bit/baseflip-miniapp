/**
 * Diagnostic script to check BaseFlip contract state
 */
import { createPublicClient, http, parseAbi, formatEther, parseAbiItem } from 'viem';
import { baseSepolia } from 'viem/chains';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS;
const RPC_URL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

const ABI = parseAbi([
    'function owner() view returns (address)',
    'function collectedFees() view returns (uint256)',
    'function currentRoundId() view returns (uint256)',
]);

async function diagnose() {
    console.log('=== BaseFlip Contract Diagnostics ===\n');
    console.log(`Contract: ${CONTRACT_ADDRESS}`);
    console.log(`RPC: ${RPC_URL}\n`);

    const client = createPublicClient({
        chain: baseSepolia,
        transport: http(RPC_URL),
    });

    try {
        // Check owner
        const owner = await client.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'owner',
        });
        console.log(`Owner: ${owner}`);

        // Check collected fees
        const fees = await client.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'collectedFees',
        });
        console.log(`Collected Fees: ${formatEther(fees)} ETH (${fees} wei)`);

        // Check current round
        const roundId = await client.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'currentRoundId',
        });
        console.log(`Current Round ID: ${roundId}`);

        // Fetch PayoutClaimed events
        console.log('\n=== PayoutClaimed Events ===');
        const logs = await client.getLogs({
            address: CONTRACT_ADDRESS,
            event: parseAbiItem('event PayoutClaimed(uint256 indexed roundId, address indexed user, uint256 amount)'),
            fromBlock: 0n,
            toBlock: 'latest',
        });

        if (logs.length === 0) {
            console.log('No PayoutClaimed events found!');
            console.log('This means either:');
            console.log('  1. No one has claimed winnings yet');
            console.log('  2. The contract was just deployed');
            console.log('  3. There\'s an issue with event indexing');
        } else {
            console.log(`Found ${logs.length} PayoutClaimed events:`);
            logs.forEach((log, i) => {
                const { roundId, user, amount } = log.args;
                console.log(`  ${i + 1}. Round ${roundId}: ${user} claimed ${formatEther(amount)} ETH`);
            });
        }

        // Fetch WinnerDeclared events
        console.log('\n=== WinnerDeclared Events ===');
        const winnerLogs = await client.getLogs({
            address: CONTRACT_ADDRESS,
            event: parseAbiItem('event WinnerDeclared(uint256 indexed roundId, uint8 winningGroup)'),
            fromBlock: 0n,
            toBlock: 'latest',
        });

        if (winnerLogs.length === 0) {
            console.log('No WinnerDeclared events found!');
        } else {
            console.log(`Found ${winnerLogs.length} WinnerDeclared events:`);
            winnerLogs.forEach((log, i) => {
                const { roundId, winningGroup } = log.args;
                console.log(`  ${i + 1}. Round ${roundId}: Pool ${winningGroup === 1 ? 'A' : 'B'} won`);
            });
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

diagnose();
