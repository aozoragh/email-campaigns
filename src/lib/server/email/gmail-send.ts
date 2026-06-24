// Send a single email via the Gmail API (users.messages.send).
// Gmail expects a base64url-encoded RFC 822 MIME message.

const SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export interface SendMessage {
	from: string;
	to: string;
	toName?: string;
	subject: string;
	/** Plain-text body (we keep it plain-text for simplicity and deliverability). */
	body: string;
}

/** Distinguishes an expired/invalid token from other send failures, so the UI can prompt reconnect. */
export class TokenExpiredError extends Error {}

function encodeHeader(value: string): string {
	// RFC 2047 encode non-ASCII header values (subject, display name).
	// eslint-disable-next-line no-control-regex
	if (/^[\x00-\x7F]*$/.test(value)) return value;
	return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

function buildMime(msg: SendMessage): string {
	const toHeader = msg.toName ? `${encodeHeader(msg.toName)} <${msg.to}>` : msg.to;
	const lines = [
		`From: ${msg.from}`,
		`To: ${toHeader}`,
		`Subject: ${encodeHeader(msg.subject)}`,
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset="UTF-8"',
		'Content-Transfer-Encoding: 7bit',
		'',
		msg.body
	];
	return lines.join('\r\n');
}

function toBase64Url(input: string): string {
	return Buffer.from(input, 'utf-8')
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

/** Send one message. Throws TokenExpiredError on 401, Error on other failures. */
export async function sendViaGmail(accessToken: string, msg: SendMessage): Promise<void> {
	const raw = toBase64Url(buildMime(msg));

	const res = await fetch(SEND_ENDPOINT, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ raw })
	});

	if (res.status === 401) {
		throw new TokenExpiredError('Gmail access token expired. Please reconnect your account.');
	}
	if (!res.ok) {
		let detail = `${res.status}`;
		try {
			const body = (await res.json()) as { error?: { message?: string } };
			detail = body.error?.message ?? detail;
		} catch {
			/* ignore body parse errors */
		}
		throw new Error(`Gmail send failed: ${detail}`);
	}
}
