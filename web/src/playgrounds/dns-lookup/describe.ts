/** Convierte el recorrido y el resultado en frases del idioma de la página. */
import { fill } from '../../lib/fill';
import type { DnsRecord, LookupResult, PathStep } from './dns';
import { RESOLVER } from './resolver';
import type { Strings } from './strings';

/** «la raíz», «.com» (un TLD, con su punto) o el nombre de la zona tal cual. */
export function zoneLabel(zone: string, t: Strings): string {
  if (zone === '.') return t.root;
  return zone.includes('.') ? zone : `.${zone}`;
}

/** El primer servidor y cuántos más hay: «a.root-servers.net y 12 más». */
export function serversLabel(servers: string[], t: Strings): string {
  const [first = '', ...rest] = servers;
  return rest.length === 0 ? first : fill(t.andMore, { first, n: rest.length });
}

/** El TTL más bajo: lo que dura en la caché la respuesta completa. */
export function minTtl(records: DnsRecord[]): number {
  return Math.min(...records.map((record) => record.ttl));
}

/** Un valor legible: sin el punto final de los nombres (en MX, NS y CNAME), que parecería puntuación. */
function shownValue(record: DnsRecord): string {
  return ['MX', 'NS', 'CNAME'].includes(record.type) ? record.data.replace(/\.$/, '') : record.data;
}

/** La prioridad de un MX («5 gmail-smtp-in…» → 5): el servidor de correo con la más baja se prueba primero. */
const priority = (record: DnsRecord) => Number.parseInt(record.data, 10) || 0;

/** Los valores de la respuesta (sin los CNAME, que se cuentan aparte), como mucho tres; los MX, por prioridad. */
function valuesLabel(records: DnsRecord[], t: Strings): string {
  const values = records.filter((record) => record.type !== 'CNAME');
  const sorted = [...values].sort((a, b) =>
    a.type === 'MX' && b.type === 'MX' ? priority(a) - priority(b) : 0,
  );
  const shown = sorted.map(shownValue);
  if (shown.length <= 3) return shown.join(', ');
  return fill(t.andMore, { first: shown.slice(0, 3).join(', '), n: shown.length - 3 });
}

export interface StepText {
  from: string;
  to: string;
  says: string;
}

/**
 * Quién pregunta, a quién y qué le responden en un paso del recorrido. `resolverAddress`: el resolver
 * que ha respondido (8.8.8.8 si Cloudflare no lo hizo).
 */
export function stepText(
  step: PathStep,
  t: Strings,
  resolverAddress: string = RESOLVER.address,
): StepText {
  const resolver = fill(t.resolver, { address: resolverAddress });
  switch (step.kind) {
    case 'ask':
      return { from: t.you, to: resolver, says: fill(t.ask, { type: step.type, name: step.name }) };
    case 'referral':
      return {
        from: resolver,
        to: `${zoneLabel(step.zone.name, t)} (${serversLabel(step.zone.servers, t)})`,
        says: fill(t.referral, {
          next: zoneLabel(step.next.name, t),
          servers: serversLabel(step.next.servers, t),
        }),
      };
    case 'final': {
      const to = `${zoneLabel(step.zone.name, t)} (${serversLabel(step.zone.servers, t)})`;
      if (step.outcome === 'error') {
        return { from: resolver, to, says: fill(t.final.error, { code: step.status }) };
      }
      if (!step.alias) {
        const says =
          step.outcome === 'answer'
            ? fill(t.finalAnswer, { values: valuesLabel(step.records, t) })
            : fill(t.final[step.outcome], { type: step.type });
        return { from: resolver, to, says };
      }
      // Con un alias: el servidor lo dice y, si el destino está en su zona, también lo que hay detrás.
      const { name, target, via } = step.alias;
      const alias =
        via.length > 0
          ? fill(t.aliasVia, { name, target, via: via.join(', ') })
          : fill(t.alias, { name, target });
      const hasValues = step.records.some((record) => record.type !== 'CNAME');
      const rest = step.leavesZone
        ? t.lookThere
        : step.outcome !== 'answer'
          ? fill(t.aliasOutcome[step.outcome], { target: step.alias.target, type: step.type })
          : hasValues
            ? fill(t.finalAnswer, { values: valuesLabel(step.records, t) })
            : '';
      return { from: resolver, to, says: [alias, rest].filter(Boolean).join(' ') };
    }
    case 'alias': {
      const values = valuesLabel(step.records, t);
      const answer = !step.chain
        ? fill(t.followAlias, { values })
        : step.chain.via.length > 0
          ? fill(t.followAliasChainVia, {
              target: step.chain.target,
              via: step.chain.via.join(', '),
              values,
            })
          : fill(t.followAliasChain, { target: step.chain.target, values });
      return {
        from: resolver,
        to: step.target,
        says:
          step.outcome === 'answer'
            ? answer
            : fill(t.followAliasOutcome[step.outcome === 'nxdomain' ? 'nxdomain' : 'nodata'], {
                type: step.type,
              }),
      };
    }
    case 'reply':
      return {
        from: resolver,
        to: t.you,
        says: fill(t.reply[step.outcome], {
          ttl: step.records.length > 0 ? minTtl(step.records) : 0,
          type: step.type,
          code: step.status,
        }),
      };
  }
}

/** Una frase con el resultado, para anunciarla al terminar la consulta. */
export function summary(result: LookupResult, t: Strings): string {
  const template =
    result.outcome === 'answer' && result.records.length === 1
      ? t.summaryOne
      : t.summary[result.outcome];
  return fill(template, { n: result.records.length, type: result.type, code: result.status });
}
