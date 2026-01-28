
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from parent directory
dotenv.config({ path: resolve(__dirname, '../.env.local') });

async function checkOwnership() {
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
    const client = createPublicClient({
        chain: baseSepolia,
        transport: http(rpcUrl)
    });

    const contractAddress = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS;
    const privateKey = process.env.PRIVATE_KEY;

    if (!contractAddress || !privateKey) {
        console.error("Missing env vars");
        return;
    }

    const botAccount = privateKeyToAccount(`0x${privateKey.replace(/^0x/, '')}`);

    try {
        const ABI = parseAbi(['function owner() view returns (address)']);
        const owner = await client.readContract({
            address: contractAddress,
            abi: ABI,
            functionName: 'owner'
        });

        console.log(`Contract Address: ${contractAddress}`);
        console.log(`Contract Owner:   ${owner}`);
        console.log(`Bot Address:      ${botAccount.address}`);

        if (owner.toLowerCase() === botAccount.address.toLowerCase()) {
            console.log("\n✅ Bot wallet IS the owner.");
        } else {
            console.log("\n❌ Bot wallet is NOT the owner.");
        }
    } catch (e) {
        console.error("Error reading contract:", e);
    }
}

checkOwnership();
