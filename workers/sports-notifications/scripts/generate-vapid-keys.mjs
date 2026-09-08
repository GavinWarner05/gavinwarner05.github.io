import { createECDH } from "node:crypto";
import { spawnSync } from "node:child_process";

const key = createECDH("prime256v1");
key.generateKeys();
const encode = (value) => Buffer.from(value).toString("base64url");

const publicKey = encode(key.getPublicKey());
const privateKey = encode(key.getPrivateKey());

if (process.argv.includes("--install")) {
  const secrets = JSON.stringify({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey });
  const result = spawnSync("npx", ["wrangler", "secret", "bulk"], { input: secrets, stdio: ["pipe", "inherit", "inherit"] });
  if (result.status !== 0) process.exit(result.status || 1);
  console.log("VAPID keys were generated and stored as Cloudflare secrets.");
} else {
  console.log("VAPID_PUBLIC_KEY=" + publicKey);
  console.log("VAPID_PRIVATE_KEY=" + privateKey);
  console.log("\nKeep the private key secret. Never commit it or paste it into chat.");
}
