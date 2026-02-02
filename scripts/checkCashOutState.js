const hre = require("hardhat");

async function main() {
    // Address from environment or fallback
    const contractAddress = process.env.NEXT_PUBLIC_CASHOUTORDIE_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const gameId = 1;

    console.log(`Checking Game ${gameId} state at address: ${contractAddress}`);

    try {
        const CashOutOrDie = await hre.ethers.getContractFactory("CashOutOrDie");
        const contract = CashOutOrDie.attach(contractAddress);

        const game = await contract.games(gameId);

        console.log("\n=== Game State ===");
        console.log("Entry Fee:", hre.ethers.formatEther(game.entryFee), "ETH");
        console.log("Total Pool:", hre.ethers.formatEther(game.totalPool), "ETH");
        console.log("Current Round:", game.currentRound.toString());
        console.log("Start Time:", new Date(Number(game.startTime) * 1000).toLocaleString());
        console.log("Is Accepting Players:", game.isAcceptingPlayers);
        console.log("Is Completed:", game.isCompleted);
        console.log("Active Player Count:", game.activePlayerCount.toString());

        // Check recent events to see if rounds are advancing
        const currentBlock = await hre.ethers.provider.getBlockNumber();
        console.log("\nCurrent Block:", currentBlock);

    } catch (error) {
        console.error("Error fetching game state:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
