import firebaseAuthService from './firebase-auth-service';

// FCM HTTP v1 error codes that specifically mean the token/registration is
// dead — as opposed to a transient/auth/payload problem, which shouldn't
// disable the device. https://firebase.google.com/docs/cloud-messaging/send-message#admin
const INVALID_ERROR_CODES = new Set([
	'UNREGISTERED',
	'NOT_FOUND',
	'SENDER_ID_MISMATCH'
]);

function buildMessage(device, payload) {
	const { title, body, data } = payload;
	const stringData = Object.fromEntries(
		Object.entries(data || {}).map(([k, v]) => [k, String(v)])
	);

	// Both platforms register an FCM registration token (device.targetKind
	// is always 'token' today); only the platform-specific delivery hints differ.
	const message = {
		token: device.targetValue,
		notification: { title, body },
		data: stringData
	};

	if (device.platform === 'android') {
		message.android = {
			priority: 'high',
			notification: { channel_id: 'psg-mail-inbox' }
		};
	} else {
		message.webpush = {
			fcm_options: { link: '/' }
		};
	}

	return message;
}

const firebasePushService = {

	async sendPush(c, device, payload) {
		const { env } = c;
		const projectId = env.FIREBASE_PROJECT_ID;
		if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not configured');

		const accessToken = await firebaseAuthService.getAccessToken(c);

		const res = await fetch(
			`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
			{
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ message: buildMessage(device, payload) })
			}
		);

		if (res.ok) return true;

		const errBody = await res.json().catch(() => null);
		const errorCode = errBody?.error?.details?.find(d => d.errorCode)?.errorCode;
		const errorMessage = errBody?.error?.message || res.statusText;

		const error = new Error(`FCM send failed (${res.status} ${errorCode || ''}): ${errorMessage}`);
		error.status = res.status;
		error.errorCode = errorCode;
		error.invalidDevice = INVALID_ERROR_CODES.has(errorCode);
		throw error;
	}
};

export default firebasePushService;
