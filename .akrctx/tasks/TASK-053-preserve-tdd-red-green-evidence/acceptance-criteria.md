# Acceptance Criteria

- Los workflows TDD, SDD+TDD y TDD+EDD requieren evidencia red→green en el log de la ronda.
- La evidencia preserva orden, comando, status y salida del fallo esperado y del pase final.
- Red y green comparan el mismo comando tras normalizar espacios en blanco.
- Un red ausente, un fallo por motivo diferente o un green ausente impide afirmar que se
  completó el workflow y produce una señal accionable.
- Una ronda TDD inválida se rechaza antes de persistirse y `impl log` devuelve refusal con
  salida CLI no-cero.
- Workflows sin TDD no reciben ese requisito.
- Records existentes siguen siendo legibles y no obtienen evidencia inventada.
- Las instrucciones renderizadas de los tres hosts son equivalentes.
- El judge no trata el log del implementer como aprobación independiente.
- Tests cubren casos válidos, incompletos y legacy.
- Las validaciones pasan y el checklist queda listo antes del handoff.
