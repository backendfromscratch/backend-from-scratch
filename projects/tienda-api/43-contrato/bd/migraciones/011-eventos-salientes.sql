-- Los eventos salientes (Fase 9, lección 7): lo que la tienda tiene que hacer después de que un
-- pedido se pague (avisar a la empresa de reparto, mandar el correo), guardado en la misma
-- transacción que el pago. Si el pago se guarda, esto también; si no, tampoco. Después, un
-- repartidor en el trabajador (src/salientes.ts) los lee, los pone en la cola de Redis y apunta
-- cuándo. Dice lo mismo que el SQL que generó drizzle-kit (drizzle/0008_eventos-salientes.sql).

-- #region eventos-salientes
CREATE TABLE eventos_salientes (
  -- bigint, y no integer: es una tabla que solo crece, una fila por cada trabajo de cada pago.
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- El tipo del trabajo (aviso-de-pago, correo-de-confirmacion), también dentro de datos: aquí, a
  -- la vista, para contar o buscar sin abrir el JSON.
  tipo text NOT NULL,
  -- El trabajo entero, tal y como irá a la cola. jsonb: JSON que PostgreSQL entiende por dentro.
  datos jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  -- Cuándo lo puso el repartidor en la cola. NULL: todavía no.
  enviado_en timestamptz
);

-- Un índice parcial (WHERE): solo las filas sin enviar, las que busca el repartidor cada segundo.
-- Las enviadas, que con el tiempo son casi todas, no están en él, así que sigue siendo pequeño.
CREATE INDEX eventos_salientes_sin_enviar ON eventos_salientes (creado_en)
  WHERE enviado_en IS NULL;
-- #endregion eventos-salientes
