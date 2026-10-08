// Trace ids tie one request / queue job / cron run together across log lines.
// An inbound X-Trace-Id is honoured only if it looks like an id, so a client
// can't inject arbitrary text (newlines, huge strings) into our logs.
const TRACE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export const TRACE_HEADER = 'X-Trace-Id';

export function newTraceId(): string {
	return crypto.randomUUID().replace(/-/g, '');
}

export function resolveTraceId(inbound?: string | null): string {
	return inbound && TRACE_ID_PATTERN.test(inbound) ? inbound : newTraceId();
}
