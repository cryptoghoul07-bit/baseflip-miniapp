# BaseFlip - Prediction Game on Base

A mini-app prediction game built on Base blockchain where users stake ETH on competing groups (A or B). Rounds start when both pools are balanced, and winners receive 99% of the losing pool distributed pro-rata.

## Features

- **Three Levels**: 0.1 ETH, 0.5 ETH, and 1 ETH pool targets (only Level 1 active in V1)
- **Fair Pool Balancing**: Users can only stake on the smaller side until pools are equal
- **Min/Max Stake Limits**: Prevent whale dominance and ensure fair play
- **Pro-rata Payouts**: Winners receive rewards proportional to their stake
- **Real-time Updates**: Live pool tracking and instant payout calculations
- **Base Integration**: Built with OnchainKit for seamless Base blockchain interaction

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Blockchain**: Base (Sepolia testnet / Mainnet)
- **Smart Contracts**: Solidity 0.8.24, Hardhat
- **Web3**: Wagmi, Viem, OnchainKit
- **Styling**: CSS Modules

## Prerequisites

- Node.js v18+ and npm
- A Base-compatible wallet (Coinbase Wallet, MetaMask, etc.)
- ETH for gas fees (on Base Sepolia for testing)

## Installation

1. **Clone the repository** (already done)
   ```bash
   cd baseflip-miniapp
   ```

2. **Install dependencies** (already done)
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file in the root directory:
   ```bash
   cp .env.local.example .env.local
   ```
   
   Edit `.env.local` and add:
   ```
   NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_cdp_api_key
   NEXT_PUBLIC_URL=http://localhost:3000
   NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS=  # Add after deployment
   PRIVATE_KEY=your_private_key_for_deployment
   ```

## Smart Contract Deployment

### Option 1: Deploy to Base Sepolia Testnet (Recommended for testing)

1. **Compile the contract**
   ```bash
   npx hardhat compile
   ```

2. **Deploy to Base Sepolia**
   ```bash
   npx hardhat run scripts/deploy.js --network baseSepolia
   ```

3. **Save the contract address** printed in the console to your `.env.local`:
   ```
   NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS=0x...
   ```

### Option 2: Deploy to Base Mainnet (Production)

```bash
npx hardhat run scripts/deploy.js --network base
```

⚠️ **Warning**: Deploying to mainnet involves real ETH. Ensure your contract is audited first.

## Running the Application

1. **Start the development server**
   ```bash
   npm run dev
   ```

2. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

3. **Connect your wallet** and start playing!

## Game Rules

### Level 1 (Active)
- **Target Pool**: 0.1 ETH per side
- **Min Stake**: 0.001 ETH
- **Max Stake**: 0.05 ETH

### How to Play

1. **Select Level 1** (Levels 2 & 3 coming soon)
2. **Choose your side**: Pool A or Pool B
   - You can only stake on the smaller pool
3. **Enter your stake amount** within min/max limits
4. **View your expected payout multiplier** before confirming
5. **Submit your stake** and wait for the round to start
6. **Round starts** when both pools reach 0.1 ETH
7. **Admin declares winner** (oracle integration coming in V2)
8. **Claim your winnings** if you chose the winning side!

## Admin Functions

As the contract owner, you can:

- **Declare winners**: `declareWinner(roundId, winningGroup)`
- **Activate levels**: `setLevelStatus(levelId, true)`
- **Withdraw fees**: `withdrawFees()` (1% rake from each round)

## Project Structure

```
baseflip-miniapp/
├── contracts/
│   └── BaseFlip.sol           # Main game contract
├── scripts/
│   └── deploy.js              # Deployment script
├── app/
│   ├── components/            # React components
│   │   ├── LevelSelector.tsx
│   │   ├── PoolDisplay.tsx
│   │   ├── StakeInput.tsx
│   │   └── styles/
│   ├── hooks/
│   │   └── useBaseFlip.ts     # Contract interaction hook
│   ├── lib/
│   │   └── BaseFlipABI.json   # Contract ABI
│   └── page.tsx               # Main game page
├── hardhat.config.js
├── minikit.config.ts
└── .env.local.example
```

## Testing

### Manual Testing

1. Connect two different wallets
2. Stake from both wallets on different sides
3. Verify pool balancing works (can only stake on smaller side)
4. Wait for both pools to reach target
5. As admin, declare a winner
6. Both users claim (only winner should receive payout)

### Contract Testing

```bash
npx hardhat test
```

## Deployment to Production

1. **Build the Next.js app**
   ```bash
   npm run build
   ```

2. **Deploy to Vercel** (or your preferred hosting)
   ```bash
   vercel --prod
   ```

3. **Set environment variables** in Vercel dashboard

4. **Publish as Farcaster Mini App** (optional)
   - Follow the instructions in the original README for manifest signing
   - Update `minikit.config.ts` with account association

## Troubleshooting

### "npm is not recognized"
Make sure Node.js is in your PATH. Restart your terminal after installing Node.js.

### Contract not found
Ensure you've deployed the contract and added the address to `.env.local`

### Transaction fails
- Check you have enough ETH for gas
- Verify you're on the correct network (Base Sepolia or Base Mainnet)
- Ensure you meet stake min/max requirements

## Roadmap

- ✅ V1: Admin-controlled winner selection
- 🔜 V2: Chainlink VRF integration for provably fair randomness
- 🔜 V3: Levels 2 and 3 activation
- 🔜 V4: Leaderboards and user stats

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.

---

**Built with ❤️ on Base**
