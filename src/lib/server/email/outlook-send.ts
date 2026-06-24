// Send a single email via Microsoft Graph (/me/sendMail).
// Graph accepts a JSON message object directly (no MIME assembly needed).

const SENDMAIL_ENDPOINT = 'https://graph.microsoft.com/v1.0/me/sendMail';

export interface SendMessage {
	from: string;
	to: string;
	toName?: string;
	subject: string;
	/** Plain-text body. */
	body: string;
}

/** Distinguishes an expired/invalid token from other send failures, so the UI can prompt reconnect. */
export class TokenExpiredError extends Error {}

/** Send one message. Throws TokenExpiredError on 401, Error on other failures. */
export async function sendViaOutlook(accessToken: string, msg: SendMessage): Promise<void> {
	const payload = {
		message: {
			subject: msg.subject,
			body: { contentType: 'Text', content: msg.body },
			toRecipients: [
				{
					emailAddress: {
						address: msg.to,
						...(msg.toName ? { name: msg.toName } : {})
					}
				}
			]
		},
		// We do not save a copy to keep the run lightweight; flip to true if desired.
		saveToSentItems: true
	};

	const res = await fetch(SENDMAIL_ENDPOINT, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	if (res.status === 401) {
		throw new TokenExpiredError('Outlook access token expired. Please reconnect your account.');
	}
	// Graph returns 202 Accepted on success.
	if (!res.ok && res.status !== 202) {
		let detail = `${res.status}`;
		try {
			const body = (await res.json()) as { error?: { message?: string } };
			detail = body.error?.message ?? detail;
		} catch {
			/* ignore body parse errors */
		}
		throw new Error(`Outlook send failed: ${detail}`);
	}
}
