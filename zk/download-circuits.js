// zk/download-circuits.js
import fs from "fs";
import https from "https";
import path from "path";

const circuits = {
  "semaphore.wasm": "https://www.trusted-setup-pse.org/semaphore/20/semaphore.wasm",
  "semaphore.zkey": "https://www.trusted-setup-pse.org/semaphore/20/semaphore.zkey"
};

async function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✅ Downloaded ${path.basename(filePath)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

async function main() {
  try {
    // Create zk directory if it doesn't exist
    if (!fs.existsSync("zk")) {
      fs.mkdirSync("zk");
    }

    // Download circuit files
    for (const [filename, url] of Object.entries(circuits)) {
      const filePath = `zk/${filename}`;
      if (!fs.existsSync(filePath)) {
        console.log(`📥 Downloading ${filename}...`);
        await downloadFile(url, filePath);
      } else {
        console.log(`✅ ${filename} already exists`);
      }
    }

    console.log("🎉 All circuit files are ready!");
  } catch (err) {
    console.error("❌ Error downloading circuits:", err.message);
  }
}

main();