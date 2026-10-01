# Acceptance Criteria

- AC-1: `src/templates/judge-contract.ts` define `independent` como boolean opcional
  en la raíz del schema, con la misma descripción que la copia instalada. No
  entra en `required`.
- AC-2: La raíz del schema no acepta `evidence`. El campo sigue definido solo dentro
  de cada entrada de `tests`.
- AC-3: Las instrucciones del judge enumeran las claves de raíz permitidas y prohíben
  explícitamente añadir otras, incluida `evidence`.
- AC-4: El ejemplo mínimo embebido en las instrucciones del judge pasa validación
  contra `validateRecord`.
- AC-5: Un test verifica que el ejemplo embebido es válido contra `validateRecord`.
- AC-6: Un test verifica que `validateRecord` acepta el record con `independent` en
  ambos valores y lo rechaza con `evidence` en la raíz.
- AC-7: Un test verifica que cada rendering del judge (claude, codex, copilot)
  enumera las claves permitidas.
- AC-8: `akrctx upgrade` completa sin conflicto sobre `review.schema.json`.
- AC-9: Existing agent instruction files are preserved.
