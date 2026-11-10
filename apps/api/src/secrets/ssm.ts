import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

// The only module that talks to SSM Parameter Store. On AWS each secret is a
// SecureString parameter the owner creates once (infra/README.md), so it never
// appears in the CloudFormation template or the Lambda's environment settings.
// The stack sets the parameter's name (e.g. ELEVENLABS_KEY_PARAM); it is read
// once per cold start into the variable the code already reads (e.g.
// ELEVENLABS_API_KEY). Locally and on Vultr the *_PARAM names are unset and
// this does nothing.

type Ssm = Pick<SSMClient, "send">;

/** [variable holding the parameter name, variable the value goes into, what turns off without it] */
export const SECRETS = [
  ["ELEVENLABS_KEY_PARAM", "ELEVENLABS_API_KEY", "voice"],
  ["OWNER_TOKEN_PARAM", "OWNER_TOKEN", "owner insights"],
] as const;

export async function loadSecrets(env: NodeJS.ProcessEnv = process.env, ssm?: Ssm): Promise<void> {
  for (const [param, target, feature] of SECRETS) {
    const name = env[param];
    if (!name || env[target]) continue;
    try {
      ssm ??= new SSMClient({});
      const { Parameter } = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
      if (Parameter?.Value) env[target] = Parameter.Value;
    } catch (error) {
      // That feature turns off (its routes answer 503) and the rest of the API still starts.
      // Only the error name: the message could echo the parameter.
      console.error(`${target} unavailable from SSM (${(error as { name?: string }).name ?? "error"}); ${feature} is off.`);
    }
  }
}
