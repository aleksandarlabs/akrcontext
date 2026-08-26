# Acceptance Criteria

- Ninguna plantilla exige marcar `independent review completed` después de recibir APPROVED.
- El checklist generado termina en un estado comprobable antes del snapshot, como `ready for
  independent review`.
- Las instrucciones asignan al record verificado —no a un checkbox posterior— la evidencia de
  que la revisión terminó.
- El flujo normal no necesita catch-up cuando no cambió código, criterios ni documentación.
- Un cambio real en cualquiera de los cinco archivos de cápsula continúa moviendo
  `taskDigest` y exige catch-up.
- Tests cubren tanto la ausencia del write administrativo como la detección de cambios reales.
- No se aplican cambios a instrucciones protegidas sin preview y aprobación actuales.
- Las validaciones pasan y el checklist queda listo antes del handoff.
