# Diseño: lección «Qué es el backend» (Fase 0, nueva lección 1)

- **Fecha:** 2026-10-04
- **Estado:** aprobado (2026-10-04)
- **Origen:** el autocompletado de Google muestra muchas búsquedas de principiante que ninguna página del curso responde (`docs/pendientes.md`, propuesta del 2026-10-04).
- **Decisiones del autor (2026-10-04):**
  - es la lección 1 de la Fase 0, y las ocho actuales pasan a ser la 2 a la 9;
  - el ejemplo que recorre la lección es comprar una entrada para un concierto desde el móvil, y la analogía es un restaurante;
  - las referencias «lección N» se renumeran con un script, no con un componente;
  - la práctica usa la API de Open-Meteo, primero en el navegador y luego con `curl`.

## 1. Intención

Dos objetivos, por este orden:

1. **Responder a las búsquedas de quien empieza de cero.** Autocompletado de Google del 2026-10-04:
   - **en español:** «qué es el backend», «que es backend y frontend», «frontend y backend diferencias», «backend que es y para que sirve», «que es el backend de una web», «que hace el backend», «frontend y backend ejemplos»;
   - **en inglés:** «what is the backend of a website», «what is backend vs frontend», «frontend vs backend», «what does a backend do».
2. **Ser la puerta de entrada al curso.** Quien llega desde Google tiene que terminar sabiendo:
   - qué es el frontend, qué es el backend y qué es el full stack;
   - qué hace un backend en una web real;
   - por qué hay cosas que solo puede hacer el backend.

   Y tiene que querer seguir con la lección 2, «Modelo cliente-servidor».

Público: todos los públicos (`docs/specs/2026-10-03-seo-design.md`, §2.3). No da por sabido nada de programación.

## 2. Título, URL y frontmatter

| | Español | Inglés |
|---|---|---|
| `translationKey` | `what-is-backend` | `what-is-backend` |
| Fichero | `fase-0/que-es-el-backend.mdx` | `en/phase-0/what-is-the-backend.mdx` |
| URL | `/fase-0/que-es-el-backend/` | `/en/phase-0/what-is-the-backend/` |
| `title` (H1 y `<title>`) | Qué es el backend: diferencias con el frontend | What is the backend? Frontend vs backend |
| `sidebar.label` | Qué es el backend | What is the backend |
| En el explorador | `01-que-es-el-backend.md` | `01-what-is-the-backend.md` |
| `sidebar.order` | 1 | 1 |

- **Ajuste del 2026-10-04, al escribir el plan:** los títulos aprobados («Qué es el backend y en qué se diferencia del frontend» y «What is the backend? Frontend vs backend explained») no cabían. Con el nombre de la web detrás, el `<title>` daba 74 y 73 caracteres, y la auditoría SEO del build no admite más de 70. Los nuevos dan 67 y 63, y conservan las palabras de las búsquedas: «qué es el backend», «diferencias», «frontend» y «frontend vs backend».
- **`description`:**
  - es (144 caracteres): «Qué es el backend, para qué sirve y en qué se diferencia del frontend, explicado desde cero y con ejemplos de las webs y apps que usas cada día.»
  - en (154 caracteres): «What the backend is, what it does and how it differs from the frontend, explained from scratch with examples from the websites and apps you use every day.»
- **`lesson.oneLiner`:** «El backend es la parte de una web o una app que no ves: los programas que, en otros ordenadores, reciben lo que pides, guardan los datos y deciden qué responder. El frontend es lo que ves y tocas.» En inglés, la misma idea.
- **`lesson.objectives`:**
  - Distinguir el frontend del backend: dónde se ejecuta cada uno y qué hace.
  - Explicar qué hace el backend cuando compras algo en una web o una app.
  - Entender por qué hay cosas que solo puede hacer el backend: guardar los datos de todos, cobrar y comprobar quién eres.
  - Ver con tus ojos la respuesta de un backend real, sin frontend.
- **`lesson.prerequisites`:** ninguno.

## 3. Contenido

El orden de las secciones es el de la guía de estilo. Duración: entre 10 y 15 minutos de lectura, unas 2.000–2.500 palabras.

### 3.1 El problema

- Compras una entrada para un concierto desde el móvil. La pantalla de compra está en tu móvil, pero tu móvil no puede saber qué asientos quedan libres. Miles de personas compran a la vez desde sus propios móviles.
- Algo, en otro sitio, lleva la cuenta para todos: qué asientos quedan, quién ha pagado y qué entrada es de quién. Eso es el backend. Lo que tienes en la mano es el frontend.

### 3.2 La analogía: un restaurante

- **La sala es el frontend:** la carta, la mesa y lo que ves.
- **La cocina es el backend:** los cocineros siguen las recetas y las reglas, la despensa es la base de datos y los proveedores son otros servicios.
- **El camarero** lleva tu pedido a la cocina y te trae el plato: son la petición y la respuesta.
- **Límites** (slot `limits`):
  - una cocina da de comer a unas pocas mesas, y un backend atiende a millones de personas a la vez;
  - el frontend no es solo «lo bonito»: también tiene lógica, como comprobar un formulario antes de enviarlo;
  - en un restaurante te fías de la cocina porque la ves; en una web no ves nada, y por eso el backend no se fía de lo que le llega (§3.3).

### 3.3 Cómo funciona de verdad

1. **Dónde se ejecuta cada parte.**
   - El frontend se ejecuta en tu dispositivo: la web en tu navegador, o la app en tu móvil.
   - El backend se ejecuta en servidores, es decir, en programas que esperan peticiones. Enlaza con la lección 2, que lo explica a fondo.
2. **Lo que viaja entre los dos son datos, no pantallas.** Aquí va la figura de §5: el backend envía datos y el frontend los convierte en lo que ves. La forma en que se hablan es una **API** (`<Term id="api">`).
3. **El recorrido de la compra, paso a paso.**
   - Es un diagrama de secuencia (bloque `mermaid`, que el build convierte en HTML). Tiene cinco participantes: tu móvil (frontend), el backend de la tienda, la base de datos, el servicio de pagos y el servicio de correo.
   - Pasos: compruebo quién eres → ¿quedan asientos? → reservo el tuyo para que nadie más lo compre → cobro con el servicio de pagos → guardo la compra → mando el correo → respondo «compra hecha».
   - Cada paso dice en qué fase del curso se aprende: quién eres (Fase 6), las reglas y las comprobaciones (Fase 3), guardar y que no se venda dos veces el mismo asiento (Fase 5), hablar con otros servicios (Fase 4) y el correo en segundo plano (Fase 9). Las fases sin publicar no se enlazan, porque darían 404: se nombran y se enlaza el temario (`/roadmap/`).
4. **Por qué no puede hacerlo todo el frontend.**
   - El código del frontend está en el dispositivo de cada usuario, y cualquiera puede cambiarlo. Por eso:
     - las comprobaciones que importan se repiten en el backend;
     - las claves secretas (la de cobrar, por ejemplo) solo viven en el backend;
     - los datos que comparten todos están en el backend.
   - Es la idea «nunca te fíes del cliente», que vuelve en las fases 3 y 6.
5. **Frontend, backend y full stack.**
   - Una tabla con cuatro filas para el frontend y el backend: dónde se ejecuta, qué hace, lenguajes típicos y qué ves cuando falla. Los lenguajes:
     - frontend: HTML, CSS, JavaScript y TypeScript;
     - backend: JavaScript y TypeScript con Node.js (el de este curso), Python, Go, Java, PHP…
   - Después, una frase sobre el *full stack*: quien trabaja en las dos partes. No hace falta dominar las dos a fondo.

### 3.4 Pruébalo

Ver la respuesta de un backend real, sin frontend. Se usa la API de Open-Meteo (§4).

1. **En el navegador, sin terminal.** Se pega la URL en la barra de direcciones. En vez de una página aparece texto con datos (JSON). Se explica dónde están la temperatura (`"temperature_2m": 17.4`) y el código del tiempo (`"weather_code": 0`), y que eso es lo que recibe una app del tiempo antes de pintar «17 °C», un sol y «Despejado».
2. **En la terminal,** con `curl` dentro de un `<TryIt>`.
   - La salida se copia de una ejecución real, como pide la guía, y la lección avisa de que tus números serán otros.
   - `curl` se explica en una frase: un programa que hace peticiones desde la terminal, como un navegador sin pantalla.
3. **Cita de los datos,** que es lo que pide su licencia: «Datos del tiempo: [Open-Meteo.com](https://open-meteo.com/), con licencia CC BY 4.0».

### 3.5 Ya lo has visto

- Lo que ve cualquiera:
  - el aviso «algo ha ido mal, inténtalo más tarde» (el backend ha fallado o no responde);
  - la rueda de «cargando» (el frontend espera la respuesta del backend);
  - la cesta que ves igual en el móvil y en el portátil (está guardada en el backend, no en el dispositivo).
- «Y si programas:» `fetch` llama a un backend, y en la pestaña Network de DevTools se ven esas llamadas.

### 3.6 Errores comunes

- «El backend es la base de datos». La base de datos es una de sus piezas; el backend es el programa que decide.
- «El frontend es solo diseño». También tiene lógica.
- «Si el formulario ya lo comprueba, es seguro». Cualquiera puede saltarse el frontend; el backend tiene que volver a comprobarlo.
- «El backend es una máquina». Es un programa, y lo verás en la lección 2.

### 3.7 Resumen, «¿Lo has entendido?» y «Para profundizar»

- **Resumen:** de 3 a 5 puntos.
- **«¿Lo has entendido?»:** de 2 a 4 `<SelfCheck>`. Por ejemplo:
  - «La web comprueba en el formulario que tienes más de 18 años. ¿Basta?» No: hay que comprobarlo también en el backend.
  - «¿Por qué la clave para cobrar no puede estar en el código de la app?»
  - «¿Dónde está guardada tu cesta de la compra cuando la ves en dos dispositivos?»
- **«Para profundizar»:** la introducción de MDN a la programación del lado del servidor (la versión en español si MDN la tiene; si no, la inglesa) y la documentación de la API de Open-Meteo.

## 4. La API de Open-Meteo

- **URL en español:** `https://api.open-meteo.com/v1/forecast?latitude=40.42&longitude=-3.70&current=temperature_2m,weather_code` (Madrid). En inglés, Londres: `latitude=51.51&longitude=-0.13`.
- **`weather_code`** (ajuste del 2026-10-04, al escribir el plan): es un número de la norma WMO, por ejemplo 0 para despejado, 3 para nublado, 61 para lluvia y 95 para tormenta. Enseña mejor que la temperatura lo que hace el frontend: el backend envía un número, y la app lo convierte en un dibujo y una palabra. La figura de §5 usa el mismo campo.
- **Por qué esta:** es gratis, no pide registro ni clave, y su respuesta es una sola línea de JSON con datos que entiende cualquiera. Comprobada el 2026-10-04: responde en menos de 0,2 s.
- **Condiciones** (open-meteo.com/en/terms, 2026-10-04): permite el uso en contenido educativo sin ánimo de lucro, con menos de 10.000 llamadas al día (las hace cada lector desde su navegador o su terminal). Los datos tienen licencia CC BY 4.0, que pide citar la fuente (§3.4).
- **Riesgo:** si Open-Meteo cambia su API o desaparece, el ejercicio se rompe. Se acepta: la API es estable desde 2022 y cambiar de API es editar una URL y una salida.

## 5. La figura «de datos a pantalla»

- **Qué enseña:** a la izquierda, el JSON que envía el backend (abreviado, con `temperature_2m` y `weather_code`). A la derecha, la tarjeta del tiempo que pinta el frontend con esos datos: «Madrid», «17 °C», un sol y «Despejado». Entre las dos, una flecha con el texto «la app lo convierte en».
- **Cómo se hace:** un componente propio en `web/src/components/diagrams/`, con los textos por props. Va en HTML y CSS, sin JavaScript, con los colores del tema y con el texto legible por los lectores de pantalla, como `<Encapsulation>` y `<NatTranslation>`. En móvil, las dos partes van una debajo de otra.
- Se documenta en la guía de estilo, en «Diagramas», junto a los otros dos componentes.

## 6. Glosario

Cuatro términos nuevos, en `es` y en `en`. No llevan `lesson:`: su primer uso es esta lección, que es la que los explica.

| id | es | en | `related` |
|---|---|---|---|
| `backend` | Backend | Backend | `frontend`, `server`, `api`, `database` |
| `frontend` | Frontend | Frontend | `backend`, `client` |
| `api` | API | API | `backend`, `request`, `response` |
| `database` | Base de datos | Database | `backend` |

Cada definición (`short`) va en una o dos frases, sin jerga que no esté en el glosario.

## 7. Cambios en el resto del curso

### 7.1 Renumeración

- **`sidebar.order`:** las ocho lecciones actuales suben uno, de 1–8 a 2–9, en los dos idiomas. Lo que sale del orden del sidebar se actualiza solo: los nombres del explorador, la paginación, la barra de estado y la lista de playgrounds.
- **`lessonCount` de la Fase 0:** pasa de 8 a 9 (`web/src/data/phases.ts`). El test que compara las lecciones publicadas con `lessonCount` lo vigila.
- **Las «lección N» del texto** (54 en español y 54 en inglés, en `web/src/content/docs/`):
  - un script suma 1 a cada número que se refiere a una lección de la Fase 0 («lección 3» → «lección 4», «Lesson 5» → «Lesson 6»);
  - imprime cada cambio con su línea, para revisarlo uno a uno antes de darlo por bueno;
  - se ejecuta una sola vez y no se queda en el repositorio.
- **Introducción de la Fase 0, en los dos idiomas:**
  - la lista «Las lecciones» añade la nueva en primer lugar y renumera las demás;
  - «Lo que vas a aprender» añade un punto: qué es el backend y en qué se diferencia del frontend.

### 7.2 Lección 2, «Modelo cliente-servidor»

- `prerequisites: [what-is-backend]`. Bajo el título se verá `import 01-que-es-el-backend.md // requisito previo`.
- El tercer límite de su analogía explica de pasada qué son el backend, el frontend y una API. Se acorta y remite a la lección 1, en vez de repetirlo.

### 7.3 Documentos

- `docs/specs/2026-10-02-web-fase-0-design.md`: la lista de lecciones de la Fase 0, con una nota que remite a este documento.
- `docs/specs/2026-10-03-seo-design.md`, §4: una fila nueva para la lección 1 y las demás renumeradas.
- `docs/style-guide.md`: «DevTools es para todos desde la lección 3» pasa a ser la lección 4.
- `docs/pendientes.md`:
  - se renumeran las revisiones de lecciones que tienes pendientes;
  - se añade «Leer y hacer como lector la lección 1 nueva, y reescribirla con tu voz»;
  - se marca como hecha la propuesta de esta lección.
- `CLAUDE.md`: se añade «Qué es el backend» como primer punto del roadmap de la Fase 0. Es el fichero del autor, así que se le pregunta antes.
- Los planes ya ejecutados (`docs/plans/…`) no se tocan: son historia.

## 8. Inglés

- La lección en inglés se escribe en la misma tanda que la española, con los mismos datos de Open-Meteo para Londres y su propia salida real.
- También se traducen los términos de glosario nuevos y los textos de la figura y del diagrama.
- Los títulos de sección en inglés son los de la guía de estilo.

## 9. Verificación

- **Tests (`pnpm test`):**
  - `lessonCount` coincide con las lecciones publicadas;
  - cada clave i18n se usa;
  - el glosario no tiene relaciones rotas.
- **`pnpm check` y `pnpm format:check`:** sin errores.
- **Build:**
  - la auditoría SEO pasa (título, descripción, `hreflang`, imagen para redes);
  - todos los enlaces internos son válidos;
  - el JavaScript de la página no crece, porque la figura no lleva JavaScript.
- **Renumeración:**
  - un recuento antes y después confirma las 108 referencias cambiadas;
  - ninguna «lección N» de la Fase 0 pasa de 9;
  - se revisa a mano cada referencia cambiada.
- **Navegador, en oscuro y en claro, a 1440 y a 390 px:**
  - la barra de estado dice «lección 1/9» en la nueva y «lección 2/9» en «Modelo cliente-servidor»;
  - la paginación va de la introducción a la lección 1 y de la 1 a la 2;
  - la figura y el diagrama se leen bien;
  - el ejercicio de Open-Meteo funciona en el navegador.
- **Revisión independiente,** por un revisor con contexto nuevo:
  - la lección española contra la guía de estilo y el criterio «todos los públicos»;
  - la inglesa contra la española.

## 10. Fuera de alcance

- «Qué estudiar para ser desarrollador backend», los sueldos y la ruta profesional: van en el temario (`/roadmap/`), que tiene su propio pendiente.
- Un playground interactivo: la figura de §5 y el ejercicio bastan.
- El componente `<LessonRef>`, para no tener que renumerar a mano en el futuro: se descarta mientras insertar lecciones sea algo raro.
- Reescribir el resto de lecciones: solo cambian sus números y lo que dice §7.2.
