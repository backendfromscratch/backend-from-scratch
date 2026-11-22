-- La traza de cada evento saliente (Fase 10, lección 4). La API guarda el evento dentro de la
-- petición del pago, y el repartidor lo pone en la cola más tarde, en otro proceso y sin petición:
-- sin esto, el trabajo empezaría una traza nueva, y no se vería que viene de ese pago. Dice lo mismo
-- que el SQL que generó drizzle-kit (drizzle/0009_contexto-eventos.sql).

-- #region contexto
-- La traza y el span en los que se guardó el evento, en el formato del estándar W3C Trace Context
-- (la cabecera traceparent): 00-<id de la traza>-<id del span>-01. NULL si no hay trazas (sin
-- OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) y en los eventos de antes de esta migración: esos se reparten
-- igual, cada uno en una traza suya. Admite NULL y no tiene DEFAULT: PostgreSQL solo apunta que la
-- columna existe, sin tocar las filas que ya hay.
ALTER TABLE eventos_salientes ADD COLUMN contexto text;
-- #endregion contexto
