/**
 * El texto de una región que anuncian los lectores de pantalla (aria-live). Si el mensaje es igual al
 * anterior (dos errores o dos avisos seguidos), no cambiaría y no se anunciaría: cada intento alterna
 * un espacio duro al final, que no se ve. Lo usan los laboratorios.
 */
export function liveText(message: string, attempt: number): string {
  return attempt % 2 === 0 ? message : `${message}\u00A0`;
}
