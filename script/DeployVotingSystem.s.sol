// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {VotingSystem} from "../src/VotingSystem.sol";

// Import the real Semaphore contracts
import "../lib/semaphore/packages/contracts/contracts/base/SemaphoreVerifier.sol";

contract DeployVotingSystem is Script {
    // Configuration constants
    uint256 constant GROUP_ID = 1;
    uint256 constant CANDIDATE_COUNT = 3;
    uint256 constant VOTING_DURATION = 24 hours;
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("=== Deploying VotingSystem with Real Semaphore Verifier ===");
        console.log("Deployer address:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Balance:", deployer.balance / 1e18, "ETH");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy the real SemaphoreVerifier first
        console.log("Deploying SemaphoreVerifier...");
        SemaphoreVerifier verifier = new SemaphoreVerifier();
        console.log("SemaphoreVerifier deployed at:", address(verifier));
        
        // Deploy the VotingSystem contract
        console.log("Deploying VotingSystem...");
        VotingSystem votingSystem = new VotingSystem(deployer, address(verifier));
        console.log("VotingSystem deployed at:", address(votingSystem));
        
        // Verify the contract was deployed correctly
        address contractOwner = votingSystem.owner();
        console.log("VotingSystem owner:", contractOwner);
        require(contractOwner == deployer, "Owner mismatch!");
        
        // Initialize voting with default parameters
        uint256 startTime = block.timestamp + 1 hours; // Start in 1 hour
        uint256 endTime = startTime + VOTING_DURATION;
        
        console.log("Initializing voting parameters...");
        votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        
        // Verify initialization
        (uint256 groupId, uint256 start, uint256 end, uint256 candidates, uint256 votes) = votingSystem.getVotingInfo();
        console.log("Voting initialized successfully:");
        console.log("- Group ID:", groupId);
        console.log("- Start time:", start);
        console.log("- End time:", end);
        console.log("- Candidate count:", candidates);
        console.log("- Total votes:", votes);
        
        // Add some example relayer wallets (replace with real ones)
        address[] memory exampleRelayers = getExampleRelayers();
        console.log("Adding example relayers...");
        
        for (uint256 i = 0; i < exampleRelayers.length; i++) {
            if (exampleRelayers[i] != address(0)) {
                votingSystem.addRelayer(exampleRelayers[i]);
                console.log("Added relayer:", exampleRelayers[i]);
            }
        }
        
        vm.stopBroadcast();
        
        // Save deployment information
        saveDeploymentInfo(address(votingSystem), address(verifier), deployer);
        
        console.log("=== Deployment Summary ===");
        console.log("Network Chain ID:", block.chainid);
        console.log("SemaphoreVerifier:", address(verifier));
        console.log("VotingSystem:", address(votingSystem));
        console.log("Owner:", deployer);
        console.log("Voting starts at:", startTime);
        console.log("Voting ends at:", endTime);
        console.log("Total relayers:", votingSystem.getRelayers().length);
        
        if (block.chainid == 11155111) { // Sepolia
            console.log("Sepolia Etherscan URLs:");
            console.log("- Verifier: https://sepolia.etherscan.io/address/%s", address(verifier));
            console.log("- VotingSystem: https://sepolia.etherscan.io/address/%s", address(votingSystem));
        }
        
        console.log("Deployment completed successfully!");
    }
    
    function getExampleRelayers() internal pure returns (address[] memory) {
        // Return some example relayer addresses
        // In production, replace these with your actual organizational wallets
        address[] memory relayers = new address[](3);
        
        // real addresses - replace with real relayer wallets
        relayers[0] = 0xfD2addb8CFfA4e5034a404646C07620BC1Fbb1F4; // Example wallet 1
        relayers[1] = 0xa02EC16Be6589F08C7C9Ef9f95fC295be80a0063; // Example wallet 3
        relayers[3] = 0x292578F7748B55e53D8E6aF54ADd5830db16AfA8;

        return relayers;
    }
    
    function saveDeploymentInfo(address votingSystemAddress, address verifierAddress, address owner) internal {
        string memory json = string(abi.encodePacked(
            '{\n',
            '  "chainId": ', vm.toString(block.chainid), ',\n',
            '  "network": "', getNetworkName(), '",\n', 
            '  "timestamp": ', vm.toString(block.timestamp), ',\n',
            '  "deployer": "', vm.toString(owner), '",\n',
            '  "contracts": {\n',
            '    "semaphoreVerifier": "', vm.toString(verifierAddress), '",\n',
            '    "votingSystem": "', vm.toString(votingSystemAddress), '"\n',
            '  },\n',
            '  "configuration": {\n',
            '    "groupId": ', vm.toString(GROUP_ID), ',\n',
            '    "candidateCount": ', vm.toString(CANDIDATE_COUNT), ',\n',
            '    "votingDuration": ', vm.toString(VOTING_DURATION), '\n',
            '  }\n',
            '}'
        ));
        
        // Create deployments directory if it doesn't exist
        string[] memory cmd = new string[](3);
        cmd[0] = "mkdir";
        cmd[1] = "-p"; 
        cmd[2] = "deployments";
        vm.ffi(cmd);
        
        // Write deployment info
        vm.writeFile("./deployments/latest.json", json);
        
        string memory networkFile = string(abi.encodePacked(
            "./deployments/",
            vm.toString(block.chainid),
            ".json"
        ));
        vm.writeFile(networkFile, json);
        
        console.log("Deployment info saved to deployments/");
    }
    
    function getNetworkName() internal view returns (string memory) {
        if (block.chainid == 1) return "mainnet";
        if (block.chainid == 11155111) return "sepolia";
        if (block.chainid == 137) return "polygon";
        if (block.chainid == 80001) return "mumbai";
        if (block.chainid == 42161) return "arbitrum";
        if (block.chainid == 421614) return "arbitrum-sepolia";
        return "unknown";
    }
}

// Additional management contracts
contract AddRelayers is Script {
    function run() public {
        address votingSystemAddress = vm.envAddress("VOTING_SYSTEM_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        console.log("Adding relayers to VotingSystem at:", votingSystemAddress);
        
        VotingSystem votingSystem = VotingSystem(votingSystemAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Add relayers from command line or environment
        // You can set these as environment variables
        string memory relayersList = vm.envOr("RELAYERS", string(""));
        
        if (bytes(relayersList).length > 0) {
            // Parse comma-separated addresses (you'd need to implement parsing)
            console.log("Relayers list:", relayersList);
            // For now, add individual relayer
            address newRelayer = vm.envOr("NEW_RELAYER", address(0));
            if (newRelayer != address(0)) {
                votingSystem.addRelayer(newRelayer);
                console.log("Added relayer:", newRelayer);
            }
        }
        
        vm.stopBroadcast();
        
        // Display current relayers
        address[] memory currentRelayers = votingSystem.getRelayers();
        console.log("Total relayers:", currentRelayers.length);
        for (uint256 i = 0; i < currentRelayers.length; i++) {
            console.log("Relayer", i + 1, ":", currentRelayers[i]);
        }
    }
}

// //----------------for simple Semaphore verifier.sol -------------------------
// pragma solidity ^0.8.19;

// import {Script, console} from "forge-std/Script.sol";
// import {VotingSystem} from "../src/VotingSystem.sol";
// import {SimpleSemaphoreVerifier} from "../src/SimpleSemaphoreVerifier.sol";

// contract DeployVotingSystem is Script {
//     // Configuration constants
//     uint256 constant GROUP_ID = 1;
//     uint256 constant CANDIDATE_COUNT = 3;
//     uint256 constant VOTING_DURATION = 24 hours;
    
//     function run() public {
//         uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
//         address deployer = vm.addr(deployerPrivateKey);
        
//         console.log("Deploying VotingSystem...");
//         console.log("Deployer address:", deployer);
//         console.log("Chain ID:", block.chainid);
        
//         vm.startBroadcast(deployerPrivateKey);
        
//         // Deploy SimpleSemaphoreVerifier first
//         SimpleSemaphoreVerifier verifier = new SimpleSemaphoreVerifier();
//         console.log("SimpleSemaphoreVerifier deployed at:", address(verifier));
        
//         // Deploy the VotingSystem contract
//         VotingSystem votingSystem = new VotingSystem(deployer, address(verifier));
//         console.log("VotingSystem deployed at:", address(votingSystem));
        
//         // Initialize voting with default parameters
//         uint256 startTime = block.timestamp + 1 hours;
//         uint256 endTime = startTime + VOTING_DURATION;
        
//         votingSystem.initializeVoting(GROUP_ID, startTime, endTime, CANDIDATE_COUNT);
        
//         console.log("Voting initialized:");
//         console.log("- Group ID:", GROUP_ID);
//         console.log("- Start time:", startTime);
//         console.log("- End time:", endTime);
//         console.log("- Candidate count:", CANDIDATE_COUNT);
        
//         vm.stopBroadcast();
        
//         console.log("Deployment completed successfully!");
//         console.log("SimpleSemaphoreVerifier:", address(verifier));
//         console.log("VotingSystem:", address(votingSystem));
//     }
// }