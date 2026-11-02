// V6.1 real-time checks through the user's own provider: one short request
// per sentence. The prompt contract and the strict parser are shared with the
// local engine (shared/realtime-model.ts).
import {
  REALTIME_INSTRUCTION,
  REALTIME_SCHEMA,
  realtimeMessage,
} from '../shared/realtime-model';
import type { TaskRequest } from './transport';

export { parseRealtime } from '../shared/realtime-model';

/** Short on purpose: a late underline is useless. No retry. */
export const REALTIME_TIMEOUT_MS = 8_000;

/**
 * The text travels as its own message, never inside the instructions. Only
 * the sentence and the previous one: never the field, URL or page title.
 */
export function realtimeTask(sentence: string, context: string): TaskRequest {
  return {
    name: 'correctly_realtime',
    instruction: REALTIME_INSTRUCTION,
    text: realtimeMessage(sentence, context),
    temperature: 0,
    // Room for a few issues plus minimal thinking; bounds tokens, not money.
    maxOutputTokens: 512,
    schema: REALTIME_SCHEMA,
  };
}
