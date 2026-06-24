<script lang="ts">
	import { page } from '$app/stores';
</script>

<div class="card">
	<h1>Something went wrong</h1>
	<p class="alert error">{$page.error?.message ?? 'Unexpected error.'}</p>
	<a class="btn" href="/">Back to start</a>
</div>
