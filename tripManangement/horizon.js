/* The globe on the Trips tab, in the new design ("Horizon"): the Earth at night, a glowing arc from home to the
   trip on screen with a plane flying it, and a point for every place you have been. It turns to face the trip
   you pick. Loaded only in the new design (core.js loads it); the classic design never fetches three.js. */
import * as THREE from 'three';

const EARTH = 'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-night.jpg';
let live = null;   // {canvas, api}: one renderer, kept while the page lives

function create(canvas){
  let R;
  try{ R = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true}); }catch(e){ return null; }
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  R.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(35, 1, .1, 100);
  cam.position.set(0, 0, 4.4);
  const earth = new THREE.Group(); scene.add(earth);
  const tex = new THREE.TextureLoader().load(EARTH); tex.colorSpace = THREE.SRGBColorSpace;
  earth.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshBasicMaterial({map: tex})));
  // a thin teal atmosphere at the edge
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 48), new THREE.ShaderMaterial({transparent: true, side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 n; void main(){ float f = pow(.62 - dot(n, vec3(0., 0., 1.)), 4.0); gl_FragColor = vec4(.18, .83, .75, 1.0) * f * .9; }'})));
  const toV = (lat, lng, r = 1) => { const p = (90 - lat) * Math.PI / 180, l = (lng + 180) * Math.PI / 180; return new THREE.Vector3(-r * Math.sin(p) * Math.cos(l), r * Math.cos(p), r * Math.sin(p) * Math.sin(l)); };
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.4)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const dot = (c, s) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending})); m.scale.setScalar(s); return m; };
  const homeDot = dot(0x7dd3fc, .16); earth.add(homeDot);
  const ring = dot(0xfde68a, .5); earth.add(ring);
  const plane = dot(0xffffff, .14), trail = dot(0x2dd4bf, .3); earth.add(plane); earth.add(trail);
  let been = [], arcLine = null, arcCurve = null, born = 0, hasDest = false;
  let tgt = {x: .35, y: -2}, cr = {x: .35, y: -2};
  let pins = {home: null, dest: null}, names = {home: '', dest: ''};

  function set(d){
    been.forEach(b => earth.remove(b)); been = (d.dots || []).map(p => { const s = dot(0x2dd4bf, .09); s.position.copy(toV(p.lat, p.lng, 1.01)); earth.add(s); return s; });
    if(arcLine){ earth.remove(arcLine); arcLine.geometry.dispose(); arcLine = null; arcCurve = null; }
    const home = d.home, dest = d.dest;
    homeDot.visible = !!home; if(home) homeDot.position.copy(toV(home.lat, home.lng, 1.01));
    hasDest = !!dest; ring.visible = plane.visible = trail.visible = hasDest;
    names = {home: home ? home.name : '', dest: dest ? dest.name : ''};
    if(dest){
      ring.position.copy(toV(dest.lat, dest.lng, 1.01));
      if(home){
        const a = toV(home.lat, home.lng, 1.01), b = toV(dest.lat, dest.lng, 1.01);
        const mid = a.clone().add(b).normalize().multiplyScalar(1 + Math.max(.18, a.distanceTo(b) * .45));
        arcCurve = new THREE.QuadraticBezierCurve3(a, mid, b);
        arcLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcCurve.getPoints(80)), new THREE.LineBasicMaterial({color: 0xfde68a, transparent: true, opacity: .85}));
        arcLine.geometry.setDrawRange(0, 0); earth.add(arcLine); born = performance.now();
      }
    }
    // face the middle of the route (or the place, or home)
    const f = dest && home ? {lat: (home.lat + dest.lat) / 2, lng: (home.lng + dest.lng) / 2} : dest || home || {lat: 20, lng: 60};
    tgt = {x: f.lat * Math.PI / 180 * .9, y: -(f.lng + 90) * Math.PI / 180};
    while(tgt.y - cr.y > Math.PI) tgt.y -= 2 * Math.PI;
    while(cr.y - tgt.y > Math.PI) tgt.y += 2 * Math.PI;
  }
  const V = new THREE.Vector3();
  const pin = (el, obj, off, text) => {
    if(!el) return;
    if(!text || !obj.visible){ el.style.opacity = 0; return; }
    obj.getWorldPosition(V); const facing = V.z > .15; V.project(cam);
    if(el.textContent !== text) el.textContent = text;
    el.style.opacity = facing ? 1 : 0;
    el.style.transform = `translate(${((V.x + 1) / 2 * canvas.clientWidth).toFixed(1)}px, ${((1 - V.y) / 2 * canvas.clientHeight + off).toFixed(1)}px) translate(-50%, 0)`;
  };
  const clock = new THREE.Clock();
  let vis = true;
  const io = new IntersectionObserver(e => { vis = e[0].isIntersecting; }); io.observe(canvas);
  (function frame(){
    requestAnimationFrame(frame);
    if(!vis || !canvas.isConnected) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if(!w || !h) return;
    if(canvas.width !== Math.round(w * R.getPixelRatio()) || canvas.height !== Math.round(h * R.getPixelRatio())){ R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    const t = clock.getElapsedTime(), k = calm ? 1 : .045;
    cr.x += (tgt.x - cr.x) * k; cr.y += (tgt.y - cr.y) * k;
    earth.rotation.x = cr.x; earth.rotation.y = cr.y + (calm ? 0 : Math.sin(t * .15) * .05);
    if(arcLine){
      const grow = calm ? 1 : Math.min(1, (performance.now() - born) / 1400);
      arcLine.geometry.setDrawRange(0, Math.floor(81 * grow));
      const u = grow < 1 ? grow : ((t * .22) % 1);
      arcCurve.getPoint(u, plane.position); arcCurve.getPoint(Math.max(0, u - .04), trail.position);
      plane.material.opacity = trail.material.opacity = grow < 1 ? 1 : Math.sin(u * Math.PI);
    }
    const pulse = (t * .8) % 1;
    ring.scale.setScalar(.3 + pulse * .5); ring.material.opacity = 1 - pulse;
    been.forEach((b, i) => { b.material.opacity = .55 + .45 * Math.sin(t * 1.4 + i * 1.7); });
    R.render(scene, cam);
    pin(pins.home, homeDot, 10, names.home);
    pin(pins.dest, ring, -30, names.dest);
  })();
  return {set, bind(p){ pins = p; }};
}

/* box: the element holding a <canvas> and the two name pins. The renderer is made once and moved into each new
   box the Trips tab draws, so switching trips turns the same globe instead of starting a new one. */
function mount(box, data){
  const fresh = box.querySelector('canvas');
  if(live){ fresh.replaceWith(live.canvas); }
  else { const api = create(fresh); if(!api){ box.classList.add('no3d'); return; } live = {canvas: fresh, api}; }
  live.api.bind({home: box.querySelector('[data-pin="home"]'), dest: box.querySelector('[data-pin="dest"]')});
  live.api.set(data);
}

window.TripHorizon = {mount};
if(window.__horizonPending){ const p = window.__horizonPending; window.__horizonPending = null; mount(p.box, p.data); }
