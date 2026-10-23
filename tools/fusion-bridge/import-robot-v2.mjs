#!/usr/bin/env node
// Runs the repository MCP server locally and calls its real fusion_ping/exec.
// Usage: node tools/fusion-bridge/import-robot-v2.mjs cube|head|robot
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '../..');
const choice = process.argv[2] || 'cube';
if (!['cube', 'head', 'robot'].includes(choice)) throw new Error('Choose cube, head, or robot');
const child = spawn(process.execPath, [resolve(here, 'mcp-server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
let nextId = 1;
createInterface({ input: child.stdout }).on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const call = pending.get(message.id);
  if (!call) return;
  pending.delete(message.id);
  clearTimeout(call.timer);
  if (message.error) call.reject(new Error(JSON.stringify(message.error)));
  else call.resolve(message.result);
});
child.on('exit', code => {
  for (const call of pending.values()) { clearTimeout(call.timer); call.reject(new Error(`MCP exited (${code})`)); }
  pending.clear();
});
function rpc(method, params) {
  return new Promise((resolveCall, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Fusion MCP timed out after 130 seconds')); }, 130000);
    pending.set(id, { resolve: resolveCall, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
function toolValue(response) {
  const value = JSON.parse(response.content.find(item => item.type === 'text').text);
  if (response.isError || !value.ok) throw new Error(value.error || JSON.stringify(value));
  return value;
}
try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'robot-v2-import', version: '1.0' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const ping = toolValue(await rpc('tools/call', { name: 'fusion_ping', arguments: {} }));
  console.log('Fusion connected:', ping.result);
  const script = readFileSync(resolve(project, 'fusion/scripts/import_robot_v2.py'), 'utf8');
  // JSON literals are valid Python string literals for ordinary Windows paths;
  // ensure_ascii semantics from JSON.stringify escape every path backslash.
  const modelPath = JSON.stringify(resolve(project, 'models/robot_v2'));
  const code = `MODEL_DIR = ${modelPath}\n${script}\nresult = import_design(${JSON.stringify(choice)})\n`;
  const response = toolValue(await rpc('tools/call', { name: 'fusion_exec', arguments: { code } }));
  console.log(JSON.stringify(response.result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  child.kill();
}
