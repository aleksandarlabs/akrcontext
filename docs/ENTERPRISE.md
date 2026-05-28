# Enterprise Usage

akrctx is designed to be forked and governed internally. An enterprise fork can keep the architecture while changing branding, defaults, policy, and bundled templates.

## Rebranding a Fork

If a company does not want the command or package to be called `akrctx`, change the package metadata and binary name in `package.json`:

```json
{
  "name": "@company/agent-harness",
  "bin": {
    "agent-harness": "dist/index.js"
  }
}
```

During a migration, the fork can expose both names:

```json
{
  "bin": {
    "agent-harness": "dist/index.js",
    "akrctx": "dist/index.js"
  }
}
```

Generated file names and skill names currently use the `akrctx` namespace. A deeper rebrand can rename templates and generated content, but should preserve the same safety rules: do not overwrite protected instruction files, keep task capsules under a neutral source-of-truth directory, and keep policy auditable.

## CI Doctor

`doctor --ci` turns the local audit into a CI gate:

```bash
akrctx doctor --ci
akrctx doctor --ci --json
```

It exits with `0` when the harness is healthy and exits with `1` when there are actionable gaps such as missing files, pending instruction merges, config/policy gaps, version drift, or judge misconfiguration.

Example CI step:

```yaml
- run: akrctx doctor --ci
```

The readiness score is now issue-based:

- `100/100`: installed target is complete and no gaps were found.
- `0/100`: akrctx is not installed.
- Missing files, policy/config gaps, or conflicts reduce the score.

## Policy Enforcement

`.akrctx/policy.json` is not only advisory. `doctor` validates the minimum safety contract and `doctor --ci` fails when it is weakened.

The generated policy includes:

```json
{
  "mergeStrategy": "preserve-and-suggest",
  "protectedFiles": ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"],
  "blockedReadPatterns": [".env", ".env.*", "*.pem", "*.key", "*.p12", "*.pfx", "secrets/", "credentials/", "private/"],
  "enforcement": {
    "requireTaskCapsule": true,
    "requireWorkflowReason": true,
    "requireAcceptanceCriteria": true,
    "requireReviewChecklist": true
  }
}
```

If a repository changes `requireTaskCapsule` to `false`, removes a protected file, or removes required blocked-read patterns, `doctor` reports a policy gap and CI mode fails.

## Profiles

Profiles are built-in presets for different levels of process rigor:

```bash
akrctx init --target copilot --profile default
akrctx init --target copilot --profile strict
akrctx init --target copilot --profile regulated
```

- `default`: standard akrctx behavior.
- `strict`: uses a thorough context budget and adds blocked reads such as `.ssh/`, `.netrc`, and private key filenames.
- `regulated`: inherits strict behavior, adds regulated-material patterns such as `*.jks`, `*.gpg`, and `compliance/`, and avoids `fast-patch` for small patches by routing them to `TDD`.

The selected profile is recorded in both `.akrctx/config.json` and `.akrctx/policy.json`. `doctor` validates profile-specific policy requirements.

## Template Packs

Template packs let governors ship company defaults without forking source code for every team.

Use a path-based pack:

```bash
akrctx init --target copilot --template-pack ./pepe-template
```

Use a bundled pack from this repository's `templates/` directory:

```bash
akrctx templates list
akrctx init --target copilot --template test-template
```

Template packs are target-relative. The selected `--target` determines where files are installed.

Supported v1 shape:

```txt
pepe-template/
  akrctx-pack.json
  config.json
  policy.json
  wiki/
    testing.md
  target/
    root-instructions.md
    skills/
      pepe-front/
        SKILL.md
    prompts/
      pepe-review.md
    instructions/
      pepe.instructions.md
```

For `--target copilot`, this maps to:

```txt
target/root-instructions.md          -> .github/copilot-instructions.md
target/skills/pepe-front/SKILL.md    -> .github/skills/pepe-front/SKILL.md
target/prompts/pepe-review.md        -> .github/prompts/pepe-review.md
target/instructions/pepe.instructions.md -> .github/instructions/pepe.instructions.md
```

`config.json` and `policy.json` are deep-merged with the profile defaults. Arrays of strings are merged as a union without duplicates.

Root-level `skills/`, `prompts/`, `instructions/`, and `targets/` are intentionally rejected in v1. Put target files under `target/` so the selected `--target` owns the mapping.

## Bundled Templates

Bundled templates live in:

```txt
templates/<template-name>/
```

They are included in the published package. Enterprise governors can review template changes by pull request, publish the forked CLI, and users can install them by name without copying folders around.

This repository includes `templates/test-template/` as a working example.
