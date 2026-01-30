// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// We are not editing the contract, we are creating a hook.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BaseFlip
 * @dev A prediction game where users stake ETH on competing groups (A or B)
 * Round starts when both pools reach equal targets. Winners get 99% of losing pool pro-rata.
 */
contract BaseFlip is Ownable, ReentrancyGuard {
    
    // ============ Structs ============
    
    struct Level {
        uint256 targetPoolSize;    // Target ETH per pool to start round
        uint256 minStake;           // Minimum stake per user
        uint256 maxStake;           // Maximum stake per user
        bool isActive;              // Whether this level is currently active
    }
    
    struct Round {
        uint256 levelId;
        uint256 poolA;              // Total ETH in Pool A
        uint256 poolB;              // Total ETH in Pool B
        uint256 roundStartTime;     // Timestamp when round became balanced
        uint256 createdAt;          // Timestamp when first stake was placed
        bool isActive;              // Whether round is accepting stakes
        bool isCompleted;           // Whether winner has been determined
        bool isCancelled;           // Whether round was cancelled (timeout)
        uint8 winningGroup;         // 0 = not set, 1 = A wins, 2 = B wins
    }
    
    struct Stake {
        uint256 amount;
        uint8 group;                // 1 = A, 2 = B
    }
    
    // ============ State Variables ============
    
    mapping(uint256 => Level) public levels;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => Stake)) public userStakes; // roundId => user => stake
    mapping(uint256 => address[]) public roundParticipants; // roundId => participants
    mapping(address => uint256) public leaderboardPoints; // Total points per user
    mapping(uint256 => bool) public roundPointsAwarded; // Track if points awarded for a round
    
    uint256 public currentRoundId;
    uint256 public constant PAYOUT_PERCENTAGE = 99; // Winners get 99% of losing pool
    uint256 public constant ROUND_TIMEOUT = 24 hours; // Time allowed for round to fill
    uint256 public collectedFees; // 1% rake accumulated
    
    // ============ Events ============
    
    event LevelCreated(uint256 indexed levelId, uint256 targetPoolSize, uint256 minStake, uint256 maxStake);
    event LevelStatusChanged(uint256 indexed levelId, bool isActive);
    event StakePlaced(uint256 indexed roundId, address indexed user, uint8 group, uint256 amount);
    event RoundStarted(uint256 indexed roundId, uint256 poolA, uint256 poolB);
    event WinnerDeclared(uint256 indexed roundId, uint8 winningGroup);
    event PayoutClaimed(uint256 indexed roundId, address indexed user, uint256 amount);
    event FeesWithdrawn(address indexed owner, uint256 amount);
    event PointsAwarded(uint256 indexed roundId, address indexed user, uint256 points, bool isWinner);
    event StakeReclaimed(uint256 indexed roundId, address indexed user, uint256 amount);
    event RoundCancelled(uint256 indexed roundId);
    
    // ============ Constructor ============
    
    constructor() Ownable(msg.sender) {
        // Initialize Level 1 (0.1 ETH target)
        levels[1] = Level({
            targetPoolSize: 0.1 ether,
            minStake: 0.001 ether,
            maxStake: 0.05 ether,
            isActive: true
        });
        emit LevelCreated(1, 0.1 ether, 0.001 ether, 0.05 ether);
        
        // Initialize Level 2 and 3 as inactive (coming soon)
        levels[2] = Level({
            targetPoolSize: 0.5 ether,
            minStake: 0.005 ether,
            maxStake: 0.25 ether,
            isActive: false
        });
        emit LevelCreated(2, 0.5 ether, 0.005 ether, 0.25 ether);
        
        levels[3] = Level({
            targetPoolSize: 1 ether,
            minStake: 0.01 ether,
            maxStake: 0.5 ether,
            isActive: false
        });
        emit LevelCreated(3, 1 ether, 0.01 ether, 0.5 ether);
        
        // Start round 1
        currentRoundId = 1;
        rounds[1] = Round({
            levelId: 1,
            poolA: 0,
            poolB: 0,
            roundStartTime: 0,
            createdAt: 0,
            isActive: true,
            isCompleted: false,
            isCancelled: false,
            winningGroup: 0
        });
    }
    
    // ============ Public Functions ============
    
    /**
     * @dev Place a stake on group A or B
     * @param _group 1 for A, 2 for B
     */
    function stake(uint8 _group) external payable nonReentrant {
        require(_group == 1 || _group == 2, "Invalid group");
        require(msg.value > 0, "Stake must be greater than 0");
        
        Round storage round = rounds[currentRoundId];
        require(round.isActive, "Round is not active");
        require(!round.isCompleted, "Round is completed");
        require(round.roundStartTime == 0, "Round already started");
        
        Level storage level = levels[round.levelId];
        require(level.isActive, "Level is not active");
        require(msg.value >= level.minStake, "Stake below minimum");
        require(msg.value <= level.maxStake, "Stake above maximum");
        
        // Check if user already staked in this round
        Stake storage userStake = userStakes[currentRoundId][msg.sender];
        require(userStake.amount == 0, "Already staked in this round");
        
        // Determine which pool is smaller and only allow staking on that side
        if (round.poolA != round.poolB) {
            if (round.poolA < round.poolB) {
                require(_group == 1, "Can only stake on Pool A (smaller side)");
            } else {
                require(_group == 2, "Can only stake on Pool B (smaller side)");
            }
        }
        
        // Record the stake
        userStake.amount = msg.value;
        userStake.group = _group;
        roundParticipants[currentRoundId].push(msg.sender);
        
        // Track when round was created (first stake)
        if (round.createdAt == 0) {
            round.createdAt = block.timestamp;
        }
        
        // Add to respective pool
        if (_group == 1) {
            round.poolA += msg.value;
        } else {
            round.poolB += msg.value;
        }
        
        emit StakePlaced(currentRoundId, msg.sender, _group, msg.value);
        
        // Check if both pools reached target
        if (round.poolA >= level.targetPoolSize && round.poolB >= level.targetPoolSize) {
            round.roundStartTime = block.timestamp;
            emit RoundStarted(currentRoundId, round.poolA, round.poolB);
        }
    }
    
    /**
     * @dev Declare winner of a round and award points to all participants (admin only)
     * @param _roundId Round ID
     * @param _winningGroup 1 for A, 2 for B
     */
    function declareWinner(uint256 _roundId, uint8 _winningGroup) external onlyOwner {
        require(_winningGroup == 1 || _winningGroup == 2, "Invalid winning group");
        
        Round storage round = rounds[_roundId];
        require(round.roundStartTime > 0, "Round has not started");
        require(!round.isCompleted, "Round already completed");
        require(!roundPointsAwarded[_roundId], "Points already awarded");
        
        round.winningGroup = _winningGroup;
        round.isCompleted = true;
        round.isActive = false;
        
        // Calculate and store 1% fee
        uint256 losingPool = _winningGroup == 1 ? round.poolB : round.poolA;
        uint256 fee = (losingPool * (100 - PAYOUT_PERCENTAGE)) / 100;
        collectedFees += fee;
        
        // Award points to all participants
        _awardPoints(_roundId);
        roundPointsAwarded[_roundId] = true;
        
        emit WinnerDeclared(_roundId, _winningGroup);
        
        // Start next round if this was the current round
        if (_roundId == currentRoundId) {
            _startNextRound(round.levelId);
        }
    }
    
    /**
     * @dev Claim winnings from a completed round
     * @param _roundId Round ID to claim from
     */
    function claimWinnings(uint256 _roundId) external nonReentrant {
        Round storage round = rounds[_roundId];
        require(round.isCompleted, "Round not completed");
        require(round.winningGroup != 0, "Winner not declared");
        
        Stake storage userStake = userStakes[_roundId][msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.group == round.winningGroup, "Not a winner");
        
        // Calculate user's share
        uint256 winningPool = round.winningGroup == 1 ? round.poolA : round.poolB;
        uint256 losingPool = round.winningGroup == 1 ? round.poolB : round.poolA;
        uint256 payoutPool = (losingPool * PAYOUT_PERCENTAGE) / 100;
        uint256 userShare = (userStake.amount * payoutPool) / winningPool;
        uint256 totalPayout = userStake.amount + userShare; // Original stake + winnings
        
        // Mark as claimed
        userStake.amount = 0;
        
        // Transfer payout
        (bool success, ) = msg.sender.call{value: totalPayout}("");
        require(success, "Transfer failed");
        
        emit PayoutClaimed(_roundId, msg.sender, totalPayout);
    }
    
    /**
     * @dev Reclaim stake from a round that hasn't filled within 24 hours
     * @param _roundId Round ID to reclaim from
     */
    function reclaimStake(uint256 _roundId) external nonReentrant {
        Round storage round = rounds[_roundId];
        require(round.createdAt > 0, "Round has no stakes");
        require(round.roundStartTime == 0, "Round already started");
        require(!round.isCompleted, "Round already completed");
        require(!round.isCancelled, "Round already cancelled");
        require(block.timestamp >= round.createdAt + ROUND_TIMEOUT, "Timeout not reached");
        
        Stake storage userStake = userStakes[_roundId][msg.sender];
        require(userStake.amount > 0, "No stake found");
        
        uint256 stakeAmount = userStake.amount;
        uint8 stakeGroup = userStake.group;
        
        // Remove stake from pool
        if (stakeGroup == 1) {
            round.poolA -= stakeAmount;
        } else {
            round.poolB -= stakeAmount;
        }
        
        // Mark stake as reclaimed
        userStake.amount = 0;
        
        // Cancel round if this was current round
        if (_roundId == currentRoundId && !round.isCancelled) {
            round.isCancelled = true;
            round.isActive = false;
            emit RoundCancelled(_roundId);
            
            // Start new round
            _startNextRound(round.levelId);
        }
        
        // Transfer stake back to user
        (bool transferSuccess, ) = msg.sender.call{value: stakeAmount}("");
        require(transferSuccess, "Transfer failed");
        
        emit StakeReclaimed(_roundId, msg.sender, stakeAmount);
    }
    
    /**
     * @dev Get user's expected payout multiplier if they win
     * @param _amount Stake amount
     * @param _group Group to stake on (1 or 2)
     * @return multiplier Expected payout multiplier (scaled by 100, e.g., 150 = 1.5x)
     */
    function getExpectedMultiplier(uint256 _amount, uint8 _group) external view returns (uint256 multiplier) {
        Round storage round = rounds[currentRoundId];
        
        uint256 myPool = _group == 1 ? round.poolA + _amount : round.poolB + _amount;
        uint256 opponentPool = _group == 1 ? round.poolB : round.poolA;
        
        if (opponentPool == 0) return 100; // No opponent pool yet, 1x return
        
        uint256 payoutPool = (opponentPool * PAYOUT_PERCENTAGE) / 100;
        uint256 myShare = (_amount * payoutPool) / myPool;
        uint256 totalReturn = _amount + myShare;
        
        multiplier = (totalReturn * 100) / _amount;
    }
    
    /**
     * @dev Get current round data
     */
    function getCurrentRound() external view returns (
        uint256 roundId,
        uint256 levelId,
        uint256 poolA,
        uint256 poolB,
        uint256 targetSize,
        bool isStarted,
        bool isCompleted
    ) {
        Round storage round = rounds[currentRoundId];
        Level storage level = levels[round.levelId];
        
        return (
            currentRoundId,
            round.levelId,
            round.poolA,
            round.poolB,
            level.targetPoolSize,
            round.roundStartTime > 0,
            round.isCompleted
        );
    }
    
    /**
     * @dev Get user's stake for current round
     */
    function getMyStake() external view returns (uint256 amount, uint8 group) {
        Stake storage userStake = userStakes[currentRoundId][msg.sender];
        return (userStake.amount, userStake.group);
    }
    
    /**
     * @dev Get user's total leaderboard points
     */
    function getUserPoints(address _user) external view returns (uint256) {
        return leaderboardPoints[_user];
    }
    
    /**
     * @dev Get top N users by points (simple implementation, gas intensive for large N)
     * @param _limit Maximum number of users to return
     * @return addresses Array of user addresses
     * @return points Array of corresponding points
     */
    function getLeaderboardTop(uint256 _limit) external view returns (address[] memory addresses, uint256[] memory points) {
        // This is a simplified implementation
        // For production, consider using off-chain indexing
        uint256 count = 0;
        address[] memory tempAddresses = new address[](_limit);
        uint256[] memory tempPoints = new uint256[](_limit);
        
        // Iterate through all rounds and collect unique participants
        for (uint256 i = 1; i <= currentRoundId; i++) {
            address[] memory participants = roundParticipants[i];
            for (uint256 j = 0; j < participants.length && count < _limit; j++) {
                address participant = participants[j];
                uint256 userPoints = leaderboardPoints[participant];
                
                if (userPoints > 0) {
                    // Check if user already in list
                    bool found = false;
                    for (uint256 k = 0; k < count; k++) {
                        if (tempAddresses[k] == participant) {
                            found = true;
                            break;
                        }
                    }
                    
                    if (!found) {
                        // Insert sorted
                        uint256 insertPos = count;
                        for (uint256 k = 0; k < count; k++) {
                            if (userPoints > tempPoints[k]) {
                                insertPos = k;
                                break;
                            }
                        }
                        
                        // Shift elements
                        for (uint256 k = count; k > insertPos; k--) {
                            if (k < _limit) {
                                tempAddresses[k] = tempAddresses[k - 1];
                                tempPoints[k] = tempPoints[k - 1];
                            }
                        }
                        
                        tempAddresses[insertPos] = participant;
                        tempPoints[insertPos] = userPoints;
                        count++;
                    }
                }
            }
        }
        
        // Trim arrays to actual count
        addresses = new address[](count);
        points = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            addresses[i] = tempAddresses[i];
            points[i] = tempPoints[i];
        }
        
        return (addresses, points);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @dev Activate or deactivate a level
     */
    function setLevelStatus(uint256 _levelId, bool _isActive) external onlyOwner {
        require(_levelId > 0 && _levelId <= 3, "Invalid level ID");
        levels[_levelId].isActive = _isActive;
        emit LevelStatusChanged(_levelId, _isActive);
    }
    
    // ============ Internal Functions ============
    
    /**
     * @dev Calculate points for a user's participation in a round
     * @param _stakeAmount Amount user staked
     * @param _isWinner Whether user won the round
     * @param _levelId Level of the round
     * @return points Total points earned
     */
    function _calculateRoundPoints(uint256 _stakeAmount, bool _isWinner, uint256 _levelId) internal view returns (uint256) {
        Level storage level = levels[_levelId];
        
        // Total points for the round based on LEVEL target size
        // Example: Level 1 (0.1 ETH total) -> 100 points "Pizza" pool
        // Formula: targetPoolSize * 1000 / 1 ether
        uint256 totalRoundPoints = (level.targetPoolSize * 1000) / 1 ether;
        
        // Calculate user's share of the "Fair Point Pool"
        // Base Share: (Your Stake / Total Target Pool) * Total Points
        // We multiply by 10 to handle precision before dividing
        uint256 userShare = (_stakeAmount * totalRoundPoints) / (level.targetPoolSize * 2);

        if (_isWinner) {
            // Winners get the main share (80% of round value)
            return (userShare * 16) / 10; // Share * 1.6 (which is 80% of the total 2-side pool)
        } else {
            // Losers get the fair share (20% of round value)
            return (userShare * 4) / 10;  // Share * 0.4 (which is 20% of the total 2-side pool)
        }
    }
    
    /**
     * @dev Award points to all participants in a round
     * @param _roundId Round ID to award points for
     */
    function _awardPoints(uint256 _roundId) internal {
        Round storage round = rounds[_roundId];
        address[] memory participants = roundParticipants[_roundId];
        
        for (uint256 i = 0; i < participants.length; i++) {
            address participant = participants[i];
            Stake storage userStake = userStakes[_roundId][participant];
            
            if (userStake.amount > 0) {
                bool isWinner = userStake.group == round.winningGroup;
                uint256 points = _calculateRoundPoints(userStake.amount, isWinner, round.levelId);
                
                leaderboardPoints[participant] += points;
                emit PointsAwarded(_roundId, participant, points, isWinner);
            }
        }
    }
    
    /**
     * @dev Start the next round for a level
     * @param _levelId Level ID for the new round
     */
    function _startNextRound(uint256 _levelId) internal {
        currentRoundId++;
        rounds[currentRoundId] = Round({
            levelId: _levelId,
            poolA: 0,
            poolB: 0,
            roundStartTime: 0,
            createdAt: 0,
            isActive: true,
            isCompleted: false,
            isCancelled: false,
            winningGroup: 0
        });
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
    
    // Allow contract to receive ETH
    receive() external payable {}
}
