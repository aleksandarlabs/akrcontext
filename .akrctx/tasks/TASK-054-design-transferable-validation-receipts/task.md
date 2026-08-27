# Task

## Goal

Diseñar una forma honesta de transferir entre agentes la evidencia de que
`judge verify --run-tests` reejecutó los comandos declarados.

Actualmente una verificación posterior puede demostrar que el record es válido, aprobado y
CURRENT, pero devuelve `reexecuted: []`. La reejecución anterior fue un evento de sesión y no
queda atestiguada de forma durable. En TASK-047 el informe presentó `valid: true` y
`approved: true` junto a la reejecución, aunque esas propiedades por sí solas no la prueban.

Esta cápsula es research-first: debe comparar alternativas, amenazas y costes antes de
proponer implementación. El resultado puede ser mantener el contrato no transferible y
mejorar reporting, o diseñar un receipt local/CI explícito; no debe fingir autenticidad que
un hash sin raíz de confianza no aporta.

## Validation

```
pnpm vitest run tests/akrctx.test.ts
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Implementar una solución antes de aprobar el diseño.
- Presentar un archivo local modificable como prueba criptográfica independiente.
- Ejecutar comandos sin el consentimiento actual del operador.
- Hacer transferible una aprobación a un snapshot o lista de comandos distinta.

## Clarifications

- ### Session 2026-08-27
  - The user confirmed closing TASK-054 as research and documentation only; no runtime
    changes or receipt implementation are authorized.

## Open Questions

No unresolved questions. The research recommendation is recorded below; the user has
confirmed that this task closes without implementation.

## Research Findings

### Threat model and trust boundary

The receipt consumer may trust the local repository for tamper-evident bookkeeping, but
must not treat a file written by the primary agent or a later local agent as an
independent attestation. A hash proves that bytes are consistently bound to an input; it
does not identify who ran the commands or prevent the writer from choosing both the
claims and the hash. Authenticity therefore requires an external issuer and a trust
anchor outside the reviewed worktree.

The relevant boundary is the exact snapshot scope: snapshot ID, scope digest, record
digest, task and change digests, declared command list, result/exit-status digest, CLI
version, policy digest, lockfile/package-manager identity, and execution time/run ID.
Any change to those inputs invalidates the receipt. Operator consent remains an
ephemeral decision for one exact execution; it is never encoded as reusable permission.

### Alternatives

1. **Keep re-execution non-transferable and correct wording/output.** This has the
   strongest honest default: local verification can prove only what the current caller
   executed. It provides no durable execution evidence, has no migration cost, and is
   fully compatible. The receiving agent must say “boundary verified; re-execution not
   performed by this caller,” never infer it from `valid` or `approved`.
2. **Local hash-linked receipt.** This provides persistence and integrity if the file is
   unchanged, but no authenticity: the same actor can rewrite the receipt and its hash.
   It is portable and cheap, but revocation is only boundary/digest mismatch or explicit
   deletion. It may improve UX and audit trails, but a receiver must treat it as
   informational evidence, not independent validation.
3. **CI/orchestrator-signed receipt.** A trusted CI issuer can attest to execution and
   results by signing a canonical envelope bound to all boundary inputs above. This is
   the only option that can make the claim transferable, but it requires an external
   trust configuration, key rotation/revocation, canonicalisation, CI identity policy,
   and a new receipt format/verification path. It is portable as an artifact and more
   expensive to operate; a receiver may claim “trusted issuer attested that these exact
   commands passed for this exact boundary,” not that the local operator consented.
4. **Re-execute at every handoff.** This preserves the current trust model and avoids
   receipt authenticity, but repeats cost, can produce environment-specific results,
   and still requires fresh consent. It is the most direct high-assurance fallback, not
   a transfer mechanism.

The comparison across the requested decision dimensions is:

| Alternative | Security claim | UX / portability | Revocation | Compatibility | Cost | Receiver may say |
|---|---|---|---|---|---|---|
| 1. Non-transferable + wording | Honest local evidence; no issuer authenticity | Simple and fully portable | Boundary/current checks only | No change | One execution | “This caller verified the boundary; no transferred re-execution evidence.” |
| 2. Local hash receipt | Integrity/persistence only; no authenticity | Convenient and portable as a file | Digest mismatch or deletion; no trusted revocation | Additive sidecar, but no security upgrade | Low implementation/operation cost | “A local record claims this; it is not an independent attestation.” |
| 3. Trusted CI receipt | Signature authenticates an issuer, subject to its external trust root | Artifact is portable; setup and key management add UX | Key rotation, trust-config changes, boundary mismatch, or issuer revocation | New opt-in format/verifier; old records remain valid without receipts | Highest operational cost | “The configured issuer attested these exact results for this exact boundary.” |
| 4. Re-execute per handoff | Fresh execution evidence; no transferred trust | Least convenient and environment-sensitive | Each run expires as a separate event; boundary drift blocks it | Existing verifier flow | Repeated compute and consent | “I reran it here under this fresh approval.” |

## Research Recommendation

Keep alternative 1 as the default contract and wording. Do not add a local receipt as
security evidence. If a product requirement later needs transferable validation, pursue
alternative 3 as an explicitly optional, sidecar receipt protocol whose verifier
requires a configured external trust root and exact equality of snapshot, record,
commands, results, CLI, policy, and lockfile identities. A receipt must never upgrade a
record's `APPROVED` or `CURRENT` status, and those fields must never be described as
proof that commands were re-executed.

The protocol should reject or mark revoked any receipt whose snapshot, record, command
set/order, result, CLI version, policy, lockfile, issuer key, or declared trust config
differs from the signed envelope. Existing records cannot be backfilled honestly: they
remain valid under the current schema but have no receipt. Migration should therefore
be additive and opt-in (sidecar receipt plus a new explicit verification command), with
old records continuing to use the non-transferable wording and no automatic reuse of
execution consent.

No runtime change is authorized by this research capsule. The user confirmed closure as
research/documentation only; any future implementation requires a new task or an
explicitly reopened capsule, a concrete SDD+TDD workflow, and fresh approval.
