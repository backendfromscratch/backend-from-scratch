# Postmortem: <título corto del incidente>

<!--
Una plantilla para después de un incidente (Fase 10, lección 7). Cópiala, rellénala y guárdala con
las demás: incidentes/2026-10-24-redis-congelado.md, por ejemplo.

Es «sin culpables» (blameless): cuenta qué pasó y por qué el sistema lo permitió, no quién se
equivocó. Si una persona pudo romperlo con un comando, el fallo es que el sistema dejara hacerlo sin
avisar; la siguiente persona haría lo mismo. Nombra papeles («quien estaba de guardia»), no
culpables. Escríbelo en los días siguientes, cuando aún se recuerda, y con los datos delante: las
horas de las alertas, las gráficas, las trazas, el log.

Borra estos comentarios al rellenarla.
-->

<!-- #region cabecera -->
- **Fecha:** <día del incidente>
- **Duración:** <desde que empezó hasta que se resolvió, y cuánto tardó en detectarse>
- **Gravedad:** <urgente / aviso: la de la alerta que saltó, o la que debería haber saltado>
- **Autoría:** <quién lo escribe>
- **Estado:** <borrador / revisado / acciones terminadas>
<!-- #endregion cabecera -->

## Resumen

<!-- Tres o cuatro frases que entienda alguien que no estaba: qué falló, qué notaron los clientes,
cómo se arregló. -->

## Impacto

<!-- Lo que notaron quienes usan la tienda, con números: cuántas peticiones fallaron, cuántos
clientes no pudieron iniciar sesión, cuántos correos llegaron tarde y cuánto, si se perdió algo.
Y cuánto del presupuesto de errores del SLO se gastó («99 % de las peticiones a /v2 sin 5xx»). -->

<!-- #region cronologia -->
## Cronología

<!-- Cada momento con su hora, de la fuente que lo dice (el correo de la alerta, el log, una
gráfica). Desde el primer síntoma, aunque nadie lo viera entonces, hasta que todo volvió a la
normalidad. -->

| Hora | Qué pasó | Fuente |
| ---- | -------- | ------ |
|      |          |        |
<!-- #endregion cronologia -->

## Causa

<!-- Qué lo provocó y por qué el sistema lo permitió. Pregunta «¿por qué?» varias veces, hasta llegar
a algo que se pueda cambiar: rara vez hay una sola causa. -->

## Qué fue bien

<!-- Lo que ayudó: la alerta que avisó, el panel que dijo dónde mirar, el límite de tiempo que evitó
que todo se colgara, la cola que guardó los trabajos hasta que volvió Redis. -->

## Qué fue mal

<!-- Lo que estorbó o tardó: una alerta que no saltó, o que saltó tarde; un dato que no estaba en
ningún sitio; un paso que nadie sabía hacer. -->

## Dónde tuvimos suerte

<!-- Lo que no salió peor por casualidad: a esa hora había poco tráfico, el disco no se llenó. La
próxima vez puede no haber esa suerte. -->

## Acciones

<!-- Cambios concretos, cada uno con una persona responsable y una fecha. «Tener más cuidado» no es
una acción; «una alerta si la cola pasa de 100 trabajos» sí lo es. -->

| Acción | Responsable | Para cuándo | Estado |
| ------ | ----------- | ----------- | ------ |
|        |             |             |        |
