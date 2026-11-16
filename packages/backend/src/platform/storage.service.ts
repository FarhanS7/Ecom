// @shopscale/backend/platform/storage.service - S3/MinIO storage port (T035).
// Invariants:
// 1. Issues short-lived presigned PUT URLs (15 minutes default) for direct client uploads.
// 2. Uses AWS SDK v3 with forcePathStyle=true for MinIO compatibility.
// 3. getObjectBytes reads bounded byte slices for magic byte verification without buffering large files.
// 4. Import-safe: lazily connects to S3/MinIO.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from '@shopscale/config';

export interface StoragePort {
  getPresignedPutUrl(objectKey: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  getPresignedGetUrl(objectKey: string, expiresInSeconds?: number): Promise<string>;
  putObject(objectKey: string, body: Uint8Array, contentType: string): Promise<void>;
  getObjectBytes(objectKey: string, byteLimit?: number): Promise<Uint8Array>;
  deleteObject(objectKey: string): Promise<void>;
  getPublicUrl(objectKey: string): string;
}

export class S3StorageService implements StoragePort {
  private clientInstance: S3Client | null = null;

  constructor(
    private readonly customClient?: S3Client,
    private readonly customBucket?: string,
  ) {}

  private get client(): S3Client {
    if (this.customClient) return this.customClient;
    if (this.clientInstance) return this.clientInstance;

    const env = getEnv();
    const endpoint = env.MINIO_ENDPOINT || 'http://localhost:9000';
    const region = env.MINIO_REGION || 'us-east-1';
    const accessKeyId = env.MINIO_ACCESS_KEY || 'minioadmin';
    const secretAccessKey = env.MINIO_SECRET_KEY || 'minioadmin';

    this.clientInstance = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });

    return this.clientInstance;
  }

  private get bucket(): string {
    if (this.customBucket) return this.customBucket;
    try {
      const env = getEnv();
      return env.MINIO_BUCKET || 'shopscale-media';
    } catch {
      return 'shopscale-media';
    }
  }

  async getPresignedPutUrl(
    objectKey: string,
    contentType: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async getPresignedGetUrl(
    objectKey: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async putObject(
    objectKey: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
    });

    await this.client.send(command);
  }

  async getObjectBytes(objectKey: string, byteLimit?: number): Promise<Uint8Array> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Range: byteLimit !== undefined ? `bytes=0-${byteLimit - 1}` : undefined,
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`Empty object body for key: ${objectKey}`);
    }

    return response.Body.transformToByteArray();
  }

  async deleteObject(objectKey: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });

    await this.client.send(command);
  }

  getPublicUrl(objectKey: string): string {
    let endpoint = 'http://localhost:9000';
    try {
      const env = getEnv();
      if (env.MINIO_ENDPOINT) {
        endpoint = env.MINIO_ENDPOINT.replace(/\/$/, '');
      }
    } catch {
      // Fallback
    }

    return `${endpoint}/${this.bucket}/${objectKey}`;
  }
}

export const storageService = new S3StorageService();
