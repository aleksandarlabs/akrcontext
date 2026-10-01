# Acceptance Criteria

- AC-1: Los workflows TDD, SDD+TDD y TDD+EDD requieren evidencia red→green en el log de la ronda.
- AC-2: La evidencia preserva orden, comando, status y salida del fallo esperado y del pase final.
- AC-3: Red y green comparan el mismo comando tras normalizar espacios en blanco.
- AC-4: Un red ausente, un fallo por motivo diferente o un green ausente impide afirmar que se
  completó el workflow y produce una señal accionable.
- AC-5: Una ronda TDD inválida se rechaza antes de persistirse y `impl log` devuelve refusal con
  salida CLI no-cero.
- AC-6: Workflows sin TDD no reciben ese requisito.
- AC-7: Records existentes siguen siendo legibles y no obtienen evidencia inventada.
- AC-8: Las instrucciones renderizadas de los tres hosts son equivalentes.
- AC-9: El judge no trata el log del implementer como aprobación independiente.
- AC-10: Tests cubren casos válidos, incompletos y legacy.
- AC-11: Las validaciones pasan y el checklist queda listo antes del handoff.
