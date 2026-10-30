import { copyFile, writeFile } from 'node:fs/promises'

await copyFile('dist/index.css', 'dist/index.tailwind.css')
await writeFile('dist/tailwind.js', 'import \'./index.css\'\nexport * from \'./client/index.js\'\nexport { default } from \'./client/index.js\'\n')
await writeFile('dist/tailwind.d.ts', 'export * from \'./index\'\nexport { default } from \'./index\'\n')
