import { compileMcpEgress, compileMcpIngress } from "./mcp-receptor-contract.mjs";

function freeze(value) {
  return Object.freeze(value);
}

export function createMcpWorkAdapter({ createWorkForIngress }) {
  if (typeof createWorkForIngress !== "function") {
    throw new TypeError("MCP Work adapter requires createWorkForIngress(ingress)");
  }

  return freeze({
    id: "MONDAYID_MCP_WORK_ADAPTER_V1",
    role: "receptor_adapter",
    root: "MONDAYID_UNIFIED_RUNTIME",
    ownsCognition: false,
    ownsIdentity: false,
    ownsCanonicalState: false,

    async handle(rawInput, { includeDiagnostics = false, maxPasses = 8 } = {}) {
      const ingress = compileMcpIngress(rawInput);
      const work = await createWorkForIngress(ingress);

      if (!work || typeof work.runUntilBlocker !== "function") {
        throw new TypeError("createWorkForIngress() must return a MondayID Work runtime");
      }

      const result = await work.runUntilBlocker(ingress.task, { maxPasses });
      const workResult = result?.final ?? result;
      const egress = compileMcpEgress(workResult, { includeDiagnostics });

      return freeze({
        adapter: "MONDAYID_MCP_WORK_ADAPTER_V1",
        receptor: ingress.receptor,
        root: ingress.root,
        egress,
      });
    },
  });
}
