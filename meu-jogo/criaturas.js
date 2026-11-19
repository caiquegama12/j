// ===== Ajustes (mexa nestes números) =====
const VIDA_INICIAL = 100;      // energia do bicho ao nascer (máximo 255)
const NASCE_VAGALUME = 0.0002; // chance por quadro de um vaga-lume gerar outro
const CRESCE_ALGA = 0.003;     // velocidade com que a alga toma a água
const DANO_ARANHA = 45;
const DANO_CARANGUEJO = 30;
const DANO_DINO = 80;
const ESCALA_SPRITE = 3;       // tamanho das imagens dos bichos

const ehAgua = m => m === AGUA || m === ALGA;

// ===== Ferramentas comuns a todos os bichos =====
// Cada bicho usa estado[i] como energia: gasta com o tempo, ganha comendo
// ou caçando, e morre quando chega a zero.
function viz8(x, y) {
  const v = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) v.push(ny * W + nx);
    }
  }
  return v;
}
function escolher(lista) {
  return lista.length ? lista[(Math.random() * lista.length) | 0] : -1;
}
function nascer(j, mat, energia) {
  criar(j, mat);
  estado[j] = energia;
  movido[j] = 1;               // só age a partir do próximo quadro
}
function sofrer(i) {           // morre de calor, de frio ou de fome
  if (temp[i] > 120 || temp[i] < -40 || estado[i] === 0) {
    grade[i] = VAZIO; temp[i] = AMBIENTE; estado[i] = 0;
    return true;
  }
  return false;
}
function gastar(i, taxa) {
  if (estado[i] > 0 && Math.random() < 1 / taxa) estado[i]--;
}
function pode(j, agua) {
  const g = grade[j];
  return g === VAZIO || (agua && ehAgua(g));
}
function agarrado(i) {         // tem onde se segurar?
  for (const j of vizinhos(i)) {
    if (grade[j] !== VAZIO && !ehAgua(grade[j])) return true;
  }
  return false;
}
function cair(i, x, y, escalador) {
  if (y >= H - 1) return false;
  const g = grade[i + W];
  if (g !== VAZIO && !ehAgua(g)) return false;         // está apoiado
  if (escalador && agarrado(i)) return false;
  trocar(i, i + W);
  return true;
}
function andar(i, x, y, escalador, agua) {
  if (escalador) {                                     // anda por qualquer superfície
    const opcoes = [];
    for (const j of viz8(x, y)) {
      if (!pode(j, agua)) continue;
      for (const k of vizinhos(j)) {
        if (k !== i && grade[k] !== VAZIO && !ehAgua(grade[k])) {
          opcoes.push(j); break;
        }
      }
    }
    const j = escolher(opcoes);
    if (j >= 0) { trocar(i, j); return true; }
    return false;
  }
  const lados = Math.random() < 0.5 ? [-1, 1] : [1, -1];
  for (const dx of lados) {
    const nx = x + dx;
    if (nx < 0 || nx >= W) continue;
    const j = y * W + nx;
    if (pode(j, agua)) { trocar(i, j); return true; }
    if (y > 0 && pode(j - W, agua) && pode(i - W, agua)) { // sobe um degrau
      trocar(i, j - W); return true;
    }
  }
  return false;
}
// ataca um animal vizinho (menos os da própria espécie e os vaga-lumes,
// que só são comidos por sapos e por aranhas, na teia)
function atacar(i, x, y, exceto, dano) {
  const presas = viz8(x, y).filter(j =>
    ANIMAIS.includes(grade[j]) && grade[j] !== exceto && grade[j] !== VAGALUME);
  if (!presas.length || Math.random() > 0.35) return false;
  const j = escolher(presas);
  if (estado[j] <= dano) {
    grade[j] = VAZIO; temp[j] = AMBIENTE; estado[j] = 0;
    estado[i] = Math.min(255, estado[i] + 60);         // comeu: ganha energia
  } else {
    estado[j] -= dano;
  }
  return true;
}
function reproduzir(i, x, y, mat, limite, custo) {
  if (estado[i] < limite) return;
  const j = escolher(viz8(x, y).filter(k => grade[k] === VAZIO));
  if (j < 0) return;
  estado[i] -= custo;
  nascer(j, mat, custo);
}
// procura a célula mais próxima que passe no teste, num raio
function procurar(x, y, raio, teste) {
  let melhor = -1, dmin = 1e9;
  for (let dy = -raio; dy <= raio; dy++) {
    for (let dx = -raio; dx <= raio; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (teste(j) && dx * dx + dy * dy < dmin) { dmin = dx * dx + dy * dy; melhor = j; }
    }
  }
  return melhor;
}
// dá um passo em direção ao alvo, sempre se segurando em alguma superfície
function andarPara(i, x, y, alvo) {
  const ax = alvo % W, ay = (alvo / W) | 0;
  let melhor = -1, dmin = (x - ax) * (x - ax) + (y - ay) * (y - ay);
  for (const j of viz8(x, y)) {
    if (!pode(j, false)) continue;
    let apoio = false;
    for (const k of vizinhos(j)) {
      if (k !== i && grade[k] !== VAZIO && !ehAgua(grade[k])) { apoio = true; break; }
    }
    if (!apoio) continue;
    const jx = j % W, jy = (j / W) | 0;
    const d = (jx - ax) * (jx - ax) + (jy - ay) * (jy - ay);
    if (d < dmin) { dmin = d; melhor = j; }
  }
  if (melhor >= 0) { trocar(i, melhor); return true; }
  return false;
}

// ===== Cupim: come madeira e se multiplica =====
const CUPIM = registrar({ nome: "Cupim", cor: [205, 170, 120], tipo: "fixo",
  d: 99, e0: VIDA_INICIAL, rara: true,
  reagir(i, x, y) {
    if (movido[i] || sofrer(i)) return;
    gastar(i, 40);
    for (const j of vizinhos(i)) {
      if (grade[j] === MADEIRA && Math.random() < 0.15) {
        grade[j] = VAZIO;                              // comeu a madeira
        estado[i] = Math.min(255, estado[i] + 60);
        if (estado[i] >= 140) {                        // bem alimentado: se reproduz
          estado[i] -= 70;
          nascer(j, CUPIM, 70);
        }
        return;
      }
    }
    if (cair(i, x, y, true)) return;
    if (Math.random() < 0.3) andar(i, x, y, true, false);
  } });

// ===== Caranguejo: anda no chão e na água, ataca com as pinças =====
const CARANGUEJO = registrar({ nome: "Caranguejo", cor: [230, 80, 60],
  tipo: "fixo", d: 99, e0: VIDA_INICIAL, rara: true,
  reagir(i, x, y) {
    if (movido[i] || sofrer(i)) return;
    gastar(i, 80);
    if (atacar(i, x, y, CARANGUEJO, DANO_CARANGUEJO)) return;
    reproduzir(i, x, y, CARANGUEJO, 220, 100);
    if (cair(i, x, y, false)) return;
    if (Math.random() < 0.25) andar(i, x, y, false, true);
  } });

// ===== Teia e aranha =====
const TEIA = registrar({ nome: "Teia", cor: [225, 225, 235], tipo: "fixo",
  d: 99, oculto: true,
  reagir(i) {
    if (temp[i] >= 150) { grade[i] = FOGO; temp[i] = 500; return; } // teia queima
    if (Math.random() < 0.0003) grade[i] = VAZIO;                   // some com o tempo
  } });

const ARANHA = registrar({ nome: "Aranha", cor: [90, 50, 110], tipo: "fixo",
  d: 99, e0: VIDA_INICIAL, rara: true,
  reagir(i, x, y) {
    if (movido[i] || sofrer(i)) return;
    gastar(i, 70);
    // 1) come vaga-lume preso na teia
    for (const j of viz8(x, y)) {
      if (grade[j] === VAGALUME && estado[j] === 1) {
        grade[j] = VAZIO;
        estado[i] = Math.min(255, estado[i] + 90);
        return;
      }
    }
    if (atacar(i, x, y, ARANHA, DANO_ARANHA)) return;
    reproduzir(i, x, y, ARANHA, 220, 100);
    if (cair(i, x, y, true)) return;
    // 2) com fome, vai atrás de vaga-lume preso por perto
    if (estado[i] < 200 && Math.random() < 0.2) {
      const alvo = procurar(x, y, 8, j => grade[j] === VAGALUME && estado[j] === 1);
      if (alvo >= 0 && andarPara(i, x, y, alvo)) return;
    }
    // 3) às vezes tece um pedacinho de teia no ar, para caçar
    if (Math.random() < 0.03) {
      const livres = viz8(x, y).filter(k => grade[k] === VAZIO);
      for (let n = 0; n < 3 && livres.length; n++) {
        criar(livres.splice((Math.random() * livres.length) | 0, 1)[0], TEIA);
      }
      return;
    }
    // 4) anda e deixa um rastro de teia
    if (Math.random() < 0.3 && andar(i, x, y, true, false)) {
      if (Math.random() < 0.12 && grade[i] === VAZIO) criar(i, TEIA);
    }
  } });

// ===== Dinossauro: ataca todos os animais, menos outros dinossauros =====
const DINOSSAURO = registrar({ nome: "Dinossauro", cor: [210, 160, 40],
  tipo: "fixo", d: 99, e0: VIDA_INICIAL, rara: true,
  reagir(i, x, y) {
    if (movido[i] || sofrer(i)) return;
    gastar(i, 110);
    if (atacar(i, x, y, DINOSSAURO, DANO_DINO)) return;
    reproduzir(i, x, y, DINOSSAURO, 230, 110);
    if (cair(i, x, y, false)) return;
    if (Math.random() < 0.4) andar(i, x, y, false, false);
  } });

// ===== Ecossistema dos sapos: alga > girino > sapo > ovo =====
// A alga é água de cor verde: escorre, ferve e congela como a água.
// Ela só se espalha para água vizinha, e o girino a come (vira água de novo).
const ALGA = registrar({ nome: "Alga", cor: [35, 150, 105], tipo: "liquido",
  d: 3, cap: 3, sobreAgua: true,
  reagir(i) {
    if (temp[i] >= 100) { grade[i] = VAPOR; temp[i] = 110; return; }
    if (temp[i] <= -2) { grade[i] = GELO; return; }
    if (Math.random() < CRESCE_ALGA) {
      const aguas = vizinhos(i).filter(j => grade[j] === AGUA);
      if (aguas.length) grade[escolher(aguas)] = ALGA;   // mantém temperatura
    }
  } });

const OVO = registrar({ nome: "Ovo de sapo", cor: [240, 235, 200], tipo: "po",
  d: 3.1,
  reagir(i) {
    if (temp[i] > 60 || temp[i] < -10) { grade[i] = VAZIO; return; }
    const naAgua = vizinhos(i).some(j => ehAgua(grade[j]));
    if (naAgua && Math.random() < 0.004) { nascer(i, GIRINO, VIDA_INICIAL); return; }
    if (!naAgua && Math.random() < 0.0008) grade[i] = VAZIO;   // ressecou
  } });

const GIRINO = registrar({ nome: "Girino", cor: [40, 200, 160], tipo: "fixo",
  d: 99, e0: VIDA_INICIAL, rara: true, sobreAgua: true,
  reagir(i, x, y) {
    if (movido[i] || sofrer(i)) return;
    const naAgua = vizinhos(i).some(j => ehAgua(grade[j]));
    gastar(i, naAgua ? 90 : 12);                       // fora da água, morre rápido
    for (const j of vizinhos(i)) {
      if (grade[j] === ALGA && Math.random() < 0.2) {  // come a alga: vira água
        grade[j] = AGUA;
        estado[i] = Math.min(255, estado[i] + 50);
        break;
      }
    }
    if (estado[i] >= 170) { nascer(i, SAPO, VIDA_INICIAL); return; } // vira sapo
    if (!naAgua) { cair(i, x, y, false); return; }
    if (Math.random() < 0.4) {                         // nada dentro da água
      const j = escolher(viz8(x, y).filter(k => ehAgua(grade[k])));
      if (j >= 0) trocar(i, j);
    }
  } });

const SAPO = registrar({ nome: "Sapo", cor: [120, 220, 90], tipo: "fixo",
  d: 99, e0: VIDA_INICIAL, rara: true,
  reagir(i, x, y) {
    if (movido[i] || sofrer(i)) return;
    gastar(i, 140);
    for (const j of viz8(x, y)) {                      // come vaga-lume
      if (grade[j] === VAGALUME && Math.random() < 0.4) {
        grade[j] = VAZIO;
        estado[i] = Math.min(255, estado[i] + 70);
        return;
      }
    }
    if (estado[i] >= 150 && Math.random() < 0.02) {    // bota ovo
      const j = escolher(viz8(x, y).filter(k => grade[k] === VAZIO || ehAgua(grade[k])));
      if (j >= 0) { estado[i] -= 70; nascer(j, OVO, 1); return; }
    }
    if (cair(i, x, y, false)) return;
    if (Math.random() < 0.06 && y > 0) {               // pulinho
      const nx = x + (Math.random() < 0.5 ? -1 : 1);
      if (nx >= 0 && nx < W && pode((y - 1) * W + nx, true)) {
        trocar(i, (y - 1) * W + nx); return;
      }
    }
    if (Math.random() < 0.25) andar(i, x, y, false, true);
  } });

// Vaga-lume: voa sem rumo. Encostou na teia, fica preso (estado = 1).
const VAGALUME = registrar({ nome: "Vaga-lume", cor: [230, 255, 100],
  tipo: "fixo", d: 99, rara: true,
  reagir(i, x, y) {
    if (movido[i]) return;
    if (temp[i] > 100 || temp[i] < -20) { grade[i] = VAZIO; return; }
    if (estado[i] === 1) {                             // preso: só espera
      if (Math.random() < 0.0004) estado[i] = 0;       // às vezes consegue se soltar
      return;
    }
    if (viz8(x, y).some(j => grade[j] === TEIA)) { estado[i] = 1; return; }
    if (Math.random() < NASCE_VAGALUME) {
      const j = escolher(viz8(x, y).filter(k => grade[k] === VAZIO));
      if (j >= 0) nascer(j, VAGALUME, 0);
    }
    if (Math.random() < 0.5) {                         // voa sem rumo
      const j = escolher(viz8(x, y).filter(k => grade[k] === VAZIO));
      if (j >= 0) trocar(i, j);
    }
  } });

// quem conta como "animal" para ataques
const ANIMAIS = [CUPIM, CARANGUEJO, ARANHA, DINOSSAURO, GIRINO, SAPO, VAGALUME];
CORROIVEIS.push(...ANIMAIS);                           // o ácido também mata bichos

// ===== Texturas (pixel art desenhada por cima do jogo) =====
// Cada letra é um pixel; "." é transparente. A paleta diz a cor de cada letra.
function fazerSprite(linhas, paleta) {
  const c = document.createElement("canvas");
  c.width = linhas[0].length * ESCALA_SPRITE;
  c.height = linhas.length * ESCALA_SPRITE;
  const k = c.getContext("2d");
  linhas.forEach((linha, y) => {
    [...linha].forEach((ch, x) => {
      if (ch === ".") return;
      k.fillStyle = paleta[ch];
      k.fillRect(x * ESCALA_SPRITE, y * ESCALA_SPRITE, ESCALA_SPRITE, ESCALA_SPRITE);
    });
  });
  return c;
}

const SPRITES = [];

SPRITES[CUPIM] = fazerSprite([
  ".d...d.",
  ".bbbbb.",
  "bbbbbbb",
  ".d.d.d.",
], { b: "#e1be82", d: "#785028" });

SPRITES[CARANGUEJO] = fazerSprite([
  "r.w...w.r",
  "rr.rrr.rr",
  ".rrrrrrr.",
  ".r.r.r.r.",
], { r: "#eb4632", w: "#ffffff" });

SPRITES[ARANHA] = fazerSprite([
  "l..l.l..l",
  ".l.ppp.l.",
  "..lprpl..",
  ".l.ppp.l.",
  "l..l.l..l",
], { l: "#33204a", p: "#6e3c8c", r: "#ff3030" });

SPRITES[DINOSSAURO] = fazerSprite([
  ".......ggg.",
  "......ggeg.",
  "......gggg.",
  "g....ggggg.",
  "gggggggg...",
  ".yyyyyyy...",
  "..g.g.g....",
], { g: "#50aa3c", y: "#d8c860", e: "#111111" });

SPRITES[GIRINO] = fazerSprite([
  ".bbb..",
  "wbbbtt",
  ".bbb..",
], { b: "#32a08c", t: "#32a08c", w: "#ffffff" });

SPRITES[SAPO] = fazerSprite([
  ".wg...gw.",
  ".ggggggg.",
  "ggggggggg",
  ".yyyyyyy.",
  "gg.....gg",
], { g: "#78dc5a", y: "#e6e6a0", w: "#ffffff" });

SPRITES[VAGALUME] = fazerSprite([
  "w...w",
  ".kkk.",
  "..k..",
  ".yyy.",
  "..y..",
], { w: "#d8e8ff", k: "#2a2a2a", y: "#f0ff64" });

SPRITES[OVO] = fazerSprite([
  ".o.",
  "oko",
  ".o.",
], { o: "#ebebc8", k: "#506450" });

// camada transparente por cima do jogo, onde as imagens são desenhadas
const camada = document.createElement("canvas");
camada.width = W * CELULA;
camada.height = H * CELULA;
camada.style.cssText = "position:absolute;left:0;top:0;pointer-events:none";
document.body.appendChild(camada);
const ctxBichos = camada.getContext("2d");
ctxBichos.imageSmoothingEnabled = false;

let quadro = 0;
const desenharBase = desenhar;
desenhar = function () {
  desenharBase();
  quadro++;
  ctxBichos.clearRect(0, 0, camada.width, camada.height);
  if (modoCalor) return;                               // no mapa de calor, sem imagens
  for (let i = 0; i < W * H; i++) {
    const s = SPRITES[grade[i]];
    if (!s) continue;
    const cx = (i % W) * CELULA + CELULA / 2;
    const cy = ((i / W) | 0) * CELULA + CELULA / 2;
    if (grade[i] === VAGALUME) {                       // brilho; preso, ele pisca
      const piscando = estado[i] === 1 && ((quadro >> 3) & 1);
      ctxBichos.fillStyle = piscando ? "rgba(255,255,140,0.10)" : "rgba(235,255,110,0.28)";
      ctxBichos.beginPath();
      ctxBichos.arc(cx, cy, 8, 0, 6.2832);
      ctxBichos.fill();
    }
    ctxBichos.drawImage(s, Math.round(cx - s.width / 2), Math.round(cy - s.height / 2));
  }
};