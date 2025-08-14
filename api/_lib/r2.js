// api/_lib/r2.js
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT,  // Cloudflare R2 endpoint
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,       // From R2 token
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function signR2Url(key, expiresSeconds = 6 * 60 * 60) {
  const cmd = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${key.split('/').pop()}"`
  });
  return getSignedUrl(s3, cmd, { expiresIn: expiresSeconds });
}

module.exports = { signR2Url };
