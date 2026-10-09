import type { Locale } from '../lib/locales';

export type PhaseStatus = 'available' | 'coming-soon';

export interface Phase {
  number: number;
  /** 'available' only when the phase has published content. */
  status: PhaseStatus;
  /** Lessons planned for the phase (for "lesson 2/8"). */
  lessonCount?: number;
  title: Record<Locale, string>;
  summary: Record<Locale, string>;
}

export const phases: Phase[] = [
  {
    number: 0,
    status: 'available',
    lessonCount: 9,
    title: { es: 'Cómo funciona internet', en: 'How the internet works' },
    summary: {
      es: 'Cliente-servidor, protocolos, capas de red, IP, TCP, DNS y TLS: por dónde viajan los datos antes de que escribas una línea de backend.',
      en: 'Client-server, protocols, network layers, IP, TCP, DNS and TLS: how data travels before you write a single line of backend code.',
    },
  },
  {
    number: 1,
    status: 'available',
    lessonCount: 10,
    title: { es: 'Terminal, Linux y SSH', en: 'Terminal, Linux and SSH' },
    summary: {
      es: 'Donde vive casi todo backend: la shell, los permisos, los procesos, las variables de entorno y cómo entrar en un servidor remoto.',
      en: 'Where almost every backend lives: the shell, permissions, processes, environment variables and how to log into a remote server.',
    },
  },
  {
    number: 2,
    status: 'coming-soon',
    title: { es: 'HTTP a fondo', en: 'HTTP in depth' },
    summary: {
      es: 'El protocolo de la web visto desde quien responde: métodos, códigos de estado, cabeceras, cookies, CORS y caché.',
      en: "The web's protocol from the side that answers: methods, status codes, headers, cookies, CORS and caching.",
    },
  },
  {
    number: 3,
    status: 'coming-soon',
    title: { es: 'Tu primer servidor', en: 'Your first server' },
    summary: {
      es: 'Node.js y TypeScript: un servidor HTTP sin framework, después con uno, validación de entrada, errores, logs y el event loop.',
      en: 'Node.js and TypeScript: an HTTP server without a framework, then with one, input validation, errors, logs and the event loop.',
    },
  },
  {
    number: 4,
    status: 'coming-soon',
    title: { es: 'Diseño de APIs', en: 'API design' },
    summary: {
      es: 'REST bien hecho, OpenAPI y cuándo usar GraphQL, gRPC, WebSockets, Server-Sent Events o webhooks.',
      en: 'REST done right, OpenAPI, and when to use GraphQL, gRPC, WebSockets, Server-Sent Events or webhooks.',
    },
  },
  {
    number: 5,
    status: 'coming-soon',
    title: { es: 'Bases de datos', en: 'Databases' },
    summary: {
      es: 'SQL con PostgreSQL, modelado, índices, transacciones, migraciones, ORMs y cuándo tiene sentido NoSQL.',
      en: 'SQL with PostgreSQL, modeling, indexes, transactions, migrations, ORMs and when NoSQL makes sense.',
    },
  },
  {
    number: 6,
    status: 'coming-soon',
    title: {
      es: 'Autenticación, autorización y seguridad',
      en: 'Authentication, authorization and security',
    },
    summary: {
      es: 'Contraseñas, sesiones y JWT, OAuth y OpenID Connect, roles y permisos, y el OWASP Top 10.',
      en: 'Passwords, sessions and JWT, OAuth and OpenID Connect, roles and permissions, and the OWASP Top 10.',
    },
  },
  {
    number: 7,
    status: 'coming-soon',
    title: { es: 'Docker y contenedores', en: 'Docker and containers' },
    summary: {
      es: 'El fin del «en mi máquina funciona»: imágenes, contenedores, Dockerfile, volúmenes, redes y Docker Compose.',
      en: 'The end of “works on my machine”: images, containers, Dockerfiles, volumes, networks and Docker Compose.',
    },
  },
  {
    number: 8,
    status: 'coming-soon',
    title: { es: 'Despliegue e infraestructura', en: 'Deployment and infrastructure' },
    summary: {
      es: 'Tu propio servidor: VPS, reverse proxy, dominio y HTTPS, CI/CD, modelos de cloud e infraestructura como código.',
      en: 'Your own server: VPS, reverse proxy, domain and HTTPS, CI/CD, cloud models and infrastructure as code.',
    },
  },
  {
    number: 9,
    status: 'coming-soon',
    title: { es: 'Arquitectura y escalado', en: 'Architecture and scaling' },
    summary: {
      es: 'Colas y trabajos en segundo plano, caché, escalado horizontal, monolito frente a microservicios y sistemas distribuidos.',
      en: 'Queues and background jobs, caching, horizontal scaling, monoliths vs microservices and distributed systems.',
    },
  },
  {
    number: 10,
    status: 'coming-soon',
    title: { es: 'Calidad y observabilidad', en: 'Quality and observability' },
    summary: {
      es: 'Tests unitarios, de integración y end-to-end; logs, métricas y trazas; health checks y gestión de incidentes.',
      en: 'Unit, integration and end-to-end tests; logs, metrics and traces; health checks and incident management.',
    },
  },
  {
    number: 11,
    status: 'coming-soon',
    title: { es: 'Backend para IA y agentes', en: 'Backend for AI and agents' },
    summary: {
      es: 'APIs de modelos desde el servidor, streaming, tool use, MCP, búsqueda semántica con embeddings y RAG, e IA en producción.',
      en: 'Model APIs from the server, streaming, tool use, MCP, semantic search with embeddings and RAG, and AI in production.',
    },
  },
];
