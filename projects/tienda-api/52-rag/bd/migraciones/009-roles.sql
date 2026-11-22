-- Los roles (lección 5): qué puede hacer cada cuenta y cada clave, y de quién es cada pedido.

-- #region roles
-- Cada persona tiene un rol: cliente (lo normal: quien se da de alta), reparto o admin. DEFAULT:
-- las cuentas que ya había, y las nuevas, son de clientes. Hacer admin a alguien es un UPDATE a
-- mano, que hace otra persona admin: nunca algo que se pida por la API.
ALTER TABLE usuarios
  ADD COLUMN rol text NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente', 'reparto', 'admin'));

-- Una clave es de un programa: reparto (lo justo para la empresa de reparto) o admin. Nunca
-- cliente: un programa no tiene pedidos propios.
ALTER TABLE claves_api
  ADD COLUMN rol text NOT NULL DEFAULT 'reparto' CHECK (rol IN ('reparto', 'admin'));
-- #endregion roles

-- #region cliente-pedidos
-- De quién es cada pedido. Puede faltar (NULL) en los pedidos que ya había: se hicieron cuando la
-- tienda no tenía cuentas, y no se sabe de quién son. Desde ahora, cada pedido nuevo lleva el suyo.
ALTER TABLE pedidos ADD COLUMN cliente_id integer REFERENCES usuarios (id);

-- La lista de pedidos de un cliente, del más nuevo al más antiguo: el mismo orden que el índice de
-- la migración 003, pero empezando por el cliente.
CREATE INDEX pedidos_por_cliente ON pedidos (cliente_id, creado_en DESC, id DESC);
-- #endregion cliente-pedidos
