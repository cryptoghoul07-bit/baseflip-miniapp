// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CashOutOrDie
 * @dev Player-vs-player elimination game with cash-out decision mechanics
 * Players stake equal amounts, predict A or B each round, losers are eliminated,
 * winners can cash out or continue for bigger shares. No house bankroll required.
 */
contract CashOutOrDie is Ownable, ReentrancyGuard {
    
    // ============ Structs ============
    
    struct Game {
        uint256 entryFee;           // Fixed ETH to join
        uint256 totalPool;          // Total ETH staked
        uint256 currentRound;       // Current round number
        uint256 startTime;          // When game started
        bool isAcceptingPlayers;    // Can new players join
        bool isCompleted;           // Game has ended
        uint256 activePlayerCount;  // Number of alive players
    }
    
    struct Player {
        uint256 claimValue;         // Current share of pool
        uint8 currentChoice;        // 1=A, 2=B for current round (0=not set)
        bool isAlive;               // Still in game
        bool hasCashedOut;          // Took payout and left
        bool hasSubmittedChoice;    // Submitted choice for current round
        uint256 roundsWon;          // Survival count
        uint256 joinedAt;           // Timestamp when joined
    }
    
    struct RoundResult {
        uint8 winningGroup;         // 1=A, 2=B
        uint256 timestamp;
        uint256 playersEliminated;
        uint256 poolBeforeRound;
    }
    
    // ============ State Variables ============
    
    mapping(uint256 => Game) public games;
    mapping(uint256 => mapping(address => Player)) public gamePlayers; // gameId => player => data
    mapping(uint256 => address[]) public gamePlayerList; // gameId => list of all players
    mapping(uint256 => RoundResult[]) public gameRounds; // gameId => round history
    
    uint256 public currentGameId;
    uint256 public constant CASH_OUT_FEE_PERCENTAGE = 1; // 1% fee on cash-out
    uint256 public constant ROUND_TIMEOUT = 24 hours;
    uint256 public constant MIN_PLAYERS = 2;
    uint256 public constant MAX_PLAYERS = 100;
    
    uint256 public collectedFees;
    
    // ============ Events ============
    
    event GameCreated(uint256 indexed gameId, uint256 entryFee);
    event PlayerJoined(uint256 indexed gameId, address indexed player, uint8 choice);
    event GameStarted(uint256 indexed gameId, uint256 playerCount, uint256 totalPool);
    event ChoiceSubmitted(uint256 indexed gameId, uint256 round, address indexed player, uint8 choice);
    event RoundCompleted(uint256 indexed gameId, uint256 round, uint8 winningGroup, uint256 eliminated);
    event PlayerEliminated(uint256 indexed gameId, uint256 round, address indexed player);
    event PlayerCashedOut(uint256 indexed gameId, address indexed player, uint256 amount);
    event GameCompleted(uint256 indexed gameId, address indexed winner, uint256 finalPayout);
    event FeesWithdrawn(address indexed owner, uint256 amount);
    
    // ============ Constructor ============
    
    constructor() Ownable(msg.sender) {
        currentGameId = 0;
    }
    
    // ============ Public Functions ============
    
    /**
     * @dev Create a new game with specified entry fee
     * @param _entryFee Amount of ETH required to join
     */
    function createGame(uint256 _entryFee) external onlyOwner {
        require(_entryFee > 0, "Entry fee must be greater than 0");
        
        currentGameId++;
        
        games[currentGameId] = Game({
            entryFee: _entryFee,
            totalPool: 0,
            currentRound: 0,
            startTime: 0,
            isAcceptingPlayers: true,
            isCompleted: false,
            activePlayerCount: 0
        });
        
        emit GameCreated(currentGameId, _entryFee);
    }
    
    /**
     * @dev Join the current game with initial A/B choice
     * @param _gameId Game to join
     * @param _choice 1 for A, 2 for B
     */
    function joinGame(uint256 _gameId, uint8 _choice) external payable nonReentrant {
        require(_choice == 1 || _choice == 2, "Invalid choice");
        
        Game storage game = games[_gameId];
        require(game.isAcceptingPlayers, "Game not accepting players");
        require(!game.isCompleted, "Game completed");
        require(msg.value == game.entryFee, "Incorrect entry fee");
        require(gamePlayerList[_gameId].length < MAX_PLAYERS, "Game full");
        
        Player storage player = gamePlayers[_gameId][msg.sender];
        require(player.claimValue == 0, "Already joined");
        
        // Initialize player
        player.claimValue = msg.value;
        player.currentChoice = _choice;
        player.isAlive = true;
        player.hasCashedOut = false;
        player.hasSubmittedChoice = true;
        player.roundsWon = 0;
        player.joinedAt = block.timestamp;
        
        gamePlayerList[_gameId].push(msg.sender);
        game.totalPool += msg.value;
        game.activePlayerCount++;
        
        emit PlayerJoined(_gameId, msg.sender, _choice);
    }
    
    /**
     * @dev Start the game (stop accepting new players)
     * @param _gameId Game to start
     */
    function startGame(uint256 _gameId) external onlyOwner {
        Game storage game = games[_gameId];
        require(game.isAcceptingPlayers, "Already started");
        require(gamePlayerList[_gameId].length >= MIN_PLAYERS, "Not enough players");
        
        game.isAcceptingPlayers = false;
        game.startTime = block.timestamp;
        game.currentRound = 1;
        
        emit GameStarted(_gameId, gamePlayerList[_gameId].length, game.totalPool);
    }
    
    /**
     * @dev Submit choice for current round (for players who survived previous round)
     * @param _gameId Game ID
     * @param _choice 1 for A, 2 for B
     */
    function submitChoice(uint256 _gameId, uint8 _choice) external {
        require(_choice == 1 || _choice == 2, "Invalid choice");
        
        Game storage game = games[_gameId];
        require(!game.isAcceptingPlayers, "Game not started");
        require(!game.isCompleted, "Game completed");
        require(game.currentRound > 1, "Use joinGame for first round");
        
        Player storage player = gamePlayers[_gameId][msg.sender];
        require(player.isAlive, "Player eliminated");
        require(!player.hasCashedOut, "Already cashed out");
        require(!player.hasSubmittedChoice, "Choice already submitted");
        
        player.currentChoice = _choice;
        player.hasSubmittedChoice = true;
        
        emit ChoiceSubmitted(_gameId, game.currentRound, msg.sender, _choice);
    }
    
    /**
     * @dev Declare winner of current round and eliminate losers (admin only)
     * @param _gameId Game ID
     * @param _winningGroup 1 for A, 2 for B
     */
    function declareRoundWinner(uint256 _gameId, uint8 _winningGroup) external onlyOwner {
        require(_winningGroup == 1 || _winningGroup == 2, "Invalid winning group");
        
        Game storage game = games[_gameId];
        require(!game.isAcceptingPlayers, "Game not started");
        require(!game.isCompleted, "Game already completed");
        
        uint256 eliminatedCount = 0;
        uint256 winnersCount = 0;
        uint256 eliminatedClaims = 0;
        
        // First pass: count winners and calculate eliminated claims
        address[] memory playerList = gamePlayerList[_gameId];
        for (uint256 i = 0; i < playerList.length; i++) {
            Player storage player = gamePlayers[_gameId][playerList[i]];
            
            if (player.isAlive && !player.hasCashedOut) {
                if (player.currentChoice == _winningGroup) {
                    winnersCount++;
                    player.roundsWon++;
                } else {
                    eliminatedClaims += player.claimValue;
                    eliminatedCount++;
                }
            }
        }
        
        // Second pass: eliminate losers and redistribute claims to winners
        for (uint256 i = 0; i < playerList.length; i++) {
            Player storage player = gamePlayers[_gameId][playerList[i]];
            
            if (player.isAlive && !player.hasCashedOut) {
                if (player.currentChoice != _winningGroup) {
                    player.isAlive = false;
                    player.claimValue = 0;
                    game.activePlayerCount--;
                    emit PlayerEliminated(_gameId, game.currentRound, playerList[i]);
                } else if (winnersCount > 0) {
                    // Redistribute eliminated claims pro-rata to winners
                    player.claimValue += (eliminatedClaims * player.claimValue) / (game.totalPool - eliminatedClaims);
                }
                
                // Reset choice submission for next round
                player.hasSubmittedChoice = false;
                player.currentChoice = 0;
            }
        }
        
        // Record round result
        gameRounds[_gameId].push(RoundResult({
            winningGroup: _winningGroup,
            timestamp: block.timestamp,
            playersEliminated: eliminatedCount,
            poolBeforeRound: game.totalPool
        }));
        
        emit RoundCompleted(_gameId, game.currentRound, _winningGroup, eliminatedCount);
        
        // Check if game should end (only one player left)
        if (game.activePlayerCount == 1) {
            _endGame(_gameId);
        } else {
            game.currentRound++;
        }
    }
    
    /**
     * @dev Cash out current claim and exit game
     * @param _gameId Game ID
     */
    function cashOut(uint256 _gameId) external nonReentrant {
        Game storage game = games[_gameId];
        require(!game.isCompleted, "Game completed");
        
        Player storage player = gamePlayers[_gameId][msg.sender];
        require(player.isAlive, "Player eliminated");
        require(!player.hasCashedOut, "Already cashed out");
        require(player.claimValue > 0, "No claim to cash out");
        
        uint256 claimAmount = player.claimValue;
        uint256 fee = (claimAmount * CASH_OUT_FEE_PERCENTAGE) / 100;
        uint256 payout = claimAmount - fee;
        
        // Update state
        player.hasCashedOut = true;
        player.isAlive = false;
        player.claimValue = 0;
        game.activePlayerCount--;
        game.totalPool -= claimAmount;
        collectedFees += fee;
        
        // Transfer payout
        (bool success, ) = msg.sender.call{value: payout}("");
        require(success, "Transfer failed");
        
        emit PlayerCashedOut(_gameId, msg.sender, payout);
        
        // Check if game should end
        if (game.activePlayerCount == 1 || game.activePlayerCount == 0) {
            _endGame(_gameId);
        }
    }
    
    /**
     * @dev Final survivor claims remaining pool
     * @param _gameId Game ID
     */
    function claimVictory(uint256 _gameId) external nonReentrant {
        Game storage game = games[_gameId];
        require(game.activePlayerCount == 1, "Game not finished or multiple players remain");
        
        Player storage player = gamePlayers[_gameId][msg.sender];
        require(player.isAlive, "Not the winner");
        require(!player.hasCashedOut, "Already cashed out");
        
        uint256 claimAmount = player.claimValue;
        uint256 fee = (claimAmount * CASH_OUT_FEE_PERCENTAGE) / 100;
        uint256 payout = claimAmount - fee;
        
        player.hasCashedOut = true;
        player.isAlive = false;
        game.activePlayerCount = 0;
        collectedFees += fee;
        
        _endGame(_gameId);
        
        (bool success, ) = msg.sender.call{value: payout}("");
        require(success, "Transfer failed");
        
        emit GameCompleted(_gameId, msg.sender, payout);
    }
    
    /**
     * @dev Withdraw collected fees (owner only)
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = collectedFees;
        require(amount > 0, "No fees to withdraw");
        
        collectedFees = 0;
        
        (bool success, ) = owner().call{value: amount}("");
        require(success, "Transfer failed");
        
        emit FeesWithdrawn(owner(), amount);
    }
    
    // ============ Internal Functions ============
    
    function _endGame(uint256 _gameId) internal {
        games[_gameId].isCompleted = true;
    }
    
    // ============ View Functions ============
    
    function getGamePlayers(uint256 _gameId) external view returns (address[] memory) {
        return gamePlayerList[_gameId];
    }
    
    function getPlayerStats(uint256 _gameId, address _player) external view returns (
        uint256 claimValue,
        uint8 currentChoice,
        bool isAlive,
        bool hasCashedOut,
        uint256 roundsWon
    ) {
        Player memory player = gamePlayers[_gameId][_player];
        return (
            player.claimValue,
            player.currentChoice,
            player.isAlive,
            player.hasCashedOut,
            player.roundsWon
        );
    }
    
    function getRoundHistory(uint256 _gameId) external view returns (RoundResult[] memory) {
        return gameRounds[_gameId];
    }
    
    function getActivePlayerCount(uint256 _gameId) external view returns (uint256) {
        uint256 count = 0;
        address[] memory playerList = gamePlayerList[_gameId];
        
        for (uint256 i = 0; i < playerList.length; i++) {
            Player memory player = gamePlayers[_gameId][playerList[i]];
            if (player.isAlive && !player.hasCashedOut) {
                count++;
            }
        }
        
        return count;
    }
}
