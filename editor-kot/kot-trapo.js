// kot-trapo.js: el Kot del editor se vuelve ragdoll cuando lo agarrás o lo empujás con el dedo, y después se levanta solo.
// Mientras está de pie lo mueven los clips del Stickman (kot-modelo.js, Animador). Al tocarlo se arma un ragdoll de cannon-es
// en la pose de ese momento; cuando queda quieto, los huesos vuelven mezclándose al clip de reposo.
// Es una versión liviana del ragdoll de ragdoll-kot.html (mismas partes, sin músculos ni cerebro).
import * as THREE from "three";
import * as CANNON from "cannon-es";

// Las partes del ragdoll (las mismas que ragdoll-kot.html). Los huesos que no están (dedos, puntas) siguen a su padre.
const PARTES = [
  // Pelvis y torso van en una sola pieza: si la cintura se dobla, la piel del Stickman se estira como un globo.
  { n: "torso", huesos: ["root_x", "spine_01_x", "spine_02_x", "spine_03_x", "shoulder_l", "shoulder_r"], desde: "spine_01_x", hasta: "neck_x", masa: 24 },
  { n: "cabeza", padre: "torso", huesos: ["neck_x", "head_x"], desde: "neck_x", masa: 5, cono: .5 },
  { n: "brazo_izq", padre: "torso", huesos: ["c_arm_twist_offset_l", "arm_stretch_l"], desde: "c_arm_twist_offset_l", hasta: "forearm_stretch_l", masa: 2.5, cono: 1.5 },
  { n: "antebrazo_izq", padre: "brazo_izq", huesos: ["forearm_stretch_l", "forearm_twist_l", "hand_l"], desde: "forearm_stretch_l", hasta: "hand_l", masa: 1.8, cono: 1.3 },
  { n: "brazo_der", padre: "torso", huesos: ["c_arm_twist_offset_r", "arm_stretch_r"], desde: "c_arm_twist_offset_r", hasta: "forearm_stretch_r", masa: 2.5, cono: 1.5 },
  { n: "antebrazo_der", padre: "brazo_der", huesos: ["forearm_stretch_r", "forearm_twist_r", "hand_r"], desde: "forearm_stretch_r", hasta: "hand_r", masa: 1.8, cono: 1.3 },
  { n: "muslo_izq", padre: "torso", huesos: ["thigh_twist_l", "thigh_stretch_l"], desde: "thigh_twist_l", hasta: "leg_stretch_l", masa: 5, cono: 1.0 },
  { n: "pierna_izq", padre: "muslo_izq", huesos: ["leg_stretch_l", "leg_twist_l", "foot_l"], desde: "leg_stretch_l", hasta: "foot_l", masa: 3.5, cono: 1.2 },
  { n: "muslo_der", padre: "torso", huesos: ["thigh_twist_r", "thigh_stretch_r"], desde: "thigh_twist_r", hasta: "leg_stretch_r", masa: 5, cono: 1.0 },
  { n: "pierna_der", padre: "muslo_der", huesos: ["leg_stretch_r", "leg_twist_r", "foot_r"], desde: "leg_stretch_r", hasta: "foot_r", masa: 3.5, cono: 1.2 },
];
const QUIETO = 1.1;        // segundos quieto (y suelto) antes de levantarse
const MAX_TRAPO = 3.5;     // aunque se siga moviendo, a los 3,5 s se levanta igual
const LEVANTARSE = .9;     // lo que tarda en volver al clip
const LIMITE = .85;       // no se va más lejos que esto del centro (la vista del editor es chica)
const VEL_MANO = 5;        // m/s: lo más rápido que lo lleva el dedo
const VEL_MAX = 7;         // m/s: tope de cualquier parte (soltarlo revoleado no lo saca de la vista)

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _uno = new THREE.Vector3(1, 1, 1);
const aVec = (v) => new CANNON.Vec3(v.x, v.y, v.z);
const percentil = (l, p) => [...l].sort((a, b) => a - b)[Math.min(l.length - 1, Math.floor(p * l.length))];

export class Trapo {
  constructor(modelo) {
    this.modelo = modelo;
    this.kot = modelo.kotModelo;
    this.estado = "pie";   // "pie" | "trapo" | "levantando"
    this.reloj = 0; this.quieto = 0;
    this.mano = null; this.union = null;
    this.mundo = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.8, 0) });
    this.mundo.solver.iterations = 30;
    this.mundo.defaultContactMaterial.friction = .7;
    this.mundo.defaultContactMaterial.restitution = 0;
    const piso = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    piso.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.mundo.addBody(piso);
    this.huesoPor = {};
    this.kot.traverse((o) => { if (o.isBone) this.huesoPor[o.name] = o; });
    this.medir();
    this.giros = [];
    this.acumulado = 0;
    this.rigidezGiro = 80;  // qué tan fuerte vuelve el giro de brazos y piernas a su lugar
  }

  /** Antes de cada paso (antes de que el solver resuelva articulaciones y choques): lleva a cero el giro de cada parte sobre su eje respecto de su padre (un resorte con freno).
   *  Los cuerpos se arman sin rotar, así que el eje vale igual en el marco del padre y del hijo. */
  enderezarGiros() {
    for (const { padre, hijo, eje } of this.giros) {
      const rel = padre.quaternion.conjugate().mult(hijo.quaternion);
      const proyeccion = rel.x * eje.x + rel.y * eje.y + rel.z * eje.z;
      let angulo = 2 * Math.atan2(proyeccion, rel.w);
      if (angulo > Math.PI) angulo -= 2 * Math.PI; else if (angulo < -Math.PI) angulo += 2 * Math.PI;
      const ejeMundo = padre.quaternion.vmult(eje);
      const rapidez = hijo.angularVelocity.vsub(padre.angularVelocity).dot(ejeMundo);
      // Cuánto tiene que cambiar el giro relativo en este paso; se reparte entre los dos según su masa.
      const correccion = (-angulo * this.rigidezGiro - rapidez) * .8;
      const total = hijo.invMass + padre.invMass || 1;
      hijo.angularVelocity.vadd(ejeMundo.scale(correccion * hijo.invMass / total), hijo.angularVelocity);
      padre.angularVelocity.vsub(ejeMundo.scale(correccion * padre.invMass / total), padre.angularVelocity);
    }
  }

  junta(n) { return this.huesoPor[n].getWorldPosition(new THREE.Vector3()); }
  /** Hacia dónde va la parte: de su junta a la siguiente; la cabeza, a lo largo del hueso del cuello. */
  direccion(p) {
    if (p.hasta) return this.junta(p.hasta).sub(this.junta(p.desde)).normalize();
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.huesoPor[p.desde].getWorldQuaternion(_q)).normalize();
  }

  /** Grosor y largo de cada parte, medidos una vez sobre la piel (cuerpo y cabeza). */
  medir() {
    this.kot.updateMatrixWorld(true);
    const deParte = {};
    for (const p of PARTES) for (const h of p.huesos) deParte[h] = p.n;
    for (const o of Object.values(this.huesoPor)) {
      if (deParte[o.name]) continue;
      for (let a = o.parent; a?.isBone; a = a.parent) if (deParte[a.name]) { deParte[o.name] = deParte[a.name]; break; }
    }
    this.deParte = deParte;
    const vertices = Object.fromEntries(PARTES.map((p) => [p.n, []]));
    for (const m of this.modelo.formas.filter((f) => f.isSkinnedMesh)) {
      const ind = m.geometry.attributes.skinIndex, pes = m.geometry.attributes.skinWeight, v = new THREE.Vector3();
      for (let i = 0; i < ind.count; i += 2) {
        let mejor = 0;
        for (let k = 1; k < 4; k++) if (pes.getComponent(i, k) > pes.getComponent(i, mejor)) mejor = k;
        const parte = deParte[m.skeleton.bones[ind.getComponent(i, mejor)].name];
        if (!parte) continue;
        m.getVertexPosition(i, v);
        vertices[parte].push(v.clone().applyMatrix4(m.matrixWorld));
      }
    }
    this.medidas = {};
    for (const p of PARTES) {
      const a = this.junta(p.desde), d = this.direccion(p), largo = [], radial = [];
      for (const v of vertices[p.n]) {
        const r = v.clone().sub(a), t = r.dot(d);
        largo.push(t);
        radial.push(r.addScaledVector(d, -t).length());
      }
      if (!largo.length) { this.medidas[p.n] = { radio: .08, t0: 0, t1: .2 }; continue; }
      const radio = Math.max(.04, percentil(radial, .5) * .85);
      const t0 = percentil(largo, .02) + radio, t1 = Math.max(t0, percentil(largo, .98) - radio);
      this.medidas[p.n] = { radio, t0, t1 };
    }
  }

  get activo() { return this.estado !== "pie"; }

  /** ¿El rayo toca al Kot? Devuelve la parte y el punto (en el mundo), o null. Sirve de pie y tirado. */
  tocar(rayo) {
    this.kot.updateMatrixWorld(true);
    let mejor = null;
    const enRayo = new THREE.Vector3(), enParte = new THREE.Vector3();
    for (const p of PARTES) {
      const { radio, t0, t1 } = this.medidas[p.n];
      const a = this.junta(p.desde), d = this.direccion(p);
      const ini = a.clone().addScaledVector(d, t0 - radio), fin = a.clone().addScaledVector(d, t1 + radio);
      const dist2 = rayo.distanceSqToSegment(ini, fin, enRayo, enParte);
      const margen = radio + .07;
      if (dist2 < margen * margen) {
        const lejos = enRayo.distanceTo(rayo.origin);
        if (!mejor || lejos < mejor.lejos) mejor = { parte: p.n, punto: enParte.clone(), lejos };
      }
    }
    return mejor;
  }

  /** Arma el ragdoll en la pose que tiene ahora (la del clip). */
  activar() {
    if (this.estado === "trapo") return;
    this.kot.updateMatrixWorld(true);
    for (const b of [...this.mundo.bodies]) if (b.mass > 0) this.mundo.removeBody(b);
    for (const c of [...this.mundo.constraints]) this.mundo.removeConstraint(c);
    this.partes = {};
    this.giros = [];
    for (const p of PARTES) {
      const { radio, t0, t1 } = this.medidas[p.n];
      const a = this.junta(p.desde), d = this.direccion(p);
      const centro = a.clone().addScaledVector(d, (t0 + t1) / 2);
      const cuerpo = new CANNON.Body({ mass: p.masa, position: aVec(centro), linearDamping: .12, angularDamping: .6 });
      const n = Math.max(1, Math.ceil((t1 - t0) / (radio * .8)) + 1);
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1) - .5) * (t1 - t0);
        cuerpo.addShape(new CANNON.Sphere(radio), aVec(d.clone().multiplyScalar(t)));
      }
      // Una fila de esferas casi no tiene inercia para girar sobre su largo: cualquier roce la hace dar vueltas y
      // la piel se retuerce. Se le da la misma inercia en los tres ejes (la mayor).
      cuerpo.updateMassProperties();
      const inercia = Math.max(cuerpo.inertia.x, cuerpo.inertia.y, cuerpo.inertia.z);
      cuerpo.inertia.set(inercia, inercia, inercia);
      cuerpo.invInertia.set(1 / inercia, 1 / inercia, 1 / inercia);
      cuerpo.updateInertiaWorld(true);
      // Todas las partes chocan entre sí (si no, se atraviesa a sí mismo); las unidas por una articulación no
      // (collideConnected). Solo los dos muslos se ignoran: arrancan pegados en la cadera y se empujarían al armarse.
      const muslo = p.n.startsWith("muslo");
      cuerpo.collisionFilterGroup = muslo ? 4 : 2;
      cuerpo.collisionFilterMask = muslo ? 1 | 2 : 1 | 2 | 4;
      this.mundo.addBody(cuerpo);
      this.partes[p.n] = { ...p, cuerpo, d };
    }
    for (const p of PARTES) {
      if (!p.padre) continue;
      const hijo = this.partes[p.n].cuerpo, padre = this.partes[p.padre].cuerpo;
      const punto = aVec(this.junta(p.desde)), eje = aVec(this.partes[p.n].d);
      const union = new CANNON.ConeTwistConstraint(padre, hijo, {
        pivotA: punto.vsub(padre.position), pivotB: punto.vsub(hijo.position), axisA: eje, axisB: eje,
        angle: p.cono, twistAngle: .5, collideConnected: false,
      });
      // El límite de giro (twist) de cannon hace vibrar brazos y piernas sin parar: se apaga y el giro sobre el
      // eje del hueso lo corrige un resorte suave (enderezarGiros), así la piel no se retuerce.
      union.twistEquation.enabled = false;
      this.mundo.addConstraint(union);
      this.giros.push({ padre, hijo, eje });
    }
    // Cada hueso queda pegado a su parte en la pose de este momento.
    this.huesos = [];
    this.kot.traverse((o) => {
      if (!o.isBone) return;
      const parte = this.partes[this.deParte[o.name]];
      if (!parte) return;
      const base = new THREE.Matrix4().compose(_v.copy(parte.cuerpo.position), new THREE.Quaternion(), _uno);
      this.huesos.push({ hueso: o, cuerpo: parte.cuerpo, parte: parte.n, desfase: base.invert().multiply(o.matrixWorld) });
    });
    this.estado = "trapo"; this.reloj = 0; this.quieto = 0;
  }

  /** Toque corto: un empujón desde la cámara hacia adentro. */
  empujar(parte, punto, direccion, fuerza = 1) {
    this.activar();
    const cuerpo = this.partes[parte]?.cuerpo || this.partes.torso.cuerpo;
    const d = new CANNON.Vec3(direccion.x, 0, direccion.z);
    d.normalize();
    const impulso = d.scale(2.6).vadd(new CANNON.Vec3(0, .9, 0)).scale(cuerpo.mass * fuerza);
    cuerpo.applyImpulse(impulso, aVec(punto).vsub(cuerpo.position));
  }

  /** Lo agarra de la parte tocada: queda colgando del dedo. */
  agarrar(parte, punto) {
    this.activar();
    this.soltar();
    const cuerpo = this.partes[parte].cuerpo;
    this.mano = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, position: aVec(punto) });
    this.mano.collisionFilterGroup = 0; this.mano.collisionFilterMask = 0;
    this.mundo.addBody(this.mano);
    // El agarre va sobre la línea del medio de la parte: tomado del borde, el peso del cuerpo la hace girar sobre sí.
    const local = cuerpo.quaternion.inverse().vmult(aVec(punto).vsub(cuerpo.position));
    const eje = aVec(this.partes[parte].d);
    eje.scale(local.dot(eje), local);
    this.union = new CANNON.PointToPointConstraint(cuerpo, local, this.mano, new CANNON.Vec3(), 250);
    this.mundo.addConstraint(this.union);
    this.destino = punto.clone();
  }
  mover(punto) {
    if (!this.mano) return;
    this.destino.set(Math.max(-LIMITE, Math.min(LIMITE, punto.x)), Math.max(.15, Math.min(2.6, punto.y)), Math.max(-LIMITE, Math.min(LIMITE, punto.z)));
  }
  soltar() {
    if (this.union) this.mundo.removeConstraint(this.union);
    if (this.mano) this.mundo.removeBody(this.mano);
    this.union = this.mano = null;
  }
  get agarrado() { return !!this.mano; }

  /** Avanza la física y copia los huesos. Va después de actualizar el clip (lo pisa mientras está tirado). */
  paso(dt) {
    if (this.estado === "pie") return false;
    if (this.estado === "levantando") return this.levantar(dt);
    if (this.mano) {
      // La mano sigue al dedo con una velocidad con tope: un tirón rápido no lo manda a volar fuera de la vista.
      const p = this.mano.position, inv = 1 / Math.max(dt, 1e-3);
      const v = new CANNON.Vec3((this.destino.x - p.x) * inv * .5, (this.destino.y - p.y) * inv * .5, (this.destino.z - p.z) * inv * .5);
      const largo = v.length();
      if (largo > VEL_MANO) v.scale(VEL_MANO / largo, v);
      this.mano.velocity.copy(v);
    }
    // Pasos fijos a mano (no step con subpasos): así el resorte de giro entra antes del solver en cada uno.
    this.acumulado = Math.min(this.acumulado + dt, 4 / 90);
    while (this.acumulado >= 1 / 90) {
      this.enderezarGiros();
      this.mundo.step(1 / 90);
      this.acumulado -= 1 / 90;
    }
    // Que no se vaya de la vista: una pared blanda alrededor, techo y velocidad con tope.
    for (const { cuerpo } of Object.values(this.partes)) {
      const rapidez = cuerpo.velocity.length();
      if (rapidez > VEL_MAX) cuerpo.velocity.scale(VEL_MAX / rapidez, cuerpo.velocity);
      if (cuerpo.position.y > 2.6 && cuerpo.velocity.y > 0) cuerpo.velocity.y *= .5;
      for (const eje of ["x", "z"]) {
        const fuera = Math.abs(cuerpo.position[eje]) - LIMITE;
        if (fuera > 0) cuerpo.velocity[eje] -= Math.sign(cuerpo.position[eje]) * fuera * 30 * dt;
      }
    }
    this.sincronizar();
    this.reloj += dt;
    let rapido = 0;
    for (const { cuerpo } of Object.values(this.partes)) rapido = Math.max(rapido, cuerpo.velocity.length());
    this.quieto = !this.mano && rapido < .5 ? this.quieto + dt : 0;
    if (!this.mano && (this.quieto > QUIETO || this.reloj > MAX_TRAPO + (this.quieto > 0 ? 0 : 1))) this.empezarALevantarse();
    return true;
  }

  /** Cómo se ve cada parte: la rotación de la física sin el giro sobre su propio eje respecto del padre
   *  (swing sin twist). Aunque la física lo gire, la piel de brazos y piernas no se retuerce. */
  rotacionesVisibles() {
    const vista = {};
    for (const p of PARTES) {
      const q = this.partes[p.n].cuerpo.quaternion;
      if (!p.padre) { vista[p.n] = new THREE.Quaternion(q.x, q.y, q.z, q.w); continue; }
      const qp = this.partes[p.padre].cuerpo.quaternion, d = this.partes[p.n].d;
      const rel = new THREE.Quaternion(-qp.x, -qp.y, -qp.z, qp.w).multiply(new THREE.Quaternion(q.x, q.y, q.z, q.w));
      const proy = rel.x * d.x + rel.y * d.y + rel.z * d.z;
      const giro = new THREE.Quaternion(d.x * proy, d.y * proy, d.z * proy, rel.w);
      if (giro.lengthSq() < 1e-9) giro.identity(); else giro.normalize();
      vista[p.n] = vista[p.padre].clone().multiply(rel.multiply(giro.invert()));
    }
    return vista;
  }

  sincronizar() {
    const vista = this.rotacionesVisibles();
    for (const { hueso, cuerpo, parte, desfase } of this.huesos) {
      _m.compose(_v.set(cuerpo.position.x, cuerpo.position.y, cuerpo.position.z), vista[parte], _uno).multiply(desfase);
      _inv.copy(hueso.parent.matrixWorld).invert();
      hueso.matrix.multiplyMatrices(_inv, _m);
      hueso.matrix.decompose(hueso.position, hueso.quaternion, hueso.scale);
      hueso.matrixWorld.copy(_m);
    }
  }

  /** Foto de la pose tirada: de acá se mezcla hacia el clip. */
  empezarALevantarse() {
    this.soltar();
    this.foto = Object.values(this.huesoPor).map((h) => ({ h, p: h.position.clone(), q: h.quaternion.clone(), s: h.scale.clone() }));
    this.estado = "levantando"; this.reloj = 0;
    this.alLevantarse?.();
  }

  levantar(dt) {
    this.reloj += dt;
    const x = Math.min(1, this.reloj / LEVANTARSE), k = x * x * (3 - 2 * x);
    // El clip ya puso su pose en los huesos: se mezcla de la foto hacia ella.
    for (const { h, p, q, s } of this.foto) {
      _v.copy(h.position); h.position.copy(p).lerp(_v, k);
      _q.copy(h.quaternion); h.quaternion.copy(q).slerp(_q, k);
      _v.copy(h.scale); h.scale.copy(s).lerp(_v, k);
    }
    if (x >= 1) { this.estado = "pie"; this.foto = null; }
    return true;
  }
}
