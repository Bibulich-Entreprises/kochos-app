// El Kot real armado en three.js: carga editor-kot/kot.glb (el Stickman de thcyrax con todas sus piezas) y le aplica un perfil.
// Lo usan el editor (editor-kot.html) y la prueba de ragdoll (ragdoll-kot.html).
// kot.glb, kot.json y las miniaturas salen de kot_base.blend con consola/kots/herramientas/exportar_web.py.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const RUTA = new URL("./", import.meta.url).href;
export const RUTA_MINIS = RUTA + "miniaturas/";

// El perfil guarda cómo es el Kot, no una imagen: qué pieza de cada tipo lleva (las que falten, las de fábrica) y el color del pelo.
// La piel de fábrica es "Canela" (la de la maqueta B); el rojo tomate del perfil es un color loco más.
export const KOT_INICIAL = { v: 4, colorPelo: "#3b2a20", colorCuerpo: "#c98a5c", colorOjos: "#1b1b1f", colorCejas: "#2b1d16", piezas: {} };
// Ojos: de los oscuros de siempre a colores de fantasía.
export const OJOS = [
  ["#1b1b1f", "Negro"], ["#4a2e1f", "Marrón"], ["#7a5230", "Avellana"], ["#3f7a4a", "Verde"], ["#3d6fa8", "Azul"],
  ["#7fb4e0", "Celeste"], ["#8a8f98", "Gris"], ["#a66cff", "Violeta"], ["#ff5a5f", "Rojo"], ["#ffd23f", "Dorado"],
];
// Paletas del editor (las de la maqueta B): piel real, colores locos y pelo natural/fantasía, con nombre para el cartel.
export const PIELES = [
  ["#ffe3cc", "Porcelana"], ["#f7cfae", "Clara"], ["#eeb98f", "Durazno"], ["#dda276", "Miel"], ["#c98a5c", "Canela"],
  ["#ad6f45", "Tostada"], ["#8d5534", "Cacao"], ["#6c3f26", "Café"], ["#4e2c1a", "Chocolate"], ["#36200f", "Ébano"],
];
export const LOCOS = [
  ["#ff5a5f", "Tomate"], ["#ff9f1c", "Naranja"], ["#ffd23f", "Banana"], ["#b8f13a", "Lima"], ["#43c59e", "Menta"],
  ["#2ec4b6", "Turquesa"], ["#3fa9f5", "Cielo"], ["#4f5dff", "Azul rey"], ["#a66cff", "Uva"], ["#ff6bd6", "Chicle"],
  ["#9bc48a", "Zombi"], ["#9aa3ad", "Robot"], ["#f4f4f4", "Fantasma"], ["#2a2d34", "Sombra"],
];
export const PELO_NATURAL = [
  ["#16100c", "Negro"], ["#3b2a20", "Castaño oscuro"], ["#6b4226", "Castaño"], ["#a0642d", "Cobrizo"],
  ["#d4a04c", "Rubio oscuro"], ["#f2d27a", "Rubio"], ["#b9b9b9", "Canoso"], ["#f5f5f5", "Blanco"],
];
export const PELO_FANTASIA = [
  ["#ff5a5f", "Rojo"], ["#ff8fab", "Rosa"], ["#a66cff", "Violeta"], ["#4f86ff", "Azul"],
  ["#2ec4b6", "Turquesa"], ["#43c59e", "Verde"], ["#ffd23f", "Amarillo"], ["#ff9f1c", "Naranja"],
];
// Ropa: remera y pantalón se tiñen con cualquiera de estos (sin elegir, queda el color de fábrica de la prenda).
export const ROPA_BASICOS = [
  ["#f4f4f4", "Blanco"], ["#9aa3ad", "Gris"], ["#2a2d34", "Negro"], ["#1f2f5c", "Azul marino"], ["#3d6fa8", "Jean"],
  ["#d8c3a0", "Beige"], ["#7a5230", "Marrón"], ["#6b7a3a", "Oliva"], ["#7d1f2e", "Bordó"], ["#c1121f", "Rojo"],
];
// Pelos que se ven mal o están rotos en el .glb (ver docs/editor/README.md): no se ofrecen hasta arreglarlos en Blender.
const PELOS_ROTOS = new Set([
  "pelo_rapado_corto", "pelo_rodetes", "pelo_bangs_over_eyes", "pelo_cresta", "pelo_rey", "pelo_aventurero",
  "pelo_pouf", "pelo_pigtails", "pelo_curtain_bangs", "pelo_high_ponytail", "pelo_cornrows_with_ponytail",
  "pelo_half_top_knot", "pelo_malt_shop_bob", "pelo_powdered_wig",
]);
// Listas planas para lo que solo necesita hex (el azar, la puerta).
export const PELOS = [...PELO_NATURAL, ...PELO_FANTASIA].map(([c]) => c);
export const COLORES = LOCOS.map(([c]) => c);
export const copiar = (k) => JSON.parse(JSON.stringify(k));

// Accesorios: se guardan en el perfil para los juegos, pero no se editan ni se muestran en la puerta.
// (En la mano y Espalda: espadas, capas, etc. Los disfraces de "extras" sí se editan y se ven, desde el 23/10.)
export const ACCESORIOS = new Set(["mano", "espalda"]);
// Disfraces que tapan todo el cuerpo: con ellos se saca toda la ropa (Mirko, 23/10). Con los demás, solo la remera.
// Tiburón rosa, marciano, banana, banana con anteojos y el de Among Us.
const DISFRACES_ENTEROS = new Set(["Custom_04", "Custom_07", "Custom_08", "Custom_13", "Custom_15"]);
const ROPA = new Set(["remeras", "pantalones", "medias", "zapatillas", "guantes"]);
// Piezas que se tiñen con "más colores" (repintando su color principal) y dónde guarda el perfil el color.
// Prendas que se tiñen por partes: cada una dice en kot.json sus "partes" de color (máximo 2) y el perfil guarda el
// color elegido para cada parte en kot.colores[tipo] = [color 1, color 2] (null = el de fábrica).
// El pelo también: color 1 el pelo, color 2 la colita o el moño si tiene (Mirko, 23/10).
export const RECOLOR = ["pelos", "remeras", "pantalones", "medias", "zapatillas", "guantes", "sombreros"];

/** Tono (0-1), luz y saturación de un color 0-255. */
function hls(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : l > .5 ? d / (2 - max - min) : d / (max + min);
  let h = d === 0 ? 0 : max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h / 6 + 1) % 1, l, s];
}
/** Si un píxel es de la misma parte que un color: la misma regla que parecidos() en exportar_web.py. Devuelve la
 *  diferencia de luz (para quedarse con la parte más parecida) o -1 si no es de esa parte. */
export function parecidos([ha, la, sa], [hb, lb, sb]) {
  // Más tolerante que al armar las partes (.06 en exportar_web.py): los bordes borrosos de la paleta también van.
  const dl = Math.abs(la - lb);
  if (dl > .14) return -1;
  const grisA = sa < .22 || la < .1 || la > .94, grisB = sb < .22 || lb < .1 || lb > .94;
  if (grisA || grisB) return grisA && grisB ? dl : -1;
  return Math.min(Math.abs(ha - hb), 1 - Math.abs(ha - hb)) * 360 <= 25 ? dl : -1;
}

/** Los colores elegidos de una prenda (con los perfiles de antes: colorRemera / colorPantalon eran el color 1). */
export function coloresDe(kot, tipo) {
  const viejos = { pelos: kot.colorPelo, remeras: kot.colorRemera, pantalones: kot.colorPantalon };
  return kot.colores?.[tipo] || (viejos[tipo] ? [viejos[tipo], null] : [null, null]);
}

const BORRADOR = "kochos.kotBorrador";
export function cargarBorrador() {
  try { const k = JSON.parse(localStorage.getItem(BORRADOR)); return k && k.v === 4 ? k : null; } catch (e) { return null; }
}
export function guardarBorrador(kot) {
  try { localStorage.setItem(BORRADOR, JSON.stringify(kot)); } catch (e) {}
}

// Al azar: cara, remera, pantalón y zapatillas casi siempre; lo demás a veces.
const SEGUIDO = { caras: 1, ojos: 1, cejas: .8, bocas: .8, remeras: .9, pantalones: .95, zapatillas: .9, pelos: .7, medias: .2, guantes: .15, anteojos: .25,
  sombreros: .3, barbas: .2, caretas: .06, espalda: .15, mano: .15, extras: .08 };
export function kotAlAzar(catalogo) {
  const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];
  const piezas = {};
  for (const [tipo, lista] of Object.entries(catalogo.piezas)) {
    if (ACCESORIOS.has(tipo)) { piezas[tipo] = "sin"; continue; }
    const llenas = lista.filter((p) => !p.vacia);
    piezas[tipo] = llenas.length && Math.random() < (SEGUIDO[tipo] ?? .2) ? azar(llenas).id : "sin";
  }
  return { v: 4, colorPelo: azar(PELOS), piezas };
}

const draco = new DRACOLoader().setDecoderPath(new URL("./draco/", import.meta.url).href);

// --- Sombreado dibujado (como el render del pack Stickman) ----------------------------------------
// No es brillo realista: es "cel shading", la luz en pocos escalones planos (como pintado con 3 tonos) y un borde
// claro de corte duro en la silueta. Se ajusta con estos números: los tonos de los escalones (0-255, de la sombra a
// la luz) y cuánto aclara el borde.
export const DIBUJO = { escalones: [150, 215, 255], borde: .28 };

const rampa = (() => {
  const datos = new Uint8Array(DIBUJO.escalones.flatMap((v) => [v, v, v, 255]));
  const textura = new THREE.DataTexture(datos, DIBUJO.escalones.length, 1, THREE.RGBAFormat);
  textura.magFilter = textura.minFilter = THREE.NearestFilter;
  textura.generateMipmaps = false;
  textura.needsUpdate = true;
  return textura;
})();

/** Un material del Kot pasado a dibujado (toon): mismo nombre, textura y color. */
export function dibujado(m) {
  const toon = new THREE.MeshToonMaterial({
    name: m.name, color: m.color?.clone() ?? new THREE.Color(1, 1, 1), map: m.map || null, gradientMap: rampa,
    transparent: m.transparent, alphaTest: m.alphaTest, side: m.side,
  });
  toon.onBeforeCompile = (shader) => {
    shader.uniforms.kotBorde = { value: DIBUJO.borde };
    shader.fragmentShader = "uniform float kotBorde;\n" + shader.fragmentShader.replace("#include <dithering_fragment>",
      `float kotSilueta = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), smoothstep(.62, .68, kotSilueta) * kotBorde);
      #include <dithering_fragment>`);
  };
  toon.customProgramCacheKey = () => "kot-dibujado";
  return toon;
}

/** Ya no hace falta el cuarto de estudio (era para el reflejo realista): queda para no romper a quien lo llame. */
export function entornoDeEstudio() {}

/** Carga el Kot y devuelve el modelo y cómo aplicarle un perfil. */
export async function cargarKot(opciones = {}) {
  const catalogo = await (await fetch(RUTA + "kot.json", { cache: "no-cache" })).json();
  if (catalogo.piezas.pelos) catalogo.piezas.pelos = catalogo.piezas.pelos.filter((p) => !PELOS_ROTOS.has(p.id));
  const cargador = new GLTFLoader().setDRACOLoader(draco);
  const gltf = await cargador.loadAsync(RUTA + "kot.glb?v=" + (catalogo.version || 0));
  const kotModelo = gltf.scene;

  const mallasDe = (nodo) => (nodo.isMesh ? [nodo] : nodo.getObjectsByProperty("isMesh", true));
  // Todo pasa a dibujado (toon). Un material compartido sigue compartido. El pelo conserva su textura de fábrica.
  const materiales = {};
  const pasados = new Map();
  const pasar = (m) => {
    if (!pasados.has(m)) { const t = dibujado(m); pasados.set(m, t); materiales[t.name] = t; }
    return pasados.get(m);
  };
  kotModelo.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(pasar) : pasar(o.material);
  });

  const cuerpo = kotModelo.getObjectByName("kot_cuerpo");
  const cuerpoMaterial = cuerpo?.material?.name || "kot_cuerpo";
  const huesoCabeza = kotModelo.getObjectByName("head_x");

  // Piezas por tipo: el nodo del .glb de cada una.
  // `nodo` es el nombre real en el .glb; `objeto` es el nombre en el .blend (pueden diferir si el .glb quedó viejo).
  const piezas = {};
  for (const [tipo, lista] of Object.entries(catalogo.piezas)) {
    piezas[tipo] = {};
    for (const p of lista) {
      const nombre = p.nodo || p.objeto;
      const nodo = nombre && kotModelo.getObjectByName(nombre);
      if (nodo) piezas[tipo][p.id] = { nodo, datos: p };
    }
  }

  // Todo lo que cuelga del esqueleto y no es el cuerpo es una pieza que se prende o se apaga.
  // Sirve de red de seguridad: aunque el catálogo nombre mal una pieza, nunca queda todo amontonado.
  const raizPiezas = cuerpo?.parent;
  const piezasSueltas = raizPiezas ? raizPiezas.children.filter((o) => o !== cuerpo) : [];

  // Las barbas pasan a un material liso ("kot_barba") que se tiñe con el color elegido. Los pelos no: van con
  // su textura de fábrica. Ojos y cejas ya vienen del .blend con su material liso ("kot_ojos", "kot_cejas").
  materiales.kot_barba = dibujado(new THREE.MeshStandardMaterial({ name: "kot_barba" }));
  for (const { nodo } of Object.values(piezas.barbas || {})) for (const malla of mallasDe(nodo)) malla.material = materiales.kot_barba;

  // El .blend está en pose T: se bajan los brazos desde el hombro (el hueso del brazo, no la clavícula).
  kotModelo.updateMatrixWorld(true);
  const EJE_Z = new THREE.Vector3(0, 0, 1);
  const enKot = (obj) => kotModelo.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(obj.getWorldQuaternion(new THREE.Quaternion()));
  const brazos = [["c_arm_twist_offset_l", -1.25], ["c_arm_twist_offset_r", 1.25]].map(([nombre, angulo]) => {
    const hueso = kotModelo.getObjectByName(nombre);
    const padre = enKot(hueso.parent), giro = new THREE.Quaternion().setFromAxisAngle(EJE_Z, angulo);
    hueso.quaternion.premultiply(padre.clone().invert().multiply(giro).multiply(padre));
    return hueso;
  });
  for (const mano of manosDe(kotModelo)) mano.scale.setScalar(ESCALA_MANOS);
  kotModelo.updateMatrixWorld(true);

  let caraActual = null;
  function elegir(tipo, id) {
    return (piezas[tipo] || {})[id] || null;
  }

  /** Viste al Kot según el perfil. Un tipo que el perfil no trae (o una pieza que ya no existe) va con lo de fábrica. */
  function aplicar(kot, opciones = {}) {
    // Los accesorios quedan guardados para los juegos, pero no se muestran en la puerta ni en el editor.
    // Un juego puede pedirlos con aplicar(kot, { accesorios: true }).
    const conAccesorios = opciones.accesorios === true;
    // Primero se apaga todo y después se prende lo elegido: así una pieza sin nombre no deja el modelo lleno.
    for (const nodo of piezasSueltas) nodo.visible = false;
    // Con disfraz no va remera (las mangas lo atraviesan); los disfraces enteros sacan toda la ropa. El perfil
    // la guarda igual para cuando se lo saque.
    const disfraz = kot.piezas?.extras && kot.piezas.extras !== "sin" && piezas.extras?.[kot.piezas.extras];
    const sinRopa = !disfraz ? new Set() : DISFRACES_ENTEROS.has(kot.piezas.extras) ? ROPA : new Set(["remeras"]);
    // Perfiles de antes de separar la cara: la cara vieja dice qué ojos, cejas y boca llevaba.
    const vieja = catalogo.migrar_caras?.[kot.piezas?.caras] || {};
    for (const tipo of Object.keys(catalogo.piezas)) {
      if (ACCESORIOS.has(tipo) && !conAccesorios) continue;
      if (sinRopa.has(tipo)) continue;
      let id = kot.piezas?.[tipo] ?? vieja[tipo];
      if (id !== "sin" && !piezas[tipo]?.[id]) id = catalogo.inicial[tipo];
      const p = elegir(tipo, id);
      if (p) p.nodo.visible = true;
      if (tipo === "caras") caraActual = p;
    }
    if (materiales.kot_pelo) materiales.kot_pelo.color.set(kot.colorPelo || KOT_INICIAL.colorPelo);
    materiales.kot_barba.color.set(kot.colorBarba || kot.colorPelo || KOT_INICIAL.colorPelo);
    if (materiales.kot_ojos) materiales.kot_ojos.color.set(kot.colorOjos || KOT_INICIAL.colorOjos);
    if (materiales.kot_cejas) materiales.kot_cejas.color.set(kot.colorCejas || KOT_INICIAL.colorCejas);
    if (materiales[cuerpoMaterial]) materiales[cuerpoMaterial].color.set(kot.colorCuerpo || KOT_INICIAL.colorCuerpo);
    for (const [nombre, clave, paleta, columna] of ROPA_TENIBLE) {
      const m = materiales[nombre];
      if (!m) continue;
      m.map = kot[clave] ? texturaRopa(kot[clave], paleta, columna) : mapasDeFabrica[nombre];
      m.needsUpdate = true;
    }
    // Las prendas puestas se repintan con los colores elegidos para cada parte.
    for (const tipo of RECOLOR) {
      const p = elegir(tipo, kot.piezas?.[tipo] ?? catalogo.inicial[tipo]);
      if (p) repintar(p, coloresDe(kot, tipo));
    }
  }

  // --- Colores por parte (remeras, pantalones, medias, zapatillas, guantes, sombreros) ------------------
  // Estas piezas comparten texturas con muchos colores (la paleta del pack). Cada una se queda con su propio material
  // y, para teñirla, se pinta una copia de la textura: los píxeles de la familia de cada parte pasan al color elegido
  // para esa parte, conservando lo claro y lo oscuro (las costuras y sombras pintadas siguen ahí).
  const propios = new Map();
  for (const tipo of RECOLOR) {
    for (const p of Object.values(piezas[tipo] || {})) {
      for (const malla of mallasDe(p.nodo)) {
        const original = malla.material;
        malla.material = original.clone();
        malla.material.onBeforeCompile = original.onBeforeCompile;   // el sombreado dibujado no se copia solo
        malla.material.customProgramCacheKey = original.customProgramCacheKey;
        malla.material.userData.mapaDeFabrica = original.map;
      }
      propios.set(p, new Map());
    }
  }
  function repintar(p, colores) {
    const partes = p.datos.partes || [];
    const pedidos = partes.map((parte, i) => colores[i] ? [parte, colores[i]] : null).filter(Boolean);
    const clave = pedidos.map(([parte, c]) => parte.c + c).join("|");
    const cache = propios.get(p);
    for (const malla of mallasDe(p.nodo)) {
      const m = malla.material, fabrica = m.userData.mapaDeFabrica;
      let nuevo = fabrica;
      if (pedidos.length && fabrica?.image) {
        if (!cache.has(clave)) cache.set(clave, textura(fabrica, pedidos));
        nuevo = cache.get(clave);
      }
      if (m.map !== nuevo) { m.map = nuevo; m.needsUpdate = true; }
    }
  }
  function textura(fabrica, pedidos) {
    const img = fabrica.image;
    const lienzo = document.createElement("canvas");
    lienzo.width = img.width; lienzo.height = img.height;
    const ctx = lienzo.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const px = datos.data;
    const reglas = pedidos.map(([parte, hex]) => {
      const de = new THREE.Color(parte.c), a = new THREE.Color(hex);
      return { hls: hls(de.r * 255, de.g * 255, de.b * 255), luz: Math.max(.12, (de.r + de.g + de.b) / 3), a };
    });
    const vistos = new Map();   // las texturas de paleta repiten pocos colores: cada uno se clasifica una vez
    for (let i = 0; i < px.length; i += 4) {
      const llave = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      let regla = vistos.get(llave);
      if (regla === undefined) {
        const propio = hls(px[i], px[i + 1], px[i + 2]);
        let mejor = null, menor = Infinity;
        for (const r of reglas) {
          const d = parecidos(propio, r.hls);
          if (d >= 0 && d < menor) { mejor = r; menor = d; }
        }
        regla = mejor;
        vistos.set(llave, regla);
      }
      if (!regla) continue;   // de otra parte (o de otra prenda de la paleta): queda igual
      const f = Math.min(1.6, ((px[i] + px[i + 1] + px[i + 2]) / 765) / regla.luz);
      px[i] = Math.min(255, regla.a.r * 255 * f); px[i + 1] = Math.min(255, regla.a.g * 255 * f); px[i + 2] = Math.min(255, regla.a.b * 255 * f);
    }
    ctx.putImageData(datos, 0, 0);
    const t = new THREE.CanvasTexture(lienzo);
    t.flipY = fabrica.flipY;
    t.colorSpace = fabrica.colorSpace;
    t.wrapS = fabrica.wrapS; t.wrapT = fabrica.wrapT;
    t.magFilter = fabrica.magFilter; t.minFilter = fabrica.minFilter;
    return t;
  }

  // Remera y pantalón usan una paleta de 4×4. La del Stickman: columna izquierda grises (costuras, detalles) y el
  // resto cuatro tonos del color, de claro a oscuro. La del Hypercasual ("hc_remera", "hc_pantalon"): piel, grises,
  // marrones y la última columna, la de la ropa. Teñir = armar esa misma paleta con otro color.
  // El pelo del Hypercasual ("hc_pelo") usa la tercera columna de su paleta (la de los marrones).
  // (Pelo, remeras y pantalones se tiñen ahora por partes, como el resto: ver RECOLOR.)
  const ROPA_TENIBLE = [];
  const COLUMNAS_HC = [["#f29171", "#deaa87", "#d38d5f", "#c87137"], ["#ececec", "#b3b3b3", "#4d4d4d", "#1a1a1a"],
    ["#d38d5f", "#c87137", "#a05a2c", "#502d16"]];
  const COLUMNA_HC_ROPA = ["#e37c95", "#d74469", "#d8315b", "#bc244a"];
  const mapasDeFabrica = Object.fromEntries(ROPA_TENIBLE.map(([n]) => [n, materiales[n]?.map]));
  const texturasRopa = new Map();
  function texturaRopa(hex, paleta, columna = 3) {
    const clave = paleta + columna + hex;
    if (texturasRopa.has(clave)) return texturasRopa.get(clave);
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = 4;
    const ctx = lienzo.getContext("2d");
    const base = new THREE.Color(hex), blanco = new THREE.Color(1, 1, 1), negro = new THREE.Color(0, 0, 0);
    const tonos = [base.clone().lerp(blanco, .35), base.clone().lerp(blanco, .15), base, base.clone().lerp(negro, .22)];
    for (let fila = 0; fila < 4; fila++) {
      const columnas = paleta === "hc"
        ? [...COLUMNAS_HC.map((c) => c[fila]), COLUMNA_HC_ROPA[fila]].map((c, x) => x === columna ? "#" + tonos[fila].getHexString() : c)
        : [["#ececec", "#b3b3b3", "#4d4d4d", "#1b1b1b"][fila], ...Array(3).fill("#" + tonos[fila].getHexString())];
      columnas.forEach((c, x) => { ctx.fillStyle = c; ctx.fillRect(x, fila, 1, 1); });
    }
    const textura = new THREE.CanvasTexture(lienzo);
    textura.flipY = false;
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.magFilter = textura.minFilter = THREE.NearestFilter;
    textura.generateMipmaps = false;
    texturasRopa.set(clave, textura);
    return textura;
  }

  // --- Animación de reposo -----------------------------------------------------------------
  // Se mueven los huesos del rig, no el grupo entero: respira, se balancea y mira alrededor.
  const HUESOS = {};
  for (const nombre of ["spine_01_x", "spine_02_x", "spine_03_x", "neck_x", "head_x", "shoulder_l", "shoulder_r",
    "c_arm_twist_offset_l", "c_arm_twist_offset_r", "arm_stretch_l", "arm_stretch_r", "thigh_twist_l", "thigh_twist_r"]) {
    const hueso = kotModelo.getObjectByName(nombre);
    if (hueso) HUESOS[nombre] = hueso;
  }
  const POSE_BASE = new Map(Object.entries(HUESOS).map(([nombre, hueso]) => [nombre, hueso.quaternion.clone()]));
  const giroAux = new THREE.Quaternion(), eulerAux = new THREE.Euler();
  const giroBrazo = new THREE.Quaternion(), giroBrazoAux = new THREE.Quaternion();
  const PADRE_BRAZO = {};
  for (const nombre of ["c_arm_twist_offset_l", "c_arm_twist_offset_r"]) {
    const hueso = HUESOS[nombre];
    if (hueso) {
      const padre = enKot(hueso.parent);
      PADRE_BRAZO[nombre] = [padre, padre.clone().invert()];
    }
  }
  function mover(nombre, x = 0, y = 0, z = 0) {
    const hueso = HUESOS[nombre];
    if (!hueso) return;
    eulerAux.set(x, y, z);
    giroAux.setFromEuler(eulerAux);
    hueso.quaternion.copy(POSE_BASE.get(nombre)).multiply(giroAux);
  }
  // Giro en el espacio del padre: es el mismo eje con el que se bajaron los brazos al cargar.
  function girarBrazo(nombre, angulo) {
    const hueso = HUESOS[nombre], padre = PADRE_BRAZO[nombre];
    if (!hueso || !padre || !angulo) return;
    giroBrazo.setFromAxisAngle(EJE_Z, angulo);
    giroBrazoAux.copy(padre[1]).multiply(giroBrazo).multiply(padre[0]);
    hueso.quaternion.premultiply(giroBrazoAux);
  }

  /** `t` en segundos. `saludo` (0 a 1) levanta los brazos cuando lo tocan. */
  function animar(t, opciones = {}) {
    const resp = Math.sin(t * 1.7);
    const resp2 = Math.sin(t * 1.7 + .9);
    const peso = Math.sin(t * .75);
    const mirar = Math.sin(t * .42);
    const saludo = Math.max(0, Math.min(1, opciones.saludo || 0));
    mover("spine_01_x", 0, peso * .04, peso * .025);
    mover("spine_02_x", resp * .03, 0, -peso * .035);
    mover("spine_03_x", resp2 * .02, mirar * .025, 0);
    mover("neck_x", resp * .012, mirar * .08, 0);
    mover("head_x", -resp * .018 + mirar * .04, mirar * .16, peso * .025);
    mover("shoulder_l", resp * .035, 0, resp * .035);
    mover("shoulder_r", resp * .035, 0, -resp * .035);
    mover("c_arm_twist_offset_l", resp * .03, 0, 0);
    mover("c_arm_twist_offset_r", resp * .03, 0, 0);
    girarBrazo("c_arm_twist_offset_l", resp * .06 + saludo * 1.3);
    girarBrazo("c_arm_twist_offset_r", -resp * .06 - saludo * 1.3);
    mover("thigh_twist_l", peso * .02, 0, 0);
    mover("thigh_twist_r", -peso * .02, 0, 0);
  }

  // La boca y los ojos ya vienen dibujados en la cara: se dejan para el cerebro y la sala (no hacen nada por ahora).
  const ponerBoca = () => {}, actualizarOjos = () => {}, parpadear = () => {};

  // --- Clips del pack Stickman ---------------------------------------------------------------
  // kot_animaciones.glb lo hace consola/kots/herramientas/exportar_animaciones.py: el mismo esqueleto limpio, con los clips
  // del pack (reposo, saludo, festejo, aplauso, baile...). Si no está, queda la animación de reposo hecha a mano (animar).
  let clips = null;
  if (opciones.clips !== false) {
    try {
      const anims = await cargador.loadAsync(RUTA + "kot_animaciones.glb?v=" + (catalogo.version || 0));
      clips = new Animador(kotModelo, anims.animations);
    } catch (e) { console.warn("Sin clips del Stickman (kot_animaciones.glb):", e); }
  }

  return {
    catalogo, kotModelo, piezas, brazos, huesoCabeza, cuerpo, aplicar, animar, actualizarOjos, parpadear, ponerBoca, clips,
    /** La piel que da la forma del muñeco: el cuerpo y la cabeza (que viene con la cara). */
    get formas() { return [cuerpo, ...(caraActual ? mallasDe(caraActual.nodo) : [])].flatMap(mallasDe); },
  };
}

/**
 * Los clips del Stickman sobre el Kot: uno de fondo que se repite (reposo) y gestos cortos que se mezclan encima
 * y vuelven solos al de fondo.
 */
// Las manos del Stickman de fábrica son enormes: se achican (los clips también traen la escala de la mano,
// así que se vuelve a fijar después de cada cuadro de animación).
export const ESCALA_MANOS = .75;
const manosDe = (raiz) => ["hand_l", "hand_r"].map((n) => raiz.getObjectByName(n)).filter(Boolean);

export class Animador {
  constructor(raiz, animaciones) {
    this.mezclador = new THREE.AnimationMixer(raiz);
    this.manos = manosDe(raiz);
    this.clips = Object.fromEntries(animaciones.map((c) => [c.name, c]));
    this.fondo = null;
    this.gestoActual = null;
    this.mezclador.addEventListener("finished", (e) => {
      if (e.action !== this.gestoActual) return;
      this.gestoActual = null;
      this.fondo?.reset().fadeIn(.35).play();
      e.action.fadeOut(.35);
    });
  }
  get nombres() { return Object.keys(this.clips); }
  accion(nombre) { return this.clips[nombre] && this.mezclador.clipAction(this.clips[nombre]); }

  /** Clip de fondo (se repite). */
  fondoA(nombre, mezcla = .4) {
    const nueva = this.accion(nombre);
    if (!nueva || nueva === this.fondo) return;
    nueva.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(mezcla).play();
    if (this.fondo && !this.gestoActual) this.fondo.fadeOut(mezcla);
    this.fondo = nueva;
  }

  /** Gesto corto: se mezcla, se repite `veces` y vuelve al fondo. */
  gesto(nombre, veces = 1, mezcla = .2) {
    const a = this.accion(nombre);
    if (!a) return;
    if (this.gestoActual && this.gestoActual !== a) this.gestoActual.fadeOut(mezcla);
    a.reset().setLoop(veces > 1 ? THREE.LoopRepeat : THREE.LoopOnce, veces);
    a.clampWhenFinished = true;
    a.fadeIn(mezcla).play();
    this.fondo?.fadeOut(mezcla);
    this.gestoActual = a;
  }

  /** Corta todo y deja el fondo de una (al volver del ragdoll). */
  reiniciar() {
    this.mezclador.stopAllAction();
    this.gestoActual = null;
    this.fondo?.reset().setEffectiveWeight(1).play();
  }

  actualizar(dt) {
    this.mezclador.update(dt);
    for (const mano of this.manos) mano.scale.setScalar(ESCALA_MANOS);
  }
}
