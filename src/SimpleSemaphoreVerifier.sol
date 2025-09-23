// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "lib/semaphore/packages/contracts/contracts/interfaces/ISemaphoreVerifier.sol";

/**
 * @title SimpleSemaphoreVerifier
 * @dev A simplified Semaphore verifier for testing purposes
 * @notice This verifier always returns true - use only for development/testing!
 */
contract SimpleSemaphoreVerifier is ISemaphoreVerifier {
    /**
     * @notice Verifies a Semaphore proof (simplified for testing)
     * @dev This is a mock implementation that always returns true
     * @param a Part of the proof
     * @param b Part of the proof  
     * @param c Part of the proof
     * @param publicSignals Public signals for the proof [signal, nullifierHash, merkleRoot, externalNullifier]
     * @param merkleTreeDepth Depth of the Merkle tree
     * @return Always returns true for testing purposes
     */
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b, 
        uint[2] calldata c,
        uint[4] calldata publicSignals,
        uint256 merkleTreeDepth
    ) external pure override returns (bool) {
        // Basic input validation
        require(publicSignals.length == 4, "Invalid public signals length");
        require(merkleTreeDepth > 0 && merkleTreeDepth <= 32, "Invalid merkle tree depth");
        require(a.length == 2, "Invalid proof component a");
        require(b.length == 2, "Invalid proof component b");
        require(c.length == 2, "Invalid proof component c");
        
        // For testing purposes, always return true
        // In production, replace this with actual zk-SNARK verification logic
        return true;
    }
    
    /**
     * @notice Get verifier information
     * @return A string indicating this is a test verifier
     */
    function getVerifierInfo() external pure returns (string memory) {
        return "SimpleSemaphoreVerifier v1.0 - FOR TESTING ONLY";
    }
}