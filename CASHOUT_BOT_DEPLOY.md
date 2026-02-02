# Deploying Cash-Out or Die Auto-Bot to Render

Follow these steps to deploy the bot to Render (same as BaseFlip auto-winner):

## Step 1: Create New Web Service on Render

1. Go to https://render.com/dashboard
2. Click **New +** → **Web Service**
3. Connect your GitHub repository (`baseflip-miniapp`)
4. Click **Connect**

## Step 2: Configure the Service

**Basic Settings:**
- **Name**: `cashout-bot` (or your preferred name)
- **Region**: Choose closest to you
- **Branch**: `main`
- **Root Directory**: (leave blank)
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm run cashout-bot`

**Instance Type:**
- Select **Free** (or paid if you want better performance)

**⚠️ IMPORTANT - Health Check (Keeps bot alive on free tier):**
- Scroll to **Health Check** section
- **Health Check Path**: `/health`
- This prevents Render from spinning down your bot after 15 minutes of inactivity

## Step 3: Add Environment Variables

Click **Advanced** and add these environment variables:

```
NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS=0xF87668d179F0CacF2d3171Df16375100fCf74c45
PRIVATE_KEY=<your_private_key_from_.env.local>
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PORT=3001
```

⚠️ **Important**: Use the same `PRIVATE_KEY` as your deployer wallet (the one in `.env.local`)

## Step 4: Deploy

1. Click **Create Web Service**
2. Wait for deployment to complete (~2-3 minutes)
3. Check the logs to confirm it's running

## Step 5: Verify It's Working

Your bot should show logs like:
```
╔════════════════════════════════════════════════════════╗
║     Cash-Out or Die Automated Game Bot Started        ║
╚════════════════════════════════════════════════════════╝

📍 Contract: 0xF87668d179F0CacF2d3171Df16375100fCf74c45
🔑 Bot Address: 0x...
🌐 Network: Base Sepolia
⚙️  Settings:
   - Min Players: 3
   - Round Delay: 15s

🤖 Bot is now monitoring for games...
```

## How the Bot Works

1. **Monitors Games**: Checks every 10 seconds for active games
2. **Starts Games**: When a game has 3+ players, automatically starts it
3. **Declares Winners**: After each round, waits 15s for suspense, then randomly picks Group A or B
4. **Repeats**: Continues until only 1 player remains or everyone cashes out

## Health Check

Visit your Render service URL to see bot status:
- `https://your-cashout-bot.onrender.com` - Shows bot status
- `https://your-cashout-bot.onrender.com/health` - Health check endpoint

## Testing Locally First (Optional)

Before deploying to Render, test locally:

```bash
npm run cashout-bot
```

Then join a game and watch the bot automatically manage it!

## Troubleshooting

**Bot not starting games?**
- Check that games have at least 3 players (MIN_PLAYERS setting)
- Verify contract address is correct
- Check bot wallet has enough ETH for gas

**Bot not declaring winners?**
- Check the logs for errors
- Verify private key is correct
- Ensure bot wallet has ETH for gas fees

**Need to adjust settings?**
- Edit `scripts/cashOutAutoBot.js`:
  - `MIN_PLAYERS` - Minimum players to start (default: 3)
  - `ROUND_DELAY` - Delay between rounds in ms (default: 15000)

## Done! 🎉

Your Cash-Out or Die game is now fully automated!
