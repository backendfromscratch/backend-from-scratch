# Idiomas y nombre del proyecto

- **Fecha:** 2026-10-03.
- **Disponibilidad:** comprobada ese día, y repetida al terminar el informe para los nombres de la lista corta. Un dominio libre hoy puede no estarlo mañana, y la confirmación final la da el registrador al comprarlo.

## 1. Los idiomas más hablados del mundo

Fuente: Ethnologue 2025 (vía Visual Capitalist y Berlitz). Hablantes totales (nativos y no nativos), en millones.

| # | Idioma | Total | Nativos |
|---|---|---|---|
| 1 | Inglés | 1.528 | 390 |
| 2 | Chino mandarín | 1.184 | 990 |
| 3 | Hindi | 609 | 345 |
| 4 | **Español** | 558 | 484 |
| 5 | Árabe estándar | 335 | 0 (es la lengua escrita; se habla cada variedad local) |
| 6 | Francés | 312 | 74 |
| 7 | Bengalí | 284 | 242 |
| 8 | Portugués | 267 | 250 |
| 9 | Ruso | 253 | 145 |
| 10 | Indonesio | 252 | 75 |
| 11 | Urdu | 246 | — |
| 12 | Alemán | 134 | — |
| 13 | Japonés | 126 | — |

### Lo que importa de verdad: dónde están los desarrolladores

Para un curso de backend no cuenta cuánta gente habla un idioma, sino cuántos desarrolladores lo prefieren para aprender.

- **GitHub Octoverse 2025 (desarrolladores por país):**
  1. Estados Unidos, 28 millones;
  2. India, 21,9 millones;
  3. China;
  4. Brasil, 6,89 millones (se ha multiplicado por más de cuatro desde 2020);
  5. Reino Unido;
  6. Japón;
  7. Alemania;
  8. Indonesia, 4,37 millones;
  9. Rusia;
  10. Canadá.

  Los que más crecen: India, Brasil e Indonesia, y a continuación Egipto, Nigeria, Kenia y Marruecos.
- **Encuesta de Stack Overflow 2025 (respuestas por país):** Estados Unidos (20,4 %), Alemania (8,6 %), India (7,2 %), Reino Unido (5,8 %), Francia (4 %), Canadá, Ucrania, Polonia, Países Bajos e Italia. Responden sobre todo quienes ya consumen contenido en inglés.

### Análisis: ¿compensa añadir idiomas?

| Idioma | Desarrolladores | ¿Aprenden en su idioma? | Coste de traducir desde el español | Valor |
|---|---|---|---|---|
| **Portugués (Brasil)** | 4.º país de GitHub y de los que más crecen | Sí: hay un gran mercado de formación en portugués (Alura, Rocketseat) | **Bajo:** es muy parecido al español | **Alto** |
| Japonés | 6.º país | Sí, mucho | Alto | Medio-alto, a largo plazo |
| Chino | 3.er país | Sí | Alto; el ecosistema está bastante separado (GitHub y Google se usan menos) | Medio, pero llegar a ese público pide otra distribución |
| Francés | Francia y la África francófona, que crece | En parte; suelen leer en inglés | Medio | Medio |
| Indonesio | 8.º país y crece rápido | En parte | Medio | Medio |
| Hindi y bengalí | India es el 2.º país | Poco: los devs indios aprenden en inglés | Medio | Bajo |
| Alemán y ruso | 7.º y 9.º países | Poco: leen en inglés | Medio | Bajo |
| Árabe | Egipto y Marruecos crecen | En parte | Alto: escritura de derecha a izquierda (Starlight la admite, pero hay que revisar el tema) | Bajo por ahora |

**Recomendación:**

1. **Ahora, ninguno más.** Cada idioma multiplica el mantenimiento:
   - hoy son unas 25.000 palabras (las 8 lecciones suman casi 24.000, más la introducción y los 51 términos del glosario);
   - más los textos de los tres laboratorios y del tema;
   - y cada lección futura, por cada idioma.

   Con 11 fases por delante, el cuello de botella es escribir el curso, no traducirlo.
2. **El tercero, cuando el curso esté avanzado: portugués de Brasil.** Mucho público de desarrolladores, poca distancia con el español y menos competencia de calidad en backend que en inglés.
3. **La web ya está preparada:** Starlight admite más idiomas con una línea de configuración, y los laboratorios guardan sus textos en `strings.ts` por idioma. Añadir uno es trabajo de traducción, no de arquitectura.

## 2. El nombre del proyecto y el dominio

### Criterios

Revisados el 2026-10-03, cuando el autor fijó como prioridad n.º 1 que la web posicione en Google y que sea entendible para todos los públicos.

1. **Que coincida con lo que la gente busca.** Un nombre de dominio con palabras clave apenas pesa en el ranking (Google le quitó casi todo su valor en 2012). Pero el nombre aparece en el título de cada resultado. Si coincide con la búsqueda, se hace más clic, y quien enlace a la web usará esas palabras.
2. **Que lo entienda cualquiera,** no solo un dev de JavaScript.
3. **Que funcione en español y en inglés,** con un solo dominio para los dos idiomas. Así toda la autoridad (los enlaces que reciba la web) se suma en un sitio.
4. **Que se recuerde y se pueda decir en voz alta.**
5. **Disponible** en `.com` y como organización de GitHub.
6. **Que aguante el curso entero:** no solo redes, también bases de datos, despliegue e IA.

### Disponibilidad comprobada

Cómo se ha comprobado:
- **`.com`, `.dev` y `.app`:** con RDAP, el registro oficial; un 404 significa que el dominio no está registrado.
- **`.io`:** con el whois de su registro.
- **`.es`:** nic.es no ofrece whois público, así que se ha mirado si el dominio existe en el DNS. «libre*» significa que no existe; es un indicio fuerte, pero se confirma al comprar.
- **GitHub:** si el nombre de usuario u organización está libre.

✓ = libre · ✗ = ocupado · ? = no se pudo comprobar · — = no se comprobó.

| Nombre | .com | .dev | .app | .io | .es | GitHub | Choques encontrados |
|---|---|---|---|---|---|---|---|
| **awaitbackend** | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Ninguno |
| **behindthefetch** | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Ninguno (`beyondthefetch.com` está ocupado) |
| **detrasdelfetch** | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Ninguno |
| **backenddesdecero** | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | La frase es genérica: la usan varios cursos (La Estación Academy, MoureDev…) |
| **backendfromscratch** | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Frase muy genérica en inglés |
| defrontaback | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Ninguno; en inglés suena raro |
| frontaback | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Ídem |
| delfrontalback | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Largo |
| trasdelfetch | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Ninguno |
| masalladelfetch | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Largo |
| underthefetch | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Ninguno |
| awaitserver | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Ninguno |
| escucha443 | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Muy de nicho; `listen443` está ocupado en GitHub |
| aprendebackend | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Genérico |
| cursobackend | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Genérico; solo sirve para buscadores |
| backendista | ✓ | — | — | ✓ | ✓* | ✓ | En checo es la palabra habitual para «dev backend» (backendisti.cz) |
| backendear | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Es un verbo inventado |
| bajoelcapo | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Solo en español |
| holabackend | ✗ | ✓ | ✓ | ✓ | ✓* | ✓ | El `.com` está ocupado |
| fetchbackend | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | `FetchBackend` es una clase de Angular: confunde |
| serversidestory | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Ya existe un canal de YouTube de backend, «Server Side Story»: **descartado** |

**Ocupados,** por si alguno te gustaba:
- `.com`: learnbackend, fronttoback, front2back, awaitresponse, beyondfrontend, puerto443, port443, elbackend, helloserver, ladoservidor y backendcourse;
- en todas las terminaciones: synack, desdecero y fromscratch;
- con terminación temática: `backend.sh`, `backend.md`, `backend.academy`, `backend.school`, `backend.guide` y `backend.rest`.

### Qué busca la gente (autocompletado de Google, 2026-10-03)

| Escribes… | Google sugiere… |
|---|---|
| «aprender backend» | **«aprender backend desde cero»** (la primera sugerencia), «aprender backend gratis» |
| «curso backend» | «curso backend gratis», **«curso backend desde cero»** |
| «backend desde cero» | «aprender backend desde cero» |
| «learn backend» | «learn backend development», **«learn backend from scratch»** |
| «backend from scratch» | «learn backend from scratch», «backend development from scratch» |

Nadie busca «await backend» ni «detrás del fetch». «Backend desde cero», en cambio, es casi literalmente la búsqueda de quien quiere hacer este curso.

### Recomendación (revisada con el SEO como prioridad)

**1. «Backend desde cero / Backend from Scratch» en `backenddesdecero.com` — mi recomendación**
- Coincide con las búsquedas «aprender backend desde cero» y «curso backend desde cero». En el resultado de Google se leerá, por ejemplo, «Qué es el DNS y cómo funciona | Backend desde cero».
- Lo entiende cualquiera, sin saber programar. Es además el título que ya tiene la web.
- **Un solo dominio para los dos idiomas:** `backenddesdecero.com` en español y `backenddesdecero.com/en/` en inglés, con «Backend from Scratch» como título de la versión inglesa. Opcional: comprar `backendfromscratch.com` y redirigirlo a `/en/`.
- **Libre:** `.com`, `.dev`, `.app`, `.io`, `.es` y GitHub (comprobado dos veces).
- **En contra:** la frase la usan otros cursos y vídeos (MoureDev, La Estación Academy). Como marca es poco distintiva, y para la búsqueda «backend desde cero» competirás con ellos. No afecta a lo importante, que es posicionar cada lección («qué es el DNS», «diferencia entre TCP y UDP»): ahí gana el mejor contenido, no el nombre.

**2. «await backend» (`awaitbackend.com`), mi recomendación anterior**
- Sigue siendo la marca más original y la más fácil de recordar para un dev frontend.
- **En contra:** nadie la busca, y quien no programa en JavaScript no entiende el guiño. Choca con las dos prioridades.

**3. «Detrás del fetch / Behind the fetch»**
- Bonito, pero tampoco lo busca nadie, son dos nombres y también exige saber qué es `fetch`.

### Dominio: qué terminación

- **`.com`, como principal** (unos 10-12 €/año). Es la terminación que más reconoce y en la que más confía todo el mundo, no solo los desarrolladores.
- **`.dev`, como defensa** (unos 12-15 €/año), redirigiendo al `.com`. Detalle curioso para la lección 7: todos los `.dev` están en la lista de precarga HSTS de los navegadores, así que solo funcionan con HTTPS.
- **`.es`, opcional** (unos 8-10 €/año).
- `.io` y `.app` no aportan nada.

### GitHub

- El nombre del repositorio lo eliges tú dentro de tu cuenta. Recomiendo `backend-desde-cero`.
- Si quieres una organización propia (para separar el proyecto de tu cuenta personal o para tener colaboradores en el futuro), `backenddesdecero` está libre.

### Antes de decidir

- Busca el nombre elegido en el registro de marcas de la UE (EUIPO, gratis en euipo.europa.eu): aquí no se ha hecho una búsqueda de marcas registradas.
- Mira si están libres las cuentas en las redes que vayas a usar (X, Bluesky, YouTube, LinkedIn).
- Cuando lo decidas, cambiar el nombre en la web son dos ficheros: `web/astro.config.ts` (el título) y las portadas (`es/index.mdx` y `en/index.mdx`).

## Fuentes

- [Ranked: The World's Most Spoken Languages in 2025 (Visual Capitalist, con datos de Ethnologue)](https://www.visualcapitalist.com/ranked-the-worlds-most-spoken-languages-in-2025/)
- [25 Most Spoken Languages in the World (Berlitz)](https://www.berlitz.com/blog/most-spoken-languages-world)
- [Octoverse 2025 (GitHub)](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- [Stack Overflow Developer Survey 2025](https://survey.stackoverflow.co/2025/)
- [Licencia de CheerpX / WebVM](https://cheerpx.io/docs/licensing) (para el diseño de la Fase 1)
- Disponibilidad: RDAP de Verisign (`.com`) y de Google Registry (`.dev` y `.app`), whois de `whois.nic.io`, DNS de `.es` y la API de GitHub; el 2026-10-03.
