// Contrato entre la puerta, el control y la consola: cómo viaja el Kot del perfil.
// La puerta guarda el perfil en el celular; al entrar a una consola lo pasa en la dirección (#p=...).
// El control lo reenvía en el mensaje "hola"; la consola lo guarda en cliente.kot (servidor_control.gd).
// No cambiar la forma sin migración: v4 es la que entiende kot-modelo.js.

export const VERSION_KOT = 4;
export const COLOR_CUERPO = "#ff5a5f";
export const COLOR_PELO = "#3b2a20";

const HEX = /^#[0-9a-f]{6}$/i;
const TIPO = /^[a-z]{3,12}$/;
const ID = /^[A-Za-z0-9_]{1,80}$/;

export const esColor = (color) => typeof color === "string" && HEX.test(color);

/**
 * Kot válido y completo. Los campos que falten vuelven a fábrica; no se inventan tipos.
 * `colorCuerpo` manda sobre el color del perfil: el color del perfil es el del cuerpo.
 * Las medidas (alto, panza, brazos) todavía no existen en v4; cuando existan van acá
 * y sube VERSION_KOT con migración.
 */
export function normalizarKot(kot, colorCuerpo = COLOR_CUERPO) {
  const crudo = kot && typeof kot === "object" ? kot : {};
  const piezas = {};
  if (crudo.piezas && typeof crudo.piezas === "object") {
    for (const [tipo, id] of Object.entries(crudo.piezas)) {
      if (TIPO.test(tipo) && typeof id === "string" && ID.test(id)) piezas[tipo] = id;
    }
  }
  return {
    v: VERSION_KOT,
    colorPelo: esColor(crudo.colorPelo) ? crudo.colorPelo : COLOR_PELO,
    colorCuerpo: esColor(colorCuerpo) ? colorCuerpo : (esColor(crudo.colorCuerpo) ? crudo.colorCuerpo : COLOR_CUERPO),
    piezas,
  };
}

/** ¿Ya eligió alguna pieza? (El de fábrica tiene `piezas` vacío y se ve igual.) */
export function tienePiezas(kot) {
  return !!kot && typeof kot.piezas === "object" && Object.keys(kot.piezas).length > 0;
}

/** El Kot de un perfil, siempre v4 y siempre con color de cuerpo. */
export function kotDelPerfil(perfil) {
  return normalizarKot(perfil && perfil.kot, perfil && perfil.color);
}

/** Lo que el control manda al presentarse: el perfil sin datos que no van a la consola. */
export function jugadorParaConsola(perfil) {
  return {
    id: perfil.id,
    tipo: perfil.tipo,
    nombre: perfil.nombre,
    color: esColor(perfil.color) ? perfil.color : COLOR_CUERPO,
    modo: perfil.modo,
    kot: kotDelPerfil(perfil),
  };
}

/**
 * Paquete que viaja en #p= (JSON en base64url).
 * El control lee `paquete.perfil` (incluye `perfil.kot`) y `paquete.puerta`.
 */
export function paqueteDelPerfil(perfil, puerta) {
  return { v: 2, perfil: { ...perfil, kot: kotDelPerfil(perfil) }, puerta };
}

/** Para leer un paquete ya decodificado desde el control o una prueba. */
export function kotDelPaquete(paquete) {
  return kotDelPerfil(paquete && paquete.perfil);
}
