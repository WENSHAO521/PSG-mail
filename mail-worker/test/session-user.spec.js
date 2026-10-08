import { describe, it, expect } from 'vitest';
import { toSessionUser } from '../src/utils/session-user';

describe('toSessionUser', () => {
	it('drops password hash and salt but keeps identity fields', () => {
		const out = toSessionUser({ userId: 1, email: 'a@b.c', password: 'h', salt: 's', type: 2 });
		expect(out).toEqual({ userId: 1, email: 'a@b.c', type: 2 });
	});
});
