# Context

Leer contract.md y TASK-061/design.md (forma de datos, estados y límites). Revisar src/task.ts, src/cli/task.ts, src/harness-files.ts, src/judge-enforcement.ts (readBlockedPatterns/matchesBlockedPattern), tests/cli.test.ts y tests/akrctx.test.ts (fixtures).

La implementación vive en src/continuation.ts para no agrandar task.ts. La CLI importa el lector. No cambiar el algoritmo de snapshots; tests nuevos en tests/continuation.test.ts. README documenta el comando y garantías reales. No leer secretos. Hay diseños previos sin commit del usuario: no revertirlos.
