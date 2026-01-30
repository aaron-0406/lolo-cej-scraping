/**
 * S3 Client
 *
 * Handles file uploads to AWS S3 for scraped documents.
 * Files are uploaded with a structured key path:
 *   {awsChbPath}{customerHasBankId}/judicial-binnacle/{filename}
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import config from "../../config";
import { logger } from "../../monitoring/logger";

let s3Client: S3Client | null = null;

/**
 * Get or initialize the S3 client singleton.
 */
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.awsBucketRegion,
      credentials: {
        accessKeyId: config.awsPublicKey,
        secretAccessKey: config.awsSecretKey,
      },
    });
  }
  return s3Client;
}

/**
 * Upload a file to S3.
 *
 * @param localPath - Local file path to upload
 * @param customerHasBankId - CHB ID for the S3 key path
 * @param originalName - Original filename
 * @returns S3 key (name_origin_aws) for storage in JUDICIAL_BIN_FILE
 */
export async function uploadFile(
  localPath: string,
  customerHasBankId: number,
  originalName: string
): Promise<string> {
  const ext = path.extname(originalName) || ".pdf";
  const s3Key = `${config.awsChbPath}${customerHasBankId}/judicial-binnacle/${uuidv4()}${ext}`;

  const fileContent = fs.readFileSync(localPath);

  const command = new PutObjectCommand({
    Bucket: config.awsBucketName,
    Key: s3Key,
    Body: fileContent,
  });

  await getS3Client().send(command);

  logger.debug(
    { s3Key, originalName, customerHasBankId },
    "File uploaded to S3"
  );

  return s3Key;
}

/**
 * Delete a file from S3.
 *
 * @param s3Key - The S3 key to delete
 */
export async function deleteFile(s3Key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: config.awsBucketName,
    Key: s3Key,
  });

  await getS3Client().send(command);
  logger.debug({ s3Key }, "File deleted from S3");
}
