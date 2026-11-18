import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Row } from '../browser/page.ts';
import { substitute, type MessageMap } from './format.ts';
import type { Args } from './run.ts';

/** One message a procedure read, as the `messages` map of that procedure declares it. */
export interface MessageRecord {
  /** Keyed by the platform's own message, so reading the same message again finds the same record. */
  id: string;
  procedure: string; channel: string; accountId: string; conversationType: 'private' | 'group'; conversationId: string;
  messageId: string; speakerId: string; speakerName?: string; conversationName?: string; content: string;
  occurredAt: string; outgoing: boolean;
}
/** Where what procedures read is filed; `written` counts only records it did not have yet. */
export interface MessageSink { record(records: MessageRecord[]): Promise<{ written: number }> }

const MAX_FIELD = 256, MAX_CONTENT = 2000;
const CONTROL = /[\u0000-\u001f\u007f]/;
const usable = (value: string) => value !== '' && value.length <= MAX_FIELD && !CONTROL.test(value);

export const messageId = (channel: string, conversationId: string, platformMessageId: string) =>
  createHash('sha256').update(JSON.stringify([channel, conversationId, platformMessageId])).digest('hex');

/** The rows of a run as records; a row missing an identity field, or holding one that is not a plain line, is skipped. */
export function messageRecords(procedure: string, map: MessageMap, rows: readonly Row[], args: Args, now: Date = new Date()): { records: MessageRecord[]; skipped: number } {
  const records: MessageRecord[] = [];
  let skipped = 0;
  for (const row of rows) {
    const values = { ...args, ...row };
    const field = (template: string | undefined) => template === undefined ? '' : substitute(template, values).trim();
    const accountId = field(map.accountId), conversationId = field(map.conversationId), platformId = field(map.messageId), content = field(map.content);
    const outgoing = field(map.outgoing) === 'true';
    const speakerId = outgoing ? accountId : field(map.speakerId);
    const speakerName = field(map.speakerName), conversationName = field(map.conversationName);
    if (![accountId, conversationId, platformId, speakerId].every(usable) || !content || [speakerName, conversationName].some(name => name && !usable(name))) { skipped++; continue; }
    const when = Date.parse(field(map.occurredAt));
    records.push({
      id: messageId(map.channel, conversationId, platformId), procedure, channel: map.channel, accountId, conversationType: map.conversationType,
      conversationId, messageId: platformId, speakerId, ...(speakerName ? { speakerName } : {}), ...(conversationName ? { conversationName } : {}),
      content: [...content].slice(0, MAX_CONTENT).join(''), occurredAt: new Date(Number.isFinite(when) ? when : now.getTime()).toISOString(), outgoing,
    });
  }
  return { records, skipped };
}

/**
 * Records appended to one JSONL file, each id once. The ids already there are read on first use, so an existing file
 * from an earlier run is never written twice; a line that does not parse is left as it is and skipped.
 */
export function createJsonlSink(file: string): MessageSink {
  let known: Set<string> | undefined;
  function ids(): Set<string> {
    if (known) return known;
    known = new Set();
    if (existsSync(file)) for (const line of readFileSync(file, 'utf8').split('\n')) {
      try { const id = (JSON.parse(line) as { id?: unknown }).id; if (typeof id === 'string') known.add(id); } catch { /* not a record */ }
    }
    return known;
  }
  return {
    async record(records) {
      const seen = ids();
      const fresh = records.filter(record => !seen.has(record.id) && (seen.add(record.id), true));
      if (fresh.length) { mkdirSync(dirname(file), { recursive: true }); appendFileSync(file, fresh.map(record => JSON.stringify(record) + '\n').join('')); }
      return { written: fresh.length };
    },
  };
}
