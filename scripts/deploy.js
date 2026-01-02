import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Deploy VotingSystem contract to testnet
 */

// Network configurations
const NETWORKS = {
    goerli: {
        name: 'Goerli Testnet',
        rpcUrl: process.env.GOERLI_RPC_URL || 'https://goerli.infura.io/v3/YOUR_KEY',
        chainId: 5,
        explorerUrl: 'https://goerli.etherscan.io'
    },
    sepolia: {
        name: 'Sepolia Testnet', 
        rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_KEY',
        chainId: 11155111,
        explorerUrl: 'https://sepolia.etherscan.io'
    },
    mumbai: {
        name: 'Polygon Mumbai',
        rpcUrl: process.env.MUMBAI_RPC_URL || 'https://rpc-mumbai.maticvigil.com/',
        chainId: 80001,
        explorerUrl: 'https://mumbai.polygonscan.com'
    },
    localhost: {
        name: 'Localhost',
        rpcUrl: 'http://127.0.0.1:8545',
        chainId: 31337,
        explorerUrl: null
    }
};

/**
 * Load contract ABI and bytecode from Foundry artifacts
 */
function loadContractArtifacts(contractName) {
    try {
        const artifactPath = path.join(__dirname, '../out', contractName + '.sol', contractName + '.json');
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        
        return {
            abi: artifact.abi,
            bytecode: artifact.bytecode.object,
            metadata: artifact.metadata
        };
    } catch (error) {
        console.error(`❌ Error loading contract artifacts for ${contractName}:`, error.message);
        console.log('💡 Make sure you ran: forge build');
        return null;
    }
}

/**
 * Deploy Semaphore Verifier (always deploy our own)
 */
async function deploySemaphoreVerifier(deployer, networkName) {
    console.log('🚀 Deploying our own Semaphore Verifier...');
    
    // Load Semaphore Verifier from artifacts
    // Note: The actual verifier contract might be in the base folder
    let verifierArtifacts = loadContractArtifacts('SemaphoreVerifier');
    
    // If not found, try looking for it in a different structure
    if (!verifierArtifacts) {
        console.log('⚠️  SemaphoreVerifier artifacts not found in standard location');
        console.log('💡 You may need to copy the SemaphoreVerifier contract to your src/ folder');
        throw new Error('SemaphoreVerifier artifacts not found. Please copy lib/semaphore/packages/contracts/contracts/base/SemaphoreVerifier.sol to src/SemaphoreVerifier.sol and run: forge build');
    }
    
    const factory = new ethers.ContractFactory(
        verifierArtifacts.abi,
        verifierArtifacts.bytecode,
        deployer
    );
    
    console.log('⏳ Deploying verifier (this may take a moment)...');
    const verifier = await factory.deploy();
    await verifier.waitForDeployment();
    
    const verifierAddress = await verifier.getAddress();
    console.log(`✅ Semaphore Verifier deployed: ${verifierAddress}`);
    
    return verifierAddress;
}

/**
 * Deploy VotingSystem contract
 */
async function deployVotingSystem(deployer, semaphoreVerifierAddress, networkName) {
    console.log('🗳️  Deploying VotingSystem contract...');
    
    const votingArtifacts = loadContractArtifacts('VotingSystem');
    if (!votingArtifacts) {
        throw new Error('VotingSystem artifacts not found');
    }
    
    const factory = new ethers.ContractFactory(
        votingArtifacts.abi,
        votingArtifacts.bytecode,
        deployer
    );
    
    // Deploy with initial owner (deployer address) and Semaphore verifier address
    console.log('⏳ Deploying VotingSystem...');
    const votingSystem = await factory.deploy(deployer.address, semaphoreVerifierAddress);
    await votingSystem.waitForDeployment();
    
    const votingAddress = await votingSystem.getAddress();
    console.log(`✅ VotingSystem deployed: ${votingAddress}`);
    
    // Verify contract owner
    const owner = await votingSystem.owner();
    console.log(`👤 Contract owner: ${owner}`);
    
    // --- Initialize voting (optional) ---
    // Use environment override or sensible defaults
    const now = Math.floor(Date.now() / 1000);
    const initGroupId = process.env.INITIAL_GROUP_ID ? parseInt(process.env.INITIAL_GROUP_ID) : 12345;
    const initStart = now + 60; // start in 1 minute
    const initEnd = now + 10 * 24 * 60 * 60; // end in 10 days

    let votingInitialized = false;
    let votingInitTxHash = null;
    try {
        console.log('⏳ Initializing voting parameters...');
        const initTx = await votingSystem.initializeVoting(
            initGroupId,
            initStart,
            initEnd,
            3
        );
        const initReceipt = await initTx.wait();
        votingInitialized = true;
        votingInitTxHash = initReceipt.transactionHash || initTx.hash;
        console.log(`✅ Voting initialized: group ${initGroupId}, start ${initStart}, end ${initEnd}`);
    } catch (err) {
        console.warn('⚠️  Failed to initialize voting (continuing):', err.message || err);
    }

    // --- Add relayers from wallets/dev file if present ---
    const relayersAdded = [];
    try {
        const walletsPath = path.join(__dirname, '..', 'wallets', 'wallets-dev-only.json');
        if (fs.existsSync(walletsPath)) {
            const walletsList = JSON.parse(fs.readFileSync(walletsPath, 'utf8'));
            for (const w of walletsList) {
                try {
                    console.log(`➕ Adding relayer ${w.address}...`);
                    const tx = await votingSystem.addRelayer(w.address);
                    const receipt = await tx.wait();
                    relayersAdded.push({ address: w.address, txHash: receipt.transactionHash || tx.hash });
                    console.log(`   ✅ Relayer added: ${w.address}`);
                } catch (innerErr) {
                    console.warn(`   ⚠️ Skipped relayer ${w.address}:`, innerErr.message || innerErr);
                }
            }
        } else {
            console.log('ℹ️  No dev wallets file found, skipping relayer addition');
        }
    } catch (err) {
        console.warn('⚠️  Error while adding relayers (continuing):', err.message || err);
    }

    return {
        contract: votingSystem,
        address: votingAddress,
        abi: votingArtifacts.abi,
        votingInitialized,
        votingInitTxHash,
        relayersAdded
    };
}

/**
 * Save deployment information
 */
function saveDeploymentInfo(networkName, deploymentData) {
    const deploymentsDir = path.join(__dirname, '../deployments');
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentsDir, `${networkName}.json`);
    
    const info = {
        network: networkName,
        chainId: deploymentData.chainId,
        timestamp: new Date().toISOString(),
        deployer: deploymentData.deployer,
        contracts: {
            semaphoreVerifier: deploymentData.semaphoreVerifier,
            votingSystem: {
                address: deploymentData.votingSystem.address,
                transactionHash: deploymentData.votingSystem.txHash
            }
        },
        relayers: deploymentData.relayers || [],
        voting: {
            initialized: deploymentData.votingInitialized || false,
            initTx: deploymentData.votingInitTxHash || null
        },
        gasUsed: deploymentData.gasUsed,
        explorerUrls: {
            semaphoreVerifier: deploymentData.explorerUrl ? `${deploymentData.explorerUrl}/address/${deploymentData.semaphoreVerifier}` : null,
            votingSystem: deploymentData.explorerUrl ? `${deploymentData.explorerUrl}/address/${deploymentData.votingSystem.address}` : null
        }
    };
    
    fs.writeFileSync(deploymentFile, JSON.stringify(info, null, 2));
    console.log(`📄 Deployment info saved: ${deploymentFile}`);
    
    // Also save ABI for frontend integration
    const abiFile = path.join(deploymentsDir, `${networkName}-abi.json`);
    fs.writeFileSync(abiFile, JSON.stringify(deploymentData.votingSystem.abi, null, 2));
    console.log(`📄 Contract ABI saved: ${abiFile}`);
}

/**
 * Main deployment function
 */
async function deployToNetwork(networkName) {
    console.log(`🚀 Deploying to ${NETWORKS[networkName].name}...`);
    
    // Check required environment variables
    const privateKey = process.env.PRIVATE_KEY || process.env.OWNER_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('PRIVATE_KEY or OWNER_PRIVATE_KEY environment variable required');
    }
    
    // Connect to network
    const provider = new ethers.JsonRpcProvider(NETWORKS[networkName].rpcUrl);
    const deployer = new ethers.Wallet(privateKey, provider);
    
    console.log(`📍 Network: ${NETWORKS[networkName].name}`);
    console.log(`👤 Deployer: ${deployer.address}`);
    
    // Check deployer balance
    const balance = await provider.getBalance(deployer.address);
    const balanceEth = ethers.formatEther(balance);
    console.log(`💰 Balance: ${balanceEth} ETH`);
    
    if (parseFloat(balanceEth) < 0.01) {
        console.log('⚠️  Warning: Low balance, deployment might fail');
    }
    
    let totalGasUsed = 0n;
    
    try {
        // Always deploy our own Semaphore Verifier
        const semaphoreVerifierAddress = await deploySemaphoreVerifier(deployer, networkName);
        
        // Deploy VotingSystem
        const votingSystemDeployment = await deployVotingSystem(deployer, semaphoreVerifierAddress, networkName);
        
        // Get deployment transaction for gas calculation
        const deploymentTx = await provider.getTransaction(votingSystemDeployment.contract.deploymentTransaction().hash);
        const receipt = await deploymentTx.wait();
        totalGasUsed += receipt.gasUsed;
        
        // Save deployment information
        const deploymentData = {
            chainId: NETWORKS[networkName].chainId,
            deployer: deployer.address,
            semaphoreVerifier: semaphoreVerifierAddress,
            votingSystem: {
                address: votingSystemDeployment.address,
                abi: votingSystemDeployment.abi,
                txHash: votingSystemDeployment.contract.deploymentTransaction().hash
            },
            relayers: votingSystemDeployment.relayersAdded || [],
            votingInitialized: votingSystemDeployment.votingInitialized || false,
            votingInitTxHash: votingSystemDeployment.votingInitTxHash || null,
            gasUsed: totalGasUsed.toString(),
            explorerUrl: NETWORKS[networkName].explorerUrl
        };
        
        saveDeploymentInfo(networkName, deploymentData);
        
        // Print summary
        console.log('\n🎉 Deployment completed successfully!');
        console.log('📊 Summary:');
        console.log(`   Network: ${NETWORKS[networkName].name}`);
        console.log(`   Semaphore Verifier: ${semaphoreVerifierAddress}`);
        console.log(`   VotingSystem: ${votingSystemDeployment.address}`);
        console.log(`   Total Gas Used: ${totalGasUsed.toString()}`);
        
        if (NETWORKS[networkName].explorerUrl) {
            console.log('\n🔍 Explorer Links:');
            console.log(`   Semaphore Verifier: ${NETWORKS[networkName].explorerUrl}/address/${semaphoreVerifierAddress}`);
            console.log(`   VotingSystem: ${NETWORKS[networkName].explorerUrl}/address/${votingSystemDeployment.address}`);
        }
        
        console.log('\n📝 Next Steps:');
        console.log('   1. Verify contracts on explorer (if available)');
        console.log('   2. Generate and fund organizational wallets');
        console.log('   3. Add wallets as relayers to the contract');
        console.log('   4. Initialize voting parameters');
        
        return deploymentData;
        
    } catch (error) {
        console.error('❌ Deployment failed:', error);
        throw error;
    }
}

/**
 * Verify contract on Etherscan (if API key available)
 */
async function verifyContract(networkName, contractAddress, constructorArgs = []) {
    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
        console.log('⏭️  Skipping verification (no ETHERSCAN_API_KEY)');
        return;
    }
    
    console.log('🔍 Verifying contract on Etherscan...');
    // Implementation would use etherscan API or foundry verify
    console.log('💡 Use: forge verify-contract --chain-id <id> --num-of-optimizations 200 --watch <address> VotingSystem');
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    let networkName = 'goerli'; // default
    
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--network' && args[i + 1]) {
            networkName = args[i + 1];
        }
    }
    
    // Validate network
    if (!NETWORKS[networkName]) {
        console.error(`❌ Unknown network: ${networkName}`);
        console.log('Available networks:', Object.keys(NETWORKS).join(', '));
        process.exit(1);
    }
    
    try {
        await deployToNetwork(networkName);
    } catch (error) {
        console.error('💥 Deployment failed:', error.message);
        process.exit(1);
    }
}

// Export for use as module
export {
    deployToNetwork,
    deploySemaphoreVerifier,
    deployVotingSystem,
    saveDeploymentInfo,
    NETWORKS
};

// Run CLI if called directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    main().catch(console.error);
}
