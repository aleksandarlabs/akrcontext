# Acceptance Criteria

- [x] Claves secret-bearing entrecomilladas en JSON/YAML se redactan antes de persistir o mostrar evidencia.
- [x] Asignaciones dotenv/YAML, flags, Bearer y URLs ya soportadas conservan su comportamiento.
- [x] Un log TDD legacy sin fases sigue legible y no bloquea una ronda nueva con red→green válido.
- [x] Una ronda TDD nueva incompleta o inválida sigue rechazándose antes de persistir.
- [x] El build limpia `dist` y el paquete no incluye chunks históricos obsoletos.
- [x] `CHANGELOG.md` describe judge schema v5, snapshot v6 y la migración desde 0.5.0.
- [x] `src/version.ts` y `package.json` quedan en 0.6.0, con lockfile consistente.
- [x] La validación focalizada y completa pasa, y Doctor termina sin gaps de release.
