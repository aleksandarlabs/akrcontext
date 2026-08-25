# Review Checklist

- [x] `init` escribe el ignore.
- [x] `upgrade` escribe el ignore en instalaciones existentes.
- [x] El `.gitignore` raíz queda intacto.
- [x] El borrado elimina solo lo no escrito por el run actual.
- [x] Un candidato sin resolver sobrevive.
- [x] Un run que no cubre todos los targets no borra nada.
- [x] `--dry-run` no borra nada y reporta lo que borraría.
- [x] Las versiones anteriores no se tocan.
- [x] El propio `.gitignore` de upgrades nunca se borra.
- [x] `doctor` detecta el ignore ausente o debilitado y lo repara con `--fix`.
- [x] El nuevo archivo está en `src/harness-files.ts`.
- [x] La salida del CLI distingue el borrado.
- [x] `npm test`, `npm run lint` y `npm run build` pasan.
