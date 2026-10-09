# Diseño: Fase 1, «Terminal, Linux y SSH»

- **Fecha:** 2026-10-03
- **Estado:** aprobada el 2026-10-07. El autor eligió la VM de Multipass (§2.1), WSL como única vía en Windows (§2.2) y las diez lecciones (§3), y esperar a la Fase 3 para el primer proyecto guiado (§8). Se empieza con una lección piloto: la introducción y la lección 1, solo en español; las demás, cuando el autor la lea y apruebe la plantilla y el tono (plan: `docs/plans/2026-10-07-fase-1-piloto.md`).
- **Origen:** el roadmap de `CLAUDE.md` (Fase 1). El autor pidió diseñarla sin consultarle («no me preguntes nada»), así que las decisiones están aquí argumentadas y resumidas en `docs/pendientes.md`.
- **Spec de referencia:** `docs/specs/2026-10-02-web-fase-0-design.md`. La plantilla de lección, los tres niveles de «Pruébalo», los idiomas y el tema visual no cambian.

## 1. Objetivo

Al terminar la fase, el lector se mueve con soltura por la terminal de un servidor Linux:

- navega, lee y edita ficheros, y encadena comandos;
- entiende los usuarios, los permisos, los procesos y los servicios;
- configura programas con variables de entorno y escribe scripts pequeños;
- entra en un servidor por SSH con su clave;
- y usa Git desde la terminal sabiendo lo que pasa por dentro.

Todavía no escribe código de backend: aprende el terreno donde va a vivir ese código (Fases 3, 7 y 8).

## 2. Decisiones transversales

### 2.1 Dónde practica el lector

Tres entornos, de menos a más, y cada lección dice cuál usa:

| Entorno | Para qué | Cómo |
|---|---|---|
| **Su terminal** | Shell, ficheros, pipes, procesos, variables y scripts | macOS (zsh), Linux (bash) o Windows con WSL (Ubuntu) |
| **Su servidor de prácticas** | Lo que solo existe en un Linux de servidor: usuarios y `sudo`, `systemd`, `apt`; y ser el destino de SSH | Una máquina virtual Ubuntu con **Multipass** (gratis, de Canonical, para macOS, Windows y Linux): `multipass launch --name curso` y `multipass shell curso` |
| **Servidores reales en internet** | Practicar SSH y la shell en remoto | **OverTheWire Bandit**, un juego para aprender Linux entrando por SSH (`ssh bandit0@bandit.labs.overthewire.org -p 2220`), y **GitHub** (`ssh -T git@github.com`) para usar una clave de verdad |

**Comprobado el 2026-10-03:** Bandit responde en el puerto 2220 (`SSH-2.0-OpenSSH_10.2p1`). Multipass 1.16.4 se instala con `brew install --cask multipass`. En macOS, el servidor SSH propio viene apagado (Inicio de sesión remoto), y activarlo pide permisos de administrador, así que no se usa `ssh localhost`.

**Por qué una máquina virtual y no Docker:** Docker llega en la Fase 7, y un contenedor no es un servidor (no tiene `systemd`, por ejemplo). Una VM de Multipass se parece mucho al VPS de la Fase 8, así que lo aprendido se reutiliza tal cual.

**Windows:** WSL2 ya es un Ubuntu, y admite `systemd` (activándolo en `/etc/wsl.conf`). Así que en Windows la propia WSL puede hacer de servidor de prácticas, sin Multipass, salvo en la lección de SSH, donde hace falta un destino distinto (Bandit o GitHub).

**Sin instalar nada:** se enlaza WebVM (webvm.io), un Linux en el navegador, para quien no pueda instalar nada. Solo se enlaza: su motor (CheerpX) no permite alojarlo en una web ajena en la versión gratuita.

### 2.2 Windows: WSL como única vía (cierra una decisión pendiente)

La Fase 1 enseña Linux. PowerShell es otro mundo, y mantener dos versiones de cada ejercicio no compensa. Propuesta:

- WSL es la forma oficial de seguir el curso en Windows, explicada en la introducción de la Fase 0 (ya lo está);
- desaparece la pestaña «Windows» de los ejercicios, también la de la lección 2;
- `<TryIt>` mantiene la prop `windows` por si algún día hace falta, pero la guía de estilo dice que no se use.

### 2.3 zsh, bash y las diferencias entre macOS y Linux

- Se enseña lo que comparten zsh y bash. Los scripts usan `#!/usr/bin/env bash` y se ejecutan con bash también en macOS.
- macOS trae las versiones BSD de muchas herramientas, y Linux las de GNU. Los ejercicios evitan las opciones que cambian (`sed -i`, `date -d`, `ls --color`…). Cuando una diferencia importa, se dice. Y lo que solo existe en Linux se hace en el servidor de prácticas.

### 2.4 Seguridad del lector

- Nada destructivo en su ordenador: los ejercicios de borrar, mover y permisos van en una carpeta de prácticas, `~/curso-backend/fase-1`, que crea la introducción, o en la VM.
- Cada `sudo` se explica antes de pedirlo. Una lección no puede pedir `sudo` en el ordenador del lector si se puede hacer en la VM.
- Las salidas usan un usuario y una máquina inventados (`ana`, en el host `portatil`; `ubuntu`, en la VM `curso`), como pide la guía de estilo con los datos personales.

## 3. Lecciones

Diez lecciones y la introducción. Entre 10 y 15 minutos de lectura cada una, como en la Fase 0, con la misma plantilla.

| # | Slug | Título | Contenido | Pruébalo | Entorno |
|---|---|---|---|---|---|
| 0 | `index` | Introducción | Por qué casi todo servidor es Linux sin pantalla. Los tres sitios donde se practica y la carpeta de prácticas | `uname` y crear la carpeta de prácticas | Terminal |
| 1 | `comandos-basicos-terminal` (`translationKey` `shell-basics`) | Comandos básicos de la terminal en Mac y Linux (nombre corto: «La shell: comandos y rutas») | El prompt; comando, opciones y argumentos; `pwd`, `ls`, `cd`; rutas absolutas y relativas, `~`, `.` y `..`; ficheros ocultos; tabulador e historial; `man` y `--help`; `which` | Moverse por el sistema y por la carpeta de prácticas | Terminal |
| 2 | `files-and-text` | Ficheros y texto | `mkdir`, `touch`, `cp`, `mv` y `rm` (sin papelera); `cat`, `less`, `head` y `tail -f`; `wc`; `find`; `grep`; editar con `nano`, y cómo salir de `vim` | Descargar un log de ejemplo con `curl` y buscar en él | Terminal |
| 3 | `pipes-and-redirection` | Pipes y redirecciones | stdin, stdout y stderr; `\|`, `>`, `>>`, `2>`, `2>&1` y `/dev/null`; el código de salida (`$?`), `&&` y `\|\|`; `sort`, `uniq -c` y `cut` | Leer logs como en un servidor: las IPs que más piden, los 404 y las peticiones por hora | Terminal |
| 4 | `users-and-permissions` | Usuarios y permisos | Instalar Multipass y crear la VM `curso`. Usuarios y grupos (`whoami`, `id`); `rwx` en `ls -l`; `chmod` simbólico y en octal; `chown`; `root`, `sudo` y el mínimo privilegio; por qué cada servidor corre con su propio usuario (y el puerto 80 de la lección 5 de la Fase 0) | Crear un usuario en la VM e intentar leer sus ficheros | VM |
| 5 | `processes-and-signals` | Procesos y señales | Proceso y PID; `ps` y `top`; `kill` y las señales (`SIGINT` es Ctrl+C, `SIGTERM`, `SIGKILL`, `SIGHUP`); primer y segundo plano (`&`, `jobs`, `fg`); `nohup`; qué proceso escucha en un puerto (`lsof`, lección 5 de la Fase 0) | Lanzar, encontrar y parar procesos, con `nc -l` y `sleep` | Terminal |
| 6 | `services-and-packages` | Servicios y paquetes | Demonios y `systemd`: `systemctl`, `journalctl`; un *unit file* mínimo; `apt`; en macOS, `launchd` y `brew`, solo mencionados | Instalar nginx con `apt`, verlo con `systemctl` y `curl localhost`, y crear un servicio propio con `python3 -m http.server` | VM |
| 7 | `environment-variables` | Variables de entorno | `env` y `export`; `PATH` (cómo encuentra la shell los comandos); `.zshrc` y `.bashrc`; `PORT=3000 node app.js`; ficheros `.env` y por qué no se suben a Git; los secretos fuera del código; `process.env` | Un script que se configura con variables, y arreglar un `command not found` | Terminal |
| 8 | `shell-scripts` | Scripts de shell | Shebang y `chmod +x`; variables y argumentos (`$1`, `$@`); `if`, `for` y `test`; `set -euo pipefail`; códigos de salida; cuándo conviene pasar a Node o Python | Un script que comprueba si un servidor escucha (`nc -z`, lección 5 de esta fase) y otro que hace copias con fecha | Terminal |
| 9 | `ssh` | SSH | Cliente y servidor (`sshd`, puerto 22); la huella del servidor y `known_hosts`, comparados con los certificados de la lección 8 de la Fase 0 (aquí no hay autoridad certificadora: confías la primera vez); claves `ed25519` (`ssh-keygen`), `authorized_keys` y los permisos `600`; `ssh-agent`; `~/.ssh/config`; `scp` y `rsync`; túneles (`-L`) | Bandit niveles 0 y 1; entrar sin contraseña en tu VM; tu clave en GitHub (`ssh -T git@github.com`); un túnel hasta el nginx de la VM | Internet y VM |
| 10 | `git-in-depth` | Git por dentro | Qué es un commit (objetos y hashes, que enlazan con las huellas de la lección 8 de la Fase 0); las ramas son punteros; `merge` frente a `rebase`; `rebase -i`; `reflog` para deshacer casi todo; `bisect`; remotos por SSH; firmar commits con tu clave SSH; adelanto de cómo Git dispara un despliegue (Fase 8) | Un repositorio de prácticas: `git cat-file -p`, rescatar un commit con `reflog` y encontrar un error con `bisect` | Terminal |

El `lessonCount` de la fase en `web/src/data/phases.ts` pasa a 10.

### Cambios respecto al roadmap de `CLAUDE.md` (propuestos con la libertad que dio el autor)

- **«Procesos» se divide en dos:** procesos y señales por un lado, y servicios (`systemd`) y paquetes (`apt`) por otro. Juntos no caben en 15 minutos, y `apt` no estaba en el roadmap y hace falta desde el primer día en un servidor.
- **`nano` y salir de `vim`** entran en «Ficheros y texto»: en un servidor no hay VS Code.
- **Leer logs** es el hilo práctico de «Pipes y redirecciones». Es lo primero que se hace en un servidor cuando algo falla, y prepara la observabilidad de la Fase 10.
- **«Git como base del despliegue»** se queda en un adelanto. La parte de verdad, que un `push` despliegue, es CI/CD y encaja en la Fase 8. La lección de Git se centra en lo que un dev frontend con años de experiencia suele no conocer: el modelo interno, `reflog` y `bisect`.

## 4. «Pruébalo» y laboratorios

- **Nivel 1 (terminal) en todas las lecciones.** Es la fase más práctica del curso: el propio terminal es el laboratorio.
- **Sin laboratorios de nivel 3:** `CLAUDE.md` los reserva para HTTP, DNS, TCP y Docker. El de HTTP llega en la Fase 2.
- **Un componente pequeño y opcional:** una calculadora de permisos (`rwx` ↔ octal ↔ `chmod u+x`) en la lección 4. Es lógica pura, se puede probar con tests y es útil de consulta. Se construye solo si al escribir la lección se ve que ayuda.

## 5. Material de prácticas que hay que crear

- **Un log de ejemplo** servido por la propia web, en `web/public/practicas/access.log`. Lo genera un script reproducible, con un formato como el de nginx, IPs de los rangos de documentación y unas mil líneas con 200, 301, 404 y 500 repartidos. Lo usan las lecciones 2 y 3.
- **Un repositorio de prácticas para Git:** un script que crea, en la carpeta de prácticas, un repositorio con historia y un error escondido para `bisect`.
- **Nada de imágenes de VM propias:** se usa la imagen estándar de Ubuntu de Multipass, que el lector descarga con `multipass launch`.

## 6. Cambios en la web antes de publicar la primera lección

Están apuntados en `docs/pendientes.md` desde la revisión del tema y se hacen con su plan y sus tests:

1. El explorador abre solo la carpeta de la fase actual y recuerda las plegadas (`sl-sidebar-restore`).
2. «Anterior / siguiente» y los requisitos previos anteponen `fase-N/` cuando cambian de fase.
3. El build falla si hay un grupo del sidebar que no sea una fase, o si una fase publica más lecciones que su `lessonCount`.
4. `phases.ts`: la Fase 1 pasa a `available`, con `lessonCount: 10`, al publicar su primera lección.
5. Desaparece la pestaña «Windows» de la lección 2 (es y en) y la guía de estilo lo dice (§2.2).

## 7. Orden de trabajo

1. **Revisión del autor** de este diseño.
2. **Plan y ejecución de los cambios en la web** (§6), con TDD.
3. **El entorno de prácticas, comprobado de verdad:** instalar Multipass y lanzar la VM en macOS, y anotar las salidas reales. WSL no se puede comprobar desde un Mac: se marca como «sin verificar» hasta que alguien lo pruebe en Windows.
4. **Las lecciones, en orden,** igual que en la Fase 0: un plan corto por lección, comandos ejecutados de verdad, glosario, revisión técnica independiente y, cuando el autor apruebe el español, la traducción.

**Piloto (2026-10-07):** la introducción y la lección 1, solo en español (plan `docs/plans/2026-10-07-fase-1-piloto.md`). La preparación de la VM pasó de la introducción a la lección 4. El paso 3 (comprobar Multipass) se hace al preparar la lección 4.

## 8. Riesgos y preguntas abiertas para el autor

- **Instalar una VM es una barrera.** Multipass necesita virtualización; en Windows con WSL2 puede chocar con Hyper-V. Por eso en Windows se propone usar la propia WSL como servidor.
- **Bandit es de terceros:** puede cambiar o caerse. Las lecciones no dependen solo de él, y no se publican las soluciones de sus niveles (sus normas lo piden).
- **El tamaño:** diez lecciones son más que en la Fase 0. Si al escribirlas alguna se queda corta, se fusiona (por ejemplo, variables de entorno con scripts).
- **¿Hace falta un proyecto guiado?** `projects/` empieza en la Fase 3. Se podría adelantar uno pequeño («tu primer servicio en la VM»), pero se propone esperar a la Fase 3.
