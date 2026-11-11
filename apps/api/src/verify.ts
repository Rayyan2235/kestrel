import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import { sqsVerifyQueue, type VerifyQueue } from "./queue/sqs.js";
import { s3ClaimStore, type ClaimStore } from "./storage/s3.js";

/**
 * Hands an attempt to the server's verifier (P4, ADR-003): the claim goes to
 * S3 first, then a message pointing at it goes on the queue. Where no
 * verifier is deployed (local, Vultr) there is none, and the ledger takes the
 * browser's report as before.
 */
export type Claim = { attemptId: string; learnerId: string; leftCm: number; rightCm: number };
export type Verifier = { submit(claim: Claim): Promise<void> };

export function verifier(claims: ClaimStore, queue: VerifyQueue): Verifier {
  return {
    async submit(claim) {
      const key = await claims.put(claim.attemptId, claim);
      await queue.send(claim.attemptId, key);
    },
  };
}

/** On AWS the stack sets both; anywhere else verification is off. */
export function verifierFromEnv(): Verifier | null {
  const bucket = process.env.DATA_BUCKET;
  const url = process.env.VERIFY_QUEUE_URL;
  return bucket && url ? verifier(s3ClaimStore(new S3Client({}), bucket), sqsVerifyQueue(new SQSClient({}), url)) : null;
}
