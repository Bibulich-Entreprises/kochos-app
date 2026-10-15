"use strict";
// Puerta de entrada de kochOS: tu perfil (o invitado de hoy) vive en este celular y viaja a cualquier consola.
// El QR de la tele abre esta página con ?consola=IP:PUERTO&nombre=...; al entrar, el perfil pasa al control
// de esa consola dentro de la dirección (#p=...), que nunca sale de la wifi.

const COLORES = ["#ff5a5f", "#ff9f1c", "#ffc93c", "#43c59e", "#2ec4b6", "#3fa9f5", "#a66cff", "#ff8fab"];
const CLAVES = { perfil: "kochos.perfil", invitado: "kochos.invitado", consolas: "kochos.consolas" };

const $ = (id) => document.getElementById(id);
const parametros = new URLSearchParams(location.search);
const consola = limpiarDireccion(parametros.get("consola"));
const nombreConsola = (parametros.get("nombre") || "").slice(0, 40);

let editando = null;   // "perfil", "invitado" o "editar" mientras se usa el formulario
let borrador = {};

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
    kot: { forma: "silueta" }, puntajes: {}, estadisticas: { partidas: 0, ganadas: 0 }, creado: Date.now(),
  };
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

function mostrar(nombre) {
  document.querySelectorAll(".pantalla").forEach((p) => p.classList.toggle("visible", p.dataset.pantalla === nombre));
  window.scrollTo(0, 0);
}

function pintarInicio() {
  const yo = identidad();
  if (!yo) { mostrar("elegir"); return; }
  $("kot-inicio").innerHTML = kotSvg(yo.color, yo.nombre);
  $("saludo").textContent = `Hola, ${yo.nombre}`;
  $("tipo").textContent = yo.tipo === "invitado" ? "Invitado hasta la medianoche" : "Tu perfil está guardado en este celular";
  $("guardar-invitado").style.display = yo.tipo === "invitado" ? "" : "none";
  $("entrar").style.display = consola ? "" : "none";
  $("entrar").textContent = consola ? `Entrar a ${nombreConsola || "la consola"}` : "Entrar";

  const consolas = consola ? [] : leer(CLAVES.consolas) || [];
  $("consolas").innerHTML = consolas.length ? "<h2>Tus consolas</h2>" : "";
  for (const guardada of consolas) {
    const boton = document.createElement("button");
    boton.className = "consola-guardada";
    boton.innerHTML = `<span>${escapar(guardada.nombre)}</span><small>${escapar(guardada.direccion)}</small>`;
    boton.onclick = () => entrar(guardada.direccion, guardada.nombre);
    $("consolas").appendChild(boton);
  }
  $("sin-consola").style.display = consola || consolas.length ? "none" : "";
  mostrar("inicio");
}

function abrirFormulario(modo) {
  editando = modo;
  const yo = identidad();
  borrador = modo === "editar" ? { ...yo } : perfilNuevo(modo);
  $("formulario-titulo").textContent = { perfil: "Tu perfil", invitado: "Invitado de hoy", editar: "Editar" }[modo];
  $("nombre").value = borrador.nombre;
  $("guardar").textContent = modo === "editar" ? "Guardar" : "Listo";
  pintarColores();
  pintarModos();
  pintarVista();
  mostrar("formulario");
  setTimeout(() => $("nombre").focus(), 250);
}

function pintarColores() {
  $("colores").innerHTML = "";
  for (const color of COLORES) {
    const boton = document.createElement("button");
    boton.style.background = color;
    boton.setAttribute("aria-label", `Color ${color}`);
    boton.classList.toggle("activo", color === borrador.color);
    boton.onclick = () => { borrador.color = color; pintarColores(); pintarVista(); };
    $("colores").appendChild(boton);
  }
}

function pintarModos() {
  document.querySelectorAll("#modos button").forEach((b) => b.classList.toggle("activo", b.dataset.modo === borrador.modo));
}

function pintarVista() {
  $("vista-kot").innerHTML = kotSvg(borrador.color, borrador.nombre || "?");
  $("guardar").disabled = !borrador.nombre.trim();
}

function guardarFormulario() {
  borrador.nombre = borrador.nombre.trim().slice(0, 12);
  if (!borrador.nombre) return;
  if (borrador.tipo === "invitado") {
    borrador.expira = medianoche();
    borrador.usarHoy = true;
    guardar(CLAVES.invitado, borrador);
  } else {
    guardar(CLAVES.perfil, borrador);
    const invitado = leer(CLAVES.invitado);
    if (invitado) { invitado.usarHoy = false; guardar(CLAVES.invitado, invitado); }
  }
  pintarInicio();
}

/** El invitado se queda con su Kot: pasa a ser el perfil guardado. */
function invitadoAPerfil() {
  const invitado = leer(CLAVES.invitado);
  if (!invitado) return;
  const perfil = { ...invitado, tipo: "perfil" };
  delete perfil.expira;
  delete perfil.usarHoy;
  guardar(CLAVES.perfil, perfil);
  guardar(CLAVES.invitado, null);
  pintarInicio();
}

/** Entrar como otra persona: el que está deja de ser el de hoy y se elige de nuevo. */
function entrarComoOtro() {
  const invitado = leer(CLAVES.invitado);
  if (invitado) guardar(CLAVES.invitado, null);
  if (leer(CLAVES.perfil)) { abrirFormulario("invitado"); return; }
  mostrar("elegir");
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
  const paquete = { perfil: yo, puerta: location.origin + location.pathname };
  location.href = `https://${direccion}/#p=${aBase64(JSON.stringify(paquete))}`;
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

// --- Botones -----------------------------------------------------------------------

const acciones = {
  "crear-perfil": () => abrirFormulario("perfil"),
  "crear-invitado": () => abrirFormulario("invitado"),
  volver: () => (identidad() ? pintarInicio() : mostrar("elegir")),
  guardar: guardarFormulario,
  entrar: () => entrar(consola, nombreConsola),
  "guardar-invitado": invitadoAPerfil,
  editar: () => abrirFormulario("editar"),
  otro: entrarComoOtro,
  "volver-inicio": pintarInicio,
  "entrar-ya": irAlControl,
};
document.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-accion]");
  if (boton && acciones[boton.dataset.accion]) acciones[boton.dataset.accion]();
});
$("nombre").addEventListener("input", (e) => { borrador.nombre = e.target.value; pintarVista(); });
$("nombre").addEventListener("keydown", (e) => { if (e.key === "Enter") guardarFormulario(); });
document.querySelectorAll("#modos button").forEach((b) => b.addEventListener("click", () => { borrador.modo = b.dataset.modo; pintarModos(); }));

// --- Arranque ----------------------------------------------------------------------

if (consola) recordarConsola(consola, nombreConsola);
$("consola-nombre").textContent = consola ? (nombreConsola || consola) : "";
pintarInicio();

// Sin internet también: la puerta queda guardada en el celular.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
