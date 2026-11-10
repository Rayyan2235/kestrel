import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

// The only module that talks to SQS. A verify message is a claim check: the
// attempt and where its claim sits in S3, never the claim itself. The
// verifier Lambda reads the queue (infra/kestrel_infra/stack.py).

export type VerifyQueue = { send(attemptId: string, s3Key: string): Promise<void> };

export function sqsVerifyQueue(client: SQSClient, queueUrl: string): VerifyQueue {
  return {
    async send(attemptId, s3Key) {
      await client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify({ attemptId, s3Key }) }));
    },
  };
}
