# Context

## Relevant Files

- `src/upgrade.ts` — usa `readdir(..., { recursive: true, withFileTypes: true })` y
  `entry.parentPath` para resolver paths de candidatos.
- `package.json` — declara `"node": ">=20"`.
- `tests/akrctx.test.ts` — pruebas de limpieza recursiva y candidatos de upgrade.
- `src/fs-utils.ts` — helpers de paths y normalización POSIX existentes.
- `docs/INSTALLATION.md` y `README.md` — requisitos públicos de runtime, si mencionan Node.

## Compatibility Evidence

- `fs.readdir` con `recursive` apareció en Node 20.1.0.
- `Dirent.parentPath` apareció en Node 20.12.0.
- Por tanto, para honrar literalmente `>=20`, la implementación no debe depender de ninguna
  de esas APIs para recorrer candidatos.

## Blocked Reads

- No leer `.env`, claves, certificados, `secrets/`, `credentials/` ni `private/`.
