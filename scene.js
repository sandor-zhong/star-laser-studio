import * as THREE from "./vendor/three.module.js";

const C = {
  hull: 0x171918,
  steel: 0x363a3a,
  graphite: 0x101313,
  edge: 0x56738c,
  cyan: 0x62f1ed,
  blue: 0x35a7d2,
  gold: 0xf2c77c,
  shadow: 0x061020,
};

const metallic = (color, roughness = 0.31, metalness = 0.77) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
const unlit = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1,
  });

function meshBox(w, h, d, m, x = 0, y = 0, z = 0) {
  const a = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  a.position.set(x, y, z);
  a.castShadow = true;
  a.receiveShadow = true;
  return a;
}
function tube(a, b, r, color) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const diff = new THREE.Vector3().subVectors(end, start);
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, diff.length(), 8),
    metallic(color),
  );
  m.position.copy(start).add(end).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
  return m;
}

export class LaserScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2("#171a18", 0.025);
    this.camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100);
    this.camera.position.set(6.4, 5.3, 12.8);
    this.camera.lookAt(0, 1.1, 0.25);
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    container.appendChild(this.renderer.domElement);
    this.pointer = { x: 0, y: 0 };
    this.activeCoin = null;
    this.finished = [];
    this.lastScan = -1;
    this.sparks = [];
    this.buildEnvironment();
    this.buildMachine();
    this.buildSparks();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    container.addEventListener("pointermove", (e) => {
      const r = container.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      this.pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    container.addEventListener("pointerleave", () => {
      this.pointer.x = this.pointer.y = 0;
    });
  }

  buildEnvironment() {
    this.scene.add(new THREE.HemisphereLight(0xdde0cc, 0x29231c, 2.0));
    const spotlight = new THREE.SpotLight(
      0xffe4b7,
      87,
      20,
      Math.PI / 4,
      0.7,
      1,
    );
    spotlight.position.set(-3, 8, 6);
    spotlight.target.position.set(0, 0, 0);
    spotlight.castShadow = true;
    spotlight.shadow.mapSize.set(1024, 1024);
    spotlight.shadow.bias = -0.0003;
    this.scene.add(spotlight, spotlight.target);
    const warmth = new THREE.PointLight(C.gold, 18, 13);
    warmth.position.set(4, 3, -3);
    this.scene.add(warmth);
    const backlight = new THREE.PointLight(C.blue, 16, 11);
    backlight.position.set(-3, 3, -3);
    this.scene.add(backlight);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({
        color: 0x292c29,
        roughness: 0.44,
        metalness: 0.28,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.43;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.scene.add(meshBox(26, 12, 0.3, metallic(0x202522, 0.95, 0.08), 0, 4, -5.8));
    for (let x = -12; x <= 12; x += 0.8)
      this.scene.add(meshBox(0.045, 12, 0.05, metallic(0x111714), x, 4, -5.6));
    this.scene.add(meshBox(7, 0.15, 1.3, metallic(0x44463e), 5, 5, -5));
    this.scene.add(meshBox(4.8, 0.07, 0.08, unlit(0x69fff1), 5, 4.8, -4.8));
    this.scene.add(meshBox(4, 3.2, 0.12, metallic(0x1c3733, 0.8, 0.2), 5, 2.8, -5.3));
    for (let x = 3.3; x < 6.8; x += 0.3) for (let y = 1.5; y < 4.2; y += 0.3)
      this.scene.add(meshBox(0.045, 0.045, 0.02, unlit(0x0a1211), x, y, -5.22));
    for (let i = 0; i < 5; i++) {
      this.scene.add(tube([3.5+i*0.55, 2, -5.05], [3.5+i*0.55, 3.7-i*0.12, -5.05], 0.045, 0xabb2aa));
      this.scene.add(meshBox(0.13, 0.5, 0.15, metallic(i%2 ? C.gold : 0x151a18), 3.5+i*0.55, 2, -5.04));
    }
    const atoms = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) {
      atoms[i * 3] = (Math.random() - 0.5) * 28;
      atoms[i * 3 + 1] = Math.random() * 12 - 0.1;
      atoms[i * 3 + 2] = -4 - Math.random() * 12;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(atoms, 3));
    this.floatingDust = new THREE.Points(
      geom,
      new THREE.PointsMaterial({
        color: 0x6bcadd,
        size: 0.035,
        transparent: true,
        opacity: 0.12,
        sizeAttenuation: true,
      }),
    );
    this.scene.add(this.floatingDust);
  }

  buildMachine() {
    this.machine = new THREE.Group();
    this.scene.add(this.machine);
    this.machine.scale.y = 1.45;
    const base = meshBox(6.2, 0.45, 3.7, metallic(C.hull), 0, -0.08, 0);
    this.machine.add(base);
    const skirting = meshBox(6.35, 0.09, 3.85, metallic(C.steel), 0, -0.34, 0);
    this.machine.add(skirting);
    const deck = meshBox(
      4.9,
      0.12,
      2.8,
      metallic(0x8a8d85, 0.36, 0.79),
      0,
      0.22,
      0.13,
    );
    this.machine.add(deck);
    const workplate = meshBox(
      3.15,
      0.065,
      2.45,
      metallic(0x9c9e95, 0.3, 0.85),
      0,
      0.335,
      0.25,
    );
    this.machine.add(workplate);
    for (let i = -3; i <= 3; i++) {
      const line = meshBox(
        0.025,
        0.012,
        2.7,
        metallic(0x333932),
        i * 0.47,
        0.386,
        0.13,
      );
      this.machine.add(line);
    }
    for (const xx of [-2.85, 2.85]) {
      for (const zz of [-1.5, 1.5]) {
        const post = meshBox(0.21, 3.22, 0.23, metallic(C.steel), xx, 1.48, zz);
        this.machine.add(post);
        const inset = meshBox(
          0.045,
          2.7,
          0.04,
          metallic(0x8d9188),
          xx + (xx < 0 ? 0.113 : -0.113),
          1.53,
          zz,
        );
        this.machine.add(inset);
        this.machine.add(
          meshBox(0.34, 0.24, 0.37, metallic(0x252925, 0.5), xx, 3.02, zz),
        );
      }
    }
    for (const zz of [-1.5, 1.5]) {
      this.machine.add(meshBox(5.9, 0.16, 0.2, metallic(C.steel), 0, 3.12, zz));
      this.machine.add(
        meshBox(5.75, 0.026, 0.045, unlit(0xffce82, 0.8), 0, 3.02, zz + 0.12),
      );
    }
    for (const xx of [-2.85, 2.85]) {
      this.machine.add(
        meshBox(0.17, 0.15, 3.0, metallic(0x2c302c), xx, 3.1, 0),
      );
    }
    this.machine.add(
      meshBox(5.8, 0.11, 0.19, metallic(0xadb1a8, 0.25), 0, 2.75, -0.4),
    );
    this.machine.add(
      meshBox(5.65, 0.04, 0.22, metallic(0xa6aaa3), 0, 2.65, -0.4),
    );
    const front = meshBox(2.15, 0.09, 0.16, metallic(0x42637b), 0, 0.04, 1.92);
    this.machine.add(front);
    // Workbed illumination lights and mechanical details.
    for (const xx of [-2.43, 2.43]) {
      for (const zz of [-1.21, 1.21]) {
        this.machine.add(
          meshBox(0.29, 0.05, 0.25, metallic(C.gold), xx, 0.37, zz),
        );
      }
    }
    const control = meshBox(
      0.81,
      0.3,
      0.41,
      metallic(C.graphite),
      2.12,
      0.08,
      1.27,
    );
    this.machine.add(control);
    for (let i = 0; i < 3; i++) {
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 9, 9),
        unlit(i ? C.cyan : C.gold),
      );
      led.position.set(1.91 + i * 0.21, 0.27, 1.43);
      this.machine.add(led);
    }
    this.buildEnclosure();
    this.head = new THREE.Group();
    this.machine.add(this.head);
    this.head.position.set(-1.0, 2.0, 0.32);
    this.head.add(
      meshBox(0.63, 0.65, 0.62, metallic(0x383d38, 0.4), 0, -0.06, -0.07),
    );
    this.head.add(
      meshBox(0.76, 0.11, 0.75, metallic(0xa1a59a), 0, 0.27, -0.07),
    );
    this.head.add(
      meshBox(0.23, 0.43, 0.22, metallic(C.gold, 0.18), 0, -0.47, 0.05),
    );
    for (let i=0; i<9; i++) this.head.add(meshBox(0.68,0.025,0.65,metallic(0x101612),0,-0.32+i*0.06,-0.07));
    this.head.add(meshBox(0.4,0.65,0.4,metallic(0x171c18),0,0.58,-0.07));
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.074, 0.35, 14),
      metallic(0xd1b57e, 0.23),
    );
    nozzle.position.set(0, -0.82, 0.05);
    this.head.add(nozzle);
    const lens = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.026, 8, 24),
      unlit(C.cyan),
    );
    lens.rotation.x = -Math.PI / 2;
    lens.position.set(0, -1.02, 0.05);
    this.head.add(lens);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.023, 0.18, 9, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x6dfff3,
        transparent: true,
        opacity: 0.87,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.beam.position.set(0, -1.12, 0.05);
    this.head.add(this.beam);
    this.beamHalo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.13, 0.18, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x25c5ee,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.beamHalo.position.copy(this.beam.position);
    this.head.add(this.beamHalo);
    const impact = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 8),
      new THREE.MeshBasicMaterial({
        color: 0xb7ffef,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
      }),
    );
    impact.position.set(0, -1.22, 0.05);
    this.head.add(impact);
    this.impact = impact;
    this.laserLight = new THREE.PointLight(C.cyan, 17, 3.2);
    this.laserLight.position.set(0, -1.1, 0.05);
    this.head.add(this.laserLight);
    this.setLaserActive(false);
    // Secondary front conveyor on which 3D mini-medals will travel.
    const belt = meshBox(
      6.0,
      0.25,
      1.1,
      metallic(0x171b18, 0.93, 0.1),
      0,
      -0.18,
      2.55,
    );
    this.machine.add(belt);
    for (const xx of [-3.03, 3.03]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.23, 0.23, 1.18, 22),
        metallic(0x52697a),
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(xx, -0.08, 2.55);
      this.machine.add(wheel);
    }
    for (const zz of [2.04, 3.06])
      this.machine.add(
        meshBox(6.1, 0.12, 0.1, metallic(0x50728a), 0, -0.02, zz),
      );
    for (let i = 0; i < 20; i++) {
      const s = meshBox(
        0.04,
        0.008,
        0.82,
        metallic(0x444940, 0.9, 0.1),
        -2.85 + i * 0.3,
        -0.036,
        2.55,
      );
      this.machine.add(s);
    }
    const machineName = makeTextPlate(
      "S T A R L I G H T   •   L A S E R",
      2.85,
      0.34,
    );
    machineName.position.set(0, -0.2, 1.93);
    machineName.rotation.x = -Math.PI / 6;
    this.machine.add(machineName);
  }

  buildEnclosure() {
    const black = metallic(0x1c201d, 0.4, 0.75);
    const silver = metallic(0xb8bbb1, 0.27, 0.86);
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xc7b98d, metalness: 0.1, roughness: 0.1,
      transparent: true, opacity: 0.075, depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.machine.add(meshBox(5.5, 0.025, 2.85, glass, 0, 3.16, 0));
    for (const x of [-2.85, 2.85]) {
      this.machine.add(meshBox(0.025, 2.8, 2.85, glass, x, 1.58, 0));
      this.machine.add(meshBox(0.19, 0.16, 3.2, black, x, 0.37, 0));
      this.machine.add(tube([x*0.79, 0.65, -1.35], [x*0.79, 0.65, 1.35], 0.065, 0xa9aaa0));
      for (const z of [-1.35, 1.35]) {
        this.machine.add(meshBox(0.35, 0.3, 0.25, silver, x*0.79, 0.65, z));
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.12, 24), silver);
        foot.position.set(x, -0.48, z);
        this.machine.add(foot);
      }
    }
    this.machine.add(meshBox(5.5, 0.35, 0.025, glass, 0, 2.82, 1.49));
    for (const y of [0.5, 3.08]) for (const x of [-2.84, 2.84]) {
      this.machine.add(meshBox(0.46, 0.38, 0.1, black, x, y, 1.65));
      for (const dx of [-0.13, 0.13]) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 6), silver);
        bolt.rotation.x = Math.PI/2;
        bolt.position.set(x+dx, y, 1.72);
        this.machine.add(bolt);
      }
    }
    for (const y of [1.35, 1.7]) {
      this.machine.add(tube([-2.6, y, -0.55], [2.6, y, -0.55], 0.055, 0xbcc0b7));
      for(let x=-2.55; x<2.6; x+=0.09) {
        const thread = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.014, 4, 8), silver);
        thread.rotation.y = Math.PI/2;
        thread.position.set(x,y,-0.55);
        this.machine.add(thread);
      }
    }
    for (const x of [-2.45, 2.45]) {
      this.machine.add(meshBox(0.44, 0.5, 0.5, black, x, 1.5, -0.55));
      this.machine.add(meshBox(0.47, 0.06, 0.53, silver, x, 1.78, -0.55));
    }
    for(let i=0;i<22;i++) {
      const t=i/21*Math.PI;
      this.machine.add(meshBox(0.21,0.18,0.24,black,0.35+1.8*Math.sin(t),2.35+0.43*Math.cos(t),-0.18));
    }
    for (const x of [-0.3,0.3])
      this.machine.add(tube([x,0.9,-0.3],[x,2.7,-0.3],0.055,0xb1b5ab));
    for (const z of [-0.6,1.2]) for (const x of [-1.25,1.25]) {
      const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.095,0.095,0.2,16),silver);
      clamp.position.set(x,0.52,z); this.machine.add(clamp);
    }
    for (let i=0;i<3;i++) {
      const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.42,0.07,48),metallic(C.gold,0.28));
      blank.position.set(-1.95,0.45,0.9-i*0.9); this.machine.add(blank);
    }
  }

  buildSparks() {
    this.sparks = [];
    for (let i = 0; i < 22; i++) {
      const radius = i % 4 === 0 ? 0.026 : 0.012;
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 5, 5),
        unlit(i % 3 === 0 ? C.gold : C.cyan),
      );
      this.head.add(p);
      this.sparks.push(p);
      p.visible = false;
    }
  }

  setLaserActive(on) {
    this.beam.visible = on;
    this.beamHalo.visible = on;
    this.impact.visible = on;
    this.laserLight.visible = on;
    for (const s of this.sparks) s.visible = on;
  }

  makeCoin(portraitCanvas, blank = true) {
    const group = new THREE.Group();
    const gold = metallic(0xdcae62, 0.2, 0.85);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.08, 1.08, 0.21, 80),
      gold,
    );
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    const side = new THREE.Mesh(
      new THREE.CylinderGeometry(0.99, 1.0, 0.23, 80),
      metallic(0x2d465d, 0.26, 0.78),
    );
    side.position.y = 0.015;
    group.add(side);
    const inset = new THREE.Mesh(
      new THREE.CylinderGeometry(0.94, 0.94, 0.01, 72),
      metallic(0x0e293e, 0.35, 0.75),
    );
    inset.position.y = 0.131;
    group.add(inset);
    for (const [radius, width, color] of [
      [1.025, 0.075, C.gold],
      [0.953, 0.021, 0xffe9b9],
    ]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, width, 12, 84),
        metallic(color, 0.2, 0.77),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.155;
      group.add(ring);
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 320;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(
      this.renderer.capabilities.getMaxAnisotropy(),
      4,
    );
    const photo = new THREE.Mesh(
      new THREE.CircleGeometry(0.928, 76),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
    );
    photo.rotation.x = -Math.PI / 2;
    photo.position.y = 0.151;
    group.add(photo);
    const motif = new THREE.Mesh(
      new THREE.TorusGeometry(1.13, 0.018, 7, 70),
      new THREE.MeshBasicMaterial({
        color: C.cyan,
        transparent: true,
        opacity: 0.16,
      }),
    );
    motif.rotation.x = -Math.PI / 2;
    motif.position.y = 0.02;
    group.add(motif);
    group.position.set(0, 0.61, 0.37);
    const coin = {
      group,
      texture,
      canvas,
      ctx: canvas.getContext("2d"),
      portraitCanvas,
      motif,
    };
    this.paintCoin(coin, blank ? 0 : 1);
    return coin;
  }

  paintCoin(coin, amount) {
    const { ctx, canvas, portraitCanvas } = coin;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(160, 160, 160, 0, Math.PI * 2);
    ctx.clip();
    const background = ctx.createLinearGradient(0, 0, 320, 320);
    background.addColorStop(0, "#e4c583");
    background.addColorStop(1, "#9d773c");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 320, 320);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#7dd8de";
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(0, 30 + i * 38, 320, 1);
    }
    ctx.globalAlpha = 1;
    if (amount > 0) {
      const width = Math.floor(320 * Math.min(1, amount));
      ctx.drawImage(portraitCanvas, 0, 0, width, 320, 0, 0, width, 320);
      if (amount < 1) {
        const glow = ctx.createLinearGradient(width - 16, 0, width + 5, 0);
        glow.addColorStop(0, "#79eaff00");
        glow.addColorStop(0.7, "#9bfff4a0");
        glow.addColorStop(1, "#fff5be");
        ctx.fillStyle = glow;
        ctx.fillRect(Math.max(0, width - 16), 0, 23, 320);
      }
    }
    ctx.restore();
    coin.texture.needsUpdate = true;
  }

  prepare(portraitCanvas) {
    if (this.activeCoin) {
      this.machine.remove(this.activeCoin.group);
      this.releaseCoin(this.activeCoin);
    }
    this.activeCoin = this.makeCoin(portraitCanvas, true);
    this.machine.add(this.activeCoin.group);
    this.activeCoin.group.position.x = -3.3;
    this.activeCoin.group.scale.setScalar(0.9);
    this.lastScan = -1;
    this.setLaserActive(false);
  }

  updateEngraving(elapsed) {
    if (!this.activeCoin) return;
    const coin = this.activeCoin;
    if (elapsed < 0.2) {
      const t = easeOut(Math.max(0, elapsed / 0.2));
      coin.group.position.x = -3.3 * (1 - t);
      coin.group.scale.setScalar(0.9 + 0.1 * t);
      this.head.position.x = -1.2;
      this.setLaserActive(false);
      return;
    }
    coin.group.position.x = 0;
    coin.group.scale.setScalar(1);
    if (elapsed < 1.1) {
      const t = Math.max(0, Math.min(1, (elapsed - 0.2) / 0.9));
      const reveal = t;
      // A single pass over the face is deliberately fast and reproducible.
      this.head.position.x = -0.89 + 1.78 * t;
      this.setLaserActive(true);
      this.impact.scale.setScalar(0.7 + Math.random() * 0.5);
      this.beam.material.opacity = 0.65 + Math.random() * 0.2;
      if (reveal - this.lastScan > 0.013 || reveal === 1) {
        this.paintCoin(coin, reveal);
        this.lastScan = reveal;
      }
      for (let i = 0; i < this.sparks.length; i++) {
        const s = this.sparks[i];
        const v = (i + 1) * 0.87;
        const angle = elapsed * 17 + v;
        const r = 0.04 + (Math.sin(elapsed * 21 + i * 2) * 0.5 + 0.5) * 0.36;
        s.position.set(
          Math.cos(angle) * r,
          -1.22 + Math.sin(angle * 0.9) * r * 0.6,
          Math.sin(angle) * r,
        );
        s.scale.setScalar(0.6 + Math.abs(Math.sin(elapsed * 14 + i)) * 1.7);
      }
      return;
    }
    this.setLaserActive(false);
    this.head.position.x = 1.2;
    this.paintCoinIfNotDone(coin);
    if (elapsed < 1.4) {
      const t = (elapsed - 1.1) / 0.3;
      coin.motif.material.opacity = 0.25 + 0.4 * Math.sin(t * Math.PI);
      coin.group.position.y = 0.61 + 0.07 * Math.sin(t * Math.PI);
      coin.group.rotation.y = Math.sin(t * 4) * 0.11;
    } else {
      const t = (elapsed - 1.4) / 0.1;
      coin.group.position.y = 0.61;
      coin.group.position.x = easeOut(t) * 0.7;
      coin.group.rotation.y = 0;
    }
  }

  paintCoinIfNotDone(coin) {
    if (this.lastScan < 1) {
      this.paintCoin(coin, 1);
      this.lastScan = 1;
    }
  }

  complete() {
    if (!this.activeCoin) return;
    const coin = this.activeCoin;
    this.activeCoin = null;
    this.setLaserActive(false);
    this.paintCoin(coin, 1);
    coin.motif.material.opacity = 0.32;
    this.finished.unshift({ coin, age: 0 });
    if (this.finished.length > 7) {
      const old = this.finished.pop();
      this.machine.remove(old.coin.group);
      this.releaseCoin(old.coin);
    }
  }

  update(delta, now) {
    if (this.floatingDust) this.floatingDust.rotation.y = now * 0.006;
    for (let i = 0; i < this.finished.length; i++) {
      const item = this.finished[i];
      item.age += delta;
      const t = Math.min(item.age / 0.68, 1);
      const destX = 2.25 - i * 0.93;
      const destZ = 2.54;
      const startX = 0.7;
      item.coin.group.position.x = startX + (destX - startX) * easeOut(t);
      item.coin.group.position.z = 0.37 + (destZ - 0.37) * easeOut(t);
      item.coin.group.position.y = 0.61 + (-0.03 - 0.61) * easeOut(t);
      const scale = 1 - 0.64 * easeOut(t);
      item.coin.group.scale.setScalar(scale);
      item.coin.group.rotation.y = 0;
      item.coin.group.rotation.z = 0;
    }
    // Tiny drifting camera movement: enough to show depth, not enough to distract.
    const x = 6.4 + this.pointer.x * 0.35 + Math.sin(now * 0.22) * 0.11;
    const y = 5.3 - this.pointer.y * 0.2 + Math.cos(now * 0.19) * 0.09;
    this.camera.position.lerp(new THREE.Vector3(x, y, 12.8), 0.035);
    this.camera.lookAt(0, 1.6, 0.34);
    this.renderer.render(this.scene, this.camera);
  }

  releaseCoin(coin) {
    coin.texture.dispose();
    coin.group.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
  }
  reset() {
    this.setLaserActive(false);
    if (this.activeCoin) {
      this.machine.remove(this.activeCoin.group);
      this.releaseCoin(this.activeCoin);
      this.activeCoin = null;
    }
    for (const obj of this.finished) {
      this.machine.remove(obj.coin.group);
      this.releaseCoin(obj.coin);
    }
    this.finished = [];
    this.head.position.x = -1.1;
  }
  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    // Tall render windows need a wider FOV to fit the gantry in the portrait crop.
    this.camera.fov = h / w > 1.2 ? 42 : 37;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}

function easeOut(t) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}
function makeTextPlate(text, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = 700;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#101f31";
  ctx.fillRect(0, 0, 700, 80);
  ctx.fillStyle = "#d0ba89";
  ctx.textAlign = "center";
  ctx.font = "bold 26px monospace";
  ctx.fillText(text, 350, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  plate.rotation.x = -Math.PI / 2;
  return plate;
}
