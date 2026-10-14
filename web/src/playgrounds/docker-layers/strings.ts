/** Texts of the docker-layers lab in both languages. */
import type { Locale } from '../../lib/locales';
import type { Status } from './cache';
import type { FileGroup } from './dockerfile';
import type { Change, Order } from './lab-state';
import type { ByteUnit, Variant } from './measure';

export interface Strings {
  title: string;
  orderLegend: string;
  order: Record<Order, string>;
  /** Next to the order switch while multi-stage is on, which uses the right order. */
  orderFixed: string;
  multiStageLegend: string;
  multiStage: { off: string; on: string };
  dockerfile: string;
  /** Under the Dockerfile's title: the lab shows it without its comments. */
  dockerfileNote: string;
  layers: string;
  /** Under the layers' title: how the list is ordered. */
  layersNote: string;
  stage: string;
  stageFinal: string;
  stageBuild: string;
  /** A stage that starts FROM another one: {stage}. */
  stageFrom: string;
  /** The base image's block: {image}, {layers}, {size}. */
  base: string;
  baseNote: string;
  /** The base again, in another stage: the layers are stored once. */
  baseAgain: string;
  line: string;
  metadata: string;
  /** What a COPY takes: {files}. */
  copies: string;
  /** What a COPY --from takes: {stage}, {files}. */
  copiesFrom: string;
  /** What COPY . . takes. */
  everything: string;
  files: Record<FileGroup, string>;
  status: Record<Status | 'none', string>;
  /** A step that two stages share: {n} is the other line. */
  sharedStep: string;
  seconds: string;
  bytes: Record<ByteUnit, string>;
  imageSize: string;
  /** {base} and {own}. */
  imageSizeDetail: string;
  leftOut: string;
  buildTime: string;
  /** {rebuilt} and {cached}. */
  buildTimeDetail: string;
  notBuilt: string;
  /** Under the time of a multi-stage build. */
  parallelNote: string;
  pending: string;
  none: string;
  change: Record<Change, string>;
  build: string;
  rebuild: string;
  actions: string;
  /** Where the data comes from: {date}. */
  source: string;
  narration: {
    intro: string;
    variant: Record<Variant, string>;
    /** {button}: «Construir» or «Reconstruir». */
    changed: Record<Change, string>;
    /** {seconds}. */
    'first-build': string;
    'all-cached': string;
    /** {cached}, {rebuilt}, {first} and {slowest} (made with `quoted`), {slowestSeconds}, {seconds}. */
    rebuilt: string;
    /** {cached}, {step} (made with `quoted`), {seconds}. */
    'rebuilt-one': string;
  };
  /** An instruction quoted in a sentence: {text}. */
  quoted: string;
  /** The same, with its stage: {text}, {stage}. */
  quotedInStage: string;
}

const es: Strings = {
  title: 'laboratorio · capas de Docker',
  orderLegend: 'Orden',
  order: { good: 'correcto', wrong: 'incorrecto' },
  orderFixed: 'Con multi-stage, el orden es siempre el correcto.',
  multiStageLegend: 'Multi-stage',
  multiStage: { off: 'no', on: 'sí' },
  dockerfile: 'Dockerfile',
  dockerfileNote: 'Sin los comentarios.',
  layers: 'Capas',
  layersNote: 'De la base a la última capa, en el orden en que se apilan.',
  stage: 'Etapa {name}',
  stageFinal: 'se convierte en la imagen final',
  stageBuild: 'no llega a la imagen final',
  stageFrom: 'parte de la etapa {stage}',
  base: '{image}: {layers} capas, {size}',
  baseNote: 'La imagen base. Se descarga una vez y nunca se reconstruye.',
  baseAgain: 'La misma imagen base: sus capas se guardan una sola vez.',
  line: 'línea {n}',
  metadata: 'solo metadatos: no añade capa',
  copies: 'copia {files}',
  copiesFrom: 'copia de la etapa {stage}: {files}',
  everything: 'todo lo que no está en .dockerignore',
  files: {
    src: 'src/',
    'package.json': 'package.json',
    'package-lock.json': 'package-lock.json',
    '.npmrc': '.npmrc (la configuración de npm)',
    other: 'otros ficheros',
  },
  status: {
    cached: 'reutilizada (caché)',
    rebuilt: 'reconstruida',
    none: 'sin construir',
  },
  sharedStep: 'el mismo paso que la línea {n}: se ejecuta una vez',
  seconds: '{n} s',
  bytes: { B: '{n} B', kB: '{n} kB', MB: '{n} MB', GB: '{n} GB' },
  imageSize: 'Tamaño de la imagen',
  imageSizeDetail: 'base {base} + tus capas {own}',
  leftOut: 'Se queda fuera, en las etapas de construcción',
  buildTime: 'Tiempo de la última construcción',
  buildTimeDetail: 'pasos ejecutados: {rebuilt}; reutilizados: {cached}',
  notBuilt: 'aún sin construir',
  parallelNote:
    'Es la suma de los pasos. BuildKit ejecuta a la vez las etapas que no dependen entre sí, así que en el reloj tarda algo menos.',
  pending: 'Cambios desde la última construcción',
  none: 'ninguno',
  change: { src: 'Cambiar un fichero de src/', 'package.json': 'Cambiar package.json' },
  build: 'Construir',
  rebuild: 'Reconstruir',
  actions: 'Acciones',
  source: 'Tamaños de docker history y segundos de docker build reales, medidos el {date}.',
  narration: {
    intro:
      'Este es el Dockerfile de la tienda, y a su lado las capas que construye. Todavía no hay nada construido: pulsa «Construir».',
    variant: {
      good: 'Orden correcto: primero se copia solo lo que necesita npm ci (package.json, package-lock.json y .npmrc, la configuración de npm) y se ejecuta npm ci; después, el resto del código. Es otro Dockerfile, así que no hay nada construido: pulsa «Construir».',
      wrong:
        'Orden incorrecto: COPY . . va antes de npm ci. Es otro Dockerfile, así que no hay nada construido: pulsa «Construir».',
      multi:
        'Multi-stage: una etapa instala las dependencias, otra comprueba los tipos y la final solo se lleva lo necesario para arrancar. Es otro Dockerfile, así que no hay nada construido: pulsa «Construir».',
    },
    changed: {
      src: 'Has cambiado un fichero de src/. Docker aún no lo sabe: pulsa «{button}» para ver qué capas reutiliza.',
      'package.json':
        'Has cambiado package.json. Docker aún no lo sabe: pulsa «{button}» para ver qué capas reutiliza.',
    },
    'first-build':
      'Primera construcción: no hay caché, así que Docker ejecuta todos los pasos ({seconds}). La imagen base no se construye: se descarga una vez.',
    'all-cached':
      'No ha cambiado nada: Docker reutiliza todas las capas de la caché y no ejecuta ningún paso.',
    rebuilt:
      'Capas reutilizadas: {cached}. Reconstruidas: {rebuilt}, a partir de {first}. Cuando un paso cambia, todos los que vienen detrás en su etapa se reconstruyen. El paso más lento es {slowest}: {slowestSeconds} de {seconds}.',
    'rebuilt-one':
      'Capas reutilizadas: {cached}. Solo se reconstruye {step}, y tarda {seconds}: los pasos de antes no han cambiado, y no hay ninguno detrás.',
  },
  quoted: '«{text}»',
  quotedInStage: '«{text}» (etapa {stage})',
};

const en: Strings = {
  title: 'lab · Docker layers',
  orderLegend: 'Order',
  order: { good: 'right', wrong: 'wrong' },
  orderFixed: 'With multi-stage, the order is always the right one.',
  multiStageLegend: 'Multi-stage',
  multiStage: { off: 'no', on: 'yes' },
  dockerfile: 'Dockerfile',
  dockerfileNote: 'Without its comments.',
  layers: 'Layers',
  layersNote: 'From the base to the last layer, in the order they stack up.',
  stage: 'Stage {name}',
  stageFinal: 'becomes the final image',
  stageBuild: 'does not reach the final image',
  stageFrom: 'starts from the {stage} stage',
  base: '{image}: {layers} layers, {size}',
  baseNote: 'The base image. It is downloaded once and never rebuilt.',
  baseAgain: 'The same base image: its layers are stored only once.',
  line: 'line {n}',
  metadata: 'metadata only: adds no layer',
  copies: 'copies {files}',
  copiesFrom: 'copies from the {stage} stage: {files}',
  everything: 'everything not in .dockerignore',
  files: {
    src: 'src/',
    'package.json': 'package.json',
    'package-lock.json': 'package-lock.json',
    '.npmrc': '.npmrc (npm’s settings)',
    other: 'other files',
  },
  status: {
    cached: 'reused (cache)',
    rebuilt: 'rebuilt',
    none: 'not built',
  },
  sharedStep: 'the same step as line {n}: it runs once',
  seconds: '{n} s',
  bytes: { B: '{n} B', kB: '{n} kB', MB: '{n} MB', GB: '{n} GB' },
  imageSize: 'Image size',
  imageSizeDetail: 'base {base} + your layers {own}',
  leftOut: 'Left out, in the build stages',
  buildTime: 'Time of the last build',
  buildTimeDetail: 'steps run: {rebuilt}; reused: {cached}',
  notBuilt: 'not built yet',
  parallelNote:
    'This is the sum of the steps. BuildKit runs the stages that do not depend on each other at the same time, so on the clock it takes a bit less.',
  pending: 'Changes since the last build',
  none: 'none',
  change: { src: 'Change a file in src/', 'package.json': 'Change package.json' },
  build: 'Build',
  rebuild: 'Rebuild',
  actions: 'Actions',
  source: 'Real sizes from docker history and seconds from docker build, measured on {date}.',
  narration: {
    intro:
      'This is the shop’s Dockerfile, and next to it the layers it builds. Nothing is built yet: press “Build”.',
    variant: {
      good: 'Right order: first it copies only what npm ci needs (package.json, package-lock.json and .npmrc, npm’s settings) and runs npm ci; then, the rest of the code. It is another Dockerfile, so nothing is built: press “Build”.',
      wrong:
        'Wrong order: COPY . . comes before npm ci. It is another Dockerfile, so nothing is built: press “Build”.',
      multi:
        'Multi-stage: one stage installs the dependencies, another checks the types, and the final one only takes what it needs to start. It is another Dockerfile, so nothing is built: press “Build”.',
    },
    changed: {
      src: 'You changed a file in src/. Docker doesn’t know yet: press “{button}” to see which layers it reuses.',
      'package.json':
        'You changed package.json. Docker doesn’t know yet: press “{button}” to see which layers it reuses.',
    },
    'first-build':
      'First build: there is no cache, so Docker runs every step ({seconds}). The base image is not built: it is downloaded once.',
    'all-cached': 'Nothing changed: Docker reuses every layer from the cache and runs no step.',
    rebuilt:
      'Layers reused: {cached}. Rebuilt: {rebuilt}, starting at {first}. When a step changes, every step after it in its stage is rebuilt. The slowest step is {slowest}: {slowestSeconds} of {seconds}.',
    'rebuilt-one':
      'Layers reused: {cached}. Only {step} is rebuilt, and it takes {seconds}: the steps before it did not change, and there are none after it.',
  },
  quoted: '“{text}”',
  quotedInStage: '“{text}” ({stage} stage)',
};

export const strings: Record<Locale, Strings> = { es, en };
