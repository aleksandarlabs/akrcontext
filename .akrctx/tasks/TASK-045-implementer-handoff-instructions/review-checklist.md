# Review Checklist

- [x] La cápsula está lista: contrato SDD y clarificaciones registrados.
- [x] La plantilla raíz nombra al implementer y dice cuándo delegar.
- [x] La instrucción exige preguntar antes de delegar.
- [x] La condición es `enabled`, no el trigger.
- [x] El reparto de responsabilidades queda escrito.
- [x] Se nombran `akrctx impl start` y `akrctx impl status`.
- [x] El paso 7 ya no presupone quién implementó.
- [x] `defaultTrigger.implementer` vale `post-clarification`.
- [x] Ninguna configuración existente se migra.
- [x] Tests de presencia y de default añadidos.
- [x] `pnpm test`, `pnpm lint` y `pnpm build` pasan.
- [x] Los archivos raíz protegidos no se editaron sin aprobación explícita.
