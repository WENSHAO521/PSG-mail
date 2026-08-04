import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const externalApiKey = sqliteTable('external_api_key', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	name: text('name').notNull().default(''),
	keyHash: text('key_hash').notNull(),
	keyPrefix: text('key_prefix').notNull(),
	status: integer('status').notNull().default(1),
	lastUsedTime: text('last_used_time'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export default externalApiKey;
