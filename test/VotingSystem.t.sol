// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test, console} from "forge-std/Test.sol";
import {VotingSystem} from "../src/VotingSystem.sol";
import { Pausable } from "lib/openzeppelin-contracts/contracts/utils/Pausable.sol";

// Mock Semaphore Verifier for testing
contract MockSemaphoreVerifier {
    bool public shouldReturnTrue = true;
    
    // Updated to match the interface used in VotingSystem
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[4] calldata publicSignals,
        uint256 merkleTreeDepth
    ) external view returns (bool) {
        return shouldReturnTrue;
    }
    
    function setShouldReturnTrue(bool _value) external {
        shouldReturnTrue = _value;
    }
}

contract VotingSystemTest is Test {
    VotingSystem public votingSystem;
    MockSemaphoreVerifier public mockVerifier;
    
    // Test accounts
    address public owner;
    address public relayer1;
    address public relayer2;
    address public relayer3;
    address public unauthorized;
    
    // Test constants
    uint256 constant GROUP_ID = 1;
    uint256 constant CANDIDATE_COUNT = 3;
    uint256 constant VOTING_DURATION = 3600; // 1 hour
    
    // Test data
    uint256 startTime;
    uint256 endTime;
    
    function setUp() public {
        // Setup test accounts
        owner = address(this);
        relayer1 = makeAddr("relayer1");
        relayer2 = makeAddr("relayer2");
        relayer3 = makeAddr("relayer3");
        unauthorized = makeAddr("unauthorized");
        
        // Deploy mock verifier
        mockVerifier = new MockSemaphoreVerifier();
        
        // Deploy voting system with correct constructor parameters
        votingSystem = new VotingSystem(owner, address(mockVerifier));
        
        // Setup voting times
        startTime = block.timestamp + 100;
        endTime = startTime + VOTING_DURATION;
    }
    
    // Helper function to create mock proof parameters
    function createMockProofParams() internal pure returns (
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[4] memory publicSignals,
        uint256 merkleTreeDepth
    ) {
        a = [uint256(1), uint256(2)];
        b = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
        c = [uint256(7), uint256(8)];
        publicSignals = [uint256(0), uint256(12345), uint256(999), GROUP_ID]; // signal, nullifier, merkleRoot, externalNullifier
        merkleTreeDepth = 20;
    }
    
    // ============ Initialization Tests ============
    
    function testInitializeVoting() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        
        (uint256 groupId, uint256 start, uint256 end, uint256 candidates, uint256 votes) = 
            votingSystem.getVotingInfo();
            
        assertEq(groupId, GROUP_ID);
        assertEq(start, startTime);
        assertEq(end, endTime);
        assertEq(candidates, CANDIDATE_COUNT);
        assertEq(votes, 0);
        assertTrue(votingSystem.votingInitialized());
    }
    
    function testInitializeVotingOnlyOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
    }
    
    function testCannotReinitializeVoting() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        
        vm.expectRevert(VotingSystem.VotingAlreadyInitialized.selector);
        votingSystem.initializeVoting(GROUP_ID, startTime + 1000, endTime + 1000, CANDIDATE_COUNT);
    }
    
    function testInitializeVotingInvalidTimeRange() public {
        // Use explicit values to make the test more predictable
        uint256 currentTime = block.timestamp;
        uint256 futureStart = currentTime + 1000;
        uint256 futureEnd = futureStart + 3600;
        
        console.log("currentTime:", currentTime);
        console.log("futureStart:", futureStart);
        console.log("futureEnd:", futureEnd);
        
        // Test: end time before start time (this should definitely revert)
        vm.expectRevert(VotingSystem.InvalidTimeRange.selector);
        votingSystem.initializeVoting(GROUP_ID, futureEnd, futureStart, CANDIDATE_COUNT); // swapped: start > end
    }
    
    function testInitializeVotingStartTimeInPast() public {
        vm.warp(1000); // set block.timestamp to 1000

        uint256 currentTime = block.timestamp; // 1000
        uint256 pastTime = currentTime - 100;  // 900
        uint256 futureEnd = currentTime + 3600; // 4600
        
        console.log("pastTime:", pastTime);
        console.log("currentTime:", currentTime);
        console.log("futureEnd:", futureEnd);
        
        // Test: start time in the past
        vm.expectRevert(VotingSystem.InvalidTimeRange.selector);
        votingSystem.initializeVoting(GROUP_ID, pastTime, futureEnd, CANDIDATE_COUNT);
    }
    
    function testInitializeVotingZeroCandidates() public {
        vm.expectRevert(VotingSystem.InvalidCandidate.selector);
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, 0);
    }
    
    // ============ Relayer Management Tests ============
    
    function testAddRelayer() public {
        votingSystem.addRelayer(relayer1);
        
        assertTrue(votingSystem.authorizedRelayers(relayer1));
        address[] memory relayers = votingSystem.getRelayers();
        assertEq(relayers.length, 1);
        assertEq(relayers[0], relayer1);
    }
    
    function testAddMultipleRelayers() public {
        votingSystem.addRelayer(relayer1);
        votingSystem.addRelayer(relayer2);
        votingSystem.addRelayer(relayer3);
        
        address[] memory relayers = votingSystem.getRelayers();
        assertEq(relayers.length, 3);
        assertTrue(votingSystem.authorizedRelayers(relayer1));
        assertTrue(votingSystem.authorizedRelayers(relayer2));
        assertTrue(votingSystem.authorizedRelayers(relayer3));
    }
    
    function testAddRelayerOnlyOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        votingSystem.addRelayer(relayer1);
    }
    
    function testCannotAddZeroAddress() public {
        vm.expectRevert("Invalid relayer address");
        votingSystem.addRelayer(address(0));
    }
    
    function testCannotAddDuplicateRelayer() public {
        votingSystem.addRelayer(relayer1);
        
        vm.expectRevert("Relayer already exists");
        votingSystem.addRelayer(relayer1);
    }
    
    function testRemoveRelayer() public {
        votingSystem.addRelayer(relayer1);
        votingSystem.addRelayer(relayer2);
        
        votingSystem.removeRelayer(relayer1);
        
        assertFalse(votingSystem.authorizedRelayers(relayer1));
        assertTrue(votingSystem.authorizedRelayers(relayer2));
        
        address[] memory relayers = votingSystem.getRelayers();
        assertEq(relayers.length, 1);
        assertEq(relayers[0], relayer2);
    }
    
    function testRemoveNonexistentRelayer() public {
        vm.expectRevert("Relayer not found");
        votingSystem.removeRelayer(relayer1);
    }
    
    // ============ Voting Tests ============
    
    function testCastVoteSuccess() public {
        // Setup
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        
        // Warp to voting period
        vm.warp(startTime + 1);
        
        // Cast vote with correct parameters
        uint256 candidateId = 0;
        uint256 nullifierHash = 12345;
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        publicSignals[0] = candidateId; // signal should match candidateId
        publicSignals[1] = nullifierHash; // nullifier
        
        vm.prank(relayer1);
        vm.expectEmit(true, true, true, true);
        emit VotingSystem.VoteCast(candidateId, nullifierHash, relayer1, block.timestamp);
        votingSystem.castVote(candidateId, nullifierHash, a, b, c, publicSignals, merkleTreeDepth);
        
        // Verify results
        assertEq(votingSystem.getVoteCount(candidateId), 1);
        assertEq(votingSystem.totalVotes(), 1);
        assertTrue(votingSystem.isNullifierUsed(nullifierHash));
    }
    
    function testCastVoteOnlyDuringVotingPeriod() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        
        uint256 candidateId = 0;
        uint256 nullifierHash = 12345;
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        publicSignals[0] = candidateId;
        publicSignals[1] = nullifierHash;
        
        // Before voting starts
        vm.warp(startTime - 1);
        vm.prank(relayer1);
        vm.expectRevert(VotingSystem.VotingNotActive.selector);
        votingSystem.castVote(candidateId, nullifierHash, a, b, c, publicSignals, merkleTreeDepth);
        
        // After voting ends
        vm.warp(endTime + 1);
        vm.prank(relayer1);
        vm.expectRevert(VotingSystem.VotingNotActive.selector);
        votingSystem.castVote(candidateId, nullifierHash, a, b, c, publicSignals, merkleTreeDepth);
    }
    
    function testCastVoteOnlyAuthorizedRelayer() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        vm.warp(startTime + 1);
        
        uint256 candidateId = 0;
        uint256 nullifierHash = 12345;
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        publicSignals[0] = candidateId;
        publicSignals[1] = nullifierHash;
        
        vm.prank(unauthorized);
        vm.expectRevert(VotingSystem.UnauthorizedRelayer.selector);
        votingSystem.castVote(candidateId, nullifierHash, a, b, c, publicSignals, merkleTreeDepth);
    }
    
    function testCastVoteInvalidCandidate() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        vm.warp(startTime + 1);
        
        uint256 invalidCandidateId = CANDIDATE_COUNT; // Out of bounds
        uint256 nullifierHash = 12345;
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        publicSignals[0] = invalidCandidateId;
        publicSignals[1] = nullifierHash;
        
        vm.prank(relayer1);
        vm.expectRevert(VotingSystem.InvalidCandidate.selector);
        votingSystem.castVote(invalidCandidateId, nullifierHash, a, b, c, publicSignals, merkleTreeDepth);
    }
    
    function testCannotVoteWithSameNullifier() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        vm.warp(startTime + 1);
        
        uint256 candidateId = 0;
        uint256 nullifierHash = 12345;
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        publicSignals[0] = candidateId;
        publicSignals[1] = nullifierHash;
        
        // First vote
        vm.prank(relayer1);
        votingSystem.castVote(candidateId, nullifierHash, a, b, c, publicSignals, merkleTreeDepth);
        
        // Try to vote again with same nullifier
        vm.prank(relayer1);
        vm.expectRevert(VotingSystem.NullifierAlreadyUsed.selector);
        votingSystem.castVote(candidateId, nullifierHash, a, b, c, publicSignals, merkleTreeDepth);
    }
    
    function testCastVoteInvalidProof() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        vm.warp(startTime + 1);
        
        // Make mock verifier return false
        mockVerifier.setShouldReturnTrue(false);
        
        uint256 candidateId = 0;
        uint256 nullifierHash = 12345;
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        publicSignals[0] = candidateId;
        publicSignals[1] = nullifierHash;
        
        vm.prank(relayer1);
        vm.expectRevert(VotingSystem.InvalidProof.selector);
        votingSystem.castVote(candidateId, nullifierHash, a, b, c, publicSignals, merkleTreeDepth);
    }
    
    function testMultipleVotesFromDifferentRelayers() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        votingSystem.addRelayer(relayer2);
        vm.warp(startTime + 1);
        
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        
        // Vote from relayer1
        publicSignals[0] = 0; // candidateId
        publicSignals[1] = 11111; // nullifier
        vm.prank(relayer1);
        votingSystem.castVote(0, 11111, a, b, c, publicSignals, merkleTreeDepth);
        
        // Vote from relayer2  
        publicSignals[0] = 1; // candidateId
        publicSignals[1] = 22222; // nullifier
        vm.prank(relayer2);
        votingSystem.castVote(1, 22222, a, b, c, publicSignals, merkleTreeDepth);
        
        assertEq(votingSystem.getVoteCount(0), 1);
        assertEq(votingSystem.getVoteCount(1), 1);
        assertEq(votingSystem.totalVotes(), 2);
    }
    
    // ============ View Function Tests ============
    
    function testGetAllVoteCounts() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        vm.warp(startTime + 1);
        
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        
        // Cast some votes
        vm.startPrank(relayer1);
        
        // Vote 1 for candidate 0
        publicSignals[0] = 0;
        publicSignals[1] = 11111;
        votingSystem.castVote(0, 11111, a, b, c, publicSignals, merkleTreeDepth);
        
        // Vote 2 for candidate 0
        publicSignals[0] = 0;
        publicSignals[1] = 22222;
        votingSystem.castVote(0, 22222, a, b, c, publicSignals, merkleTreeDepth);
        
        // Vote 1 for candidate 1
        publicSignals[0] = 1;
        publicSignals[1] = 33333;
        votingSystem.castVote(1, 33333, a, b, c, publicSignals, merkleTreeDepth);
        
        vm.stopPrank();
        
        uint256[] memory counts = votingSystem.getAllVoteCounts();
        assertEq(counts.length, CANDIDATE_COUNT);
        assertEq(counts[0], 2);
        assertEq(counts[1], 1);
        assertEq(counts[2], 0);
    }
    
    function testIsVotingActive() public {
        // Before initialization
        assertFalse(votingSystem.isVotingActive());
        
        // After initialization but before start
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        assertFalse(votingSystem.isVotingActive());
        
        // During voting
        vm.warp(startTime + 1);
        assertTrue(votingSystem.isVotingActive());
        
        // After voting ends
        vm.warp(endTime + 1);
        assertFalse(votingSystem.isVotingActive());
    }
    
    function testGetRemainingTime() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        
        vm.warp(startTime + 100);
        assertEq(votingSystem.getRemainingTime(), VOTING_DURATION - 100);
        
        vm.warp(endTime + 1);
        assertEq(votingSystem.getRemainingTime(), 0);
    }
    
    function testGetResultPercentages() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        vm.warp(startTime + 1);
        
        // No votes yet
        uint256[] memory percentages = votingSystem.getResultPercentages();
        for (uint256 i = 0; i < CANDIDATE_COUNT; i++) {
            assertEq(percentages[i], 0);
        }
        
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        
        // Cast 10 votes: 6 for candidate 0, 3 for candidate 1, 1 for candidate 2
        vm.startPrank(relayer1);
        for (uint256 i = 1; i <= 6; i++) {
            publicSignals[0] = 0; // candidate 0
            publicSignals[1] = i; // unique nullifier
            votingSystem.castVote(0, i, a, b, c, publicSignals, merkleTreeDepth);
        }
        for (uint256 i = 7; i <= 9; i++) {
            publicSignals[0] = 1; // candidate 1
            publicSignals[1] = i; // unique nullifier
            votingSystem.castVote(1, i, a, b, c, publicSignals, merkleTreeDepth);
        }
        publicSignals[0] = 2; // candidate 2
        publicSignals[1] = 10; // unique nullifier
        votingSystem.castVote(2, 10, a, b, c, publicSignals, merkleTreeDepth);
        vm.stopPrank();
        
        percentages = votingSystem.getResultPercentages();
        assertEq(percentages[0], 6000); // 60.00%
        assertEq(percentages[1], 3000); // 30.00%
        assertEq(percentages[2], 1000); // 10.00%
    }
    
    // ============ Pause/Unpause Tests ============
    
    function testPauseVoting() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        vm.warp(startTime + 1);
        
        votingSystem.pauseVoting();
        assertFalse(votingSystem.isVotingActive());
        
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        publicSignals[0] = 0;
        publicSignals[1] = 12345;
        
        vm.prank(relayer1);
        // The error message in newer OpenZeppelin versions is "EnforcedPause"
        vm.expectRevert(Pausable.EnforcedPause.selector);
        votingSystem.castVote(0, 12345, a, b, c, publicSignals, merkleTreeDepth);
    }
    
    function testUnpauseVoting() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        vm.warp(startTime + 1);
        
        votingSystem.pauseVoting();
        votingSystem.unpauseVoting();
        assertTrue(votingSystem.isVotingActive());
        
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        publicSignals[0] = 0;
        publicSignals[1] = 12345;
        
        vm.prank(relayer1);
        votingSystem.castVote(0, 12345, a, b, c, publicSignals, merkleTreeDepth); // Should succeed
    }
    
    // ============ Gas Tests ============
    
    function testVoteGasUsage() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        vm.warp(startTime + 1);
        
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        publicSignals[0] = 0;
        publicSignals[1] = 12345;
        
        vm.prank(relayer1);
        uint256 gasBefore = gasleft();
        votingSystem.castVote(0, 12345, a, b, c, publicSignals, merkleTreeDepth);
        uint256 gasUsed = gasBefore - gasleft();
        
        console.log("Gas used for castVote:", gasUsed);
        // Should be reasonable for a ZK voting operation
        assertTrue(gasUsed < 200000);
    }
    
    // ============ Fuzz Tests ============
    
    function testFuzzCastVote(uint8 candidateId, uint256 nullifierHash) public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        vm.warp(startTime + 1);
        
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        publicSignals[0] = candidateId;
        publicSignals[1] = nullifierHash;
        
        vm.prank(relayer1);
        if (candidateId >= CANDIDATE_COUNT) {
            vm.expectRevert(VotingSystem.InvalidCandidate.selector);
            votingSystem.castVote(candidateId, nullifierHash, a, b, c, publicSignals, merkleTreeDepth);
        } else {
            votingSystem.castVote(candidateId, nullifierHash, a, b, c, publicSignals, merkleTreeDepth);
            assertEq(votingSystem.getVoteCount(candidateId), 1);
        }
    }
    
    // ============ Integration Tests ============
    
    function testCompleteVotingFlow() public {
        // 1. Initialize voting
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        
        // 2. Add relayers
        votingSystem.addRelayer(relayer1);
        votingSystem.addRelayer(relayer2);
        
        // 3. Start voting
        vm.warp(startTime + 1);
        assertTrue(votingSystem.isVotingActive());
        
        // 4. Cast multiple votes
        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        
        vm.prank(relayer1);
        publicSignals[0] = 0;
        publicSignals[1] = 1001;
        votingSystem.castVote(0, 1001, a, b, c, publicSignals, merkleTreeDepth);
        
        vm.prank(relayer2);
        publicSignals[0] = 1;
        publicSignals[1] = 1002;
        votingSystem.castVote(1, 1002, a, b, c, publicSignals, merkleTreeDepth);
        
        vm.prank(relayer1);
        publicSignals[0] = 0;
        publicSignals[1] = 1003;
        votingSystem.castVote(0, 1003, a, b, c, publicSignals, merkleTreeDepth);
        
        // 5. Check results during voting
        assertEq(votingSystem.getVoteCount(0), 2);
        assertEq(votingSystem.getVoteCount(1), 1);
        assertEq(votingSystem.totalVotes(), 3);
        
        // 6. End voting
        vm.warp(endTime + 1);
        assertFalse(votingSystem.isVotingActive());
        
        // 7. Final results
        uint256[] memory finalCounts = votingSystem.getAllVoteCounts();
        assertEq(finalCounts[0], 2);
        assertEq(finalCounts[1], 1);
        assertEq(finalCounts[2], 0);
    }

// ============ Negative Tests ============
    function testUnpauseWithoutPause() public {
        vm.expectRevert();
        votingSystem.unpauseVoting();
    }

    function testPauseOnlyOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        votingSystem.pauseVoting();
    }

    function testUnpauseOnlyOwner() public {
        votingSystem.pauseVoting();
        vm.prank(unauthorized);
        vm.expectRevert();
        votingSystem.unpauseVoting();
    }

    function testRemoveRelayerOnlyOwner() public {
        votingSystem.addRelayer(relayer1);
        vm.prank(unauthorized);
        vm.expectRevert();
        votingSystem.removeRelayer(relayer1);
    }

    function testVoteWithoutInitialization() public {
        uint[2] memory a = [uint256(1), uint256(2)];
        uint[2][2] memory b = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
        uint[2] memory c = [uint256(7), uint256(8)];
        uint[4] memory publicSignals = [uint256(0), uint256(12345), uint256(999), GROUP_ID];
        uint256 merkleTreeDepth = 20;

        vm.expectRevert();
        votingSystem.castVote(0, 12345, a, b, c, publicSignals, merkleTreeDepth);
    }

    function testVoteCandidateIdMismatchWithSignal() public {
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        votingSystem.addRelayer(relayer1);
        vm.warp(startTime + 1);

        (uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory publicSignals, uint256 merkleTreeDepth) = createMockProofParams();
        publicSignals[0] = 0; // signal = 0
        vm.prank(relayer1);
        vm.expectRevert();
        votingSystem.castVote(1, 12345, a, b, c, publicSignals, merkleTreeDepth); // candidateId=1 mismatches signal=0
    }

}