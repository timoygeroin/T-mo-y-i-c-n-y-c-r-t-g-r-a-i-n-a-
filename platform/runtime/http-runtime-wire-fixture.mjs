import { createMondayIDHttpRuntime } from "./http-runtime.mjs";

const statePath = process.env.MONDAYID_WIRE_STATE_PATH ?? ".mondayid/wire-state.enc";
const stateKey = process.env.MONDAYID_STATE_KEY ?? "wire-state-key-with-enough-entropy";
const controlToken = process.env.MONDAYID_CONTROL_TOKEN ?? "wire-control-secret";
const port = Number(process.env.PORT ?? 8787);

const agent = {
  async run({ signal, state }) {
    return {
      status: "executed",
      result: `wire:${signal}:after:${state.revision}`,
      receiptId: `wire-r-${state.revision + 1}`,
      providerId: "wire-provider",
      continuation: { objective: signal, checkpoint: state.revision + 1 },
      trace: [{ phase: "wire-proof", observedRevision: state.revision }],
    };
  },
};

const server = createMondayIDHttpRuntime({ agent, statePath, stateKey, controlToken });
server.listen(port, "127.0.0.1", () => {
  console.log(JSON.stringify({ status: "listening", port, statePath }));
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
