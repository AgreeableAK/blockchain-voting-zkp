// node scripts/generate-wallets.js generate "your-secure-password"
import { ethers } from 'ethers';
import crypto from 'crypto';
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/**
 * Generate and manage organizational wallets for gasless voting
 * These wallets will relay votes on behalf of users
 */

const WALLET_COUNT = 10;
const OUTPUT_DIR = path.join(__dirname, '../wallets');
const ENCRYPTED_FILE = path.join(OUTPUT_DIR, 'organizational-wallets.encrypted.json');
const PUBLIC_FILE = path.join(OUTPUT_DIR, 'wallet-addresses.json');

/**
 * Generate random organizational wallets
 */
async function generateWallets() {
  console.log(`🔐 Generating ${WALLET_COUNT} organizational wallets...`);

  const wallets = [];

  for (let i = 0; i < WALLET_COUNT; i++) {
    const wallet = ethers.Wallet.createRandom();

    wallets.push({
      id: i + 1,
      address: wallet.address,
      privateKey: wallet.privateKey,
      publicKey: wallet.publicKey,
      mnemonic: wallet.mnemonic?.phrase || null,
      createdAt: new Date().toISOString()
    });

    console.log(`✅ Wallet ${i + 1}: ${wallet.address}`);
  }

  return wallets;
}

/**
 * Encrypt wallet data securely with AES-256-GCM
 */
function encryptWalletData(wallets, password) {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(password, 'salt', 32); // 32 bytes key
  const iv = crypto.randomBytes(16); // random IV

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const text = JSON.stringify(wallets, null, 2);
  const encryptedBuffer = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encrypted: encryptedBuffer.toString('hex')
  };
}

/**
 * Decrypt wallet data securely with AES-256-GCM
 */
function decryptWalletData(encryptedData, password) {
  const algorithm = encryptedData.algorithm;
  const key = crypto.scryptSync(password, 'salt', 32);
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const authTag = Buffer.from(encryptedData.authTag, 'hex');
  const encryptedBuffer = Buffer.from(encryptedData.encrypted, 'hex');

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  const decryptedBuffer = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  return JSON.parse(decryptedBuffer.toString('utf8'));
}

/**
 * Save wallets securely
 */
async function saveWallets(wallets, password) {
    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    // Save encrypted private keys (for production use)
    if (password) {
        const encrypted = encryptWalletData(wallets, password);
        fs.writeFileSync(ENCRYPTED_FILE, JSON.stringify(encrypted, null, 2));
        console.log(`🔒 Encrypted wallet data saved to: ${ENCRYPTED_FILE}`);
    }
    
    // Save public addresses only (for frontend/backend use)
    const publicData = wallets.map(w => ({
        id: w.id,
        address: w.address,
        createdAt: w.createdAt
    }));
    
    fs.writeFileSync(PUBLIC_FILE, JSON.stringify(publicData, null, 2));
    console.log(`📋 Public addresses saved to: ${PUBLIC_FILE}`);
    
    // Save unencrypted for development (WARNING: Only for testnet!)
    if (process.env.NODE_ENV === 'development') {
        const devFile = path.join(OUTPUT_DIR, 'wallets-dev-only.json');
        fs.writeFileSync(devFile, JSON.stringify(wallets, null, 2));
        console.log(`⚠️  DEV ONLY: Unencrypted wallets saved to: ${devFile}`);
    }
}

/**
 * Load encrypted wallets
 */
function loadWallets(password) {
    try {
        const encryptedData = JSON.parse(fs.readFileSync(ENCRYPTED_FILE, 'utf8'));
        return decryptWalletData(encryptedData, password);
    } catch (error) {
        console.error('❌ Error loading wallets:', error.message);
        return null;
    }
}

/**
 * Fund wallets with testnet ETH
 */
async function fundWallets(wallets, rpcUrl, funderPrivateKey, amountEth = '0.01') {
    console.log(`💰 Funding wallets with ${amountEth} ETH each...`);
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const funder = new ethers.Wallet(funderPrivateKey, provider);
    
    console.log(`📤 Funding from: ${funder.address}`);
    
    const amount = ethers.parseEther(amountEth);
    const transactions = [];
    
    for (const wallet of wallets) {
        try {
            console.log(`💸 Funding ${wallet.address}...`);
            
            const tx = await funder.sendTransaction({
                to: wallet.address,
                value: amount,
                gasLimit: 21000
            });
            
            await tx.wait();
            transactions.push({
                walletId: wallet.id,
                address: wallet.address,
                txHash: tx.hash,
                amount: amountEth
            });
            
            console.log(`✅ Funded ${wallet.address} - TX: ${tx.hash}`);
            
            // Small delay to avoid nonce issues
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`❌ Failed to fund ${wallet.address}:`, error.message);
        }
    }
    
    // Save funding records
    const fundingFile = path.join(OUTPUT_DIR, 'funding-history.json');
    const fundingRecord = {
        timestamp: new Date().toISOString(),
        rpcUrl,
        funderAddress: funder.address,
        amountEth,
        transactions
    };
    
    fs.writeFileSync(fundingFile, JSON.stringify(fundingRecord, null, 2));
    console.log(`📊 Funding history saved to: ${fundingFile}`);
    
    return transactions;
}

/**
 * Check wallet balances
 */
async function checkBalances(rpcUrl, walletAddresses) {
    console.log('📊 Checking wallet balances...');
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const balances = [];
    
    for (let i = 0; i < walletAddresses.length; i++) {
        try {
            const balance = await provider.getBalance(walletAddresses[i]);
            const balanceEth = ethers.formatEther(balance);
            
            balances.push({
                id: i + 1,
                address: walletAddresses[i],
                balance: balanceEth,
                balanceWei: balance.toString()
            });
            
            console.log(`💰 Wallet ${i + 1}: ${balanceEth} ETH`);
        } catch (error) {
            console.error(`❌ Error checking balance for ${walletAddresses[i]}:`, error.message);
        }
    }
    
    return balances;
}

/**
 * Random wallet selector (for vote casting)
 */
function selectRandomWallet(wallets) {
    const randomIndex = Math.floor(Math.random() * wallets.length);
    return wallets[randomIndex];
}

/**
 * Wallet health check
 */
async function healthCheck(rpcUrl, password) {
    console.log('🏥 Running wallet health check...');
    
    // Load wallets
    const wallets = loadWallets(password);
    if (!wallets) return false;
    
    // Check balances
    const addresses = wallets.map(w => w.address);
    const balances = await checkBalances(rpcUrl, addresses);
    
    // Health status
    const lowBalanceThreshold = 0.01; // 0.01 ETH
    const healthyWallets = balances.filter(b => parseFloat(b.balance) > lowBalanceThreshold);
    
    console.log(`✅ Healthy wallets: ${healthyWallets.length}/${wallets.length}`);
    
    if (healthyWallets.length < wallets.length * 0.5) {
        console.log('⚠️  Warning: Less than 50% of wallets have sufficient balance');
    }
    
    return {
        totalWallets: wallets.length,
        healthyWallets: healthyWallets.length,
        balances,
        needsFunding: balances.filter(b => parseFloat(b.balance) <= lowBalanceThreshold)
    };
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'generate':
            const wallets = await generateWallets();
            const password = args[1] || 'your-secure-password'; // Use secure password in production
            await saveWallets(wallets, password);
            console.log('\n🎉 Wallets generated successfully!');
            console.log('📝 Next steps:');
            console.log('   1. Fund wallets: node scripts/generate-wallets.js fund');
            console.log('   2. Add to contract: Use addresses in wallet-addresses.json');
            break;
            
        case 'fund':
            const rpcUrl = args[1] || process.env.RPC_URL || 'https://goerli.infura.io/v3/YOUR_KEY';
            const funderKey = args[2] || process.env.FUNDER_PRIVATE_KEY;
            const amount = args[3] || '0.01';
            
            if (!funderKey) {
                console.error('❌ Funder private key required');
                break;
            }
            
            const fundPassword = 'your-secure-password'; // Use your password
            const walletsToFund = loadWallets(fundPassword);
            if (walletsToFund) {
                await fundWallets(walletsToFund, rpcUrl, funderKey, amount);
            }
            break;
            
        case 'balances':
            const checkRpc = args[1] || process.env.RPC_URL;
            const publicData = JSON.parse(fs.readFileSync(PUBLIC_FILE, 'utf8'));
            await checkBalances(checkRpc, publicData.map(w => w.address));
            break;
            
        case 'health':
            const healthRpc = args[1] || process.env.RPC_URL;
            const healthPassword = 'your-secure-password';
            await healthCheck(healthRpc, healthPassword);
            break;
            
        default:
            console.log('📚 Usage:');
            console.log('   generate [password] - Generate new wallets');
            console.log('   fund [rpcUrl] [funderPrivateKey] [amount] - Fund wallets');
            console.log('   balances [rpcUrl] - Check wallet balances');
            console.log('   health [rpcUrl] - Run health check');
    }
}

// Export functions for use in other scripts
export {
    generateWallets,
    saveWallets,
    loadWallets,
    fundWallets,
    checkBalances,
    selectRandomWallet,
    healthCheck,
    encryptWalletData,
    decryptWalletData
};

// Run CLI if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}