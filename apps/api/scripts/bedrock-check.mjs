// Checks which Claude models this AWS account can call on Bedrock.
// Usage (from apps/api): node --env-file=../../.env scripts/bedrock-check.mjs [modelId ...]
// Each check is one tiny request (a few tokens).
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";

const models = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["anthropic.claude-haiku-5-5", "anthropic.claude-sonnet-5", "anthropic.claude-haiku-4-5"];
const client = new AnthropicBedrockMantle({ awsRegion: process.env.AWS_REGION || "us-east-1" });

for (const model of models) {
  const t0 = performance.now();
  try {
    const msg = await client.messages.create({
      model,
      max_tokens: 64,
      messages: [{ role: "user", content: "Reply with just the word OK." }],
    });
    const text = msg.content.find((b) => b.type === "text")?.text ?? "";
    console.log(`OK    ${model.padEnd(30)} ${Math.round(performance.now() - t0)} ms  → "${text.trim()}"  (${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out)`);
  } catch (e) {
    console.log(`FAIL  ${model.padEnd(30)} ${e.status ?? ""} ${e.name}: ${String(e.message).split("\n")[0].slice(0, 220)}`);
  }
}
