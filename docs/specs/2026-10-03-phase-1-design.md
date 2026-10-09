# Design: Phase 1, «Terminal, Linux y SSH»

- **Date:** 2026-10-03
- **Status:** approved on 2026-10-07. The author chose the Multipass VM (§2.1), WSL as the only route on Windows (§2.2) and the ten lessons (§3), and to wait until Phase 3 for the first guided project (§8). It starts with a pilot lesson: the introduction and lesson 1, in Spanish only; the rest, once the author reads it and approves the template and the tone.
- **Origin:** the roadmap in `CLAUDE.md` (Phase 1). The author asked for it to be designed without consulting him ("don't ask me anything"), so the decisions are argued here and summarized in `docs/todo.md`.
- **Reference spec:** `docs/specs/2026-10-02-site-and-phase-0-design.md`. The lesson template, the three levels of «Pruébalo» ("Try it"), the languages and the visual theme do not change.

## 1. Goal

By the end of the phase, the reader moves around a Linux server's terminal with ease:

- navigates, reads and edits files, and chains commands;
- understands users, permissions, processes and services;
- configures programs with environment variables and writes small scripts;
- logs into a server over SSH with their key;
- and uses Git from the terminal knowing what happens inside.

They do not write backend code yet: they learn the terrain where that code will live (Phases 3, 7 and 8).

## 2. Cross-cutting decisions

### 2.1 Where the reader practices

Three environments, from least to most, and each lesson says which one it uses:

| Environment | What for | How |
|---|---|---|
| **Their terminal** | Shell, files, pipes, processes, variables and scripts | macOS (zsh), Linux (bash) or Windows with WSL (Ubuntu) |
| **Their practice server** | What only exists on a server Linux: users and `sudo`, `systemd`, `apt`; and being the target of SSH | An Ubuntu virtual machine with **Multipass** (free, by Canonical, for macOS, Windows and Linux): `multipass launch --name curso` and `multipass shell curso` |
| **Real servers on the internet** | Practicing SSH and the shell remotely | **OverTheWire Bandit**, a game to learn Linux by logging in over SSH (`ssh bandit0@bandit.labs.overthewire.org -p 2220`), and **GitHub** (`ssh -T git@github.com`) to use a real key |

**Checked on 2026-10-03:** Bandit responds on port 2220 (`SSH-2.0-OpenSSH_10.2p1`). Multipass 1.16.4 is installed with `brew install --cask multipass`. On macOS, the built-in SSH server comes switched off (Remote Login), and turning it on asks for administrator permissions, so `ssh localhost` is not used.

**Why a virtual machine and not Docker:** Docker arrives in Phase 7, and a container is not a server (it has no `systemd`, for example). A Multipass VM is very similar to Phase 8's VPS, so what is learned is reused as is.

**Windows:** WSL2 is already an Ubuntu, and it supports `systemd` (by enabling it in `/etc/wsl.conf`). So on Windows, WSL itself can act as the practice server, without Multipass, except in the SSH lesson, where a different target is needed (Bandit or GitHub).

**Without installing anything:** WebVM (webvm.io), a Linux in the browser, is linked for anyone who cannot install anything. It is only linked: its engine (CheerpX) does not allow hosting it on someone else's site in the free version.

### 2.2 Windows: WSL as the only route (closes a pending decision)

Phase 1 teaches Linux. PowerShell is another world, and keeping two versions of each exercise is not worth it. Proposal:

- WSL is the official way to follow the course on Windows, explained in the Phase 0 introduction (it already is);
- the «Windows» tab disappears from the exercises, including the one in lesson 2;
- `<TryIt>` keeps the `windows` prop in case it is ever needed, but the style guide says not to use it.

### 2.3 zsh, bash and the differences between macOS and Linux

- What zsh and bash share is what gets taught. Scripts use `#!/usr/bin/env bash` and are run with bash on macOS too.
- macOS ships the BSD versions of many tools, and Linux the GNU ones. The exercises avoid the options that differ (`sed -i`, `date -d`, `ls --color`…). When a difference matters, it is mentioned. And what only exists on Linux is done on the practice server.

### 2.4 The reader's safety

- Nothing destructive on their computer: the delete, move and permission exercises go in a practice folder, `~/curso-backend/fase-1`, which the introduction creates, or in the VM.
- Each `sudo` is explained before it is asked for. A lesson cannot ask for `sudo` on the reader's computer if it can be done in the VM.
- The outputs use an invented user and machine (`ana`, on the host `portatil`; `ubuntu`, on the VM `curso`), as the style guide requires for personal data.

## 3. Lessons

Ten lessons and the introduction. Between 10 and 15 minutes of reading each, as in Phase 0, with the same template. (The titles are the Spanish ones, as they appear on the site; the English is in parentheses.)

| # | Slug | Title | Content | Try it | Environment |
|---|---|---|---|---|---|
| 0 | `index` | Introducción (Introduction) | Why almost every server is Linux with no screen. The three places where you practice and the practice folder | `uname` and creating the practice folder | Terminal |
| 1 | `comandos-basicos-terminal` (`translationKey` `shell-basics`) | Comandos básicos de la terminal en Mac y Linux (Basic terminal commands on Mac and Linux; short name: «La shell: comandos y rutas») | The prompt; command, options and arguments; `pwd`, `ls`, `cd`; absolute and relative paths, `~`, `.` and `..`; hidden files; tab and history; `man` and `--help`; `which` | Moving around the system and the practice folder | Terminal |
| 2 | `files-and-text` | Ficheros y texto (Files and text) | `mkdir`, `touch`, `cp`, `mv` and `rm` (no recycle bin); `cat`, `less`, `head` and `tail -f`; `wc`; `find`; `grep`; editing with `nano`, and how to exit `vim` | Downloading a sample log with `curl` and searching it | Terminal |
| 3 | `pipes-and-redirection` | Pipes y redirecciones (Pipes and redirection) | stdin, stdout and stderr; `\|`, `>`, `>>`, `2>`, `2>&1` and `/dev/null`; the exit code (`$?`), `&&` and `\|\|`; `sort`, `uniq -c` and `cut` | Reading logs as on a server: the IPs that request the most, the 404s and the requests per hour | Terminal |
| 4 | `users-and-permissions` | Usuarios y permisos (Users and permissions) | Installing Multipass and creating the `curso` VM. Users and groups (`whoami`, `id`); `rwx` in `ls -l`; symbolic and octal `chmod`; `chown`; `root`, `sudo` and least privilege; why each server runs with its own user (and port 80 from Phase 0 lesson 5) | Creating a user in the VM and trying to read their files | VM |
| 5 | `processes-and-signals` | Procesos y señales (Processes and signals) | Process and PID; `ps` and `top`; `kill` and signals (`SIGINT` is Ctrl+C, `SIGTERM`, `SIGKILL`, `SIGHUP`); foreground and background (`&`, `jobs`, `fg`); `nohup`; which process listens on a port (`lsof`, Phase 0 lesson 5) | Launching, finding and stopping processes, with `nc -l` and `sleep` | Terminal |
| 6 | `services-and-packages` | Servicios y paquetes (Services and packages) | Daemons and `systemd`: `systemctl`, `journalctl`; a minimal *unit file*; `apt`; on macOS, `launchd` and `brew`, only mentioned | Installing nginx with `apt`, seeing it with `systemctl` and `curl localhost`, and creating your own service with `python3 -m http.server` | VM |
| 7 | `environment-variables` | Variables de entorno (Environment variables) | `env` and `export`; `PATH` (how the shell finds commands); `.zshrc` and `.bashrc`; `PORT=3000 node app.js`; `.env` files and why they are not pushed to Git; secrets outside the code; `process.env` | A script configured with variables, and fixing a `command not found` | Terminal |
| 8 | `shell-scripts` | Scripts de shell (Shell scripts) | Shebang and `chmod +x`; variables and arguments (`$1`, `$@`); `if`, `for` and `test`; `set -euo pipefail`; exit codes; when it is worth switching to Node or Python | A script that checks whether a server is listening (`nc -z`, lesson 5 of this phase) and another that makes dated backups | Terminal |
| 9 | `ssh` | SSH | Client and server (`sshd`, port 22); the server's fingerprint and `known_hosts`, compared with the certificates from Phase 0 lesson 8 (there is no certificate authority here: you trust it the first time); `ed25519` keys (`ssh-keygen`), `authorized_keys` and `600` permissions; `ssh-agent`; `~/.ssh/config`; `scp` and `rsync`; tunnels (`-L`) | Bandit levels 0 and 1; logging into your VM without a password; your key on GitHub (`ssh -T git@github.com`); a tunnel to the VM's nginx | Internet and VM |
| 10 | `git-in-depth` | Git por dentro (Git in depth) | What a commit is (objects and hashes, which connect with the fingerprints from Phase 0 lesson 8); branches are pointers; `merge` versus `rebase`; `rebase -i`; `reflog` to undo almost everything; `bisect`; remotes over SSH; signing commits with your SSH key; a preview of how Git triggers a deployment (Phase 8) | A practice repository: `git cat-file -p`, rescuing a commit with `reflog` and finding a bug with `bisect` | Terminal |

The phase's `lessonCount` in `web/src/data/phases.ts` becomes 10.

### Changes from the roadmap in `CLAUDE.md` (proposed with the freedom the author gave)

- **"Processes" is split in two:** processes and signals on one side, and services (`systemd`) and packages (`apt`) on the other. Together they do not fit in 15 minutes, and `apt` was not in the roadmap and is needed from day one on a server.
- **`nano` and exiting `vim`** go into "Files and text": on a server there is no VS Code.
- **Reading logs** is the practical thread of "Pipes and redirection". It is the first thing you do on a server when something fails, and it prepares the observability in Phase 10.
- **"Git as the basis for deployment"** stays as a preview. The real part, a `push` triggering a deployment, is CI/CD and fits in Phase 8. The Git lesson focuses on what a frontend dev with years of experience usually does not know: the internal model, `reflog` and `bisect`.

## 4. «Pruébalo» ("Try it") and labs

- **Level 1 (terminal) in every lesson.** It is the most hands-on phase of the course: the terminal itself is the lab.
- **No level 3 labs:** `CLAUDE.md` reserves them for HTTP, DNS, TCP and Docker. The HTTP one arrives in Phase 2.
- **One small, optional component:** a permissions calculator (`rwx` ↔ octal ↔ `chmod u+x`) in lesson 4. It is pure logic, can be tested with tests and is useful as a reference. It is built only if, while writing the lesson, it turns out to help.

## 5. Practice material to create

- **A sample log** served by the site itself, at `web/public/practicas/access.log`. It is generated by a reproducible script, in a format like nginx's, with IPs from the documentation ranges and about a thousand lines with 200, 301, 404 and 500 spread out. Lessons 2 and 3 use it.
- **A practice repository for Git:** a script that creates, in the practice folder, a repository with history and a hidden bug for `bisect`.
- **No custom VM images:** the standard Ubuntu image from Multipass is used, which the reader downloads with `multipass launch`.

## 6. Changes to the site before publishing the first lesson

They have been noted in `docs/todo.md` since the theme review and are done with their plan and their tests:

1. The explorer opens only the current phase's folder and remembers the collapsed ones (`sl-sidebar-restore`).
2. "Previous / next" and the prerequisites prepend `fase-N/` when they cross phases.
3. The build fails if there is a sidebar group that is not a phase, or if a phase publishes more lessons than its `lessonCount`.
4. `phases.ts`: Phase 1 becomes `available`, with `lessonCount: 10`, when its first lesson is published.
5. The «Windows» tab disappears from lesson 2 (es and en) and the style guide says so (§2.2).

## 7. Order of work

1. **The author's review** of this design.
2. **Plan and execution of the site changes** (§6), with TDD.
3. **The practice environment, really checked:** install Multipass and launch the VM on macOS, and note the real outputs. WSL cannot be checked from a Mac: it is marked "unverified" until someone tries it on Windows.
4. **The lessons, in order,** just as in Phase 0: a short plan per lesson, commands really run, glossary, independent technical review and, when the author approves the Spanish, the translation.

**Pilot (2026-10-07):** the introduction and lesson 1, in Spanish only. The VM setup moved from the introduction to lesson 4. Step 3 (checking Multipass) is done when preparing lesson 4.

## 8. Risks and open questions for the author

- **Installing a VM is a barrier.** Multipass needs virtualization; on Windows with WSL2 it can clash with Hyper-V. That is why on Windows it is proposed to use WSL itself as the server.
- **Bandit is third-party:** it can change or go down. The lessons do not depend on it alone, and the solutions to its levels are not published (its rules ask for that).
- **The size:** ten lessons are more than in Phase 0. If, while writing them, one turns out short, it is merged (for example, environment variables with scripts).
- **Is a guided project needed?** `projects/` starts in Phase 3. A small one could be moved earlier ("your first service in the VM"), but waiting for Phase 3 is proposed.
