# Audit Plan — branch `audit/v0.2-hardening`

Plan de implementación derivado de la auditoría de seguridad/calidad/DX (2026-07-04).
Cada item es autocontenido y está pensado para **un commit por item** (mensaje sugerido incluido).
Orden recomendado: los items están ordenados para minimizar conflictos entre ellos
(primero infra de tests, luego fixes críticos, luego medios, luego DX).

Reglas para el implementador:

- No refactorizar más allá de lo que pide el item. Mantener el estilo existente (biome).
- Cada item debe dejar `pnpm test` y `pnpm lint` en verde antes de pasar al siguiente.
- Los tests nuevos van en `tests/akrctx.test.ts` salvo que se indique otro archivo.
- No tocar `CHANGELOG.md` hasta el item final (F1).

---

## Fase 0 — Infraestructura de tests

### 0.1 Tests de integración de la capa CLI

**Problema:** los 100 tests actuales llaman a las funciones (`runDoctor`, `runTask`…)
directamente. `normalizeOptions`, los formatters y los gates de CI en `src/cli.ts`
no tienen cobertura — ahí viven los bugs C1, C3 y M7.

**Cambios:**

- Crear `tests/cli.test.ts` que invoque `main(argv)` de `src/cli.ts` con un cwd temporal.
  - Como los comandos usan `process.cwd()`, usar `process.chdir(tmpDir)` en `beforeEach`
    y restaurar en `afterEach` (o mockear; preferir `chdir`, es lo que hace el binario real).
  - Capturar `console.log`/`console.warn` con `vi.spyOn` para poder afirmar sobre el output.
  - Commander llama `process.exit` en errores de parseo: construir el program con
    `exitOverride` no es accesible desde fuera, así que testear solo rutas felices
    y rutas de error que lanzan `Error` (capturadas por el catch de `index.ts`).
- Tests mínimos: `init --target codex --json`, `doctor --json`, `doctor --fix --json`
  (este DEBE fallar hasta C1), `task create ... --json`, `compile ... --json`.

**Commit sugerido:** `test: add CLI-layer integration tests via main(argv)`

---

## Fase 1 — Bugs críticos

### C1. `doctor --fix` es un no-op

**Causa:** `normalizeOptions()` en `src/cli.ts:577-591` no copia `raw.fix`, así que
`runDoctor` nunca recibe `options.fix` y la rama de reparación (`src/doctor.ts:30`)
no se ejecuta desde el CLI. Los tests existentes pasan porque llaman a `runDoctor`
directamente.

**Cambios:**

- `src/cli.ts` → en `normalizeOptions` añadir `fix: Boolean(raw.fix),`.
- Test (en `tests/cli.test.ts`): repo con archivo de harness borrado →
  `akrctx doctor --fix --json` → el JSON contiene el archivo en `fixed` y
  vuelve a existir en disco.

**Commit sugerido:** `fix(cli): propagate --fix flag so doctor --fix actually repairs`

### C2. La recomendación "UI review" nunca se puede aplicar

**Causa:** `recommendWorkflow` puede devolver `"UI review"` (`src/task.ts:116`), pero
`selectWorkflow` la filtra contra `allowedWorkflows`, cuyo default `[...workflows]`
no incluye `"UI review"` (`src/types.ts:9-18`). Toda descripción con ui/page/component
cae a `fast-patch` con un reason confuso.

**Decisión de diseño:** "UI review" es una recomendación a nivel de task, no un
workflow configurable (así lo documenta `types.ts` y `wiki/workflows.md`). Por tanto
NO añadirla a `workflows`; en su lugar, `selectWorkflow` debe dejarla pasar sin
filtrarla por `allowedWorkflows`.

**Cambios:**

- `src/task.ts` → en `selectWorkflow`, antes del check `isWorkflowAllowed`:
  si `recommended.workflow === "UI review"`, devolver la recomendación directamente.
  (El filtro `allowedWorkflows` sigue aplicando a los 8 workflows normales.)
- Nota: si `--workflow "UI review"` explícito debe seguir siendo inválido (lo es hoy,
  `normalizeWorkflow` no lo mapea) — mantener ese comportamiento.
- Tests: `runTask("redesign the settings page", ...)` → workflow `"UI review"`,
  no `fast-patch`. Y con `allowedWorkflows: ["TDD"]` en config → sigue siendo
  `"UI review"` (no se filtra).

**Commit sugerido:** `fix(task): stop allowedWorkflows filter from swallowing UI review recommendation`

### C3. `compile` reporta éxito con export stale

**Causa:** `runCompile` ignora el `WriteResult` de `writePlannedFile`
(`src/compile.ts:58`). Si el export existe y no hay `--force`, se preserva el brief
antiguo pero el CLI imprime "Compiled: …".

**Decisión de diseño:** los exports son artefactos derivados, no contenido de usuario
→ regenerarlos siempre.

**Cambios:**

- `src/compile.ts` → pasar `force: true` a `writePlannedFile` (mantener `dryRun`).
  Eliminar `options.force` del objeto si queda muerto.
- Añadir el `kind` del write al `CompileResult` (`written: "create" | "update"`)
  por si el output quiere distinguir; opcional.
- Test: crear task, compilar, editar `task.md`, recompilar sin `--force` →
  el export contiene el contenido nuevo.

**Commit sugerido:** `fix(compile): always regenerate export briefs (derived artifacts)`

### C4. `config show` con JSON corrupto dice "not found"

**Causa:** `readConfig` (`src/config.ts:26-34`) traga el error de parseo y devuelve
`undefined`; el CLI responde "config not found. Run akrctx init" — seguir ese consejo
pisaría la config rota.

**Cambios:**

- `src/config.ts` → nueva función `readConfigStrict(cwd)` (o parámetro) que distinga:
  - archivo ausente → `undefined`
  - JSON inválido → lanza `Error(".akrctx/config.json is invalid JSON — fix it manually or restore from git before running init.")`
- `src/cli.ts` (`config show`) y `src/config.ts` (`setConfigValue`) usan la variante
  estricta. El resto de llamadores (`task`, `status`, `compile`, `judge`, `doctor`)
  conservan el comportamiento tolerante actual (devolver `undefined`) para no romper
  flujos de solo-lectura.
- Test: escribir `{invalid` en config → `config show` lanza con mensaje "invalid JSON";
  `setConfigValue` también lanza (hoy sobrescribiría con defaults silenciosamente).

**Commit sugerido:** `fix(config): distinguish corrupt config from missing config`

### C5. `doctor --ci`: gate frágil + version-drift rompe pipelines

**Causa:** `doctorCiFailures` (`src/cli.ts:799-811`) decide con
`!suggestion.startsWith("Setup is complete.")`, y la sugerencia de
"installedVersion mismatch → run upgrade" cuenta como fallo → cada release del CLI
rompe el CI de todos los usuarios hasta que hagan upgrade.

**Cambios:**

- `src/doctor.ts` / `src/types.ts` → `buildSuggestions` devuelve objetos estructurados:
  `{ text: string; severity: "info" | "warning" | "error" }`.
  - `error`: not installed, no target adapter, missing files, pending merges, judge gap.
  - `warning`: version drift (upgrade disponible).
  - `info`: "Setup is complete…", orphan pages.
- `DoctorResult.suggestions` pasa a ese tipo. Actualizar los formatters de `cli.ts`
  (mostrar `text`; en modo no-CI el render actual vale) y `recommendationsTemplate`
  (usa `text`).
- `doctorCiFailures` falla solo con `severity === "error"` — sin string matching.
- JSON output: incluir severity (breaking para consumidores del JSON; aceptable pre-1.0,
  anotar en F1).
- Tests: doctor CI pasa con setup completo aunque `installedVersion` difiera de
  `CLI_VERSION`; falla con archivo missing.

**Commit sugerido:** `fix(doctor): structured suggestion severities; version drift no longer fails --ci`

---

## Fase 2 — Bugs medios

### M1. `doctor --fix` solo repara el primer target

**Causa:** `runInit({ target: initial.installedTargets[0] ?? "codex" })`
(`src/doctor.ts:37-41`).

**Cambios:**

- `src/doctor.ts` → iterar `initial.installedTargets` llamando a `runInit` por target
  (o mejor: un solo `runInit` por target acumulando writes; los archivos neutrales
  se escriben idempotentemente, `writePlannedFile` los preserva).
  Si no hay targets instalados, mantener el fallback actual a `"codex"`… NO:
  con M4 (abajo) el fallback silencioso desaparece; aquí, si
  `installedTargets.length === 0`, saltar la fase de recreación de archivos y solo
  reparar config/policy.
- Test: instalar `--target all`, borrar un skill de claude y otro de pi →
  `doctor --fix` recrea ambos.

**Commit sugerido:** `fix(doctor): repair all installed targets, not just the first`

### M2. `--fix` reporta config/policy como "fixed" incondicionalmente

**Causa:** `src/doctor.ts:49-56` añade `.akrctx/config.json` y `.akrctx/policy.json`
a `fixed` aunque no hubiera gaps.

**Cambios:**

- Config: serializar el resultado de `normalizeConfigForFix` y compararlo con el
  contenido actual del archivo; escribir + reportar solo si difiere.
- Policy: `fixPolicy` ya construye `merged`; comparar JSON serializado con `raw`
  y devolver `false` si son equivalentes.
- Test: setup sano → `doctor --fix` → `fixed` vacío.

**Commit sugerido:** `fix(doctor): only report config/policy as fixed when content changed`

### M3. Frontmatter CRLF y links con anchor/título en wiki-lint

**Causa:** `parseFrontmatter` exige `---\n` literal (`src/wiki-lint.ts:12-13`);
con CRLF todas las páginas fallan el timestamp lint, y (tras C5) eso es warning/error
en doctor. Links `file.md#anchor` o `(file.md "Title")` dan falsos broken links.

**Cambios:**

- `parseFrontmatter`: normalizar `content.replace(/\r\n/g, "\n")` al inicio
  (solo para parseo; no reescribir archivos).
- `resolveWikiLink`: antes de resolver, recortar el fragmento (`link.split("#")[0]`)
  y el título (`link.split(/\s+/)[0]` — los links markdown con título llevan
  `url "title"`; usar el primer token). Si tras recortar queda vacío (link puro
  `#anchor`), devolver `null`.
- Tests: página con CRLF y timestamp válido → sin issue; link `overview.md#quick-reference`
  → sin broken link; link `missing.md#x` → broken link.

**Commit sugerido:** `fix(wiki-lint): handle CRLF frontmatter and anchored/titled links`

### M4. Fallback silencioso a codex en init no-interactivo

**Causa:** `resolveTarget` (`src/init.ts:158`) instala codex en CI cuando no hay
target ni detección.

**Cambios:**

- `src/init.ts` → en la rama no-interactiva sin detección, lanzar:
  `Error("No agent setup detected and no --target given. Pass --target <codex|claude|copilot|pi|all>.")`.
- Eliminar `fallbackUsed` del flujo (tipos `InitResult`, mensaje en `printInit`)
  o dejarlo siempre `false` — preferir eliminarlo (pre-1.0).
- Si hay **múltiples** targets detectados en no-interactivo: hoy también caería al
  fallback; con este cambio debe lanzar el mismo error listando los detectados.
- Test: `runInit({ nonInteractive: true })` en dir vacío → lanza.

**Commit sugerido:** `fix(init): fail instead of silently defaulting to codex in non-interactive mode`

### M5. Ordenación numérica de task IDs

**Causa:** `listTasks` usa `localeCompare` y `runStatus` usa orden de `readdir`
+ `slice(-5)` (`src/status.ts:29-41`).

**Cambios:**

- Helper `taskNumber(dir): number` en `src/task.ts` (extraer `/^TASK-(\d+)/`).
- `listTasks`: ordenar por número.
- `runStatus`: ordenar por número descendente y tomar 5 (eliminar el `.reverse()` hack).
- Test: crear dirs `TASK-002`, `TASK-010`, `TASK-1000` → orden correcto en ambos.

**Commit sugerido:** `fix(task,status): sort task capsules numerically`

### M6. `judge enable --dry-run` imprime "enabled"; status duplica I/O

**Cambios:**

- `src/cli.ts` (~450): con `dryRun`, imprimir `Judge: would enable (dry-run)`.
- `src/judge.ts` (`runJudgeStatus`, 86-93): un solo
  `Promise.all(allFiles.map(exists))` y particionar en present/missing.
- Test: `runJudgeStatus` sigue devolviendo lo mismo (los tests existentes cubren);
  test CLI opcional para el mensaje dry-run.

**Commit sugerido:** `fix(judge): honest dry-run output; dedupe status file checks`

### M7. `remove`: dry-run no muestra dirs podados; semántica confusa

**Cambios (alcance mínimo, sin rediseñar flags):**

- `src/remove.ts` → en dry-run, calcular qué directorios quedarían vacíos
  (simular: dir es candidato si todos sus hijos están en `planned`) y añadirlos a
  `planned` con sufijo `/`. Implementación simple: tras construir `planned`, para
  cada dir ancestro comprobar si sus entradas actuales ⊆ planned.
- Documentar en el help de `remove` la diferencia `--target all` (archivos de todos
  los targets) vs `--all` (además borra `.akrctx/`). Una frase en `addHelpText`.
- Test: dry-run y run real devuelven el mismo `planned` para un target instalado.

**Commit sugerido:** `fix(remove): dry-run preview matches actual prune; clarify --all vs --target all`

---

## Fase 3 — Seguridad

### S1. README: los controles son advisory

**Cambios:**

- `README.md` → sección corta "Security model" (o ampliar la existente):
  `policy.json`, `blockedReadPatterns` y `protectedFiles` son **controles a nivel de
  prompt/convención**: guían a un agente cooperativo; no son enforcement técnico y
  no resisten prompt injection. Recomendar complementar con permisos del propio
  agente (p. ej. deny rules de Claude Code) y `.gitignore` para secretos.

**Commit sugerido:** `docs: document that policy controls are advisory, not enforcement`

### S2. Warning cuando un template pack debilita la policy

**Causa:** `mergeTemplateJson` deja que un pack cambie escalares
(`enforcement.*`, `mergeStrategy`) — `src/template-pack.ts:240-257`.

**Cambios:**

- `src/init.ts` → tras el merge de policy, comparar contra `defaultPolicy(profile)`:
  si `mergeStrategy` cambió o algún `enforcement.*` pasó de `true` a `false`,
  añadir a `InitResult` un campo `policyWarnings: string[]` y que `printInit` los
  muestre en amarillo. NO bloquear (los packs enterprise pueden querer relajar a
  propósito), solo hacer visible.
- Test: pack con `policy.json` que pone `enforcement.requireTaskCapsule: false` →
  init devuelve warning; pack sin policy → sin warnings.

**Commit sugerido:** `feat(init): warn when a template pack weakens enforcement policy`

### S3. `remove --all` protege los task capsules

**Cambios:**

- `src/remove.ts` → con `--all`, si `.akrctx/tasks/` contiene algún dir `TASK-*`,
  no borrar `.akrctx/` entero: borrar todo su contenido excepto `tasks/`, y añadir
  `.akrctx/tasks/ (kept — contains task capsules; delete manually)` a `protected`.
  Nueva flag `--purge-tasks` para el borrado total explícito.
- Actualizar help text y test: remove --all con tasks → tasks sobreviven;
  con `--purge-tasks` → todo fuera.

**Commit sugerido:** `feat(remove): preserve task capsules on --all; add --purge-tasks`

---

## Fase 4 — DX / calidad

### D1. `upgrade` no pisa skills personalizados silenciosamente

**Cambios:**

- Enfoque: `runInit` acepta `options.upgrade?: boolean`. En `writePlannedFile`-callers
  de archivos akrctx-owned (skills/prompts/commands), cuando `upgrade` está activo y
  el archivo existe:
  - si el contenido en disco === template actual → `preserve` (sin escribir);
  - si difiere → escribir, pero marcar el `WriteResult` con
    `reason: "overwritten (had local modifications)"` y que `printInit` liste esos
    paths bajo un aviso amarillo "Overwritten files had local edits — review with git diff".
- Nota: no hay hash de la versión anterior, así que no se puede distinguir
  "modificado por usuario" de "template de versión vieja"; el aviso genérico +
  git es suficiente (el usuario committea antes de upgrade — documentarlo en help).
- Test: editar un SKILL.md, `upgrade` → archivo actualizado y el write lleva el reason.

**Commit sugerido:** `feat(upgrade): flag overwritten files that had local edits`

### D2. Eliminar keyword "tetris" y afinar precedencia de recommendWorkflow

**Cambios:**

- `src/task.ts` → quitar `\btetris\b` del regex de TDD+EDD.
- Mover el check de TDD (`bug|fix|regression|test`) ANTES del de SDD, de modo que
  "fix the api bug" → TDD (el señal de bug es más fuerte que el de dominio api).
  Mantener combos primero.
- Añadir comentario de una línea documentando el orden de precedencia:
  combos > game/interactive > EDD > TDD > SDD > UI > research.
- Ajustar los tests existentes que dependan del orden anterior (revisar los ~casos
  de `recommendWorkflow` en `tests/akrctx.test.ts`, hay varios alrededor de la
  línea 488 y 751-767).

**Commit sugerido:** `fix(task): remove demo keyword, prioritize bug signals over domain keywords`

### D3. `init` escribe solo los target references seleccionados

**Cambios:**

- `src/init.ts:91-100` → escribir `.akrctx/targets/<t>.md` solo para `selectedTargets`.
- `src/harness-files.ts` → sacar los 4 `.akrctx/targets/*.md` de `neutralRequired`;
  `doctor` los comprueba dinámicamente: para cada installed target, exigir su
  `.akrctx/targets/<t>.md` (añadirlo al cálculo de `missing` en `diagnose`).
- Test: init claude → solo `targets/claude.md` existe; doctor no marca los otros
  como missing; doctor sí marca missing si se borra `targets/claude.md`.

**Commit sugerido:** `fix(init,doctor): write and require only selected target references`

### D4. Deduplicar handlers de `task create` en cli.ts

**Cambios:**

- `src/cli.ts` → extraer `async function handleTaskCreate(description, raw)` usada
  por el subcomando `create` (línea ~277) y el argumento posicional (~359).
  Igual para el bloque de print (idéntico en ambos).
- Sin cambios de comportamiento; los tests CLI de 0.1 cubren.

**Commit sugerido:** `refactor(cli): dedupe task-create handlers`

### D5. `judge enable` — quitar `--target` no soportado

**Cambios:**

- `src/cli.ts` → registrar los subcomandos de `judge` con `addCommon(cmd, false)`
  (enable hoy recibe `includeTarget` implícito true). Verificar: `judge enable` usa
  `config.targets`, así que el flag es engañoso.

**Commit sugerido:** `fix(cli): drop unsupported --target flag from judge enable`

### D6. Readiness score pondera por categoría

**Cambios:**

- `src/doctor.ts` → `scoreReadiness` recibe los grupos separados
  (`missing` harness files, `configGaps+policyGaps`, `wikiLintIssues`, `conflicts`):
  - harness file missing: −5 c/u (cap 40)
  - config/policy gap: −3 c/u (cap 20)
  - wiki lint issue: −1 c/u (cap 10)
  - conflict: −10 c/u (cap 40)
  - sin target: −25
- Además los wiki-lint issues DEJAN de concatenarse en `result.missing`
  (`src/doctor.ts:131-135`): van solo en `wikiLint` y en `gaps.md`. Revisar que
  `doctor --ci` (tras C5) trate wiki-lint como `warning`, no `error`.
- Ajustar tests de score existentes.

**Commit sugerido:** `feat(doctor): weight readiness score by issue category`

---

## Fase 5 — Cierre

### F1. CHANGELOG + versión

**Cambios:**

- `CHANGELOG.md`: sección `0.2.0` resumiendo por fase (fixes críticos, seguridad, DX).
  Anotar breaking: JSON de doctor (`suggestions` ahora objetos con severity,
  wiki-lint fuera de `missing`), init no-interactivo sin target ahora falla,
  `remove --all` preserva tasks.
- `package.json` + `src/version.ts` → `0.2.0` (mantener sincronizados; hay dos fuentes
  de verdad — opcional: leer version de package.json en build, pero NO hacerlo ahora).
- `README.md`: revisar que ejemplos de doctor --ci y remove reflejen el nuevo
  comportamiento.

**Commit sugerido:** `chore(release): v0.2.0 — audit hardening`

---

## Checklist de verificación final (antes del release)

1. `pnpm lint && pnpm test && pnpm build` en verde.
2. Smoke manual en un dir temporal:
   `node dist/index.js init --target claude` → `doctor` → `doctor --fix` →
   `task "fix login page component"` (debe dar UI review) →
   `compile TASK-001` dos veces con edición intermedia (debe regenerar) →
   `remove --all` (tasks sobreviven) → `remove --all --purge-tasks --force`.
3. `node dist/index.js init` con stdin no-TTY en dir vacío → error claro, exit 1.
4. `doctor --ci` en instalación sana con `installedVersion` viejo → exit 0.
