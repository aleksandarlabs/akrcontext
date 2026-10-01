# Acceptance Criteria

- AC-1: La ausencia de un path en los `writes` actuales no basta para eliminarlo.
- AC-2: Solo se elimina un candidato con registro durable de ruta y hash, hash intacto y contenido
  idéntico al archivo destino.
- AC-3: Un candidato pendiente sobrevive si su agente se desactiva.
- AC-4: Un candidato pendiente sobrevive si su target se elimina de `config.targets`.
- AC-5: Un candidato pendiente sobrevive si su archivo deja de estar en el inventario gestionado.
- AC-6: Un archivo regular que akrctx no puede demostrar que creó nunca se elimina.
- AC-7: Un candidato extranjero en la ruta de un destino real se conserva aunque sus bytes sean
  idénticos al destino.
- AC-8: Un candidato extranjero preexistente que bloquea una sugerencia no se registra como propio,
  y permanece tras una ejecución posterior con el destino ya resuelto.
- AC-9: Un candidato registrado pero manipulado se conserva aunque sus bytes manipulados coincidan
  con el destino.
- AC-10: Un candidato realmente aplicado al archivo destino se detecta y puede eliminarse.
- AC-11: `--dry-run` y ejecución real clasifican exactamente los mismos paths; dry-run no escribe ni
  borra.
- AC-12: Los candidatos de versiones anteriores, los runs parciales y el ignore de upgrades siguen
  protegidos.
- AC-13: `UpgradeResult.removed` y la salida CLI solo enumeran paths cuya eliminación está probada.
- AC-14: Las validaciones de la cápsula pasan y el checklist queda actualizado antes del handoff.
