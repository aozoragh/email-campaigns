<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<div class="app">
	<header>
		<a class="brand" href="/">Small-Batch Email Sender</a>
	</header>
	<main>
		{@render children()}
	</main>
	<footer>
		<p>Safe, small-batch sending from your own Gmail or Outlook account. No database. No stored contacts.</p>
	</footer>
</div>
