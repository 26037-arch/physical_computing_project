#!/usr/bin/env node
// Minimal MCP (stdio, JSON-RPC) server that forwards to the FusionMCPBridge add-in.
// No dependencies: run with `node tools/fusion-bridge/mcp-server.mjs`.
import { createInterface } from "node:readline";

const BRIDGE = process.env.FUSION_BRIDGE_URL || "http://127.0.0.1:7432";

const TOOLS = [
  {
    name: "fusion_ping",
    description: "Check that Fusion 360 is running with the FusionMCPBridge add-in; returns the active document name.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "fusion_exec",
    description:
      "Run Python code inside Fusion 360 (Fusion API). Predefined: adsk, app, ui, design, root (root component). " +
      "Units are cm. print() output is returned; assign a JSON-serializable value to `result` to return it.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string", description: "Python source to execute" } },
      required: ["code"],
    },
  },
];

async function callBridge(path, body) {
  try {
    const res = await fetch(BRIDGE + path, body === undefined
      ? {}
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await res.json();
  } catch (e) {
    return { ok: false, error: `Cannot reach Fusion bridge at ${BRIDGE} (${e.message}). Is Fusion open and the FusionMCPBridge add-in running?` };
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handle(req) {
  const { id, method, params } = req;
  if (method === "initialize") {
    return send({ jsonrpc: "2.0", id, result: {
      protocolVersion: params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "fusion-bridge", version: "1.0.0" },
    } });
  }
  if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  if (method === "tools/call") {
    const r = params.name === "fusion_ping"
      ? await callBridge("/ping")
      : params.name === "fusion_exec"
        ? await callBridge("/exec", { code: params.arguments?.code ?? "" })
        : { ok: false, error: `unknown tool ${params.name}` };
    return send({ jsonrpc: "2.0", id, result: {
      content: [{ type: "text", text: JSON.stringify(r, null, 2) }],
      isError: !r.ok,
    } });
  }
  if (id !== undefined && id !== null) {
    if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  handle(req).catch((e) => req.id != null && send({ jsonrpc: "2.0", id: req.id, error: { code: -32603, message: e.message } }));
});
