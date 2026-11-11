import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

// The only module that talks to SSM Parameter Store. On AWS the ElevenLabs key
// is a SecureString parameter the owner creates once (infra/README.md), so it
// never appears in the CloudFormation template or the Lambda's environment
// settings. It is read once per cold start into process.env, where voice.ts and
// live.ts already look for it. Locally and on Vultr ELEVENLABS_KEY_PARAM is
// unset and this does nothing.

type Ssm = Pick<SSMClient, "send">;

export async function loadElevenLabsKey(env: NodeJS.ProcessEnv = process.env, ssm?: Ssm): Promise<void> {
  const name = env.ELEVENLABS_KEY_PARAM;
  if (!name || env.ELEVENLABS_API_KEY) return;
  try {
    const { Parameter } = await (ssm ?? new SSMClient({})).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    if (Parameter?.Value) env.ELEVENLABS_API_KEY = Parameter.Value;
  } catch (error) {
    // Voice turns off (live.ts answers 503) and the rest of the API still starts.
    // Only the error name: the message could echo the parameter.
    console.error(`ElevenLabs key unavailable from SSM (${(error as { name?: string }).name ?? "error"}); voice is off.`);
  }
}
