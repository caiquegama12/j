// ===== Ajustes (mexa nestes números para mudar o jogo) =====
const LIMITE_VIDRO = 750;      // temperatura em que a areia vira vidro
const CALOR_URANIO = 2;        // calor que o urânio gera por quadro (era 10)
const FUSAO_URANIO = 750;      // temperatura em que o urânio derrete
const EXPLOSAO_URANIO = 1200;  // temperatura em que o urânio derretido explode
const RAIO_NUCLEO = 3;         // tamanho do "miolo" de onde saem as partículas
const PASSOS_PARTICULA = 2;    // velocidade das partículas (células por quadro)
const VIDA_MIN = 50;            // alcance mínimo das partículas
const VIDA_MAX = 150;           // alcance máximo das partículas
const ALTURA_PLANTA = 19;      // altura máxima das plantas

// ===== Sólidos =====
const METAL = registrar({ nome: "Metal", cor: [170, 175, 185], tipo: "fixo",
  d: 99, cap: 1, cond: 0.9 });          // conduz calor muito rápido, não cai

const VIDRO = registrar({ nome: "Vidro", cor: [150, 210, 200], tipo: "fixo",
  d: 6, cap: 2, cond: 0.5 });           // conduz calor e cai com a gravidade

const ROCHA = registrar({ nome: "Rocha", cor: [95, 90, 85], tipo: "fixo",
  d: 99, cap: 3, cond: 0.25 });

const TERRA = registrar({ nome: "Terra", cor: [110, 75, 45], tipo: "po",
  d: 4.5, cap: 2 });

// areia vira vidro quando fica muito quente
definirReacao(AREIA, i => { if (temp[i] >= LIMITE_VIDRO) grade[i] = VIDRO; });

// ===== Líquidos =====
function corroer(i) {
  for (const j of vizinhos(i)) {
    if (CORROIVEIS.includes(grade[j]) && Math.random() < 0.08) {
      grade[j] = VAZIO; temp[j] = AMBIENTE;
      if (Math.random() < 0.35) { grade[i] = VAZIO; return; } // o ácido se gasta
    }
  }
}
const ACIDO = registrar({ nome: "Ácido", cor: [140, 230, 60], tipo: "liquido",
  d: 2.5, cap: 2, reagir: corroer });

const PETROLEO = registrar({ nome: "Petróleo", cor: [90, 60, 30], tipo: "liquido",
  d: 2, cap: 2,
  reagir(i) {
    if (temp[i] >= 200) { grade[i] = FOGO; temp[i] = 600; }       // pega fogo
    else if (temp[i] <= -20) grade[i] = PETROLEO_GELADO;          // congela
  } });

const PETROLEO_GELADO = registrar({ nome: "Petróleo congelado",
  cor: [60, 50, 60], tipo: "fixo", d: 99, cap: 2, t0: -30, oculto: true,
  reagir(i) { if (temp[i] >= -5) grade[i] = PETROLEO; } });

// ===== Urânio =====
function explodir(i, raio) {
  const cx = i % W, cy = (i / W) | 0;
  for (let dy = -raio; dy <= raio; dy++) {
    for (let dx = -raio; dx <= raio; dx++) {
      if (dx * dx + dy * dy > raio * raio) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = y * W + x;
      if (grade[j] === PAREDE) continue;       // o bloco indestrutível resiste
      grade[j] = Math.random() < 0.5 ? FOGO : VAZIO;
      temp[j] = 800; estado[j] = 0;
    }
  }
}

// ===== Urânio =====
// Cada partícula de explosão guarda para onde vai (pvx, pvy) e um acumulador
// (pax, pay) para andar em linha reta em qualquer ângulo.
const pvx = new Float32Array(W * H), pvy = new Float32Array(W * H);
const pax = new Float32Array(W * H), pay = new Float32Array(W * H);

// Cria o miolo da explosão: partículas saindo em TODAS as direções
function explodir(i) {
  const cx = i % W, cy = (i / W) | 0, r = RAIO_NUCLEO;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = y * W + x;
      if (grade[j] === PAREDE) continue;         // o bloco indestrutível resiste
      criar(j, PARTICULA);
      const ang = Math.random() * 2 * Math.PI;   // direção sorteada, 360 graus
      const c = Math.cos(ang), s = Math.sin(ang);
      const m = Math.max(Math.abs(c), Math.abs(s));
      pvx[j] = c / m; pvy[j] = s / m;
      pax[j] = 0; pay[j] = 0;
      estado[j] = VIDA_MIN + ((Math.random() * (VIDA_MAX - VIDA_MIN)) | 0);
      movido[j] = 1;                             // só começa a andar no próximo quadro
    }
  }
}

function moverParticula(i, x, y) {
  if (movido[i]) return;
  for (let passo = 0; passo < PASSOS_PARTICULA; passo++) {
    pax[i] += pvx[i]; pay[i] += pvy[i];
    let dx = 0, dy = 0;
    if (pax[i] >= 0.5) { dx = 1; pax[i] -= 1; }
    else if (pax[i] <= -0.5) { dx = -1; pax[i] += 1; }
    if (pay[i] >= 0.5) { dy = 1; pay[i] -= 1; }
    else if (pay[i] <= -0.5) { dy = -1; pay[i] += 1; }
    if (dx === 0 && dy === 0) continue;

    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) { grade[i] = VAZIO; return; }
    const j = ny * W + nx, c = grade[j];

    if (c === PAREDE) { grade[i] = VAZIO; return; }           // bate no indestrutível
    if (c === URANIO || c === URANIO_FUNDIDO) {               // reação em cadeia
      grade[i] = VAZIO;
      explodir(j);
      return;
    }
    if (c === PARTICULA) continue;                            // espera a vez

    // destrói o que estiver na frente e ocupa o lugar
    grade[j] = PARTICULA; temp[j] = 800; estado[j] = estado[i];
    pvx[j] = pvx[i]; pvy[j] = pvy[i]; pax[j] = pax[i]; pay[j] = pay[i];
    grade[i] = VAZIO; temp[i] = 400; estado[i] = 0;
    i = j; x = nx; y = ny;
    movido[i] = 1;
  }
  if (estado[i] > 0) estado[i]--;
  if (estado[i] === 0) {                                      // acabou o alcance
    if (Math.random() < 0.4) criar(i, FOGO); else { grade[i] = VAZIO; temp[i] = 300; }
  }
}

const PARTICULA = registrar({ nome: "Partícula de explosão",
  cor: [255, 220, 120], tipo: "fixo", d: 99, t0: 800, oculto: true,
  reagir: moverParticula });

const URANIO = registrar({ nome: "Urânio", cor: [90, 230, 90], tipo: "fixo",
  d: 8, cap: 5, cond: 0.1,
  reagir(i) {
    temp[i] += CALOR_URANIO;                       // esquenta sozinho, devagar
    if (temp[i] >= FUSAO_URANIO) grade[i] = URANIO_FUNDIDO;
  } });

const URANIO_FUNDIDO = registrar({ nome: "Urânio derretido",
  cor: [220, 255, 80], tipo: "liquido", d: 8, cap: 5, cond: 0.1, t0: 900,
  oculto: true,
  reagir(i) {
    temp[i] += CALOR_URANIO * 1.5;
    if (temp[i] >= EXPLOSAO_URANIO) explodir(i);
    else if (temp[i] < FUSAO_URANIO - 200) grade[i] = URANIO; // esfriou: solidifica
  } });
// ===== Dreno =====
const DRENO = registrar({ nome: "Dreno", cor: [70, 30, 90], tipo: "fixo", d: 99,
  reagir(i) {
    for (const j of vizinhos(i)) {
      if (grade[j] !== VAZIO && grade[j] !== DRENO) {
        grade[j] = VAZIO; temp[j] = AMBIENTE; estado[j] = 0;
      }
    }
  } });

// ===== Sementes e plantas =====
const SEMENTE = registrar({ nome: "Semente", cor: [200, 160, 60], tipo: "po",
  d: 4,
  reagir(i) {
    // só germina se estiver pousada sobre terra
    if (i + W < W * H && grade[i + W] === TERRA && Math.random() < 0.01) {
      criar(i, PLANTA);
    }
  } });

const PLANTA = registrar({ nome: "Planta", cor: [50, 170, 70], tipo: "fixo",
  d: 99, cap: 2, oculto: true,
  reagir(i) {
    if (temp[i] >= 200) { grade[i] = FOGO; temp[i] = 600; return; }
    if (estado[i] < ALTURA_PLANTA && i >= W && grade[i - W] === VAZIO &&
        Math.random() < 0.03) {
      criar(i - W, PLANTA);
      estado[i - W] = estado[i] + 1;           // cada pedaço sabe sua altura
    }
  } });

// o que o ácido consegue destruir (vidro e bloco indestrutível não)
const CORROIVEIS = [ROCHA, METAL, MADEIRA, TERRA, AREIA, PLANTA, GELO];