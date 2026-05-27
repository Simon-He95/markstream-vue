<script lang="ts">
  type Props = { text?: string };
  let { text = '' }: Props = $props()
</script>
<span class="tooltip-element">{text}</span>
