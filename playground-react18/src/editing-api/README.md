# CodeBlockNode editing API demo (React 18)

Permanent playground for the `markstream-react` `CodeBlockNode` editing handle.
It mounts a direct, non-loading TypeScript `code_block` with the installed
`stream-diffs 0.0.5`, `useTokenTransformer: true`, and an explicit
`onEditComplete: () => 'accept'`.

Buttons: Start editing, Apply edit, Undo, Redo, Complete, Discard, Reset.
The panel shows the live surface kind, `isReadyToEdit()`, `isEditing()`,
`canUndo()/canRedo()`, and `getCode()`, plus an action/error log.

## Run

```bash
# repository root
pnpm play:react18
```

Open <http://localhost:4174/editing-api.html>.

The page is a standalone Vite entry (`editing-api.html` → `src/editing-api/main.tsx`),
so it does not affect the main playground app.
