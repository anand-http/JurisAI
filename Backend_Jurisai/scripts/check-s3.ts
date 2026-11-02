/**
 * Checks the S3 export setup end to end: upload, private download link, delete.
 *   npm run check:s3
 * Uses S3_BUCKET and AWS_REGION from .env, and AWS credentials from the environment
 * (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY locally, the instance's IAM role on EC2).
 */
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { S3FileStorage } from "../src/modules/export/fileStorage.js";

const bucket = process.env.S3_BUCKET;
const region = process.env.AWS_REGION ?? "ap-south-1";
if (!bucket) {
  console.error("✗ S3_BUCKET is not set in .env");
  process.exit(1);
}

const hint = (err: unknown): string => {
  const e = err as { name?: string; message?: string; Code?: string };
  const name = e.name ?? e.Code ?? "";
  if (/CredentialsProviderError|Could not load credentials/i.test(`${name} ${e.message}`))
    return "No AWS credentials found. Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to .env (on EC2, attach the IAM role instead).";
  if (name === "InvalidAccessKeyId" || name === "SignatureDoesNotMatch") return "The access key or secret in .env is wrong. Re-copy both from the IAM console.";
  if (name === "AccessDenied") return "The IAM policy doesn't allow this. Check the policy's bucket name and that it covers exports/*.";
  if (name === "NoSuchBucket") return `No bucket named "${bucket}". Check S3_BUCKET for typos.`;
  if (name === "PermanentRedirect" || name === "AuthorizationHeaderMalformed" || /endpoint|region/i.test(e.message ?? ""))
    return `The bucket is not in ${region}. Set AWS_REGION in .env to the bucket's region (shown in the S3 console).`;
  return "Unexpected error; see the message above.";
};

const key = `exports/_connection-test/${Date.now()}.txt`;
const storage = new S3FileStorage(region, bucket, 300);
const s3 = new S3Client({ region });
const step = async (label: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
    console.log(`✓ ${label}`);
  } catch (err) {
    console.error(`✗ ${label}: ${(err as Error).name}: ${(err as Error).message}\n  → ${hint(err)}`);
    process.exit(1);
  }
};

console.log(`Checking s3://${bucket} in ${region}\n`);
await step("upload a test file (encrypted)", () => storage.put(key, Buffer.from("JurisAI S3 check"), "text/plain", "check.txt"));
let url = "";
await step("create a private download link", async () => {
  url = await storage.signedUrl(key);
});
await step("download through the link", async () => {
  const res = await fetch(url);
  if (!res.ok || (await res.text()) !== "JurisAI S3 check") throw Object.assign(new Error(`HTTP ${res.status}`), { name: res.status === 403 ? "AccessDenied" : "DownloadFailed" });
});
await step("the file is NOT public without the link", async () => {
  const res = await fetch(`https://${bucket}.s3.${region}.amazonaws.com/${key}`);
  if (res.ok) throw Object.assign(new Error("anyone can download exports without a link: turn Block Public Access back on"), { name: "PublicBucket" });
});
await step("delete the test file", () => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })));
console.log("\nS3 is ready for exports.");
