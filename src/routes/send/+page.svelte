<script lang="ts">
	import type { PageData } from './$types';
	import type { ParsedContact, SendResult, ContactRow } from '$lib/types';

	let { data }: { data: PageData } = $props();

	// No footer by default. The field below stays available so a footer can be
	// added per-send, but emails go out with no footer unless one is entered.
	const DEFAULT_FOOTER = '';

	// --- Form / contact state (browser-only; nothing persisted) ---
	let fileInput: HTMLInputElement | null = $state(null);
	let parsing = $state(false);
	let parseError = $state('');
	let contacts = $state<ParsedContact[] | null>(null);
	let validCount = $state(0);
	let skippedCount = $state(0);
	let duplicateCount = $state(0);
	let overLimit = $state(false);

	let subject = $state('');
	let body = $state('');
	let footer = $state(DEFAULT_FOOTER);
	let confirmed = $state(false);

	// --- Send state ---
	let sending = $state(false);
	let sendError = $state('');
	let abortedReason = $state('');
	let results = $state<SendResult[]>([]);
	let done = $state(false);

	const canSend = $derived(
		!!contacts &&
			validCount > 0 &&
			!overLimit &&
			subject.trim().length > 0 &&
			body.trim().length > 0 &&
			confirmed &&
			!sending
	);

	async function uploadFile() {
		parseError = '';
		const file = fileInput?.files?.[0];
		if (!file) {
			parseError = 'Please choose a .csv or .xlsx file.';
			return;
		}
		parsing = true;
		contacts = null;
		results = [];
		done = false;
		abortedReason = '';
		try {
			const form = new FormData();
			form.append('file', file);
			const res = await fetch('/api/parse', { method: 'POST', body: form });
			if (!res.ok) {
				const msg = await res.text();
				parseError = msg || 'Could not parse the file.';
				return;
			}
			const out = await res.json();
			contacts = out.contacts;
			validCount = out.validCount;
			skippedCount = out.skippedCount;
			duplicateCount = out.duplicateCount;
			overLimit = out.overLimit;
		} catch (err) {
			parseError = err instanceof Error ? err.message : 'Could not parse the file.';
		} finally {
			parsing = false;
		}
	}

	// Apply one streamed progress event to the live results table.
	function applyEvent(evt: {
		type: string;
		result?: SendResult;
		reason?: string;
	}) {
		if (evt.type === 'aborted') {
			abortedReason = evt.reason ?? 'The run was stopped.';
			return;
		}
		if (evt.type === 'done') {
			done = true;
			return;
		}
		if (evt.type === 'status' && evt.result) {
			const r = evt.result;
			// 'sent'/'failed' update the in-flight 'sending' row; everything else appends.
			const last = results[results.length - 1];
			if ((r.status === 'sent' || r.status === 'failed') && last && last.status === 'sending') {
				results[results.length - 1] = r;
			} else {
				results.push(r);
			}
		}
	}

	async function send() {
		if (!contacts || !canSend) return;
		sending = true;
		sendError = '';
		abortedReason = '';
		done = false;
		results = [];

		// Send back the ORIGINAL raw rows; the server re-validates authoritatively.
		const rows: ContactRow[] = contacts.map((c) => c.raw);

		try {
			const res = await fetch('/api/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subject, body, footer, rows })
			});
			if (!res.ok || !res.body) {
				sendError = (await res.text()) || 'Send failed to start.';
				return;
			}

			// Read the NDJSON stream and update the table as it arrives.
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			for (;;) {
				const { value, done: streamDone } = await reader.read();
				if (streamDone) break;
				buffer += decoder.decode(value, { stream: true });
				let nl: number;
				while ((nl = buffer.indexOf('\n')) >= 0) {
					const line = buffer.slice(0, nl).trim();
					buffer = buffer.slice(nl + 1);
					if (line) applyEvent(JSON.parse(line));
				}
			}
			if (buffer.trim()) applyEvent(JSON.parse(buffer.trim()));
		} catch (err) {
			sendError = err instanceof Error ? err.message : 'Send failed.';
		} finally {
			sending = false;
		}
	}

	async function downloadResults() {
		const res = await fetch('/api/results', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ results })
		});
		if (!res.ok) {
			sendError = (await res.text()) || 'Could not generate the results file.';
			return;
		}
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'email-send-results.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	const sentCount = $derived(results.filter((r) => r.status === 'sent').length);
	const failedCount = $derived(results.filter((r) => r.status === 'failed').length);
	const previewContacts = $derived(contacts ? contacts.slice(0, 100) : []);
</script>

<svelte:head>
	<title>Send — Small-Batch Email Sender</title>
</svelte:head>

<div class="alert info" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">
	<span>
		Connected as <strong>{data.account.email}</strong>
		<span class="badge">{data.account.provider}</span>
	</span>
	<form method="POST" action="/auth/logout">
		<button class="btn secondary" type="submit">Disconnect</button>
	</form>
</div>

<!-- Step 1: Upload -->
<div class="card">
	<h2>1. Upload contacts</h2>
	<p class="muted">CSV or XLSX. We look for an <code>email</code> column (and an optional <code>name</code> column).</p>
	<div class="field">
		<input bind:this={fileInput} type="file" accept=".csv,.xlsx,.xls" />
	</div>
	<button class="btn" onclick={uploadFile} disabled={parsing}>
		{parsing ? 'Parsing…' : 'Parse file'}
	</button>
	{#if parseError}
		<div class="alert error" style="margin-top:14px">{parseError}</div>
	{/if}
</div>

<!-- Step 2: Preview -->
{#if contacts}
	<div class="card">
		<h2>2. Review list</h2>
		<div class="summary">
			<span class="stat"><strong>{validCount}</strong><br /><span class="muted">valid</span></span>
			<span class="stat"><strong>{skippedCount}</strong><br /><span class="muted">skipped</span></span>
			<span class="stat"><strong>{duplicateCount}</strong><br /><span class="muted">duplicates removed</span></span>
		</div>

		{#if overLimit}
			<div class="alert warn">
				This list has {validCount} valid recipients, which is above the safe limit of
				{data.maxPerRun} per run. Please trim your list to {data.maxPerRun} or fewer and re-upload.
			</div>
		{/if}

		<div style="max-height:320px; overflow:auto; border:1px solid var(--border); border-radius:8px">
			<table>
				<thead>
					<tr><th>Email</th><th>Name</th><th>Status</th></tr>
				</thead>
				<tbody>
					{#each previewContacts as c}
						<tr>
							<td>{c.email || '—'}</td>
							<td>{c.name ?? ''}</td>
							<td>
								{#if c.valid}
									<span class="status pending">will send</span>
								{:else}
									<span class="status skipped">skipped — {c.skipReason}</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if contacts.length > previewContacts.length}
			<p class="muted" style="font-size:0.8rem">Showing first {previewContacts.length} of {contacts.length} rows.</p>
		{/if}
	</div>

	<!-- Step 3: Compose -->
	<div class="card">
		<h2>3. Compose message</h2>
		<div class="field">
			<label for="subject">Subject</label>
			<input id="subject" type="text" bind:value={subject} placeholder="Your subject line" />
		</div>
		<div class="field">
			<label for="body">Body (plain text)</label>
			<textarea id="body" bind:value={body} placeholder="Write your message…"></textarea>
		</div>
		<div class="field">
			<label for="footer">Footer / unsubscribe note (appended to every email)</label>
			<textarea id="footer" bind:value={footer} style="min-height:80px"></textarea>
			<p class="muted" style="font-size:0.8rem; margin-top:6px">
				A footer with a way to opt out is good practice and required by anti-spam laws in many regions.
			</p>
		</div>
	</div>

	<!-- Step 4: Confirm & send -->
	<div class="card">
		<h2>4. Send now</h2>
		<p class="muted">
			Emails are sent one at a time from your own account, with a short pause between each — safe,
			small-batch sending (max {data.maxPerRun} per run). The run stops automatically if too many
			sends fail.
		</p>
		<div class="checkbox-row field">
			<input id="confirm" type="checkbox" bind:checked={confirmed} />
			<label for="confirm">
				I confirm I have permission to email these {validCount} recipients and that this is not unsolicited bulk email.
			</label>
		</div>
		<button class="btn" onclick={send} disabled={!canSend}>
			{sending ? 'Sending…' : `Send to ${validCount} recipient${validCount === 1 ? '' : 's'}`}
		</button>
		{#if sendError}
			<div class="alert error" style="margin-top:14px">{sendError}</div>
		{/if}
	</div>
{/if}

<!-- Step 5: Progress + results -->
{#if results.length > 0}
	<div class="card">
		<h2>5. Sending status</h2>
		<div class="summary">
			<span class="stat"><strong>{sentCount}</strong><br /><span class="muted">sent</span></span>
			<span class="stat"><strong>{failedCount}</strong><br /><span class="muted">failed</span></span>
			<span class="stat"><strong>{results.filter((r) => r.status === 'skipped').length}</strong><br /><span class="muted">skipped</span></span>
		</div>

		{#if abortedReason}
			<div class="alert warn">Run stopped: {abortedReason}</div>
		{:else if done}
			<div class="alert info">Run complete.</div>
		{/if}

		<div style="max-height:360px; overflow:auto; border:1px solid var(--border); border-radius:8px">
			<table>
				<thead>
					<tr><th>Email</th><th>Name</th><th>Status</th><th>Detail</th></tr>
				</thead>
				<tbody>
					{#each results as r}
						<tr>
							<td>{r.email || '—'}</td>
							<td>{r.name ?? ''}</td>
							<td><span class="status {r.status}">{r.status}</span></td>
							<td class="muted">{r.detail ?? ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div style="margin-top:16px">
			<button class="btn secondary" onclick={downloadResults} disabled={sending}>
				Download results CSV
			</button>
		</div>
	</div>
{/if}
