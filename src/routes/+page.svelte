<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Small-Batch Email Sender</title>
</svelte:head>

<div class="card">
	<h1>Send a small batch of emails — safely</h1>
	<p class="muted">
		Connect your own Gmail or Outlook account, upload a contact list, write your message, and send
		now. Nothing is stored: no database, no saved contacts, no saved campaigns. Your access token is
		held only for the current session and discarded afterward.
	</p>

	<h2 style="margin-top:20px">How it works</h2>
	<ol class="muted">
		<li><strong>Connect</strong> your Gmail or Outlook account (send-only permission).</li>
		<li><strong>Upload</strong> a CSV or XLSX contact list.</li>
		<li><strong>Review</strong> the parsed list — invalid and duplicate emails are removed.</li>
		<li><strong>Send now</strong> — one email at a time, with safe sending limits.</li>
		<li><strong>Download</strong> the per-recipient results as CSV.</li>
	</ol>
</div>

{#if data.account}
	<div class="alert info">
		Connected as <strong>{data.account.email}</strong> ({data.account.provider}).
		<a href="/send">Continue to send →</a>
	</div>
{/if}

<div class="card">
	<h2>Connect an account</h2>
	<p class="muted">We request send-only access. No mailbox reading, no refresh tokens stored.</p>
	<div class="row">
		{#if data.gmailConfigured}
			<a class="btn" href="/auth/gmail/start" data-sveltekit-reload>Connect Gmail</a>
		{:else}
			<button class="btn" disabled title="Set GOOGLE_* env vars to enable">Connect Gmail</button>
		{/if}

		{#if data.outlookConfigured}
			<a class="btn" href="/auth/outlook/start" data-sveltekit-reload>Connect Outlook</a>
		{:else}
			<button class="btn" disabled title="Set MICROSOFT_* env vars to enable">Connect Outlook</button>
		{/if}
	</div>
	{#if !data.gmailConfigured || !data.outlookConfigured}
		<p class="muted" style="margin-top:12px; font-size:0.85rem">
			A disabled button means its OAuth environment variables aren't set. See the README for setup.
		</p>
	{/if}
</div>
