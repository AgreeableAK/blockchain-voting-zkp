import { ethers } from 'ethers';
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Manage relayer wallets in the VotingSystem contract
 */

const VOTING_CONTRACT_ABI = [
    "function addRelayer(address _relayer) external",
    "function removeRelayer(address _relayer) external", 
    "function getRelayers() external view returns (address[] memory)",
    "function authorizedRelayers(address) external view returns (bool)",
    "function owner() external view returns (address)"
];

/**
 * Load wallet addresses
 */
function loadWalletAddresses() {
    const addressFile = path.join(__dirname, '../wallets/wallet-addresses.json');
    try {
        return JSON.parse(fs.readFileSync(addressFile, 'utf8'));
    } catch (error) {
        console.error('❌ Error loading wallet addresses:', error.message);
        console.log('💡 Run: node scripts/generate-wallets.js generate');
        return null;
    }
}

/**
 * Add all organizational wallets as relayers to the contract
 */
async function addRelayersToContract(
    contractAddress, 
    rpcUrl, 
    ownerPrivateKey
) {
    console.log('🔗 Adding relayers to VotingSystem contract...');
    
    // Load wallet addresses
    const wallets = loadWalletAddresses();
    if (!wallets) return;
    
    // Connect to contract
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const owner = new ethers.Wallet(ownerPrivateKey, provider);
    const contract = new ethers.Contract(contractAddress, VOTING_CONTRACT_ABI, owner);
    
    console.log(`📍 Contract: ${contractAddress}`);
    console.log(`👤 Owner: ${owner.address}`);
    console.log(`📊 Adding ${wallets.length} relayers...`);
    
    const transactions = [];
    
    for (const wallet of wallets) {
        try {
            console.log(`➕ Adding relayer ${wallet.id}: ${wallet.address}...`);
            
            // Check if already authorized
            const isAuthorized = await contract.authorizedRelayers(wallet.address);
            
            if (isAuthorized) {
                console.log(`⚠️  Relayer ${wallet.id} already authorized, skipping...`);
                continue;
            }
            
            // Add relayer
            const tx = await contract.addRelayer(wallet.address);
            await tx.wait();
            
            transactions.push({
                walletId: wallet.id,
                address: wallet.address,
                txHash: tx.hash,
                action: 'added'
            });
            
            console.log(`✅ Added relayer ${wallet.id} - TX: ${tx.hash}`);
            
            // Small delay to avoid nonce issues
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`❌ Failed to add relayer ${wallet.address}:`, error.message);
        }
    }
    
    // Save transaction records
    const recordsFile = path.join(__dirname, '../wallets/relayer-transactions.json');
    const record = {
        timestamp: new Date().toISOString(),
        contractAddress,
        ownerAddress: owner.address,
        action: 'add_relayers',
        transactions
    };
    
    fs.writeFileSync(recordsFile, JSON.stringify(record, null, 2));
    console.log(`📊 Transaction records saved to: ${recordsFile}`);
    
    return transactions;
}

/**
 * Get current relayers from contract
 */
async function getCurrentRelayers(contractAddress, rpcUrl) {
    console.log('📋 Fetching current relayers from contract...');
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, VOTING_CONTRACT_ABI, provider);
    
    try {
        const relayers = await contract.getRelayers();
        
        console.log(`📊 Found ${relayers.length} authorized relayers:`);
        relayers.forEach((address, index) => {
            console.log(`   ${index + 1}. ${address}`);
        });
        
        return relayers;
    } catch (error) {
        console.error('❌ Error fetching relayers:', error.message);
        return [];
    }
}

/**
 * Verify all organizational wallets are authorized
 */
async function verifyRelayers(contractAddress, rpcUrl) {
    console.log('🔍 Verifying relayer authorization...');
    
    const wallets = loadWalletAddresses();
    if (!wallets) return;
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, VOTING_CONTRACT_ABI, provider);
    
    const verification = [];
    
    for (const wallet of wallets) {
        try {
            const isAuthorized = await contract.authorizedRelayers(wallet.address);
            
            verification.push({
                id: wallet.id,
                address: wallet.address,
                authorized: isAuthorized
            });
            
            const status = isAuthorized ? '✅ Authorized' : '❌ Not Authorized';
            console.log(`   ${wallet.id}. ${wallet.address} - ${status}`);
            
        } catch (error) {
            console.error(`❌ Error checking ${wallet.address}:`, error.message);
        }
    }
    
    const authorizedCount = verification.filter(v => v.authorized).length;
    console.log(`\n📊 Summary: ${authorizedCount}/${wallets.length} wallets authorized`);
    
    return verification;
}

/**
 * Remove all relayers (emergency function)
 */
async function removeAllRelayers(contractAddress, rpcUrl, ownerPrivateKey) {
    console.log('🚨 Removing all relayers from contract...');
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const owner = new ethers.Wallet(ownerPrivateKey, provider);
    const contract = new ethers.Contract(contractAddress, VOTING_CONTRACT_ABI, owner);
    
    // Get current relayers
    const currentRelayers = await contract.getRelayers();
    
    if (currentRelayers.length === 0) {
        console.log('✅ No relayers to remove');
        return;
    }
    
    console.log(`🗑️  Removing ${currentRelayers.length} relayers...`);
    
    const transactions = [];
    
    for (const relayerAddress of currentRelayers) {
        try {
            console.log(`➖ Removing relayer: ${relayerAddress}...`);
            
            const tx = await contract.removeRelayer(relayerAddress);
            await tx.wait();
            
            transactions.push({
                address: relayerAddress,
                txHash: tx.hash,
                action: 'removed'
            });
            
            console.log(`✅ Removed relayer - TX: ${tx.hash}`);
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`❌ Failed to remove relayer ${relayerAddress}:`, error.message);
        }
    }
    
    return transactions;
}

/**
 * Get a random authorized relayer for vote casting
 */
async function getRandomRelayer(contractAddress, rpcUrl) {
    const relayers = await getCurrentRelayers(contractAddress, rpcUrl);
    
    if (relayers.length === 0) {
        throw new Error('No authorized relayers found');
    }
    
    const randomIndex = Math.floor(Math.random() * relayers.length);
    return relayers[randomIndex];
}

/**
 * Get relayer with private key for transaction signing
 */
function getRelayerWithPrivateKey(relayerAddress, password) {
    const { loadWallets } = require('./generate-wallets');
    
    const wallets = loadWallets(password);
    if (!wallets) return null;
    
    const wallet = wallets.find(w => w.address.toLowerCase() === relayerAddress.toLowerCase());
    return wallet;
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'add':
            const contractAddr = args[1] || process.env.VOTING_CONTRACT_ADDRESS;
            const rpcUrl = args[2] || process.env.RPC_URL;
            const ownerKey = args[3] || process.env.OWNER_PRIVATE_KEY;
            
            if (!contractAddr || !rpcUrl || !ownerKey) {
                console.error('❌ Usage: add <contractAddress> <rpcUrl> <ownerPrivateKey>');
                break;
            }
            
            await addRelayersToContract(contractAddr, rpcUrl, ownerKey);
            break;
            
        case 'list':
            const listAddr = args[1];
            const listRpc = args[2] || process.env.RPC_URL;
            
            if (!listAddr || !listRpc) {
                console.error('❌ Usage: list <contractAddress> <rpcUrl>');
                break;
            }
            
            await getCurrentRelayers(listAddr, listRpc);
            break;
            
        case 'verify':
            const verifyAddr = args[1];
            const verifyRpc = args[2] || process.env.RPC_URL;
            
            if (!verifyAddr || !verifyRpc) {
                console.error('❌ Usage: verify <contractAddress> <rpcUrl>');
                break;
            }
            
            await verifyRelayers(verifyAddr, verifyRpc);
            break;
            
        case 'remove-all':
            const removeAddr = args[1];
            const removeRpc = args[2] || process.env.RPC_URL;
            const removeKey = args[3] || process.env.OWNER_PRIVATE_KEY;
            
            if (!removeAddr || !removeRpc || !removeKey) {
                console.error('❌ Usage: remove-all <contractAddress> <rpcUrl> <ownerPrivateKey>');
                break;
            }
            
            await removeAllRelayers(removeAddr, removeRpc, removeKey);
            break;
            
        default:
            console.log('📚 Usage:');
            console.log('   add <contractAddress> <rpcUrl> <ownerPrivateKey> - Add all wallets as relayers');
            console.log('   list <contractAddress> <rpcUrl> - List current relayers');
            console.log('   verify <contractAddress> <rpcUrl> - Verify wallet authorization');
            console.log('   remove-all <contractAddress> <rpcUrl> <ownerPrivateKey> - Remove all relayers');
    }
}

// Export functions for use in other scripts
export {
    addRelayersToContract,
    getCurrentRelayers,
    verifyRelayers,
    removeAllRelayers,
    getRandomRelayer,
    getRelayerWithPrivateKey
};

// Run CLI if called directly
if (process.argv[1] === __filename) {
    main().catch(console.error);
}