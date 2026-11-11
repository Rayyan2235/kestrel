import { GetParameterCommand } from "@aws-sdk/client-ssm";
import { expect, it, vi } from "vitest";
import { loadElevenLabsKey } from "./ssm.js";

const PARAM = "/kestrel/elevenlabs-api-key";

it("reads the SecureString once into ELEVENLABS_API_KEY, decrypted", async () => {
  const send = vi.fn().mockResolvedValue({ Parameter: { Value: "sk-from-ssm" } });
  const env: NodeJS.ProcessEnv = { ELEVENLABS_KEY_PARAM: PARAM };
  await loadElevenLabsKey(env, { send } as never);
  expect(env.ELEVENLABS_API_KEY).toBe("sk-from-ssm");
  const [command] = send.mock.calls[0]!;
  expect(command).toBeInstanceOf(GetParameterCommand);
  expect(command.input).toEqual({ Name: PARAM, WithDecryption: true });
});

it("does nothing locally and on Vultr, or when the key is already set", async () => {
  const send = vi.fn();
  await loadElevenLabsKey({}, { send } as never);
  const env: NodeJS.ProcessEnv = { ELEVENLABS_KEY_PARAM: PARAM, ELEVENLABS_API_KEY: "sk-local" };
  await loadElevenLabsKey(env, { send } as never);
  expect(send).not.toHaveBeenCalled();
  expect(env.ELEVENLABS_API_KEY).toBe("sk-local");
});

it("leaves voice off and logs only the error name when SSM refuses", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const denied = Object.assign(new Error(`User is not authorized to access ${PARAM}`), { name: "AccessDeniedException" });
  const env: NodeJS.ProcessEnv = { ELEVENLABS_KEY_PARAM: PARAM };
  await loadElevenLabsKey(env, { send: vi.fn().mockRejectedValue(denied) } as never);
  expect(env.ELEVENLABS_API_KEY).toBeUndefined();
  expect(log).toHaveBeenCalledWith(expect.stringContaining("AccessDeniedException"));
  expect(log.mock.calls[0]![0]).not.toContain(PARAM);
  log.mockRestore();
});
