<script lang="ts">
  interface Props {
    code?: string;
    title?: string;
    isDark?: boolean;
    htmlPreviewAllowScripts?: boolean;
    htmlPreviewSandbox?: string;
    onClose?: () => void;
  }
  
  let {
    code = '',
    title = 'Preview',
    isDark = false,
    htmlPreviewAllowScripts = false,
    htmlPreviewSandbox,
    onClose
  }: Props = $props();
  
  let sandbox = $derived(htmlPreviewSandbox ?? (htmlPreviewAllowScripts ? 'allow-scripts' : ''));
</script>
<div class:is-dark={isDark} class="html-preview-frame">
  <div class="html-preview-frame__header"><span>{title}</span><button type="button" onclick={() => onClose?.()}>Close</button></div>
  <iframe title={title} class="html-preview-frame__iframe" srcdoc={code} sandbox={sandbox}></iframe>
</div>
