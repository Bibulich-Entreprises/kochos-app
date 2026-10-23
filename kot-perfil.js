// Módulo compartido entre la puerta (perfil) y el editor: reexporta lo necesario de kot-modelo.js
// así no hay duplicación de KOT_INICIAL, cargarBorrador, guardarBorrador, copiar.

export { KOT_INICIAL, PELOS, COLORES, copiar, cargarBorrador, guardarBorrador } from "./editor-kot/kot-modelo.js";