# Acceptance Criteria

- La ausencia de un path en los `writes` actuales no basta para eliminarlo.
- Solo se elimina un candidato con registro durable de ruta y hash, hash intacto y contenido
  idéntico al archivo destino.
- Un candidato pendiente sobrevive si su agente se desactiva.
- Un candidato pendiente sobrevive si su target se elimina de `config.targets`.
- Un candidato pendiente sobrevive si su archivo deja de estar en el inventario gestionado.
- Un archivo regular que akrctx no puede demostrar que creó nunca se elimina.
- Un candidato extranjero en la ruta de un destino real se conserva aunque sus bytes sean
  idénticos al destino.
- Un candidato extranjero preexistente que bloquea una sugerencia no se registra como propio,
  y permanece tras una ejecución posterior con el destino ya resuelto.
- Un candidato registrado pero manipulado se conserva aunque sus bytes manipulados coincidan
  con el destino.
- Un candidato realmente aplicado al archivo destino se detecta y puede eliminarse.
- `--dry-run` y ejecución real clasifican exactamente los mismos paths; dry-run no escribe ni
  borra.
- Los candidatos de versiones anteriores, los runs parciales y el ignore de upgrades siguen
  protegidos.
- `UpgradeResult.removed` y la salida CLI solo enumeran paths cuya eliminación está probada.
- Las validaciones de la cápsula pasan y el checklist queda actualizado antes del handoff.
