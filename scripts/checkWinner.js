const hre = require("hardhat");

async function main() {
    const contractAddress = process.env.NEXT_PUBLIC_BASEFLIP_CONTRACT_ADDRESS;
    const BaseFlip = await hre.ethers.getContractFactory("BaseFlip");
    const contract = BaseFlip.attach(contractAddress);

    // Get current round ID
    const currentRoundId = await contract.currentRoundId();
    console.log(`Current Round ID: ${currentRoundId.toString()}`);

    if (currentRoundId > 1n) {
        const lastRoundId = currentRoundId - 1n;
        console.log(`Checking Round ${lastRoundId.toString()}...`);

        try {
            const round = await contract.rounds(lastRoundId);

            console.log(`\nLast Round (ID: ${lastRoundId.toString()}):`);
            console.log(`- Winning Group: ${round.winningGroup.toString()}`);
            console.log(`- Is Completed: ${round.isCompleted}`);

            if (round.winningGroup == 1n) {
                console.log("\n🏆 WINNER: POOL A (Group 1)");
            } else if (round.winningGroup == 2n) {
                console.log("\n🏆 WINNER: POOL B (Group 2)");
            } else {
                console.log("\n❓ No winner declared yet for last round");
            }
        } catch (e) {
            console.error("Error fetching round:", e);
        }
    } else {
        console.log("No completed rounds yet.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
