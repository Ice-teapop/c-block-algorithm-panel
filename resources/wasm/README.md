# WASM runtime assets

These two files are vendored byte-for-byte from the exact npm versions locked in `package-lock.json`:

- `web-tree-sitter.wasm` ← `web-tree-sitter@0.26.10`
- `tree-sitter-c.wasm` ← `tree-sitter-c@0.24.1`

`npm run verify:wasm-assets` compares the source and built copies byte-for-byte and validates both WebAssembly modules. Dependency upgrades must update the vendored files in the same isolated change.
