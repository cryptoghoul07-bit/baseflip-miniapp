const hre = require("hardhat");

async function main() {
    const contractAddress = "0xF87668d179F0CacF2d3171Df16375100fCf74c45";

    console.log("\n========================================");
    console.log("Verifying CashOutOrDie Contract");
    console.log("========================================");
    console.log("Contract Address:", contractAddress);

    const CashOutOrDie = await hre.ethers.getContractFactory("CashOutOrDie");
    const contract = CashOutOrDie.attach(contractAddress);

    try {
        // Try to read currentGameId
        const currentGameId = await contract.currentGameId();
        console.log("✅ Current Game ID:", currentGameId.toString());

        // Try to read game 1 data
        const game = await contract.games(1);
        console.log("✅ Game 1 Entry Fee:", hre.ethers.formatEther(game[0]), "ETH");
        console.log("✅ Game 1 Status:", game[4] ? "Accepting Players" : "Started");

        console.log("\n✅ CONTRACT VERIFIED - This is the CashOutOrDie contract!");
        console.log("========================================\n");
    } catch (error) {
        console.log("\n❌ ERROR - This might not be the correct contract");
        console.error(error.message);
        console.log("========================================\n");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
