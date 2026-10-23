"use strict";
// Puerta de entrada de kochOS: tu perfil (o invitado de hoy) vive en este celular y viaja a cualquier consola.
// Un solo recorrido: elegir perfil → nombre y color → armar el Kot en 3D (paso 2, embebido) → guardado → entrar.
// El QR de la tele abre esta página con ?consola=IP:PUERTO&nombre=...; al entrar, el perfil (con su Kot)
// pasa al control de esa consola dentro de la dirección (#p=...), que nunca sale de la wifi.

import * as THREE from "three";
import { cargarKot, entornoDeEstudio } from "./editor-kot/kot-modelo.js";
import { KOT_INICIAL, copiar, cargarBorrador, guardarBorrador } from "./kot-perfil.js";
import { normalizarKot, kotDelPerfil, paqueteDelPerfil, tienePiezas } from "./kot-paquete.js";
import { kotSvg } from "./kot.js";

const COLORES = ["#ff5a5f", "#ff9f1c", "#ffc93c", "#43c59e", "#2ec4b6", "#3fa9f5", "#a66cff", "#ff8fab"];
const CLAVES = { perfil: "kochos.perfil", invitado: "kochos.invitado", consolas: "kochos.consolas", borrador: "kochos.borradorPerfil" };
const PASO_EDITOR = "./editor-kot/editor-kot.html";

const $ = (id) => document.getElementById(id);
const parametros = new URLSearchParams(location.search);
const consola = limpiarDireccion(parametros.get("consola"));
const nombreConsola = (parametros.get("nombre") || "").slice(0, 40);

let borrador = null;        // perfil que se está armando (no guardado todavía)
let origenEditor = "armar"; // a dónde vuelve el editor: "armar" o "inicio"
let vistaKot = null;        // { modelo, render, escena, camara, giro, loopId, observador }
let tokenVista = 0;         // descarta cargas viejas del .glb si se cambió de pantalla
let avisoTimer = 0;

// --- Guardado en el celular ------------------------------------------------------

function leer(clave) {
  try { return JSON.parse(localStorage.getItem(clave)); } catch (e) { return null; }
}
function guardar(clave, valor) {
  try { valor == null ? localStorage.removeItem(clave) : localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) {}
}

function nuevoId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function medianoche() {
  const hoy = new Date();
  hoy.setHours(24, 0, 0, 0);
  return hoy.getTime();
}

/** Quién entra ahora: el perfil guardado o el invitado de hoy (si todavía no venció). */
function identidad() {
  const invitado = leer(CLAVES.invitado);
  if (invitado && invitado.expira < Date.now()) guardar(CLAVES.invitado, null);
  const vigente = leer(CLAVES.invitado);
  if (vigente && vigente.usarHoy) return vigente;
  return leer(CLAVES.perfil) || vigente;
}

function perfilNuevo(tipo) {
  return {
    id: nuevoId(), tipo, nombre: "", color: COLORES[Math.floor(Math.random() * COLORES.length)], modo: "puntero",
    kot: { ...copiar(KOT_INICIAL) }, puntajes: {}, estadisticas: { partidas: 0, ganadas: 0 }, creado: Date.now(),
  };
}

/** Guarda el perfil o el invitado de hoy, según quién esté usando la app. */
function guardarIdentidad(yo) {
  guardar(yo.tipo === "invitado" ? CLAVES.invitado : CLAVES.perfil, yo);
}

// El perfil que se está armando se guarda aparte: ir al editor y volver (o que iOS recargue)
// no puede perder el nombre, el color ni el modo.
function persistirBorrador() {
  if (!borrador) return;
  guardar(CLAVES.borrador, { perfil: borrador });
}
function descartarBorrador() {
  borrador = null;
  guardar(CLAVES.borrador, null);
}
function borradorGuardado() {
  const crudo = leer(CLAVES.borrador);
  return crudo && crudo.perfil && typeof crudo.perfil === "object" ? crudo.perfil : null;
}

// La dirección de la consola viene del QR: solo IP o nombre de la red local con puerto.
function limpiarDireccion(texto) {
  if (!texto) return null;
  const valida = /^[a-z0-9.-]+(:\d{2,5})?$/i.test(texto);
  return valida ? texto : null;
}

function recordarConsola(direccion, nombre) {
  const lista = (leer(CLAVES.consolas) || []).filter((c) => c.direccion !== direccion);
  const anterior = (leer(CLAVES.consolas) || []).find((c) => c.direccion === direccion);
  lista.unshift({ direccion, nombre: nombre || anterior?.nombre || "Consola", ultima: Date.now(), visitada: anterior?.visitada || false });
  guardar(CLAVES.consolas, lista.slice(0, 5));
}

// --- Pantallas -------------------------------------------------------------------

// Cada pantalla queda en el historial: el botón atrás del celular (o el gesto) vuelve a la anterior en vez
// de cerrar la app. Al volver (popstate) se muestra sin sumar otra entrada.
let navegandoAtras = false;
let pantallaActual = null;

function mostrar(nombre) {
  if (pantallaActual === "escanear" && nombre !== "escanear") detenerCamara();
  pantallaActual = nombre;
  document.querySelectorAll(".pantalla").forEach((p) => p.classList.toggle("visible", p.dataset.pantalla === nombre));
  if (nombre !== "editor") window.scrollTo(0, 0);
  if (navegandoAtras || !history.state) history.replaceState({ pantalla: nombre }, "");
  else if (history.state.pantalla !== nombre) history.pushState({ pantalla: nombre }, "");
}

window.addEventListener("popstate", (evento) => {
  const destino = evento.state?.pantalla;
  if (!destino) return;
  navegandoAtras = true;
  try {
    if (pantallaActual === "editor") cerrarEditor();
    if (destino === "armar" && borrador) { mostrar("armar"); montarVistaFormulario(); }
    else if (destino === "elegir" && !identidad()) mostrar("elegir");
    else if (destino === "escanear") abrirEscaner();
    else { descartarBorrador(); identidad() ? pintarInicio() : mostrar("elegir"); }
  } finally {
    navegandoAtras = false;
  }
});

function avisar(texto) {
  const caja = $("aviso");
  caja.textContent = texto;
  caja.classList.add("ver");
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => caja.classList.remove("ver"), 2200);
}

// --- Vista 3D --------------------------------------------------------------------

function desmontarVista() {
  tokenVista++;
  if (!vistaKot) return;
  cancelAnimationFrame(vistaKot.loopId);
  vistaKot.observador?.disconnect();
  vistaKot.render.dispose();
  vistaKot.render.domElement.remove();
  vistaKot = null;
}

/**
 * Arma el Kot real (kot-modelo.js) en el contenedor. `encuadre` "cuerpo" o "cabeza".
 * Si no hay WebGL o falla la carga, deja la silueta de kot.js (respaldo, no paso principal).
 */
async function crearVista(contenedor, kot, opciones = {}) {
  const { encuadre = "cuerpo", velocidad = .0008, inicial = "?" } = opciones;
  desmontarVista();
  const token = tokenVista;
  contenedor.querySelectorAll("canvas, .kot").forEach((c) => c.remove());
  contenedor.classList.remove("camina");

  let cargando = contenedor.querySelector(".cargando");
  if (!cargando) {
    cargando = document.createElement("div");
    cargando.className = "cargando";
    contenedor.appendChild(cargando);
  }
  cargando.textContent = "Cargando tu Kot…";
  cargando.style.display = "grid";

  try {
    // Con los clips del editor (reposo del Stickman): el mismo movimiento que en el editor y en la tele.
    const modelo = await cargarKot();
    if (token !== tokenVista) return null; // se cambió de pantalla mientras cargaba

    const render = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    render.setPixelRatio(Math.min(devicePixelRatio, 2));
    render.outputColorSpace = THREE.SRGBColorSpace;
    contenedor.prepend(render.domElement);

    const escena = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(28, 1, .1, 50);
    entornoDeEstudio(render, escena);
    escena.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.5));
    const sol = new THREE.DirectionalLight(0xffffff, 1.8);
    sol.position.set(1.5, 3, 3);
    escena.add(sol);
    const piso = new THREE.Mesh(new THREE.CylinderGeometry(.75, .82, .08, 9), new THREE.MeshLambertMaterial({ color: "#cfd8e3", flatShading: true }));
    piso.position.y = -.04;
    escena.add(piso);

    const giro = new THREE.Group();
    escena.add(giro);
    giro.add(modelo.kotModelo);

    modelo.kotModelo.updateMatrixWorld(true);
    const cabezaY = modelo.huesoCabeza.getWorldPosition(new THREE.Vector3()).y + .2;
    const alto = cabezaY + .3;
    if (encuadre === "cabeza") {
      camara.position.set(0, cabezaY + .15, 2.3);
      camara.lookAt(0, cabezaY, 0);
    } else {
      camara.position.set(0, alto * .55, alto * 2.5);
      camara.lookAt(0, alto * .5, 0);
    }

    modelo.aplicar(kot);
    modelo.clips?.fondoA("reposo", 0);

    const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const vista = { modelo, render, escena, camara, giro, contenedor, loopId: 0, observador: null };
    const reloj = new THREE.Clock();
    let t = 0;

    function cuadro() {
      const dt = Math.min(reloj.getDelta(), .05);
      t += dt;
      if (!quieto) {
        giro.rotation.y += velocidad;
        // Sin clips (no cargó kot_animaciones.glb) queda el reposo hecho a mano.
        if (modelo.clips) modelo.clips.actualizar(dt);
        else modelo.animar(t);
      }
      render.render(escena, camara);
      vista.loopId = requestAnimationFrame(cuadro);
    }

    const ajustar = () => {
      const ancho = contenedor.clientWidth, altoCaja = contenedor.clientHeight;
      if (!ancho || !altoCaja) return;
      render.setSize(ancho, altoCaja, false);
      camara.aspect = ancho / altoCaja;
      camara.updateProjectionMatrix();
    };
    const observador = new ResizeObserver(ajustar);
    observador.observe(contenedor);
    vista.observador = observador;

    cargando.style.display = "none";
    vistaKot = vista;
    ajustar();
    cuadro();
    return vista;
  } catch (e) {
    console.error("No se pudo mostrar el Kot en 3D:", e);
    if (token !== tokenVista) return null;
    cargando.style.display = "none";
    contenedor.insertAdjacentHTML("afterbegin", kotSvg(kot.colorCuerpo, inicial));
    contenedor.classList.add("camina");
    return null;
  }
}

// --- Paso 1: perfil o invitado ----------------------------------------------------

async function abrirArmar(modo, datos) {
  const yo = identidad();
  borrador = datos ? copiar(datos) : (modo === "editar" && yo ? copiar(yo) : perfilNuevo(modo));
  borrador.kot = normalizarKot(borrador.kot, borrador.color);

  $("formulario-titulo").textContent = borrador.tipo === "invitado" ? "Invitado de hoy" : "Tu perfil";
  $("nombre").value = borrador.nombre || "";
  $("nombre").classList.remove("falta");
  $("btn-disenar").textContent = tienePiezas(borrador.kot) ? "Editar mi Kot" : "Armar mi Kot";
  $("guardar").textContent = modo === "editar" ? "Guardar" : "Guardar así";
  pintarColores();
  pintarModos();
  mostrar("armar");
  persistirBorrador();
  await montarVistaFormulario();
  if (!borrador.nombre) setTimeout(() => $("nombre").focus(), 250);
}

function pintarColores() {
  $("colores").innerHTML = "";
  for (const color of COLORES) {
    const boton = document.createElement("button");
    boton.style.background = color;
    boton.setAttribute("aria-label", `Color ${color}`);
    boton.classList.toggle("activo", color === borrador.color);
    boton.onclick = () => elegirColor(color);
    $("colores").appendChild(boton);
  }
}

function elegirColor(color) {
  if (!borrador || !COLORES.includes(color)) return;
  borrador.color = color;
  borrador.kot = normalizarKot(borrador.kot, color);
  pintarColores();
  persistirBorrador();
  if (vistaKot) vistaKot.modelo.aplicar(borrador.kot);
  else $("vista-kot").innerHTML = kotSvg(color, borrador.nombre || "?");
}

function pintarModos() {
  document.querySelectorAll("#modos button").forEach((b) => b.classList.toggle("activo", b.dataset.modo === borrador.modo));
}

async function montarVistaFormulario() {
  const vista = await crearVista($("vista-kot"), borrador.kot, { encuadre: "cuerpo", velocidad: .0015, inicial: borrador.nombre || "?" });
  $("nota-preview").hidden = !!vista;
}

// --- Paso 2: editor embebido ------------------------------------------------------

function abrirEditor(origen) {
  const yo = identidad();
  if (!borrador) {
    if (!yo) { mostrar("elegir"); return; }
    borrador = copiar(yo);
    borrador.kot = normalizarKot(borrador.kot, borrador.color);
  }
  borrador.nombre = (borrador.nombre || "").trim().slice(0, 12);
  if (!borrador.nombre) {
    mostrar(origen === "inicio" ? "inicio" : "armar");
    $("nombre").classList.add("falta");
    $("nombre").focus();
    avisar("Poné tu nombre primero");
    return;
  }

  borrador.kot = normalizarKot(borrador.kot, borrador.color);
  persistirBorrador();
  guardarBorrador(borrador.kot);
  origenEditor = origen;

  desmontarVista();
  const marco = $("editor-marco");
  marco.src = "about:blank";
  marco.src = `${PASO_EDITOR}?embed=1&nombre=${encodeURIComponent(borrador.nombre)}&v=${Date.now()}`;
  mostrar("editor");
}

function cerrarEditor() {
  const marco = $("editor-marco");
  if (marco) marco.src = "about:blank";
  if (borrador) persistirBorrador();
}

function recibirDelEditor(evento) {
  if (evento.origin !== location.origin) return;
  const dato = evento.data;
  if (!dato || typeof dato.kochos !== "string") return;

  if (dato.kochos === "volver") {
    cerrarEditor();
    if (origenEditor === "inicio" && identidad()) { descartarBorrador(); pintarInicio(); }
    else if (borrador) { mostrar("armar"); montarVistaFormulario(); }
    else pintarInicio();
    return;
  }

  // El editor guarda a mitad del recorrido (paso 2): se guarda el Kot en el borrador sin cerrar el editor.
  if (dato.kochos === "kot-guardado") {
    const kot = normalizarKot(dato.kot, dato.kot?.colorCuerpo || borrador?.color);
    if (!borrador) return;
    borrador.kot = kot;
    borrador.color = kot.colorCuerpo;
    persistirBorrador();
    return;
  }

  if (dato.kochos !== "kot-listo") return;
  const kot = normalizarKot(dato.kot, dato.kot?.colorCuerpo || borrador?.color);
  const yo = identidad();
  if (!borrador && yo) { borrador = copiar(yo); }
  if (!borrador) { cerrarEditor(); pintarInicio(); return; }

  borrador.kot = kot;
  borrador.color = kot.colorCuerpo;
  cerrarEditor();
  guardarFormulario("Tu Kot está guardado");
}

// --- Guardar ---------------------------------------------------------------------

/** Guarda el perfil/invitado con su Kot. Si no hay nombre, no guarda y avisa. */
function guardarFormulario(mensaje = "Guardado") {
  if (!borrador) return false;
  borrador.nombre = (borrador.nombre || "").trim().slice(0, 12);
  if (!borrador.nombre) {
    $("nombre").classList.add("falta");
    $("nombre").focus();
    avisar("Poné tu nombre primero");
    return false;
  }

  borrador.kot = normalizarKot(borrador.kot, borrador.color);
  borrador.color = borrador.kot.colorCuerpo; // el color del perfil es el color del cuerpo

  if (borrador.tipo === "invitado") {
    borrador.expira = medianoche();
    borrador.usarHoy = true;
    guardar(CLAVES.invitado, borrador);
  } else {
    delete borrador.expira;
    delete borrador.usarHoy;
    guardar(CLAVES.perfil, borrador);
    const invitado = leer(CLAVES.invitado);
    if (invitado) { invitado.usarHoy = false; guardar(CLAVES.invitado, invitado); }
  }
  guardarBorrador(borrador.kot);
  descartarBorrador();
  pintarInicio({ aviso: mensaje });
  return true;
}

/** El invitado se queda con su Kot: pasa a ser el perfil guardado. */
function invitadoAPerfil() {
  const invitado = leer(CLAVES.invitado);
  if (!invitado) return;
  const perfil = { ...invitado, tipo: "perfil", kot: normalizarKot(invitado.kot, invitado.color) };
  delete perfil.expira;
  delete perfil.usarHoy;
  guardar(CLAVES.perfil, perfil);
  guardar(CLAVES.invitado, null);
  pintarInicio({ aviso: "Tu Kot quedó guardado como perfil" });
}

/** Entrar como otra persona: el que está deja de ser el de hoy y se elige de nuevo. */
function entrarComoOtro() {
  guardar(CLAVES.invitado, null);
  descartarBorrador();
  if (leer(CLAVES.perfil)) { abrirArmar("invitado"); return; }
  mostrar("elegir");
}

// --- Inicio ----------------------------------------------------------------------

async function pintarInicio(opciones = {}) {
  const yo = identidad();
  if (!yo) { mostrar("elegir"); return; }

  yo.kot = kotDelPerfil(yo);
  yo.color = yo.kot.colorCuerpo;
  guardarIdentidad(yo);

  $("saludo").textContent = `Hola, ${yo.nombre}`;
  $("tipo").textContent = yo.tipo === "invitado" ? "Invitado hasta la medianoche" : "Tu perfil está guardado en este celular";
  $("guardar-invitado").style.display = yo.tipo === "invitado" ? "" : "none";
  $("entrar").style.display = consola ? "" : "none";
  $("entrar").textContent = consola ? `Entrar a ${nombreConsola || "la consola"}` : "Entrar";
  $("disenar-texto").firstChild.textContent = tienePiezas(yo.kot) ? "Editar mi Kot" : "Armar mi Kot";
  document.documentElement.style.setProperty("--jugador", yo.color || "#ff5a5f");

  const consolas = consola ? [] : leer(CLAVES.consolas) || [];
  $("consolas").innerHTML = consolas.length ? "<h2>Tus consolas</h2>" : "";
  for (const guardada of consolas) {
    const boton = document.createElement("button");
    boton.className = "consola-guardada";
    boton.innerHTML = `<span class="pill${guardada.visitada ? " si" : ""}"><i></i></span><span>${escapar(guardada.nombre)}</span><small>${escapar(guardada.direccion)}</small>`;
    boton.onclick = () => entrar(guardada.direccion, guardada.nombre);
    $("consolas").appendChild(boton);
  }
  $("sin-consola").style.display = consola || consolas.length ? "none" : "";
  // Con la consola en la dirección (vino del QR) ya está todo; si no, se escanea desde acá.
  $("escanear").className = (consola || consolas.length ? "secundario" : "principal grande") + " con-icono";
  $("escanear").style.display = consola ? "none" : "";

  mostrar("inicio");
  const vista = await crearVista($("kot-inicio"), yo.kot, { encuadre: "cuerpo", velocidad: .0008, inicial: yo.nombre });
  $("nota-inicio").hidden = !!vista;
  if (opciones.aviso) avisar(opciones.aviso);
}

// --- Entrar a la consola ---------------------------------------------------------

let pendiente = null;

function entrar(direccion, nombre) {
  const guardada = (leer(CLAVES.consolas) || []).find((c) => c.direccion === direccion);
  pendiente = { direccion, nombre };
  if (guardada && guardada.visitada) { irAlControl(); return; }
  mostrar("aviso");
}

function irAlControl() {
  const { direccion, nombre } = pendiente;
  recordarConsola(direccion, nombre);
  const lista = leer(CLAVES.consolas) || [];
  lista[0].visitada = true;
  guardar(CLAVES.consolas, lista);
  const yo = identidad();
  const paquete = paqueteDelPerfil(yo, location.origin + location.pathname);
  const foto = fotoDelKot();
  if (foto) paquete.perfil.foto = foto;
  location.href = `https://${direccion}/#p=${aBase64(JSON.stringify(paquete))}`;
}

// Una foto chiquita de tu Kot (la vista 3D del inicio) para el control: viaja en el paquete y es tu avatar.
// 112 px en webp pesan ~3 KB, entran en la dirección sin problema.
function fotoDelKot() {
  try {
    if (!vistaKot) return "";
    vistaKot.render.render(vistaKot.escena, vistaKot.camara);
    const fuente = vistaKot.render.domElement;
    const lado = Math.min(fuente.width, fuente.height * .62);
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = 112;
    lienzo.getContext("2d").drawImage(fuente, (fuente.width - lado) / 2, fuente.height * .04, lado, lado, 0, 0, 112, 112);
    const foto = lienzo.toDataURL("image/webp", .8);
    return foto.startsWith("data:image/webp") && foto.length < 12000 ? foto : "";
  } catch (e) {
    return "";
  }
}

function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  bytes.forEach((b) => { binario += String.fromCharCode(b); });
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

// --- Escanear el QR de la tele ------------------------------------------------------
// La app agregada a inicio no pasa por la cámara del celular: escanea acá adentro. Android trae
// BarcodeDetector; en iPhone se usa jsQR (se baja una vez y queda guardada por el service worker).

let flujo = null;
let escaneando = false;

async function abrirEscaner() {
  mostrar("escanear");
  const nota = $("nota-camara");
  nota.hidden = true;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  } catch (e) {
    nota.textContent = "No pude abrir la cámara. Dale permiso en los ajustes del navegador, o escaneá con la cámara del celular.";
    nota.hidden = false;
    return;
  }
  const video = $("camara");
  video.srcObject = flujo;
  await video.play().catch(() => {});
  escaneando = true;
  const leer = await lectorQR();
  const lienzo = document.createElement("canvas");
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  while (escaneando) {
    await new Promise((r) => setTimeout(r, 200));
    if (!escaneando || video.readyState < 2) continue;
    const texto = await leer(video, lienzo, ctx).catch(() => null);
    const destino = texto && consolaDelQR(texto);
    if (destino) {
      detenerCamara();
      if (navigator.vibrate) navigator.vibrate(30);
      entrar(destino.direccion, destino.nombre);
      return;
    }
  }
}

function detenerCamara() {
  escaneando = false;
  if (flujo) flujo.getTracks().forEach((t) => t.stop());
  flujo = null;
}

async function lectorQR() {
  if ("BarcodeDetector" in window) {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video))[0]?.rawValue || null;
  }
  const { default: jsQR } = await import("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm");
  return async (video, lienzo, ctx) => {
    lienzo.width = video.videoWidth;
    lienzo.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    return jsQR(ctx.getImageData(0, 0, lienzo.width, lienzo.height).data, lienzo.width, lienzo.height)?.data || null;
  };
}

// El QR lleva la puerta con ?consola=IP:PUERTO&nombre=...; también vale la dirección directa de la consola.
function consolaDelQR(texto) {
  try {
    const url = new URL(texto);
    const directa = url.searchParams.get("consola");
    const direccion = limpiarDireccion(directa || (url.port === "8443" ? url.host : ""));
    return direccion ? { direccion, nombre: (url.searchParams.get("nombre") || "").slice(0, 40) } : null;
  } catch (e) {
    return null;
  }
}

// --- Botones -----------------------------------------------------------------------

const acciones = {
  "crear-perfil": () => abrirArmar("perfil"),
  "crear-invitado": () => abrirArmar("invitado"),
  volver: () => { descartarBorrador(); identidad() ? pintarInicio() : mostrar("elegir"); },
  guardar: () => guardarFormulario(),
  entrar: () => entrar(consola, nombreConsola),
  "guardar-invitado": invitadoAPerfil,
  editar: () => abrirArmar("editar"),
  disenar: () => abrirEditor("inicio"),
  otro: entrarComoOtro,
  "volver-inicio": pintarInicio,
  "entrar-ya": irAlControl,
  escanear: abrirEscaner,
  atras: () => history.back(),
};

document.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-accion]");
  if (boton && acciones[boton.dataset.accion]) acciones[boton.dataset.accion]();
});

$("btn-disenar").onclick = () => abrirEditor("armar");
$("nombre").addEventListener("input", (e) => {
  if (!borrador) return;
  borrador.nombre = e.target.value;
  e.target.classList.remove("falta");
  persistirBorrador();
});
$("nombre").addEventListener("keydown", (e) => { if (e.key === "Enter") abrirEditor("armar"); });
document.querySelectorAll("#modos button").forEach((b) => b.addEventListener("click", () => {
  borrador.modo = b.dataset.modo;
  pintarModos();
  persistirBorrador();
}));
window.addEventListener("message", recibirDelEditor);

// --- Arranque ----------------------------------------------------------------------

if (consola) recordarConsola(consola, nombreConsola);
if (consola) {
  $("consola-nombre").hidden = false;
  $("consola-nombre").lastElementChild.textContent = nombreConsola || consola;
}

// Banderas del flujo viejo (editor como página aparte): no hacen falta y confunden.
sessionStorage.removeItem("kochos.vuelveDelEditor");
sessionStorage.removeItem("kochos.editando");

// Si se cortó a mitad del armado (o iOS recargó), se retoma donde estaba.
const pendientePerfil = borradorGuardado();
if (pendientePerfil) abrirArmar(pendientePerfil.tipo || "perfil", pendientePerfil);
else pintarInicio();

// Service Worker
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
