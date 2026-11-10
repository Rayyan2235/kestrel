import { GetParameterCommand } from "@aws-sdk/client-ssm";
import { expect, it, vi } from "vitest";
import { loadSecrets } from "./ssm.js";

const PARAM = "/kestrel/elevenlabs-api-key";
const OWNER = "/kestrel/owner-token";

it("reads each SecureString once into its variable, decrypted", async () => {
  const send = vi.fn(async (c: GetParameterCommand) => ({ Parameter: { Value: c.input.Name === PARAM ? "sk-from-ssm" : "owner-from-ssm" } }));
  const env: NodeJS.ProcessEnv = { ELEVENLABS_KEY_PARAM: PARAM, OWNER_TOKEN_PARAM: OWNER };
  await loadSecrets(env, { send } as never);
  expect(env.ELEVENLABS_API_KEY).toBe("sk-from-ssm");
  expect(env.OWNER_TOKEN).toBe("owner-from-ssm");
  expect(send.mock.calls[0]![0]).toBeInstanceOf(GetParameterCommand);
  expect(send.mock.calls.map(([c]) => c.input)).toEqual([
    { Name: PARAM, WithDecryption: true },
    { Name: OWNER, WithDecryption: true },
  ]);
});

it("does nothing locally and on Vultr, or when the value is already set", async () => {
  const send = vi.fn();
  await loadSecrets({}, { send } as never);
  const env: NodeJS.ProcessEnv = { ELEVENLABS_KEY_PARAM: PARAM, ELEVENLABS_API_KEY: "sk-local" };
  await loadSecrets(env, { send } as never);
  expect(send).not.toHaveBeenCalled();
  expect(env.ELEVENLABS_API_KEY).toBe("sk-local");
});

it("turns off only the feature SSM refused, logging just the error name", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const denied = Object.assign(new Error(`User is not authorized to access ${PARAM}`), { name: "AccessDeniedException" });
  const send = vi.fn(async (c: GetParameterCommand) => {
    if (c.input.Name === PARAM) throw denied;
    return { Parameter: { Value: "owner-from-ssm" } };
  });
  const env: NodeJS.ProcessEnv = { ELEVENLABS_KEY_PARAM: PARAM, OWNER_TOKEN_PARAM: OWNER };
  await loadSecrets(env, { send } as never);
  expect(env.ELEVENLABS_API_KEY).toBeUndefined();
  expect(env.OWNER_TOKEN).toBe("owner-from-ssm");
  expect(log).toHaveBeenCalledWith(expect.stringContaining("AccessDeniedException"));
  expect(log.mock.calls[0]![0]).toContain("voice is off");
  expect(log.mock.calls[0]![0]).not.toContain(PARAM);
  log.mockRestore();
});
