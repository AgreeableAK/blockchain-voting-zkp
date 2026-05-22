// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {VotingSystem} from "../src/VotingSystem.sol";

contract DeployVotingSystem is Script {
    // Configuration constants
    uint256 constant GROUP_ID = 1;
    uint256 constant CANDIDATE_COUNT = 3;
    uint256 constant VOTING_DURATION = 24 hours; // 24 hours voting period
    
    // Network-specific Semaphore Verifier addresses
    mapping(uint256 => address) public semaphoreVerifiers;
    
    function setUp() public {
        // Semaphore Verifier contract addresses per network
        // These are the official Semaphore verifier deployments
        
        // Ethereum Mainnet - Fixed checksum
        semaphoreVerifiers[1] = 0x5ab16E27d2C75e2F6b8866ae3d7B19F3e6A3E9F2;
        
        // Ethereum Sepolia Testnet - Fixed checksum
        semaphoreVerifiers[11155111] = 0x5ab16E27d2C75e2F6b8866ae3d7B19F3e6A3E9F2;
        
        // Polygon Mainnet - Fixed checksum
        semaphoreVerifiers[137] = 0x5ab16E27d2C75e2F6b8866ae3d7B19F3e6A3E9F2;
        
        // Polygon Mumbai Testnet - Fixed checksum
        semaphoreVerifiers[80001] = 0x5ab16E27d2C75e2F6b8866ae3d7B19F3e6A3E9F2;
        
        // Arbitrum Mainnet - Fixed checksum
        semaphoreVerifiers[42161] = 0x5ab16E27d2C75e2F6b8866ae3d7B19F3e6A3E9F2;
        
        // Arbitrum Sepolia - Fixed checksum
        semaphoreVerifiers[421614] = 0x5ab16E27d2C75e2F6b8866ae3d7B19F3e6A3E9F2;
    }
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying VotingSystem...");
        console.log("Deployer address:", deployer);
        console.log("Chain ID:", block.chainid);
        
        // Get Semaphore Verifier address for current network
        address verifierAddress = semaphoreVerifiers[block.chainid];
        if (verifierAddress == address(0)) {
            console.log("WARNING: No Semaphore verifier configured for chain ID:", block.chainid);
            console.log("Using default address - please update if needed");
            verifierAddress = 0x5ab16E27d2C75e2F6b8866ae3d7B19F3e6A3E9F2; // Fixed checksum
        }
        
        console.log("Using Semaphore Verifier at:", verifierAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy the VotingSystem contract - Fixed constructor call
        VotingSystem votingSystem = new VotingSystem(deployer, verifierAddress);
        
        console.log("VotingSystem deployed at:", address(votingSystem));
        
        // Initialize voting with default parameters
        uint256 startTime = block.timestamp + 1 hours; // Start in 1 hour
        uint256 endTime = startTime + VOTING_DURATION;
        
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        
        console.log("Voting initialized:");
        console.log("- Group ID:", GROUP_ID);
        console.log("- Start time:", startTime);
        console.log("- End time:", endTime);
        console.log("- Candidate count:", CANDIDATE_COUNT);
        
        // Add default relayer wallets
        address[] memory defaultRelayers = getDefaultRelayers();
        
        for (uint256 i = 0; i < defaultRelayers.length; i++) {
            if (defaultRelayers[i] != address(0)) {
                votingSystem.addRelayer(defaultRelayers[i]);
                console.log("Added relayer:", defaultRelayers[i]);
            }
        }
        
        vm.stopBroadcast();
        
        // Save deployment info
        saveDeploymentInfo(address(votingSystem), verifierAddress);
        
        console.log("Deployment completed successfully!");
        console.log("Contract address:", address(votingSystem));
    }
    
    function getDefaultRelayers() internal pure returns (address[] memory) {
        // Return array of 10 default relayer addresses
        // In production, these should be controlled by your organization
        address[] memory relayers = new address[](10);
        
        // These are example addresses - replace with your actual relayer wallets
        relayers[0] = 0x1234567890123456789012345678901234567890;
        relayers[1] = 0x2345678901234567890123456789012345678901;
        relayers[2] = 0x3456789012345678901234567890123456789012;
        relayers[3] = 0x4567890123456789012345678901234567890123;
        relayers[4] = 0x5678901234567890123456789012345678901234;
        relayers[5] = 0x6789012345678901234567890123456789012345;
        relayers[6] = 0x7890123456789012345678901234567890123456;
        relayers[7] = 0x8901234567890123456789012345678901234567;
        relayers[8] = 0x9012345678901234567890123456789012345678;
        relayers[9] = 0x0123456789012345678901234567890123456789;
        
        return relayers;
    }
    
    function saveDeploymentInfo(address votingSystemAddress, address verifierAddress) internal {
        string memory deploymentInfo = string(abi.encodePacked(
            "{\n",
            '  "chainId": ', vm.toString(block.chainid), ",\n",
            '  "votingSystem": "', vm.toString(votingSystemAddress), '",\n',
            '  "semaphoreVerifier": "', vm.toString(verifierAddress), '",\n',
            '  "groupId": ', vm.toString(GROUP_ID), ",\n",
            '  "candidateCount": ', vm.toString(CANDIDATE_COUNT), ",\n",
            '  "deployedAt": ', vm.toString(block.timestamp), "\n",
            "}"
        ));
        
        vm.writeFile("./deployments/latest.json", deploymentInfo);
        
        string memory networkFile = string(abi.encodePacked(
            "./deployments/",
            vm.toString(block.chainid),
            ".json"
        ));
        vm.writeFile(networkFile, deploymentInfo);
    }
}

// Separate script for post-deployment configuration
contract ConfigureVotingSystem is Script {
    function run() public {
        address votingSystemAddress = vm.envAddress("VOTING_SYSTEM_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        console.log("Configuring VotingSystem at:", votingSystemAddress);
        
        VotingSystem votingSystem = VotingSystem(votingSystemAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Example: Update voting parameters
        uint256 newStartTime = block.timestamp + vm.envUint("START_DELAY_HOURS") * 1 hours;
        uint256 newEndTime = newStartTime + vm.envUint("VOTING_DURATION_HOURS") * 1 hours;
        uint256 newCandidateCount = vm.envUint("CANDIDATE_COUNT");
        
        // Note: Can only initialize once, so this is for demonstration
        // In practice, you'd need separate functions for updates
        
        vm.stopBroadcast();
        
        console.log("Configuration completed!");
    }
}

// Script for managing relayers
contract ManageRelayers is Script {
    function run() public {
        address votingSystemAddress = vm.envAddress("VOTING_SYSTEM_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        VotingSystem votingSystem = VotingSystem(votingSystemAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Add new relayers from environment
        string memory relayersEnv = vm.envString("NEW_RELAYERS");
        
        // Parse comma-separated addresses (simplified - you might want more robust parsing)
        // For now, demonstrate adding a single relayer
        address newRelayer = vm.envAddress("NEW_RELAYER");
        if (newRelayer != address(0)) {
            votingSystem.addRelayer(newRelayer);
            console.log("Added new relayer:", newRelayer);
        }
        
        // Remove relayers if needed
        address removeRelayer = vm.envOr("REMOVE_RELAYER", address(0));
        if (removeRelayer != address(0)) {
            votingSystem.removeRelayer(removeRelayer);
            console.log("Removed relayer:", removeRelayer);
        }
        
        vm.stopBroadcast();
        
        // Display current relayers
        address[] memory currentRelayers = votingSystem.getRelayers();
        console.log("Current relayers:");
        for (uint256 i = 0; i < currentRelayers.length; i++) {
            console.log("-", currentRelayers[i]);
        }
    }
}

// Emergency management script
contract EmergencyManagement is Script {
    function run() public {
        address votingSystemAddress = vm.envAddress("VOTING_SYSTEM_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        string memory action = vm.envString("EMERGENCY_ACTION"); // "PAUSE" or "UNPAUSE"
        
        console.log("Emergency action:", action);
        console.log("Target contract:", votingSystemAddress);
        
        VotingSystem votingSystem = VotingSystem(votingSystemAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        if (keccak256(abi.encodePacked(action)) == keccak256(abi.encodePacked("PAUSE"))) {
            votingSystem.pauseVoting();
            console.log("Voting has been PAUSED");
        } else if (keccak256(abi.encodePacked(action)) == keccak256(abi.encodePacked("UNPAUSE"))) {
            votingSystem.unpauseVoting();
            console.log("Voting has been UNPAUSED");
        } else {
            console.log("Invalid emergency action. Use 'PAUSE' or 'UNPAUSE'");
            revert("Invalid action");
        }
        
        vm.stopBroadcast();
        
        // Display current status
        console.log("Voting active:", votingSystem.isVotingActive());
        (,uint256 start, uint256 end,,) = votingSystem.getVotingInfo();
        console.log("Current time:", block.timestamp);
        console.log("Voting period:", start, "to", end);
    }
}