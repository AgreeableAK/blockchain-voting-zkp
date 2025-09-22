// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "lib/semaphore/packages/contracts/contracts/interfaces/ISemaphoreVerifier.sol";
import "lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import "lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";  
import "lib/openzeppelin-contracts/contracts/utils/Pausable.sol";

/**
 * @title VotingSystem
 * @dev Anonymous blockchain voting system using Semaphore ZK proofs
 * @notice Enables gasless, anonymous voting with organizational wallet relayers
 */
contract VotingSystem is Ownable, ReentrancyGuard, Pausable {
    // ============ State Variables ============
    
    ISemaphoreVerifier public immutable semaphoreVerifier;
    
    // Voting configuration
    uint256 public votingGroupId;
    uint256 public votingStartTime;
    uint256 public votingEndTime;
    bool public votingInitialized;
    
    // Vote tracking
    mapping(uint256 => uint256) public voteCounts;  // candidateId => voteCount
    mapping(uint256 => bool) public usedNullifiers; // nullifierHash => used
    uint256 public totalVotes;
    uint256 public candidateCount;
    
    // Organizational wallets (for gasless transactions)
    mapping(address => bool) public authorizedRelayers;
    address[] public relayerAddresses;
    
    // ============ Events ============
    
    event VoteCast(
        uint256 indexed candidateId,
        uint256 indexed nullifierHash,
        address indexed relayer,
        uint256 timestamp
    );
    
    event VotingConfigured(
        uint256 groupId,
        uint256 startTime,
        uint256 endTime,
        uint256 candidateCount
    );
    
    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);
    
    // ============ Errors ============
    
    error VotingNotActive();
    error VotingAlreadyInitialized();
    error InvalidCandidate();
    error NullifierAlreadyUsed();
    error UnauthorizedRelayer();
    error InvalidProof();
    error InvalidTimeRange();
    
    // ============ Modifiers ============
    
    modifier onlyDuringVoting() {
        if (block.timestamp < votingStartTime || block.timestamp > votingEndTime) {
            revert VotingNotActive();
        }
        _;
    }
    
    modifier onlyAuthorizedRelayer() {
        if (!authorizedRelayers[msg.sender]) {
            revert UnauthorizedRelayer();
        }
        _;
    }
    
    // ============ Constructor ============
    
    // constructor(address _semaphoreVerifier){
    //     semaphoreVerifier = ISemaphoreVerifier(_semaphoreVerifier);
    // }
    constructor(address _initialOwner, address _semaphoreVerifier) Ownable(_initialOwner) {
        semaphoreVerifier = ISemaphoreVerifier(_semaphoreVerifier);
    }

    // ============ Admin Functions ============
    
    /**
     * @notice Initialize voting parameters (one-time setup)
     * @param _groupId Semaphore group ID for eligible voters
     * @param _startTime Voting start timestamp
     * @param _endTime Voting end timestamp  
     * @param _candidateCount Number of candidates
     */
    function initializeVoting(
        uint256 _groupId,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _candidateCount
    ) external onlyOwner {
        if (votingInitialized) revert VotingAlreadyInitialized();
        if (_startTime >= _endTime || _startTime < block.timestamp) revert InvalidTimeRange();
        if (_candidateCount == 0) revert InvalidCandidate();
        
        votingGroupId = _groupId;
        votingStartTime = _startTime;
        votingEndTime = _endTime;
        candidateCount = _candidateCount;
        votingInitialized = true;
        
        emit VotingConfigured(_groupId, _startTime, _endTime, _candidateCount);
    }
    
    /**
     * @notice Add organizational wallet as authorized relayer
     * @param _relayer Address of the relayer wallet
     */
    function addRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Invalid relayer address");
        require(!authorizedRelayers[_relayer], "Relayer already exists");
        
        authorizedRelayers[_relayer] = true;
        relayerAddresses.push(_relayer);
        
        emit RelayerAdded(_relayer);
    }
    
    /**
     * @notice Remove relayer authorization
     * @param _relayer Address to remove
     */
    function removeRelayer(address _relayer) external onlyOwner {
        require(authorizedRelayers[_relayer], "Relayer not found");
        
        authorizedRelayers[_relayer] = false;
        
        // Remove from array
        for (uint256 i = 0; i < relayerAddresses.length; i++) {
            if (relayerAddresses[i] == _relayer) {
                relayerAddresses[i] = relayerAddresses[relayerAddresses.length - 1];
                relayerAddresses.pop();
                break;
            }
        }
        
        emit RelayerRemoved(_relayer);
    }
    
    // ============ Core Voting Function ============
        /**
     * @notice Cast anonymous vote using ZK proof
     * @param candidateId ID of chosen candidate (0-indexed)
     * @param nullifierHash Unique nullifier to prevent double voting
     * @param a Semaphore proof part A (uint[2])
     * @param b Semaphore proof part B (uint[2][2])
     * @param c Semaphore proof part C (uint[2])
     * @param publicSignals Array of public signals [signal, nullifierHash, merkleRoot, externalNullifier]
     * @param merkleTreeDepth Depth of the Merkle tree used in the Semaphore group
     * @dev Only callable by authorized relayer wallets during voting period
     */
    function castVote(
        uint256 candidateId,
        uint256 nullifierHash,
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[4] calldata publicSignals,
        uint256 merkleTreeDepth
    )
        external
        nonReentrant
        whenNotPaused
        onlyDuringVoting
        onlyAuthorizedRelayer
    {
        // Validate candidate
        if (candidateId >= candidateCount) revert InvalidCandidate();
        if (candidateId != publicSignals[0]) {
            revert InvalidCandidate();
        }

        // Check nullifier hasn't been used (prevents double voting)
        if (usedNullifiers[nullifierHash]) revert NullifierAlreadyUsed();

        // Verify ZK proof using Semaphore verifier
        // publicSignals should contain:
        // [0] signal (candidateId), 
        // [1] nullifierHash, 
        // [2] merkleRoot, 
        // [3] externalNullifier (usually votingGroupId)
        bool proofValid = semaphoreVerifier.verifyProof(
            a,
            b,
            c,
            publicSignals,
            merkleTreeDepth
        );

        if (!proofValid) revert InvalidProof();

        // Mark nullifier as used to prevent double voting
        usedNullifiers[nullifierHash] = true;

        // Record the vote for the selected candidate
        voteCounts[candidateId]++;
        totalVotes++;

        emit VoteCast(candidateId, nullifierHash, msg.sender, block.timestamp);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get current vote count for a candidate
     * @param candidateId Candidate to query
     * @return Current vote count
     */
    function getVoteCount(uint256 candidateId) external view returns (uint256) {
        return voteCounts[candidateId];
    }
    
    /**
     * @notice Get vote counts for all candidates
     * @return Array of vote counts indexed by candidate ID
     */
    function getAllVoteCounts() external view returns (uint256[] memory) {
        uint256[] memory counts = new uint256[](candidateCount);
        for (uint256 i = 0; i < candidateCount; i++) {
            counts[i] = voteCounts[i];
        }
        return counts;
    }
    
    /**
     * @notice Check if voting is currently active
     * @return True if voting is active
     */
    function isVotingActive() external view returns (bool) {
        return votingInitialized && 
               block.timestamp >= votingStartTime && 
               block.timestamp <= votingEndTime &&
               !paused();
    }
    
        /**
     * @notice Get voting configuration
     * @return groupId The group ID of the voting session
     * @return startTime The start time of the voting session
     * @return endTime The end time of the voting session
     * @return numCandidates The number of candidates in the voting session
     * @return votes The total number of votes cast
     */
    function getVotingInfo() external view returns (
        uint256 groupId,
        uint256 startTime, 
        uint256 endTime,
        uint256 numCandidates,
        uint256 votes
    ) {
        return (votingGroupId, votingStartTime, votingEndTime, candidateCount, totalVotes);
    }

    /**
     * @notice Check if nullifier has been used
     * @param nullifierHash Nullifier to check
     * @return True if already used
     */
    function isNullifierUsed(uint256 nullifierHash) external view returns (bool) {
        return usedNullifiers[nullifierHash];
    }
    
    /**
     * @notice Get all authorized relayers
     * @return Array of relayer addresses
     */
    function getRelayers() external view returns (address[] memory) {
        return relayerAddresses;
    }
    
    // ============ Emergency Functions ============
    
    /**
     * @notice Pause voting in case of emergency
     */
    function pauseVoting() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause voting
     */
    function unpauseVoting() external onlyOwner {
        _unpause();
    }
    
    // ============ Helper Functions ============
    
    /**
     * @notice Get remaining voting time
     * @return Seconds remaining, 0 if voting ended
     */
    function getRemainingTime() external view returns (uint256) {
        if (block.timestamp > votingEndTime) return 0;
        return votingEndTime - block.timestamp;
    }
    
    /**
     * @notice Calculate voting results percentages
     * @return Array of percentages (scaled by 100, e.g., 2550 = 25.50%)
     */
    function getResultPercentages() external view returns (uint256[] memory) {
        uint256[] memory percentages = new uint256[](candidateCount);
        
        if (totalVotes == 0) return percentages;
        
        for (uint256 i = 0; i < candidateCount; i++) {
            percentages[i] = (voteCounts[i] * 10000) / totalVotes; // Scale by 100 for 2 decimals
        }
        
        return percentages;
    }
}