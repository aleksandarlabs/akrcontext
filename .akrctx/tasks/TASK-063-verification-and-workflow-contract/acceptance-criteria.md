# Acceptance Criteria

- AC1: Entregar design.md con contrato actual/propuesto y tabla de migración, sin cambiar runtime.
- AC2: Resolver comandos obligatorios/opcionales, not-run, cero comandos, fallos y compatibilidad; comparar todos obligatorios versus declaración explícita por comando. La verificación completa requiere que todas las validaciones obligatorias pasen para la revisión actual de la cápsula y la versión concreta del código; no llamar completa a la verificación de un subconjunto.
- AC3: Distinguir integridad, vigencia, independencia declarada y autenticidad. Definir consecuencias de independent:false y ausencia legacy sin elevar garantías; conservar los veredictos históricos y mostrar por separado lo aprobado entonces y lo verificado ahora.
- AC4: Proponer proceso proporcional según riesgo y reversibilidad, conservando el modo manual y el traspaso a implementador. Comparar cápsula breve con cinco documentos, sin imponer una migración todavía.
- AC5: Definir matriz UI: create settings screen, review settings screen, fix screen regression, componente sin verbo, petición española y workflow explícito. Separar intención de construir/revisar; decidir fallback antes de implementar.
- AC6: Proponer preguntas agrupadas y decisiones delegables frente a decisiones del usuario; documentar cambios respecto a TASK-006 y confirmaciones de TASK-050. La autorización corresponde a una ejecución explícitamente autorizada, que puede abarcar agentes o sesiones del orquestador; no se transmite por traspaso manual o copia del repositorio. No convertir autorización de ticket en permiso para ejecutar shell.
- AC7: Separar salud de instalación de preparación operativa de Doctor, sin ejecutar automáticamente comandos descubiertos; definir métricas de coste y calidad que puedan comprobarse.
- AC8: Cerrar con preguntas de producto y cápsulas independientes para verificación, workflow UI, proporcionalidad y Doctor.
