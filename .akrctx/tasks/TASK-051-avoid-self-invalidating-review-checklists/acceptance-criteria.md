# Acceptance Criteria

- AC-1: Ninguna plantilla exige marcar `independent review completed` después de recibir APPROVED.
- AC-2: El checklist generado termina en un estado comprobable antes del snapshot, como `ready for
  independent review`.
- AC-3: Las instrucciones asignan al record verificado —no a un checkbox posterior— la evidencia de
  que la revisión terminó.
- AC-4: El flujo normal no necesita catch-up cuando no cambió código, criterios ni documentación.
- AC-5: Un cambio real en cualquiera de los cinco archivos de cápsula continúa moviendo
  `taskDigest` y exige catch-up.
- AC-6: Tests cubren tanto la ausencia del write administrativo como la detección de cambios reales.
- AC-7: No se aplican cambios a instrucciones protegidas sin preview y aprobación actuales.
- AC-8: Las validaciones pasan y el checklist queda listo antes del handoff.
