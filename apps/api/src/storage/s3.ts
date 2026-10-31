import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { randomUUID } from "node:crypto";
import { AUDIO_MAX_BYTES } from "../voice.js";

// The only module that talks to S3. On AWS a recording can't ride in the
// request (Lambda takes at most 6 MB), so the browser uploads it straight to
// the data bucket with a presigned POST and transcribe reads it from there.
// Each clip is read once and deleted; the bucket's 1-day rule is the backstop.

export const VOICE_KEY = /^voice\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GRANT_SECONDS = 300;

export type UploadGrant = { url: string; fields: Record<string, string>; key: string };
export type VoiceStore = {
  presign(): Promise<UploadGrant>;
  /** Read a clip, hand it to `use`, and delete it whether or not `use` succeeds. */
  consume<T>(key: string, use: (audio: Buffer, mime: string) => Promise<T>): Promise<T>;
};

export function s3VoiceStore(client: S3Client, bucket: string): VoiceStore {
  return {
    async presign() {
      const key = `voice/${randomUUID()}`;
      const { url, fields } = await createPresignedPost(client, {
        Bucket: bucket,
        Key: key,
        Expires: GRANT_SECONDS,
        Conditions: [
          ["content-length-range", 1, AUDIO_MAX_BYTES],
          ["starts-with", "$Content-Type", "audio/"],
        ],
      });
      return { url, fields, key };
    },
    async consume(key, use) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const audio = Buffer.from(await object.Body!.transformToByteArray());
        return await use(audio, object.ContentType ?? "audio/webm");
      } finally {
        // A failed delete must not hide the transcription result or error;
        // the lifecycle rule removes the clip within a day.
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
      }
    },
  };
}

/** S3 uploads when the stack provides a data bucket (AWS); null on Vultr. */
export function voiceStoreFromEnv(): VoiceStore | null {
  const bucket = process.env.DATA_BUCKET;
  return bucket ? s3VoiceStore(new S3Client({}), bucket) : null;
}
