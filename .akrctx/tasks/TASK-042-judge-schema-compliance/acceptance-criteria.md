# Acceptance Criteria

- `src/templates/judge-contract.ts` define `independent` como boolean opcional
  en la raíz del schema, con la misma descripción que la copia instalada. No
  entra en `required`.
- La raíz del schema no acepta `evidence`. El campo sigue definido solo dentro
  de cada entrada de `tests`.
- Las instrucciones del judge enumeran las claves de raíz permitidas y prohíben
  explícitamente añadir otras, incluida `evidence`.
- El ejemplo mínimo embebido en las instrucciones del judge pasa validación
  contra `validateRecord`.
- Un test verifica que el ejemplo embebido es válido contra `validateRecord`.
- Un test verifica que `validateRecord` acepta el record con `independent` en
  ambos valores y lo rechaza con `evidence` en la raíz.
- Un test verifica que cada rendering del judge (claude, codex, copilot)
  enumera las claves permitidas.
- `akrctx upgrade` completa sin conflicto sobre `review.schema.json`.
- Existing agent instruction files are preserved.
