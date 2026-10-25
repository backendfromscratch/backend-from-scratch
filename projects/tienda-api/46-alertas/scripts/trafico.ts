// Tráfico de práctica (Fase 10, lecciones 6 y 7): una clienta que no para de comprar, para que las
// gráficas y las alertas tengan algo que mirar. Con la tienda arrancada, en otra terminal:
//   npm run trafico                      hasta que pulses Ctrl + C
// En cada vuelta, Carmen (una cuenta de práctica, bd/cuentas.sql) inicia sesión, compra una taza,
// la paga con la pasarela de mentira (scripts/pasarela.ts, como harías a mano con npm run
// pasarela) y cancela el pedido, para devolver la taza al stock: si no, en unos minutos la tienda
// se quedaría sin tazas y todo serían 409. Cada pago deja un correo de confirmación en Mailpit.
// Compra siempre con la misma sesión, la primera que abre. Inicia sesión en cada vuelta solo para
// que haya inicios de sesión entre el tráfico (la lección 7 los necesita: son los que fallan con
// Redis congelado), y cierra al momento cada sesión nueva: sin eso, dejaría unas 3000 filas por
// hora en la tabla de sesiones.
// Escribe una línea por vuelta, con la hora y el código de cada respuesta, y al final, cuántas.
// Lee TIENDA_URL (por defecto http://localhost:3000) y WEBHOOK_SECRET del .env, como la pasarela.
import { execFile } from 'node:child_process';
import { setTimeout as dormir } from 'node:timers/promises';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);
const tienda = process.env.TIENDA_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
// Con la cookie de la sesión, la tienda exige Origin (CSRF, Fase 6): una web de ORIGENES_PERMITIDOS.
const ORIGEN = 'http://localhost:3000';
const json = { 'Content-Type': 'application/json' };
const CARMEN = { email: 'carmen@ejemplo.com', contrasena: 'carmen-practica-2026' };
const TAZA = 2; // bd/datos.sql: la que más stock tiene

let seguir = true;
process.once('SIGINT', () => {
  seguir = false;
});

// La cookie de la sesión con la que se compra. Si iniciar sesión falla, se sigue comprando con ella.
let cookie: string | undefined;
const respuestas = new Map<string, number>();
const contar = (codigo: string) => respuestas.set(codigo, (respuestas.get(codigo) ?? 0) + 1);

// Un código, o «---» si no se pudo ni preguntar (la tienda parada, por ejemplo).
async function pedir(ruta: string, init: RequestInit): Promise<Response | undefined> {
  try {
    return await fetch(`${tienda}${ruta}`, init);
  } catch {
    return undefined;
  }
}

// #region vuelta
async function unaVuelta(): Promise<string[]> {
  const linea: string[] = [];
  const apuntar = (paso: string, codigo: number | string) => {
    linea.push(`${paso} ${codigo}`);
    contar(String(codigo));
  };

  const sesion = await pedir('/v2/sesion', {
    method: 'POST',
    headers: json,
    body: JSON.stringify(CARMEN),
  });
  apuntar('sesión', sesion?.status ?? '---');
  const nueva = sesion?.ok ? sesion.headers.getSetCookie()[0]?.split(';')[0] : undefined;
  if (nueva && !cookie) {
    // La primera: con esta se compra, vuelta tras vuelta.
    cookie = nueva;
  } else if (nueva) {
    // Las demás solo eran para probar: se cierran.
    const salir = await pedir('/v2/sesion', {
      method: 'DELETE',
      headers: { Cookie: nueva, Origin: ORIGEN },
    });
    apuntar('salir', salir?.status ?? '---');
  }
  if (!cookie) return linea;
  const conSesion = { ...json, Cookie: cookie, Origin: ORIGEN };

  const pedido = await pedir('/v2/pedidos', {
    method: 'POST',
    headers: conSesion,
    body: JSON.stringify({ productoId: TAZA, cantidad: 1 }),
  });
  apuntar('pedido', pedido?.status ?? '---');
  // La sesión ha caducado: la siguiente que se abra pasa a ser la de comprar.
  if (pedido?.status === 401) cookie = undefined;
  if (pedido?.status !== 201) return linea;
  const { id } = (await pedido.json()) as { id: number };

  // La pasarela, el mismo script que usas a mano: firma el aviso con WEBHOOK_SECRET y lo manda.
  try {
    const { stdout } = await ejecutar(process.execPath, ['scripts/pasarela.ts', String(id)], {
      env: { ...process.env, TIENDA_URL: tienda },
    });
    apuntar('pago', stdout.match(/← (\d{3})/)?.[1] ?? '---');
  } catch {
    apuntar('pago', '---');
  }

  const cancelar = await pedir(`/v2/pedidos/${id}/cancelacion`, {
    method: 'POST',
    headers: conSesion,
  });
  apuntar('cancelar', cancelar?.status ?? '---');
  return linea;
}
// #endregion vuelta

console.log(`Tráfico contra ${tienda}. Ctrl + C para parar.`);
while (seguir) {
  const hora = new Date().toLocaleTimeString('es-ES');
  console.log(`${hora}  ${(await unaVuelta()).join('  ')}`);
  if (seguir) await dormir(1000);
}
const resumen = [...respuestas].map(([codigo, cuantas]) => `${codigo}: ${cuantas}`).join(', ');
console.log(`\nRespuestas: ${resumen}`);
