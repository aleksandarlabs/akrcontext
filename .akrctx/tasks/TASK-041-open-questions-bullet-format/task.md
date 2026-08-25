# Task

## Goal

`akrctx judge verify` lee `## Open Questions` contando top-level bullets.
El placeholder `- None recorded yet.` cuenta como una open question, lo que
hace que verify emita un notice en cápsulas que no tienen preguntas abiertas
reales. Lo mismo ocurre si el usuario escribe `- None remaining.` al cerrar
las preguntas.

Cambiar el placeholder del template a prosa sin bullet, o enseñar al parser
a ignorar bullets que contengan variantes de "none" / "ninguna".

## Validation

```
npm test
```

## Out Of Scope

- Cambiar la semántica de cómo se leen las secciones (solo bullets son
  contenido). Eso es correcto; el problema es el placeholder.

## Clarifications

### Session 2026-08-24

- Encontrado durante verify de TASK-020 en un repo consumidor: `- None remaining.` bajo `## Open Questions` se leyó como una open question real y el verify reportó "1 unresolved open question".

### Session 2026-08-25

- El parser trata como vacío cualquier bullet cuyo texto completo sea una variante de
  "none": `none|ninguna|ninguno|n/a`, seguido como mucho de una palabra de cierre de una
  lista fija (`remaining`, `left`, `yet`, `recorded yet`, `so far`, `open`, `pending`) y
  de puntuación o espacios. Un bullet que empieza por "None" pero continúa con contenido
  real (`None of the callers validate X`) sí se cuenta.
- Corrección sobre la primera redacción de esta sesión: el filtro estrecho dejaba fuera
  `- None remaining.`, que es la cadena exacta que abrió la tarea. La lista de palabras
  de cierre existe para cubrirla.
- El mismo tratamiento aplica a `## Clarifications` y a `## Open Questions`. Las dos
  secciones comparten `sectionBullets`; un filtro distinto por sección sería una
  inconsistencia sin razón que explicarla.
- El plan original (quitar el bullet del template) no arregla el caso reportado. El
  parser ya filtra la frase exacta del template. El fallo lo produce el texto que el
  usuario escribe al cerrar las preguntas, así que el arreglo va en el parser.

## Open Questions

None.
