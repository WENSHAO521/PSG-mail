import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const mailLabel = sqliteTable('mail_label', {
	labelId: integer('label_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	name: text('name').notNull(),
	color: text('color').notNull().default('#7e7576'),
	sortOrder: integer('sort_order').notNull().default(0),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updateTime: text('update_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export default mailLabel;
