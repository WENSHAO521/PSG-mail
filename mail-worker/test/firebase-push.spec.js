import { describe, it, expect } from 'vitest';
import { buildMessage } from '../src/service/firebase-push-service';

describe('Firebase Android push payload', () => {
	it('keeps the sender and subject in the Android notification block', () => {
		const message = buildMessage(
			{ platform: 'android', targetValue: 'android-token' },
			{
				title: 'Editorial Office',
				body: '论文第二次修改及其说明',
				data: { type: 'new_mail', emailId: 42, accountId: 7, subject: '论文第二次修改及其说明' },
			}
		);

		expect(message.notification).toEqual({
			title: 'Editorial Office',
			body: '论文第二次修改及其说明',
		});
		expect(message.android.notification).toMatchObject({
			title: 'Editorial Office',
			body: '论文第二次修改及其说明',
			channel_id: 'psg-mail-inbox',
			tag: 'psg-mail-42',
		});
		expect(message.data.notificationBody).toBe('论文第二次修改及其说明');
	});

	it('does not send an empty Android notification body', () => {
		const message = buildMessage(
			{ platform: 'android', targetValue: 'android-token' },
			{ title: '', body: '', data: { type: 'new_mail', emailId: 43 } }
		);

		expect(message.notification.title).toBe('PSG Mail');
		expect(message.android.notification.body).toBe('New email');
		expect(message.data.notificationBody).toBe('New email');
	});
});
