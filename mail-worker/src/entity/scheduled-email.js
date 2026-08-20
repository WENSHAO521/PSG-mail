import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const scheduledEmail = sqliteTable('scheduled_email', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	accountId: integer('account_id').notNull(),
	// Full emailService.send() params, captured verbatim at schedule time
	// (recipients/cc/bcc/subject/content/text/attachments/sendType/emailId
	// for replies) so processDue() can call send() exactly as if the user
	// had clicked Send at scheduled_at.
	payload: text('payload').notNull(),
	scheduledAt: text('scheduled_at').notNull(),
	timezone: text('timezone').default(''),
	status: text('status').notNull().default('pending'),
	attemptCount: integer('attempt_count').notNull().default(0),
	lastError: text('last_error'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updateTime: text('update_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	sentTime: text('sent_time'),
	resultEmailId: integer('result_email_id'),
});

export default scheduledEmail;
