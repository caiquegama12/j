// ===== Tamanho do mundo =====
const CELULA = 4;
const tela = document.getElementById("tela");
const barra = document.getElementById("barra");
const W = Math.floor(window.innerWidth / CELULA);
const H = Math.floor((window.innerHeight - 60) / CELULA);
tela.width = W;
tela.height = H;
tela.style.width = W * CELULA + "px";
tela.style.height = H * CELULA + "px";
const ctx = tela.getContext("2d");
const imagem = ctx.createImageData(W, H);
const pixels = new Uint32Array(imagem.data.buffer);

// ===== Registro de materiais =====
// tipo: "po" cai | "liquido" escorre | "gas" sobe | "fixo" não se move
// d = densidade | cap = quanto custa esquentar/esfriar
// cond = velocidade com que conduz calor | t0 = temperatura ao criar
// reagir = função chamada todo quadro | oculto = não aparece na barra
const MATERIAIS = [], TIPO = [], DENS = [], CAP = [], COND = [],
      COR32 = [], REACOES = [];

function registrar(m) {
  const id = MATERIAIS.length;
  MATERIAIS.push(m);
  TIPO[id] = m.tipo;
  DENS[id] = m.d;
  CAP[id] = m.cap || 1;
  COND[id] = m.cond || 0.2;
  COR32[id] = (255 << 24) | (m.cor[2] << 16) | (m.cor[1] << 8) | m.cor[0];
  REACOES[id] = m.reagir || null;
  return id;
}
function definirReacao(id, fn) { REACOES[id] = fn; }

// ===== O mundo =====
const AMBIENTE = 20;
const grade = new Uint8Array(W * H);   // material de cada célula
const movido = new Uint8Array(W * H);  // evita mover a mesma célula 2x
const estado = new Uint8Array(W * H);  // contador livre (crescimento, energia...)
let temp = new Float32Array(W * H).fill(AMBIENTE);
let temp2 = new Float32Array(W * H);
let tempAjustavel = 20;
let modoCalor = false;

// Camada de zonas de temperatura fixa (não ocupam espaço, tudo passa por dentro)
const zona = new Uint8Array(W * H); // 0 = sem zona, 1 = fria, 2 = quente, 3 = ajustável
const ZONAS = [
  null,
  { temp: () => -150,          tinta: [40, 100, 255] },
  { temp: () => 1000,           tinta: [255, 60, 40] },
  { temp: () => tempAjustavel, tinta: [170, 80, 230] },
];

function criar(i, mat) {
  grade[i] = mat;
  temp[i] = MATERIAIS[mat].t0 === undefined ? AMBIENTE : MATERIAIS[mat].t0;
  estado[i] = MATERIAIS[mat].e0||0;
}

function trocar(a, b) {
  let t = grade[a]; grade[a] = grade[b]; grade[b] = t;
  let q = temp[a]; temp[a] = temp[b]; temp[b] = q;      // o calor viaja junto
  let e = estado[a]; estado[a] = estado[b]; estado[b] = e;
  movido[a] = 1; movido[b] = 1;
}

function vizinhos(i) {
  const x = i % W, y = (i / W) | 0, v = [];
  if (y > 0) v.push(i - W);
  if (y < H - 1) v.push(i + W);
  if (x > 0) v.push(i - 1);
  if (x < W - 1) v.push(i + 1);
  return v;
}

// ===== Materiais básicos =====
const VAZIO = registrar({ nome: "Apagar", cor: [0, 0, 0], tipo: "vazio", d: 0 });

const AREIA = registrar({ nome: "Areia", cor: [222, 190, 110], tipo: "po", d: 5 });

const AGUA = registrar({ nome: "Água", cor: [60, 130, 230], tipo: "liquido",
  d: 3, cap: 3,
  reagir(i) {
    if (temp[i] >= 100) { grade[i] = VAPOR; temp[i] = 110; }
    else if (temp[i] <= -2) grade[i] = GELO;
  } });

const PAREDE = registrar({ nome: "Bloco indestrutível", cor: [120, 125, 135],
  tipo: "fixo", d: 99 });

const MADEIRA = registrar({ nome: "Madeira", cor: [130, 85, 50], tipo: "fixo",
  d: 99, cap: 2,
  reagir(i) { if (temp[i] >= 250) { grade[i] = FOGO; temp[i] = 600; } } });

const FOGO = registrar({ nome: "Fogo", cor: [255, 120, 30], tipo: "gas",
  d: 0.2, t0: 600, reagir: queimar });

const VAPOR = registrar({ nome: "Vapor", cor: [190, 200, 210], tipo: "gas",
  d: 0.1, cap: 6, t0: 110, oculto: true,
  reagir(i) { if (temp[i] < 60) grade[i] = AGUA; } });

const GELO = registrar({ nome: "Gelo", cor: [170, 220, 245], tipo: "fixo",
  d: 99, cap: 3, t0: -10,
  reagir(i) { if (temp[i] >= 2) grade[i] = AGUA; } });

const NITROGENIO = registrar({ nome: "Nitrogênio", cor: [200, 235, 255],
  tipo: "liquido", d: 1.5, cap: 8, t0: -196,
  reagir(i) { if (temp[i] > -120) grade[i] = VAZIO; } });

const FOGO_ETERNO = registrar({ nome: "Fogo eterno", cor: [255, 60, 0],
  tipo: "fixo", d: 99, t0: 700,
  reagir(i) {
    temp[i] = 700;
    if (i >= W && grade[i - W] === VAZIO && Math.random() < 0.1) criar(i - W, FOGO);
  } });

function queimar(i) {
  temp[i] = 600;
  for (const j of vizinhos(i)) {
    const u = grade[j];
    if (u === AGUA || u === ALGA || u === GELO || u === NITROGENIO) { // apaga no molhado/frio
      grade[i] = VAZIO; temp[i] = 150; return;
    }
  }
  if (Math.random() < 0.05) { grade[i] = VAZIO; temp[i] = 200; }
}

// ===== Movimento =====
function podeIr(mat, destino) {
  const td = TIPO[destino];
  if (td === "vazio") return true;
  return (td === "liquido" || td === "gas") && DENS[mat] > DENS[destino];
}

function mover(i, x, y, sentido) {
  const t = grade[i], tipo = TIPO[t];
  if (tipo === "po" || tipo === "liquido") {
    if (y < H - 1) {
      if (podeIr(t, grade[i + W])) { trocar(i, i + W); return; }
      for (const dx of [sentido, -sentido]) {
        const nx = x + dx;
        if (nx >= 0 && nx < W && podeIr(t, grade[i + W + dx])) {
          trocar(i, i + W + dx); return;
        }
      }
    }
    if (tipo === "liquido") {
      for (const dx of [sentido, -sentido]) {
        const nx = x + dx;
        if (nx >= 0 && nx < W && grade[i + dx] === VAZIO) {
          trocar(i, i + dx); return;
        }
      }
    }
  } else { // gás: sobe
    if (y > 0 && Math.random() < 0.7) {
      const dx = Math.floor(Math.random() * 3) - 1;
      const nx = x + dx;
      if (nx >= 0 && nx < W) {
        const j = i - W + dx, d = grade[j];
        if (d === VAZIO || (TIPO[d] === "liquido" && DENS[d] > DENS[t])) {
          trocar(i, j); return;
        }
      }
    }
    const lado = Math.random() < 0.5 ? -1 : 1;
    const nx = x + lado;
    if (nx >= 0 && nx < W && grade[i + lado] === VAZIO && Math.random() < 0.3) {
      trocar(i, i + lado);
    }
  }
}

function atualizar() {
  movido.fill(0);
  for (let y = H - 1; y >= 0; y--) {
    const sentido = Math.random() < 0.5 ? 1 : -1;
    for (let k = 0; k < W; k++) {
      const x = sentido === 1 ? k : W - 1 - k;
      const i = y * W + x;
      if (movido[i]) continue;
      const tipo = TIPO[grade[i]];
      if (tipo === "po" || tipo === "liquido" || tipo === "gas") {
        mover(i, x, y, sentido);
      }
    }
  }
}

// ===== Temperatura =====
function difundir() {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const cima = y > 0 ? i - W : i;
      const baixo = y < H - 1 ? i + W : i;
      const esq = x > 0 ? i - 1 : i;
      const dir = x < W - 1 ? i + 1 : i;
      const media = (temp[cima] + temp[baixo] + temp[esq] + temp[dir]) / 4;
      const m = grade[i];
      let novo = temp[i] + COND[m] * (media - temp[i]) / CAP[m];
      novo += (AMBIENTE - novo) * 0.002;
      temp2[i] = novo;
    }
  }
  const t = temp; temp = temp2; temp2 = t;
}

// Toda célula dentro de uma zona volta, a cada quadro, à temperatura da zona
function aplicarZonas() {
  const fixa = [0, ZONAS[1].temp(), ZONAS[2].temp(), ZONAS[3].temp()];
  for (let i = 0; i < W * H; i++) {
    if (zona[i]) temp[i] = fixa[zona[i]];
  }
}

// ===== Reações =====
function reagir() {
  for (let i = 0; i < W * H; i++) {
    const fn = REACOES[grade[i]];
    if (fn) fn(i, i % W, (i / W) | 0);
  }
}

// ===== Desenho =====
function corTemperatura(T) {
  let r, g, b;
  if (T < 20) {
    const f = Math.min(1, (20 - T) / 200);
    r = 20; g = 40 + 90 * f; b = 60 + 195 * f;
  } else {
    const f = Math.min(1, (T - 20) / 500);
    r = 40 + 215 * f; g = 255 * f * f; b = 40 * (1 - f);
  }
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

function desenhar() {
  for (let i = 0; i < W * H; i++) {
    if (modoCalor) { pixels[i] = corTemperatura(temp[i]); continue; }
    const m = grade[i], c = MATERIAIS[m].cor;
    let r = c[0], g = c[1], b = c[2];
    if (m === FOGO) {
      const f = 0.7 + Math.random() * 0.5;
      r = Math.min(255, r * f); g = Math.min(255, g * f); b = Math.min(255, b * f);
    }
    if (zona[i]) {                       // tinge de leve a área da zona
      const t = ZONAS[zona[i]].tinta;
      r = r * 0.65 + t[0] * 0.35;
      g = g * 0.65 + t[1] * 0.35;
      b = b * 0.65 + t[2] * 0.35;
    }
    pixels[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  ctx.putImageData(imagem, 0, 0);
}

// ===== Controles =====
let atual = AREIA;
let pincel = 3;
let apertado = false;
let ultimo = null;
const FERRAMENTA_ZONA = -1;
let zonaAtual = 1;

function marcar(botao) {
  document.querySelectorAll("#barra button.mat")
    .forEach(x => x.classList.remove("ativo"));
  botao.classList.add("ativo");
}

function montarBarra() {
  const btCalor = document.createElement("button");
  btCalor.textContent = "Ver temperatura";
  btCalor.onclick = () => {
    modoCalor = !modoCalor;
    btCalor.classList.toggle("ativo", modoCalor);
  };
  barra.appendChild(btCalor);

  const btLimpar = document.createElement("button");
  btLimpar.textContent = "Limpar";
  btLimpar.onclick = () => {
    grade.fill(0); estado.fill(0); zona.fill(0); temp.fill(AMBIENTE);
  };
  barra.appendChild(btLimpar);

  const caixa = document.createElement("div");
  caixa.className = "temp";
  caixa.innerHTML = 'Zona ajustável: <input id="slTemp" type="range" ' +
    'min="-200" max="1000" value="20"> <span id="valTemp">20°</span>';
  barra.appendChild(caixa);
  document.getElementById("slTemp").oninput = e => {
    tempAjustavel = +e.target.value;
    document.getElementById("valTemp").textContent = tempAjustavel + "°";
  };

  // botões das zonas
  [{ nome: "Zona fria", z: 1 }, { nome: "Zona quente", z: 2 },
   { nome: "Zona ajustável", z: 3 }, { nome: "Apagar zona", z: 0 }
  ].forEach(zn => {
    const b = document.createElement("button");
    b.className = "mat";
    b.textContent = zn.nome;
    b.onclick = () => { atual = FERRAMENTA_ZONA; zonaAtual = zn.z; marcar(b); };
    barra.appendChild(b);
  });

  // botões dos materiais
  MATERIAIS.forEach((m, id) => {
    if (m.oculto) return;
    const b = document.createElement("button");
    b.className = "mat";
    b.textContent = m.nome;
    if (id === atual) b.classList.add("ativo");
    b.onclick = () => { atual = id; marcar(b); };
    barra.appendChild(b);
  });
}

function pintar(cx, cy) {
  for (let dy = -pincel; dy <= pincel; dy++) {
    for (let dx = -pincel; dx <= pincel; dx++) {
      if (dx * dx + dy * dy > pincel * pincel) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (atual === FERRAMENTA_ZONA) zona[i] = zonaAtual;      // pinta a zona
      else if (atual === VAZIO) criar(i, VAZIO);
      else if ((grade[i] === VAZIO ||
                (MATERIAIS[atual].sobreAgua && grade[i] === AGUA)) &&
               (!MATERIAIS[atual].rara || Math.random() < 0.03)) criar(i, atual);
    }
  }
}

function posicao(e) {
  const r = tela.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) / CELULA),
          Math.floor((e.clientY - r.top) / CELULA)];
}

tela.addEventListener("pointerdown", e => {
  apertado = true;
  ultimo = posicao(e);
  pintar(ultimo[0], ultimo[1]);
});
tela.addEventListener("pointermove", e => {
  if (!apertado) return;
  const p = posicao(e);
  const n = Math.max(Math.abs(p[0] - ultimo[0]), Math.abs(p[1] - ultimo[1]), 1);
  for (let k = 0; k <= n; k++) {
    pintar(Math.round(ultimo[0] + (p[0] - ultimo[0]) * k / n),
           Math.round(ultimo[1] + (p[1] - ultimo[1]) * k / n));
  }
  ultimo = p;
});
window.addEventListener("pointerup", () => { apertado = false; });

setInterval(() => {
  if (apertado && ultimo) pintar(ultimo[0], ultimo[1]);
}, 40);

// ===== Início =====
function loop() {
  atualizar();
  difundir();
  aplicarZonas();
  reagir();
  desenhar();
  requestAnimationFrame(loop);
}
function iniciar() { montarBarra(); loop(); }
window.addEventListener("load", iniciar);