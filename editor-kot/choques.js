// choques.js: qué piezas del Kot se atraviesan entre sí (casco con pelo largo, careta con anteojos...).
// Mide la caja de cada pieza en pose de descanso (Box3 de la malla, en coordenadas del Kot) y la guarda en caché.
// Lo usa el editor (editor-kot.html) para intercambiar piezas solo y para marcar en naranja las que chocarían.
import * as THREE from "three";

/** Tipos que se miden y pueden chocar: todo lo que va en la cabeza, la espalda o la mano. */
export const TIPOS_CON_CHOQUE = ["sombreros", "pelos", "barbas", "caretas", "anteojos", "espalda", "mano", "extras"];

/** Parejas que se pueden atravesar. Fuera de esta lista, dos piezas nunca chocan. */
export const PAREJAS = [
  ["sombreros", "pelos"],
  ["sombreros", "caretas"],
  ["sombreros", "anteojos"],
  ["caretas", "anteojos"],
  ["caretas", "barbas"],
  ["caretas", "pelos"],
  ["espalda", "pelos"],
  // Los disfraces tapan la cabeza: con sombrero o pelo se atraviesan.
  ["extras", "sombreros"],
  ["extras", "pelos"],
];

/** Choque = se superponen más de este porcentaje del volumen de la pieza más chica. */
export const UMBRAL = .25;

/** Margen (en metros) para que el pelo "sobresalga" del sombrero. */
export const MARGEN = .02;

/** Desde acá para abajo, un sombrero "tapa" la parte de arriba de la cabeza. */
export const CORTE_SOMBRERO = .12;

/** Nada en el Kot mide más de 3 m: una caja más grande viene rota del export y no cuenta como pieza. */
export const TAMANO_MAX = 3;

/** Cómo se nombra cada tipo en el aviso: "Saqué los anteojos: chocaban con la careta". */
export const NOMBRE_PIEZA = {
  sombreros: "el sombrero", pelos: "el pelo", barbas: "la barba", caretas: "la careta",
  anteojos: "los anteojos", espalda: "la espalda", mano: "el objeto", extras: "el disfraz",
};

const clavePar = (a, b) => [a, b].sort().join("↔");
const PAREJAS_CLAVE = new Set(PAREJAS.map(([a, b]) => clavePar(a, b)));

/** true si los dos tipos pueden chocar entre sí. */
export function sonPareja(a, b) {
  return a !== b && PAREJAS_CLAVE.has(clavePar(a, b));
}

const volumenDe = (caja) => Math.max(0, caja.max.x - caja.min.x)
  * Math.max(0, caja.max.y - caja.min.y)
  * Math.max(0, caja.max.z - caja.min.z);

const esParejaPeloSombrero = (a, b) => (a === "pelos" && b === "sombreros") || (a === "sombreros" && b === "pelos");

// Estado global: el editor inicializa una vez y después usa choca() directo.
let estado = null;

/**
 * Mide las piezas y deja lista la API de choques.
 * Devuelve { choca, caja, volumen, alto, primerChoque, tabla, cache, cabeza }.
 */
export function iniciarChoques({ piezas, catalogo, kotModelo, huesoCabeza } = {}) {
  const cache = new Map(); // "tipo/id" -> { caja, volumen, alto, fuera } | null
  const cabeza = { y: 0 };
  const inversoKot = new THREE.Matrix4();
  const medidos = new Set();

  /** Caja de la pieza en coordenadas del Kot (da igual si el Kot está girado: se mide en su propio espacio). */
  function cajaDe(tipo, id) {
    const clave = `${tipo}/${id}`;
    if (cache.has(clave)) return cache.get(clave);
    if (!medidos.has(tipo)) medirTipo(tipo);
    return cache.get(clave) ?? null;
  }

  /** Mide todas las piezas de un tipo de una sola vez (un solo recorrido del rig). */
  function medirTipo(tipo) {
    medidos.add(tipo);
    kotModelo.updateMatrixWorld(true);
    inversoKot.copy(kotModelo.matrixWorld).invert();
    for (const id of Object.keys(piezas?.[tipo] || {})) {
      const clave = `${tipo}/${id}`;
      if (cache.has(clave)) continue;
      const nodo = piezas[tipo][id]?.nodo;
      if (!nodo) { cache.set(clave, null); continue; }
      const caja = new THREE.Box3().setFromObject(nodo).applyMatrix4(inversoKot);
      if (caja.isEmpty() || !Number.isFinite(caja.min.x)) { cache.set(clave, null); continue; }
      const alto = caja.max.y - caja.min.y;
      const ancho = caja.max.x - caja.min.x;
      const fondo = caja.max.z - caja.min.z;
      // Piezas rotas del export (cajas de 40 m de lado) no cuentan: no están sobre el Kot.
      const fuera = Math.max(alto, ancho, fondo) > TAMANO_MAX;
      cache.set(clave, { caja, volumen: volumenDe(caja), alto, fuera });
    }
  }

  const volumen = (tipo, id) => cajaDe(tipo, id)?.volumen ?? 0;
  const alto = (tipo, id) => cajaDe(tipo, id)?.alto ?? 0;
  /** true si la pieza vino rota del export (caja imposible): no sirve para medir choques. */
  const rota = (tipo, id) => cajaDe(tipo, id)?.fuera === true;
  /** El material de la pieza: los pelos tienen color propio ("Black Hair", "Blonde Hair"...) y no todos siguen al color global. */
  const material = (tipo, id) => {
    const nodo = piezas?.[tipo]?.[id]?.nodo;
    if (!nodo) return null;
    const m = Array.isArray(nodo.material) ? nodo.material[0] : nodo.material;
    return m?.name || null;
  };
  /** El color de la pieza tal como se ve. El material "kot_pelo" lo tinte el editor con el color global. */
  const color = (tipo, id) => {
    const nodo = piezas?.[tipo]?.[id]?.nodo;
    if (!nodo) return null;
    const m = Array.isArray(nodo.material) ? nodo.material[0] : nodo.material;
    if (!m?.color) return null;
    return m.name === "kot_pelo" ? null : "#" + m.color.getHexString();
  };

  // Centro de la cabeza: la malla de la cara es la cabeza entera. Si falta, el hueso de la cabeza + el radio.
  const cajaCara = cajaDe("caras", catalogo?.inicial?.caras);
  if (cajaCara) cabeza.y = (cajaCara.caja.min.y + cajaCara.caja.max.y) / 2;
  else if (huesoCabeza) {
    kotModelo.updateMatrixWorld(true);
    const punto = kotModelo.worldToLocal(huesoCabeza.getWorldPosition(new THREE.Vector3()));
    cabeza.y = punto.y + .25;
  }

  /** Un sombrero tapa la parte de arriba de la cabeza si su caja baja hasta el centro + 0.12. */
  const tapaArriba = (caja) => caja.min.y <= cabeza.y + CORTE_SOMBRERO;

  /**
   * El pelo sobresale del sombrero si se ve por arriba o por los costados.
   * Que cuelgue por abajo NO cuenta: el pelo siempre baja del sombrero, eso es normal.
   */
  function sobresale(pelo, sombrero) {
    return pelo.max.y > sombrero.max.y + MARGEN
      || pelo.max.x > sombrero.max.x + MARGEN || pelo.min.x < sombrero.min.x - MARGEN
      || pelo.max.z > sombrero.max.z + MARGEN || pelo.min.z < sombrero.min.z - MARGEN;
  }

  /**
   * Pelo y sombrero: la regla de volumen no sirve (la caja de un pelo envuelve la cabeza, así que
   * se superpone con la del sombrero en el 93 % de los casos: no dice nada).
   * Manda la regla de la consigna: si el sombrero tapa la parte de arriba de la cabeza y el pelo asoma
   * por fuera de su caja, chocan. Además las dos cajas tienen que tocarse de verdad.
   */
  function chocaPeloSombrero(a, b, tipoA, tipoB) {
    const sombrero = tipoA === "sombreros" ? a.caja : b.caja;
    const pelo = tipoA === "pelos" ? a.caja : b.caja;
    if (!tapaArriba(sombrero)) return false;
    if (a.caja.clone().intersect(b.caja).isEmpty()) return false;
    return sobresale(pelo, sombrero);
  }

  /** Lo que pide el editor: true si las dos piezas se atraviesan. */
  function choca(tipoA, idA, tipoB, idB) {
    if (!sonPareja(tipoA, tipoB)) return false;
    if (!idA || idA === "sin" || !idB || idB === "sin") return false;
    const a = cajaDe(tipoA, idA), b = cajaDe(tipoB, idB);
    if (!a || !b || a.fuera || b.fuera) return false;
    if (esParejaPeloSombrero(tipoA, tipoB)) return chocaPeloSombrero(a, b, tipoA, tipoB);
    const interseccion = a.caja.clone().intersect(b.caja);
    if (interseccion.isEmpty()) return false;
    const solape = volumenDe(interseccion);
    const chica = Math.min(a.volumen, b.volumen);
    // Piezas casi planas (volumen 0): alcanza con que se toquen.
    return chica > 0 ? solape / chica > UMBRAL : solape > 0;
  }

  /** Primer tipo puesto (de `puestas`) que chocaría con (tipo, id), o null. */
  function primerChoque(tipo, id, puestas) {
    for (const otro of TIPOS_CON_CHOQUE) {
      if (otro === tipo || !sonPareja(tipo, otro)) continue;
      const idOtro = puestas?.[otro];
      if (idOtro && idOtro !== "sin" && choca(tipo, id, otro, idOtro)) return otro;
    }
    return null;
  }

  // Se miden todas al cargar (unas 300 cajas): después elegir una pieza es instantáneo.
  const empezado = performance.now();
  for (const tipo of TIPOS_CON_CHOQUE) medirTipo(tipo);
  if (typeof console !== "undefined") {
    console.debug(`choques: ${cache.size} piezas medidas en ${Math.round(performance.now() - empezado)} ms`);
  }

  /** Para ?debug-choques: cuántas combinaciones de cada pareja chocan. */
  function tabla() {
    const filas = [];
    for (const [a, b] of PAREJAS) {
      const idsA = Object.keys(piezas?.[a] || {});
      const idsB = Object.keys(piezas?.[b] || {});
      let choques = 0;
      for (const ia of idsA) for (const ib of idsB) if (choca(a, ia, b, ib)) choques++;
      const combinaciones = idsA.length * idsB.length;
      filas.push({
        pareja: `${a} ↔ ${b}`, choques, combinaciones,
        porcentaje: combinaciones ? Math.round(choques * 100 / combinaciones) : 0,
      });
    }
    return filas.sort((x, y) => y.choques - x.choques);
  }

  estado = { choca, caja: cajaDe, volumen, alto, rota, material, color, primerChoque, tabla, cache, cabeza };
  return estado;
}

/** Choque entre dos piezas (necesita iniciarChoques antes). */
export function choca(tipoA, idA, tipoB, idB) {
  if (!estado) return false;
  return estado.choca(tipoA, idA, tipoB, idB);
}
