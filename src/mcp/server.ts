import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { errorText } from '../shared/faults.ts';
import type { ToolResult, ToolSpec } from '../tool.ts';

/** Newest first; a client asking for one of these gets it, any other gets the newest. */
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

interface Request { jsonrpc: '2.0'; id?: string | number | null; method?: string; params?: Record<string, unknown> }
type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
/** What the server serves: the tools as they stand, and running one of them. */
export interface McpTools { tools(): ToolSpec[]; call(name: string, args: unknown, signal: AbortSignal): Promise<ToolResult> }

const ERR = { parse: -32700, invalid: -32600, method: -32601, params: -32602 };

/** A tool result as MCP content: the text, then each picture after its caption. */
export function toContent(result: ToolResult): Content[] {
  return [
    { type: 'text', text: result.text },
    ...(result.images ?? []).flatMap((image): Content[] => [
      ...(image.caption ? [{ type: 'text' as const, text: image.caption }] : []),
      { type: 'image', data: image.data.toString('base64'), mimeType: image.mediaType },
    ]),
  ];
}

/**
 * A Model Context Protocol server over stdio: one JSON-RPC message per line. Nothing but protocol goes to `output`,
 * so everything else the plugin says goes to `log` (stderr). Each tool call can be cancelled by the client, and
 * `toolsChanged` tells the client to list again when the user turned desktop control on or off.
 */
export function serveMcp(server: McpTools, io: { input: Readable; output: Writable; log?(text: string): void }, info: { name: string; version: string; instructions: string }) {
  const running = new Map<string | number, AbortController>();
  let initialized = false;
  const send = (message: unknown) => { io.output.write(`${JSON.stringify(message)}\n`); };
  const reply = (id: Request['id'], result: unknown) => { if (id !== undefined && id !== null) send({ jsonrpc: '2.0', id, result }); };
  const fail = (id: Request['id'], code: number, message: string) => send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

  async function toolCall(id: string | number, params: Record<string, unknown> | undefined): Promise<void> {
    const name = params?.name;
    if (typeof name !== 'string') return fail(id, ERR.params, 'tools/call 要给 name');
    const controller = new AbortController();
    running.set(id, controller);
    try {
      const result = await server.call(name, params?.arguments ?? {}, controller.signal);
      if (!controller.signal.aborted) reply(id, { content: toContent(result) });
    } catch (error) {
      // A cancelled request gets no answer; any other failure is the agent's to read, as a tool error.
      if (!controller.signal.aborted) reply(id, { content: [{ type: 'text', text: errorText(error) }], isError: true });
    } finally { running.delete(id); }
  }
  function handle(message: Request): void {
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') return fail(null, ERR.invalid, '不是 JSON-RPC 2.0 消息');
    const { id, method, params } = message;
    if (typeof method !== 'string') return; // a response to something this server never asks
    switch (method) {
      case 'initialize': {
        const asked = params?.protocolVersion;
        return reply(id, {
          protocolVersion: typeof asked === 'string' && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: info.name, version: info.version },
          instructions: info.instructions,
        });
      }
      case 'notifications/initialized': initialized = true; return;
      case 'notifications/cancelled': { const target = params?.requestId; if (typeof target === 'string' || typeof target === 'number') running.get(target)?.abort(); return; }
      case 'ping': return reply(id, {});
      case 'tools/list': return reply(id, { tools: server.tools().map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case 'tools/call':
        if (id === undefined || id === null) return;
        void toolCall(id, params);
        return;
      default:
        if (id !== undefined && id !== null) fail(id, ERR.method, `不支持 ${method}`);
    }
  }

  const lines = createInterface({ input: io.input });
  lines.on('line', line => {
    if (!line.trim()) return;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { return fail(null, ERR.parse, 'JSON 格式不对'); }
    // Batches are from 2025-03-26 and earlier; each message in one is handled as if sent alone.
    for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
      try { handle(message as Request); } catch (error) { io.log?.(`处理消息时出错：${errorText(error)}`); }
    }
  });
  const closed = new Promise<void>(resolve => lines.once('close', () => { for (const controller of running.values()) controller.abort(); resolve(); }));
  return {
    /** Tells the client to list the tools again; before it finished initializing there is nothing to tell. */
    toolsChanged(): void { if (initialized) send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }); },
    /** Resolves when the client closed the input. */
    closed,
  };
}
