// api/r2-presign.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { key, contentType } = req.body || {};
  if (!key || !contentType) {
    return res.status(400).json({ error: "key and contentType are required" });
  }

  try {
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 }); // 5 min
    const publicUrl = `${process.env.R2_PUBLIC_BASE}/${encodeURIComponent(key)}`;

    return res.status(200).json({ uploadUrl, publicUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to sign URL" });
  }
}
