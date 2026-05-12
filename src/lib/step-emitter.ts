import { EventEmitter } from "events";

/**
 * Process-wide event bus that connects the TeaseMe webhook receiver to open
 * SSE connections. Events are keyed as "step:<referralId>" so each stream
 * listener only wakes up for its own referral.
 *
 * MaxListeners is raised to 200 to accommodate many simultaneous browser tabs
 * without triggering Node's memory-leak warning.
 */
export const stepEmitter = new EventEmitter();
stepEmitter.setMaxListeners(200);
