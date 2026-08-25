# Implementation Log

## 2026-08-25

### Cambios

- `src/templates/judge-contract.ts`: `independent` como boolean opcional en la
  raíz del schema. Se colocó tras `reviewedAt` y con la descripción exacta de la
  copia instalada, para que el candidato del upgrade sea idéntico al archivo vivo
  y el conflicto desaparezca.
- `src/templates/judge.ts`: párrafo nuevo que enumera las ocho claves de raíz
  aceptadas y prohíbe cualquier otra, nombrando `evidence` como caso concreto.
  Una frase extra aclara que `evidence` vive solo dentro de una entrada de `tests`.
- `tests/agent-templates.test.ts`: tres tests nuevos. Uno comprueba que el schema
  publica `independent` opcional y que `validateRecord` lo acepta. Otro comprueba
  que la raíz no define `evidence` y que `validateRecord` rechaza un record que lo
  lleve. El tercero comprueba que los tres renderings enumeran las claves.

### Detalle del test de renderings

La aserción sobre `evidence` no puede llevar backticks. El rendering de Codex
convierte los backticks a comillas simples para el TOML, así que la aserción
compara una subcadena sin ellos.

### Validación

- `npm test`: 749 tests, 8 archivos, todo en verde.
- `npm run lint`: 96 archivos, sin hallazgos.
- `npm run build`: correcto.

### Upgrade

`akrctx upgrade` quedó completo. `installedVersion` pasó de 0.4.0 a 0.5.0.

Durante el proceso aparecieron dos conflictos extra sobre
`akrctx-workflow/SKILL.md`, causados por un `git checkout` previo que revirtió
esos archivos mientras el manifest ya llevaba los hashes nuevos. Se resolvieron
aplicando los candidatos generados, que solo contenían la regeneración legítima
de 0.5.0.

`CLAUDE.md` y `AGENTS.md` siguen con candidato pendiente. Son root instructions y
el upgrade nunca las sobrescribe. Quedan fuera de esta tarea.
