import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const mailLabelEmail = sqliteTable('mail_label_email', {
	labelId: integer('label_id').notNull(),
	emailId: integer('email_id').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
	pk: primaryKey({ columns: [table.labelId, table.emailId] }),
}));

export default mailLabelEmail;
