// Structured (one JSON object per line) logging. Workers Observability indexes
// JSON fields, so `traceId` / `module` / `event` become filterable.
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

export interface Logger {
	debug(event: string, fields?: LogFields): void;
	info(event: string, fields?: LogFields): void;
	warn(event: string, fields?: LogFields): void;
	error(event: string, fields?: LogFields): void;
	child(fields: LogFields): Logger;
}

const SINK: Record<LogLevel, (line: string) => void> = {
	debug: (l) => console.debug(l),
	info: (l) => console.log(l),
	warn: (l) => console.warn(l),
	error: (l) => console.error(l),
};

export function serializeError(err: unknown): LogFields {
	if (err instanceof Error) {
		return { name: err.name, message: err.message, stack: err.stack };
	}
	return { message: String(err) };
}

export function createLogger(module: string, base: LogFields = {}): Logger {
	const emit = (level: LogLevel, event: string, fields?: LogFields) => {
		// Reserved keys come last so callers can't overwrite them.
		SINK[level](JSON.stringify({ ...base, ...fields, level, module, event, ts: new Date().toISOString() }));
	};
	return {
		debug: (e, f) => emit('debug', e, f),
		info: (e, f) => emit('info', e, f),
		warn: (e, f) => emit('warn', e, f),
		error: (e, f) => emit('error', e, f),
		child: (fields) => createLogger(module, { ...base, ...fields }),
	};
}
