-- Quien entra con un proveedor de identidad (lección 4) se reconoce por el sub que da el proveedor:
-- un identificador de esa persona que no cambia nunca, aunque cambie su email.

-- #region sub-proveedor
-- Puede faltar (NULL): quien solo usa contraseña no tiene. UNIQUE: un sub, una cuenta. Con un solo
-- proveedor basta una columna; con varios (Google, GitHub…), sería una tabla aparte con el
-- proveedor y el sub de cada uno.
ALTER TABLE usuarios ADD COLUMN sub_proveedor text UNIQUE;
-- #endregion sub-proveedor
