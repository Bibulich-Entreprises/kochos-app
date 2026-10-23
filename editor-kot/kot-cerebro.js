// El cerebro de los Kots sueltos (cuando nadie los controla).
//
// Cómo funciona: cuando el Kot está de pie y sin nada que hacer, cada conducta dice cuántas "ganas" tiene de
// hacerse ahora (un número; 0 = no se puede). Se sortea una, pesando las ganas por el carácter del Kot, y corre
// hasta que su "actualizar" devuelve true o se le acaba el tiempo. Si lo tiran, la conducta se corta y al
// levantarse elige otra.
//
// Para agregar una conducta: copiá una de abajo, cambiale el nombre y listo; aparece sola en el sorteo.
// Para un carácter nuevo: agregalo en CARACTERES con cuánto multiplica las ganas de cada conducta.
//
// Lo que un Kot sabe hacer (k):
//   k.irA(punto, rapidez)   camina hacia {x, z}; devuelve la distancia que falta. rapidez: .3 lento, .9 normal, 1.4 corriendo
//   k.parar()               se queda quieto
//   k.mirar(punto)          gira la cabeza hacia {x, y, z} (null = mirar al frente)
//   k.encarar(punto)        gira el cuerpo hacia {x, z} sin caminar
//   k.pegar()               tira una trompada con el brazo que toque
//   k.saludar()             levanta un brazo un rato
//   k.posicion              dónde está {x, y, z}
//   k.casa                  su lugar en la plaza
//   k.otros()               los demás Kots que están de pie
//   k.cajas                 las cajas de la plaza ({ cuerpo } con cuerpo.position)
//   k.golpe                 el último golpe que recibió: { de: otro Kot o "mano", hace: segundos } (o null)
//   k.memoria               un objeto libre para que la conducta guarde lo que quiera

export const PLAZA = 3.2;   // radio de la plaza: si se va más lejos, vuelve

const azar = (a, b) => a + Math.random() * (b - a);
const distancia = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const masCercano = (k, lista) => lista.reduce((mejor, o) => (!mejor || distancia(k.posicion, o.posicion) < distancia(k.posicion, mejor.posicion) ? o : mejor), null);
const puntoEnLaPlaza = () => { const a = azar(0, Math.PI * 2), r = Math.sqrt(Math.random()) * PLAZA * .8; return { x: Math.sin(a) * r, z: Math.cos(a) * r + .4 }; };

export const CONDUCTAS = {
  volver: {
    texto: "Volviendo",
    ganas: (k) => (distancia(k.posicion, { x: 0, z: 0 }) > PLAZA ? 100 : 0),   // más que cualquier otra: siempre gana
    actualizar: (k) => k.irA(k.casa, .9) < .2,
  },

  quieto: {
    texto: "Mirando",
    ganas: () => 1,
    empezar: (k) => {
      k.memoria.hasta = azar(1.5, 4);
      // Mirar algo: otro Kot, una caja o la cámara.
      const cosas = [...k.otros().map((o) => o.posicion), ...k.cajas.map((c) => c.cuerpo.position), { x: 0, y: 2, z: 8 }];
      k.memoria.mira = cosas[Math.floor(Math.random() * cosas.length)];
    },
    actualizar: (k, t) => { k.parar(); k.mirar(k.memoria.mira); return t > k.memoria.hasta; },
  },

  pasear: {
    texto: "Paseando",
    ganas: () => 1.2,
    empezar: (k) => { k.memoria.a = puntoEnLaPlaza(); k.memoria.rapidez = azar(.4, .9); },
    actualizar: (k) => { k.mirar(null); return k.irA(k.memoria.a, k.memoria.rapidez) < .25; },
    tiempo: 8,
  },

  cajas: {
    texto: "Empujando una caja",
    ganas: (k) => (k.cajas.length ? .6 : 0),
    empezar: (k) => { k.memoria.caja = k.cajas[Math.floor(Math.random() * k.cajas.length)]; },
    // Camina hacia la caja y sigue de largo un rato: la empuja con el cuerpo.
    actualizar: (k, t) => {
      const caja = k.memoria.caja.cuerpo.position;
      k.mirar({ x: caja.x, y: .3, z: caja.z });
      if (k.irA(caja, .8) < .7) k.memoria.desde ??= t;
      return k.memoria.desde != null && t - k.memoria.desde > 2;   // 2 segundos contra la caja
    },
    tiempo: 9,
  },

  saludar: {
    texto: "Saludando",
    ganas: (k) => (k.otros().length ? .7 : 0),
    empezar: (k) => { k.memoria.otro = k.otros()[Math.floor(Math.random() * k.otros().length)]; },
    actualizar: (k, t) => {
      const otro = k.memoria.otro;
      k.mirar({ ...otro.posicion, y: 1.2 });
      if (!k.memoria.llego && k.irA(otro.posicion, .8) < 1) { k.memoria.llego = t; k.parar(); k.saludar(); }
      if (k.memoria.llego) k.encarar(otro.posicion);
      return k.memoria.llego && t - k.memoria.llego > 1.8;
    },
    tiempo: 8,
  },

  pelear: {
    texto: "Peleando",
    ganas: (k) => (k.otros().length ? .35 : 0),
    empezar: (k) => { k.memoria.otro = k.memoria.otro || masCercano(k, k.otros()); k.memoria.proxima = 0; },
    actualizar: (k, t) => pelearCon(k, t, k.memoria.otro, 3.5),
    tiempo: 7,
  },

  vengarse: {
    texto: "¡Venganza!",
    // Recién tirado por otro Kot: muchas ganas de devolverla.
    ganas: (k) => (k.golpe && k.golpe.de !== "mano" && k.golpe.hace < 4 && k.golpe.de.estaDePie ? 6 : 0),
    empezar: (k) => { k.memoria.otro = k.golpe.de; k.memoria.proxima = 0; },
    actualizar: (k, t) => pelearCon(k, t, k.memoria.otro, 4),
    tiempo: 8,
  },

  enojarse: {
    texto: "Enojado",
    // Lo tiraste con el dedo: te mira con bronca un rato.
    ganas: (k) => (k.golpe && k.golpe.de === "mano" && k.golpe.hace < 3 ? 4 : 0),
    empezar: (k) => { k.golpe = null; },
    actualizar: (k, t) => { k.parar(); k.encarar({ x: 0, z: 8 }); k.mirar({ x: 0, y: 2, z: 8 }); return t > 2; },
  },
};

/** Ir hasta el otro y tirarle trompadas un rato (las trompadas que llegan fuerte lo tiran). */
function pelearCon(k, t, otro, cuanto) {
  if (!otro || !otro.estaDePie) return true;
  k.mirar({ ...otro.posicion, y: 1.2 });
  const falta = k.irA(otro.posicion, 1.3);
  if (falta < .75) {
    k.parar();
    k.encarar(otro.posicion);
    if (t > k.memoria.proxima) { k.pegar(); k.memoria.proxima = t + azar(.35, .7); }
  }
  return t > cuanto + (k.memoria.llegada ??= t);
}

// Cuánto multiplica cada carácter las ganas de cada conducta (lo que no está, queda igual).
export const CARACTERES = {
  base: {},
  peleador: { pelear: 4, vengarse: 2, saludar: .3 },
  vago: { quieto: 4, pasear: .4, cajas: .2, pelear: .2 },
  curioso: { cajas: 3, pasear: 2, quieto: .5 },
  amigable: { saludar: 4, pelear: .1, vengarse: .3 },
};

export class Cerebro {
  constructor(kot, caracter = "base") {
    this.kot = kot;
    this.caracter = caracter;
    this.actual = null;
  }

  get texto() { return this.actual?.texto; }

  /** El Kot no puede pensar (lo tiraron, lo agarran): se corta lo que estaba haciendo. */
  interrumpir() {
    this.actual = null;
  }

  actualizar(dt) {
    const k = this.kot;
    if (!this.actual) this.elegir();
    if (!this.actual) return;
    this.t += dt;
    const termino = this.actual.actualizar(k, this.t);
    if (termino || this.t > (this.actual.tiempo ?? 10)) { this.actual = null; k.parar(); k.mirar(null); }
  }

  elegir() {
    const k = this.kot, pesos = CARACTERES[this.caracter] || {};
    const opciones = Object.entries(CONDUCTAS).map(([nombre, c]) => [c, c.ganas(k) * (pesos[nombre] ?? 1)]).filter(([, g]) => g > 0);
    let sorteo = Math.random() * opciones.reduce((s, [, g]) => s + g, 0);
    for (const [c, g] of opciones) {
      if ((sorteo -= g) > 0) continue;
      this.actual = c;
      this.t = 0;
      k.memoria = {};
      c.empezar?.(k);
      return;
    }
  }
}

// =====================================================================================================
// Tu sala (el celular): solo vos y tu Kot, como Clumsy Ninja. No sortea conductas: reacciona a lo que hacés.
//
//   Sin hacer nada: vuelve al centro, te mira y cada tanto mira para los lados. Si pasa un rato, se sienta.
//   Tocás una caja: va, la levanta, te la trae y festeja.
//   "Chocala": levanta la mano; si se la tocás, festeja. Si no, se pone triste.
//   Si lo maltratás (lo empujás, lo revoleás, lo tirás de arriba) varias veces seguidas, se enoja.
//
// Además de lo de arriba, el Kot sabe: k.sentar(sí/no), k.manoArriba(sí/no), k.festejar(), k.zapatear(sí/no),
// k.levantarCaja(cuerpo), k.soltarCaja(),
// k.modelo.ponerBoca("id de boca" o null para la suya).

export const SALA = {
  sentarseA: 15,        // segundos sin que hagas nada hasta que se sienta
  mirarLadosCada: [3, 6],
  enojoVeces: 3,        // maltratos...
  enojoEn: 10,          // ...en estos segundos = se enoja
  chocalaEspera: 6,
};

export class CerebroSala {
  constructor(kot, camara = { x: 0, y: 1.4, z: 8 }) {
    this.kot = kot;
    this.camara = camara;
    this.actual = null;       // { nombre, t, ... }
    this.quieto = 0;          // segundos sin que hagas nada
    this.maltratos = [];      // cuándo lo maltrataste
    this.reloj = 0;
    this.pendiente = "saludar";   // lo primero que hace al aparecer
  }

  get texto() {
    return { centro: "Volviendo", quieto: "Mirándote", lados: "Mirando", sentado: "Sentado", buscar: "Buscando la caja",
      saludar: "Saludando", chocala: "¡Chocala!", festejo: "¡Eso!", triste: "Te dejó colgado", enojado: "¡Enojado!" }[this.actual?.nombre];
  }

  /** Lo que pasa afuera: lo usa la página. */
  evento(tipo, dato) {
    if (tipo !== "chocalaVencida") this.quieto = 0;
    const enojado = this.actual?.nombre === "enojado";
    if (this.actual?.nombre === "sentado" && tipo !== "maltrato") this.hacer("saludar");   // lo despertaste
    if (tipo === "maltrato") {
      this.maltratos = this.maltratos.filter((t) => this.reloj - t < SALA.enojoEn).concat(this.reloj);
      if (this.maltratos.length >= SALA.enojoVeces) { this.pendiente = "enojado"; this.maltratos = []; }
    }
    if (enojado) return;   // enojado no te da bola
    if (tipo === "objeto") this.hacer("buscar", { caja: dato });
    if (tipo === "chocala") this.hacer("chocala");
    if (tipo === "manoTocada" && this.actual?.nombre === "chocala") this.hacer("festejo");
  }

  /** Lo tiraron o lo agarran: se corta lo que hacía (el enojo queda pendiente para cuando se levante). */
  interrumpir() {
    if (!this.actual) return;
    this.terminar();
  }

  hacer(nombre, datos = {}) {
    if (this.actual) this.terminar();
    this.actual = { nombre, t: 0, ...datos };
    const k = this.kot;
    if (nombre === "sentado") k.sentar(true);
    if (nombre === "saludar") k.saludar();
    if (nombre === "chocala") k.manoArriba(true);
    if (nombre === "festejo") { k.festejar(); k.modelo.ponerBoca("carcajada"); }
    if (nombre === "triste") k.modelo.ponerBoca("puchero");
    if (nombre === "enojado") { k.zapatear(true); k.modelo.ponerBoca("grito"); }
  }

  terminar() {
    const k = this.kot;
    k.sentar(false); k.manoArriba(false); k.zapatear(false); k.soltarCaja(); k.modelo.ponerBoca(null);
    k.parar(); k.mirar(null); k.encarar(null);
    this.actual = null;
  }

  actualizar(dt) {
    const k = this.kot, a = this.actual;
    this.reloj += dt;
    this.quieto += dt;
    if (!a) {
      const lejos = Math.hypot(k.posicion.x - k.casa.x, k.posicion.z - k.casa.z);
      if (this.pendiente) { this.hacer(this.pendiente); this.pendiente = null; }
      else if (lejos > .35) this.hacer("centro");
      else this.hacer("quieto", { proximo: azar(...SALA.mirarLadosCada) });
      return;
    }
    a.t += dt;
    const camara = this.camara;
    switch (a.nombre) {
      case "centro":
        k.mirar(null);
        if (k.irA(k.casa, .6) < .2 || a.t > 8) this.hacer("quieto", { proximo: azar(...SALA.mirarLadosCada) });
        break;

      case "quieto":
        k.encarar(camara); k.mirar(camara);
        if (this.quieto > SALA.sentarseA) this.hacer("sentado");
        else if (a.t > a.proximo) this.hacer("lados", { lado: Math.random() < .5 ? 1 : -1 });
        break;

      case "lados": {
        // Mira a un costado, después al otro, y vuelve a mirarte.
        const lado = a.t < 1.3 ? a.lado : -a.lado;
        k.mirar({ x: k.posicion.x + lado * 3, y: 1.1, z: k.posicion.z + 1 });
        if (a.t > 2.8) this.terminar();
        break;
      }

      case "sentado":
        k.encarar(camara);
        k.mirar(a.t % 8 < 6 ? camara : { x: k.posicion.x + 3, y: 1, z: k.posicion.z + 1 });
        break;

      case "buscar": {
        // Va hasta la caja, la levanta, te la trae y la deja adelante tuyo.
        const caja = a.caja.cuerpo;
        a.fase ??= "ir";
        if (a.fase === "ir") {
          k.mirar({ x: caja.position.x, y: .3, z: caja.position.z });
          const medida = caja.shapes[0].halfExtents;
          if (k.irA(caja.position, .9) < Math.hypot(medida.x, medida.z) + .35) { k.parar(); k.levantarCaja(caja); a.fase = "traer"; a.desde = a.t; }
        } else if (a.fase === "traer") {
          k.mirar(camara);
          if (a.t - a.desde > .6 && k.irA({ x: k.casa.x, z: k.casa.z + .8 }, .6) < .2) { k.soltarCaja(); a.fase = "listo"; a.desde = a.t; }
        } else {
          k.parar(); k.encarar(camara); k.mirar(camara);
          if (a.t - a.desde > 1) { this.terminar(); this.hacer("festejo"); }
        }
        if (a.t > 20) this.terminar();
        break;
      }

      case "saludar":
        k.parar(); k.encarar(camara); k.mirar(camara);
        if (a.t > 1.8) this.terminar();
        break;

      case "chocala":
        k.parar(); k.encarar(camara); k.mirar(camara);
        if (a.t > SALA.chocalaEspera) this.hacer("triste");
        break;

      case "festejo":
        k.mirar(camara);
        if (a.t > 1.6) this.terminar();
        break;

      case "triste":
        k.mirar({ x: k.posicion.x, y: 0, z: k.posicion.z + 2 });   // mira al piso
        if (a.t > 1.8) this.terminar();
        break;

      case "enojado":
        k.encarar(camara); k.mirar(camara);
        if (a.t > 3.5) this.terminar();
        break;
    }
  }
}
