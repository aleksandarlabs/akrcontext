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

- None.

## Open Questions

- None.
