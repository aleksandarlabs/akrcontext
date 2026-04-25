# Installation

ContextForge is currently intended to live from a source repository. It is not published to npm yet.

## Requirements

- Node.js >=20
- pnpm

## Local Development

```bash
pnpm install
pnpm build
pnpm test
```

Run the CLI from this repo:

```bash
pnpm contextforge --help
pnpm contextforge init --target codex --dry-run
```

## Use From Another Repository

Build and link ContextForge:

```bash
cd /path/to/contextforge
pnpm install
pnpm build
pnpm link --global
```

Then in another project:

```bash
cd /path/to/target-project
contextforge init --target codex
contextforge doctor
```

## Git Install Later

When the repo is hosted, users can install from the repository URL. The package runs `prepack` to build `dist/` before packaging.

```bash
pnpm add -D <repo-url>
pnpm exec contextforge init --target codex
```
