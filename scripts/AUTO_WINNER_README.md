# BaseFlip Auto-Winner Bot

Automatically declares winners for BaseFlip rounds using cryptographically secure randomness.

## How It Works

1. **Monitors blockchain** for `RoundStarted` events on your deployed BaseFlip contract
2. **Generates random winner** using Node.js `crypto.randomInt()` (cryptographically secure)
3. **Calls `declareWinner()`** automatically from your owner wallet
4. **Waits for next round** and repeats

## Setup

### Prerequisites
- Node.js installed
- Private key with ETH on Base Sepolia (for gas fees)
- BaseFlip contract deployed on Base Sepolia

### Environment Variables
Ensure your `.env.local` has:
```env
NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS=0x...
PRIVATE_KEY=your_private_key_here
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

## Usage

### Start the bot
```bash
npm run auto-winner
```

The bot will:
- ✅ Connect to Base Sepolia
- ✅ Start watching for round completions
- ✅ Automatically declare winners when rounds start
- ✅ Log all activity to console

### Sample Output
```
🤖 BaseFlip Auto-Winner Bot Started
=====================================
📍 Contract: 0x24Ba29165D7d97301CF16BBC2607249bE5d13672
🔗 Network: Base Sepolia
👤 Bot Address: 0xC8530140fc49b13c063cafc2d1a4d9758f1183B6
=====================================

👀 Watching for RoundStarted events...

🔔 RoundStarted event detected!
   Round ID: 1
   Pool A: 100000000000000000
   Pool B: 100000000000000000

🎲 Declaring winner for Round #1...
   Winner: Pool B
   ✅ Transaction sent: 0x...
   ⏳ Waiting for confirmation...
   ✅ Winner declared successfully!
   🔗 View on BaseScan: https://sepolia.basescan.org/tx/0x...
```

## Running Continuously

### Option 1: Local Machine
Keep the terminal window open:
```bash
npm run auto-winner
```

### Option 2: Background Process (Linux/Mac)
```bash
nohup npm run auto-winner > auto-winner.log 2>&1 &
```

### Option 3: Windows Background
Use PowerShell:
```powershell
Start-Process npm -ArgumentList "run", "auto-winner" -WindowStyle Hidden
```

### Option 4: Deploy to Cloud
Deploy to:
- **Vercel** (with cron job checking every minute)
- **AWS Lambda** (event-driven)
- **Railway.app** (always-on service)

## Security Notes

⚠️ **Important**:
- The bot uses the `PRIVATE_KEY` from `.env.local` (contract owner)
- This private key has admin rights to declare winners
- Keep `.env.local` secure and never commit it to git
- The randomness comes from `crypto.randomInt()`, which is cryptographically secure

## Stopping the Bot

Press `Ctrl+C` in the terminal to stop.

## Troubleshooting

### "Missing required environment variables"
→ Ensure `NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS` and `PRIVATE_KEY` are in `.env.local`

### "Error watching events"
→ Check your RPC connection. Try using Alchemy or Infura RPC endpoint instead of public RPC

### "Transaction failed"
→ Ensure the wallet has enough Base Sepolia ETH for gas fees

### "Not enough ETH"
→ Get testnet ETH from Base Sepolia faucet

## Gas Costs

Each winner declaration costs approximately:
- **Gas Used**: ~50,000 gas
- **Cost on Base Sepolia**: ~0.001 ETH per declaration

Make sure your owner wallet has sufficient ETH balance.
