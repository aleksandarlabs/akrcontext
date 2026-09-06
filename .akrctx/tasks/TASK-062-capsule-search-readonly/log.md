# Registro de implementación

## 2026-09-06

Se implementó `akrctx task search <query>` y `--json`. La búsqueda recorre solo los cinco archivos canónicos de cápsulas, compara texto literal sin distinguir mayúsculas, ordena los resultados de forma determinista y no escribe archivos.

La lectura carga `blockedReadPatterns` antes de inspeccionar contenido, omite enlaces simbólicos de directorio y archivo, omite archivos canónicos ausentes y reporta los demás errores de lectura. No interpreta coincidencias como decisiones vigentes ni como evidencia de validación.

Se siguió SDD+TDD: se registró el contrato en plan.md, se añadieron pruebas que fallaban porque no existían la API ni el subcomando y se implementó el mínimo necesario. Las pruebas cubren orden numérico y canónico, mayúsculas, acentos, metacaracteres literales, coincidencias repetidas, cero resultados, cápsulas legacy, archivos ausentes, política bloqueada, enlaces simbólicos y salida CLI humana/JSON.

Validaciones:

- `pnpm build`: PASS.
- `pnpm lint`: PASS.
- `pnpm test`: PASS, 8 archivos y 874 tests.
- `pnpm akrctx task search "Buscar texto" --json`: PASS; devolvió la coincidencia citable de TASK-062.
- `pnpm akrctx init --target codex --dry-run`: PASS.
- `pnpm akrctx doctor --json`: PASS; readiness 100, sin missing, conflicts ni wikiLint.

No se invocó judge ni se capturó snapshot, por instrucción explícita del usuario. La revisión independiente queda pendiente para otro modelo.

## 2026-09-06 — corrección tras revisión externa

Una revisión externa señaló que un enlace simbólico en `.akrctx` hacía que la búsqueda leyera una política y cápsulas externas antes de detectar enlaces internos. Se añadió una prueba de regresión con `.akrctx` enlazado a un directorio externo; inicialmente reprodujo el fallo al devolver una coincidencia externa.

La búsqueda ahora rechaza `.akrctx` cuando es un enlace simbólico antes de leer `policy.json` o recorrer `tasks`. La regresión pasa junto con las validaciones finales:

- `pnpm build`: PASS.
- `pnpm lint`: PASS.
- `pnpm test`: PASS, 8 archivos y 875 tests.
- `pnpm akrctx init --target codex --dry-run`: PASS.
- `pnpm akrctx doctor --json`: PASS; readiness 100, sin missing, conflicts ni wikiLint.

No se invocó judge ni se capturó snapshot. Esta corrección debe pasar una nueva revisión externa.
