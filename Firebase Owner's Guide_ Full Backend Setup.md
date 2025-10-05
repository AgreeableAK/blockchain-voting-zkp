# **🗳️ Firebase Owner's Guide: Full Backend Setup**

Welcome, Project Owner\! This is the master guide for setting up, configuring, and deploying the **Firebase backend relayer**.  
This guide covers everything from creating the cloud project and managing billing to deploying the function and adding your teammates.

## **📋 Prerequisites**

Ensure you have the following tools installed and configured:

1. **A Complete Contracts Environment:** Your local blockchain-voting-zkp project should be set up with Foundry and all dependencies installed. You must have already generated the encrypted relayer wallets and deployed the smart contract.  
2. **Node.js v20:** You must be using Node.js v20 via NVM (nvm use 20).  
3. **Firebase CLI:** If not installed, run npm install \-g firebase-tools.  
4. **A Google Account:** Required for Firebase and Google Cloud.

## **🔥 Step 1: Create and Configure the Firebase Project**

First, create the cloud project that will host your backend.

1. **Create a Firebase Project:** Go to the [Firebase Console](https://console.firebase.google.com/), click **"Add project"**, and give it a unique name (e.g., zk-voting-project).  
2. **Upgrade to the Blaze Plan:** The backend uses Secret Manager, which requires the **"Blaze (pay-as-you-go)"** plan.  
   * In your new project's dashboard, click the "Upgrade" button near the project name.  
   * You will need to link a billing account. This is required to enable the Secret Manager API, but your project's usage will stay within the generous free tier, so **you will not be charged**.  
3. **(Highly Recommended) Set a Budget Alert:** To protect against accidental charges, it is crucial to set a budget.  
   * Go to the [Google Cloud Billing Console](https://console.cloud.google.com/billing).  
   * Select your billing account, then go to the "Budgets & alerts" section.  
   * Create a new budget for a small amount (e.g., $1 or ₹100) and set alert notifications for 50%, 90%, and 100% of the budget.

## **🚀 Step 2: Initialize Firebase in Your Local Project**

Now, let's add the Firebase configuration to your blockchain-voting-zkp repository.

1. **Create the Backend Directory:** From the **root** of your project, create a new folder.  
   mkdir firebase-backend  
   cd firebase-backend

2. **Log into Firebase:**  
   firebase login

3. **Initialize Firebase:**  
   firebase init functions

   Answer the prompts as follows:  
   * Please select an option: **Use an existing project**  
   * Select a default Firebase project...: Choose the zk-voting-project you just created.  
   * What language would you like to use...: **JavaScript**  
   * Do you want to use ESLint...: **Yes**  
   * Do you want to install dependencies...: **Yes**

## **🔐 Step 3: Configure Backend Secrets**

Securely provide your backend with the relayer wallet information.

1. **Encode the Encrypted Wallets File:** From the **root** of your project, run the command for your OS to convert your encrypted wallet file into a single Base64 string.  
   \# On macOS or Linux:  
   cat ./wallets/organizational-wallets.encrypted.json | base64

   \# On Windows (using PowerShell):  
   \[Convert\]::ToBase64String(\[IO.File\]::ReadAllBytes("./wallets/organizational-wallets.encrypted.json"))

   Copy the entire long output string.  
2. **Set the Secrets in Firebase:** From the firebase-backend directory, run these commands. The CLI will prompt you to enter the values securely.  
   \# Paste the long wallet string when prompted  
   firebase functions:secrets:set ENCRYPTED\_WALLETS

   \# Enter the password you used to encrypt the wallets  
   firebase functions:secrets:set WALLET\_PASSWORD

## **🛠️ Step 4: Configure the Cloud Function**

This step involves setting up the function's code, dependencies, and connecting it to your deployed contract.

1. **Navigate to the Functions Directory:**  
   cd functions

2. **Update package.json:** Open package.json in this directory and replace its entire contents with the following to ensure you are using the correct Node.js version (20) and the latest SDKs.  
   {  
     "name": "functions",  
     "description": "Cloud Functions for Firebase",  
     "scripts": {  
       "lint": "eslint .",  
       "serve": "firebase emulators:start \--only functions",  
       "shell": "firebase functions:shell",  
       "start": "npm run shell",  
       "deploy": "firebase deploy \--only functions",  
       "logs": "firebase functions:log"  
     },  
     "engines": {  
       "node": "20"  
     },  
     "main": "index.js",  
     "dependencies": {  
       "firebase-admin": "^12.0.0",  
       "firebase-functions": "^5.0.0",  
       "ethers": "^6.15.0",  
       "@semaphore-protocol/proof": "^4.12.1"  
     },  
     "devDependencies": {  
       "eslint": "^8.15.0",  
       "eslint-config-google": "^0.14.0",  
       "firebase-functions-test": "^3.1.0"  
     },  
     "private": true  
   }

3. **Install Dependencies:** Run npm install to get all the packages.  
   npm install

4. **Copy Contract Artifacts:** Copy the ABI and group files from your project root into the current functions directory.  
   cp ../../deployments/sepolia-abi.json .  
   cp ../../zk/group.json .

5. **Add the Backend Code:** Replace the entire content of index.js with the final, lint-free backend code.  
   const {onCall, HttpsError} \= require("firebase-functions/v2/https");  
   const {defineSecret} \= require("firebase-functions/v2/params");  
   const logger \= require("firebase-functions/logger");  
   const {ethers} \= require("ethers");  
   const {verifyProof} \= require("@semaphore-protocol/proof");  
   const fs \= require("fs");  
   const path \= require("path");

   const contractABI \= require("./sepolia-abi.json");  
   const groupData \= require("./group.json");  
   const ZK\_CIRCUITS\_PATH \= path.resolve(\_\_dirname, "../../zk/circuits");

   // \--- IMPORTANT: CONFIGURE THESE VALUES \---  
   // Use the same RPC URL from your contract project's .env file  
   const SEPOLIA\_RPC\_URL \= "\[https://eth-sepolia.g.alchemy.com/v2/YOUR\_API\_KEY\](https://eth-sepolia.g.alchemy.com/v2/YOUR\_API\_KEY)";  
   // Use the contract address from your latest deployment  
   const CONTRACT\_ADDRESS \= "0xYOUR\_DEPLOYED\_CONTRACT\_ADDRESS";

   const encryptedWalletsSecret \= defineSecret("ENCRYPTED\_WALLETS");  
   const walletPasswordSecret \= defineSecret("WALLET\_PASSWORD");

   const provider \= new ethers.JsonRpcProvider(SEPOLIA\_RPC\_URL);  
   const contract \= new ethers.Contract(CONTRACT\_ADDRESS, contractABI, provider);

   exports.castVote \= onCall(  
       {secrets: \[encryptedWalletsSecret, walletPasswordSecret\]},  
       async (request) \=\> {  
         // ... \[Function logic\] ...  
       },  
   );

   **Action Required:** Open the index.js file and replace the YOUR\_API\_KEY and YOUR\_DEPLOYED\_CONTRACT\_ADDRESS placeholders with the actual values from your contract deployment's .env file.

## **✅ Step 5: Deploy the Backend**

You are now ready to deploy.

1. **Deploy the Function:** From the firebase-backend directory, run:  
   firebase deploy \--only functions

2. **Verify:** After deployment, go to the Firebase Console, navigate to the "Functions" section, and you will see your castVote function listed. This is your live backend endpoint.

## **👥 Step 6: Add Your Teammates to the Project**

To give your teammates access, you need to invite them to your Firebase project.

1. In the [Firebase Console](https://console.firebase.google.com/), click the gear icon ⚙️ next to "Project Overview" and go to **"Users and permissions"**.  
2. Click the **"Add member"** button.  
3. Enter your teammate's Google account email address.  
4. Assign them the appropriate role based on their task:  
   * For backend developers who need to deploy changes: **Editor**  
   * For frontend developers who only need the config: **Viewer**  
5. Click **"Add member"**. They will receive an email invitation to join the project.