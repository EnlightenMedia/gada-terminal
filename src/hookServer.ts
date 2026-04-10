import * as http from 'http';
import type { ToolEvent, ApiRequestEvent, PermissionDecision, PermissionRequest } from './types';

export interface HookServer {
  port: number;
  close: () => void;
  decidePermission: (id: string, decision: PermissionDecision, reason?: string) => void;
}

const AUTO_APPROVE = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead', 'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TaskOutput']);
const WRITE_TOOLS  = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

export function startHookServer(
  onToolEvent: (event: ToolEvent) => void,
  onApiRequest: (event: ApiRequestEvent) => void,
  onPermissionNeeded: (req: PermissionRequest) => void,
  onPermissionModeChange: (mode: string) => void,
  onPermissionCancelled: (id: string) => void
): Promise<HookServer> {
  return new Promise((resolve, reject) => {
    const pendingPermissions = new Map<string, http.ServerResponse>();
    let lastPermMode = '';

    function sendDecision(res: http.ServerResponse, decision: PermissionDecision, reason?: string): void {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (decision === 'passthrough') {
        res.end('{}');
      } else {
        const permissionDecision = decision === 'deny' ? 'deny' : 'allow';
        const output: Record<string, unknown> = { hookEventName: 'PreToolUse', permissionDecision };
        if (reason) output['permissionDecisionReason'] = reason;
        res.end(JSON.stringify({ hookSpecificOutput: output }));
      }
    }

    function decidePermission(id: string, decision: PermissionDecision, reason?: string): void {
      const pending = pendingPermissions.get(id);
      if (!pending) return;
      pendingPermissions.delete(id);
      sendDecision(pending, decision, reason);
    }

    const server = http.createServer((req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405).end('{}');
        return;
      }

      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const ct = req.headers['content-type'] ?? '';
          handleRequest(req.url ?? '', Buffer.concat(chunks).toString('utf-8'), res, onToolEvent, onApiRequest, ct, pendingPermissions, sendDecision, onPermissionNeeded, (mode) => {
            if (mode !== lastPermMode) { lastPermMode = mode; onPermissionModeChange(mode); }
          }, onPermissionCancelled);
        } catch (err) {
          console.error('[hookServer] Unhandled error:', err);
          res.writeHead(500).end('{}');
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get hook server port'));
        return;
      }
      resolve({
        port: addr.port,
        close: () => server.close(),
        decidePermission,
      });
    });

    server.on('error', reject);
  });
}

function handleRequest(
  url: string,
  body: string,
  res: http.ServerResponse,
  onToolEvent: (event: ToolEvent) => void,
  onApiRequest: (event: ApiRequestEvent) => void,
  contentType: string,
  pendingPermissions: Map<string, http.ServerResponse>,
  sendDecision: (res: http.ServerResponse, decision: PermissionDecision, reason?: string) => void,
  onPermissionNeeded: (req: PermissionRequest) => void,
  onMode: (mode: string) => void,
  onPermissionCancelled: (id: string) => void
): void {
  if (url === '/v1/logs') {
    if (contentType.includes('json')) {
      parseOtlpLogs(body, onApiRequest);
    }
    res.writeHead(200).end('{}');
    return;
  }

  if (url.startsWith('/v1/')) {
    res.writeHead(200).end('{}');
    return;
  }

  if (url !== '/hooks') {
    res.writeHead(404).end('{}');
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400).end('{}');
    return;
  }

  const hookEventName = parsed['hook_event_name'] as string;
  const toolName = (parsed['tool_name'] as string) ?? 'Unknown';
  const toolInput = (parsed['tool_input'] as Record<string, unknown>) ?? {};
  // Use Claude's stable tool_use_id for correlation; fall back to generated id
  const id = (parsed['tool_use_id'] as string) || generateId();
  const permMode = (parsed['permission_mode'] as string) ?? 'default';

  if (hookEventName === 'PreToolUse') {
    onMode(permMode);

    onToolEvent({
      id,
      event: 'PreToolUse',
      toolName,
      input: toolInput,
      timestamp: Date.now(),
    });

    const autoApprove =
      AUTO_APPROVE.has(toolName) ||
      (permMode === 'acceptEdits' && WRITE_TOOLS.has(toolName)) ||
      permMode === 'bypassPermissions' ||
      permMode === 'dontAsk';

    if (autoApprove) {
      // Silent pass-through — no user prompt needed
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
      }));
    } else {
      // Hold the HTTP response open until the user decides.
      // If Claude Code closes the connection first (timeout), remove the stale card.
      pendingPermissions.set(id, res);
      res.on('close', () => {
        if (pendingPermissions.has(id)) {
          pendingPermissions.delete(id);
          onPermissionCancelled(id);
        }
      });
      onPermissionNeeded({ id, toolName, input: toolInput, timestamp: Date.now() });
    }

  } else if (hookEventName === 'PostToolUse') {
    const raw = parsed['tool_response'];
    const output = truncate(
      typeof raw === 'string' ? raw : JSON.stringify(raw) ?? '',
      500
    );
    onToolEvent({
      id,
      event: 'PostToolUse',
      toolName,
      input: toolInput,
      output,
      timestamp: Date.now(),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse' } }));

  } else if (hookEventName === 'PostToolUseFailure') {
    const error = String(parsed['error'] ?? '');
    onToolEvent({
      id,
      event: 'PostToolUseFailure',
      toolName,
      input: toolInput,
      error,
      timestamp: Date.now(),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUseFailure' } }));

  } else {
    // Unknown event — acknowledge and ignore
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ── OTLP log parser ───────────────────────────────────────────────────────────

type OtlpAttrValue = { intValue?: string | number; doubleValue?: number; stringValue?: string; boolValue?: boolean };
type OtlpAttr = { key: string; value: OtlpAttrValue };
type OtlpAttrs = Record<string, string | number | boolean>;

function extractAttrs(attributes: OtlpAttr[]): OtlpAttrs {
  const result: OtlpAttrs = {};
  for (const attr of attributes) {
    const v = attr.value;
    if (v.intValue !== undefined) result[attr.key] = Number(v.intValue);
    else if (v.doubleValue !== undefined) result[attr.key] = v.doubleValue;
    else if (v.stringValue !== undefined) result[attr.key] = v.stringValue;
    else if (v.boolValue !== undefined) result[attr.key] = v.boolValue;
  }
  return result;
}

function numAttr(attrs: OtlpAttrs, ...keys: string[]): number {
  for (const k of keys) {
    if (k in attrs) return Number(attrs[k]);
  }
  return 0;
}

function strAttr(attrs: OtlpAttrs, ...keys: string[]): string {
  for (const k of keys) {
    if (k in attrs) return String(attrs[k]);
  }
  return '';
}


function parseOtlpLogs(body: string, onApiRequest: (event: ApiRequestEvent) => void): void {
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return; }

  const resourceLogs = ((payload as Record<string, unknown>)['resourceLogs'] as unknown[]) ?? [];
  for (const rl of resourceLogs) {
    const scopeLogs = ((rl as Record<string, unknown>)['scopeLogs'] as unknown[]) ?? [];
    for (const sl of scopeLogs) {
      const logRecords = ((sl as Record<string, unknown>)['logRecords'] as unknown[]) ?? [];
      for (const lr of logRecords) {
        const raw = ((lr as Record<string, unknown>)['attributes'] as OtlpAttr[]) ?? [];
        const attrs = extractAttrs(raw);

        if (attrs['event.name'] !== 'api_request') continue;

        const inputTokens      = numAttr(attrs, 'input_tokens');
        const outputTokens     = numAttr(attrs, 'output_tokens');
        const cacheReadTokens  = numAttr(attrs, 'cache_read_tokens');
        const cacheWriteTokens = numAttr(attrs, 'cache_creation_tokens');
        const model            = strAttr(attrs, 'model');
        const costUsd          = numAttr(attrs, 'cost_usd');
        const durationMs       = numAttr(attrs, 'duration_ms');

        onApiRequest({ timestamp: Date.now(), model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd, durationMs });
      }
    }
  }
}
