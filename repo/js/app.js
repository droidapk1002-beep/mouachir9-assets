var MOUACHIR_API = 'https://mouachir9-backend.onrender.com';

const state = {
  site: null,
  cycle: null,
  niveau: null,
  matieresDisponibles: {},
  matieresSelectionnees: new Set(),
  fiches: [],
  fichesFiltrees: [],
  fichesSelectionnees: new Set(),
  currentDiscoveryJob: null,
  currentDownloadJob: null,
  dernierDossierTelecharge: null,
  vue: 'table',
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

function initSiteCards() {
  $$(".site-card").forEach((card) => {
    card.addEventListener("click", () => {
      $$(".site-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      state.site = card.dataset.site;
      resetApresSite();
      chargerCycles();
    });
  });
}

function resetApresSite() {
  state.cycle = null;
  state.niveau = null;
  state.matieresDisponibles = {};
  state.matieresSelectionnees.clear();
  state.fiches = [];
  state.fichesSelectionnees.clear();
  $("#panel-niveau").style.display = "block";
  $("#panel-fiches").style.display = "none";
  $("#panel-download").style.display = "none";
  $("#select-cycle").innerHTML = '<option value="">\u2014 choisir \u2014</option>';
  $("#select-niveau").innerHTML = '<option value="">\u2014 choisir le cycle d\'abord \u2014</option>';
  $("#select-niveau").disabled = true;
  $("#matieres-grid").innerHTML = '<span class="chip-empty">choisir un niveau pour voir les mati\u00e8res</span>';
  $("#btn-decouvrir").disabled = true;
}

async function apiGet(url) {
  var fullUrl = MOUACHIR_API + url;
  var r;
  try { r = await fetch(fullUrl); }
  catch(e) { throw new Error("Backend inaccessible. V\u00e9rifiez MOUACHIR_API ou lancez le serveur."); }
  var d = await r.json().catch(function(){ return {}; });
  if(!r.ok) throw new Error(d.error || ('Erreur API (' + r.status + ')'));
  return d;
}

async function apiPost(url, body) {
  var fullUrl = MOUACHIR_API + url;
  var r;
  try { r = await fetch(fullUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch(e) { throw new Error("Backend inaccessible. V\u00e9rifiez MOUACHIR_API ou lancez le serveur."); }
  var d = await r.json().catch(function(){ return {}; });
  if(!r.ok) throw new Error(d.error || ('Erreur API (' + r.status + ')'));
  return d;
}

async function chargerCycles() {
  const data = await apiGet("/api/cycles/" + state.site);
  state._cyclesData = data;
  const sel = $("#select-cycle");
  sel.innerHTML = '<option value="">\u2014 choisir \u2014</option>';
  Object.entries(data).forEach(([slug, info]) => {
    const opt = document.createElement("option");
    opt.value = slug;
    opt.textContent = info.label || slug;
    sel.appendChild(opt);
  });
}

function onCycleChange() {
  const cycle = $("#select-cycle").value;
  state.cycle = cycle || null;
  state.niveau = null;
  state.matieresDisponibles = {};
  state.matieresSelectionnees = new Set();
  $("#btn-decouvrir").disabled = true;
  $("#matieres-grid").innerHTML = '<span class="chip-empty">choisir un niveau pour voir les mati\u00e8res</span>';
  const selNiveau = $("#select-niveau");
  selNiveau.innerHTML = '<option value="">\u2014 choisir \u2014</option>';
  if (!cycle) { selNiveau.disabled = true; return; }
  const niveaux = state._cyclesData[cycle].niveaux;
  Object.entries(niveaux).forEach(([slug, label]) => {
    const opt = document.createElement("option");
    opt.value = slug;
    opt.textContent = label;
    selNiveau.appendChild(opt);
  });
  selNiveau.disabled = false;
}

function onNiveauChange() {
  const niveau = $("#select-niveau").value;
  state.niveau = niveau || null;
  $("#btn-decouvrir").disabled = !niveau;
  if (niveau) chargerMatieresReelles();
}

let _matieresRequestToken = 0;

async function chargerMatieresReelles() {
  const monToken = ++_matieresRequestToken;
  const siteAuMoment = state.site;
  const cycleAuMoment = state.cycle;
  const niveauAuMoment = state.niveau;
  const grid = $("#matieres-grid");
  grid.innerHTML = '<span class="chip-empty">\u23f3 r\u00e9cup\u00e9ration des mati\u00e8res disponibles...</span>';
  const diagLines = [];
  const res = await apiPost("/api/matieres", { site: siteAuMoment, cycle: cycleAuMoment, niveau: niveauAuMoment });
  const { job_id } = res;
  ouvrirSSE(job_id, {
    onLog: (d) => {
      if (monToken !== _matieresRequestToken) return;
      diagLines.push(d.msg);
      grid.innerHTML = '<span class="chip-empty">\u23f3 r\u00e9cup\u00e9ration en cours...</span>' +
        '<div class="diag-log">' + diagLines.map(escapeHtml).join("<br>") + '</div>';
    },
    onEnd: async () => {
      if (monToken !== _matieresRequestToken) return;
      const jobRes = await apiGet("/api/job/" + job_id);
      if (monToken !== _matieresRequestToken) return;
      if (jobRes.error || !jobRes.result) {
        grid.innerHTML = '<span class="chip-empty">\u26a0 impossible de r\u00e9cup\u00e9rer les mati\u00e8res</span>' +
          (diagLines.length ? '<div class="diag-log">' + diagLines.map(escapeHtml).join("<br>") + '</div>' : "");
        state.matieresDisponibles = {};
        return;
      }
      state.matieresDisponibles = jobRes.result.matieres || {};
      afficherChipsMatieres();
    },
  });
}

function afficherChipsMatieres() {
  const grid = $("#matieres-grid");
  const entries = Object.entries(state.matieresDisponibles);
  if (!entries.length) {
    grid.innerHTML = '<span class="chip-empty">aucune mati\u00e8re d\u00e9tect\u00e9e</span>';
    return;
  }
  grid.innerHTML = "";
  const actions = document.createElement("div");
  actions.className = "matieres-actions";
  actions.innerHTML = '<button type="button" class="btn-mini" id="btn-tout-selectionner">\u2713 Tout s\u00e9lectionner</button>' +
    '<button type="button" class="btn-mini" id="btn-tout-deselectionner">\u2717 Tout d\u00e9s\u00e9lectionner</button>';
  grid.appendChild(actions);
  const chipsWrap = document.createElement("div");
  chipsWrap.className = "matieres-chips-wrap";
  grid.appendChild(chipsWrap);
  state.matieresSelectionnees = new Set();
  entries.forEach(([slug, label]) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = label;
    chip.dataset.slug = slug;
    chip.addEventListener("click", () => {
      chip.classList.toggle("selected");
      if (chip.classList.contains("selected")) state.matieresSelectionnees.add(slug);
      else state.matieresSelectionnees.delete(slug);
    });
    chipsWrap.appendChild(chip);
  });
  $("#btn-tout-selectionner").addEventListener("click", () => {
    $$(".chip", chipsWrap).forEach((c) => { c.classList.add("selected"); state.matieresSelectionnees.add(c.dataset.slug); });
  });
  $("#btn-tout-deselectionner").addEventListener("click", () => {
    $$(".chip", chipsWrap).forEach((c) => c.classList.remove("selected"));
    state.matieresSelectionnees.clear();
  });
}

function logLine(container, msg, cls) {
  const div = document.createElement("div");
  div.className = "line" + (cls ? " " + cls : "");
  div.textContent = msg;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function ouvrirSSE(jobId, cbs) {
  var base = MOUACHIR_API || '';
  var es = new EventSource(base + "/api/stream/" + jobId);
  es.addEventListener("log", (e) => cbs.onLog && cbs.onLog(JSON.parse(e.data)));
  es.addEventListener("progress", (e) => cbs.onProgress && cbs.onProgress(JSON.parse(e.data)));
  es.addEventListener("end", (e) => { cbs.onEnd && cbs.onEnd(JSON.parse(e.data)); es.close(); });
  es.onerror = () => {};
  return es;
}

async function lancerDecouverte() {
  const matieresDisponibles = Object.keys(state.matieresDisponibles || {});
  if (matieresDisponibles.length && state.matieresSelectionnees.size === 0) {
    alert("Veuillez s\u00e9lectionner au moins une mati\u00e8re.");
    return;
  }
  const btn = $("#btn-decouvrir");
  btn.disabled = true;
  $("#panel-fiches").style.display = "block";
  $("#fiches-progress").classList.add("visible");
  $("#fiches-log").innerHTML = "";
  $("#fiches-table-wrap").innerHTML = '<div class="empty-state"><div class="glyph">\u23f3</div>D\u00e9couverte en cours\u2026</div>';
  setProgress("#fiches-progress", 0, 0, 0, 0);
  const btnAnnuler = $("#btn-annuler-decouverte");
  btnAnnuler.style.display = "inline-flex";
  btnAnnuler.disabled = false;
  const res = await apiPost("/api/decouvrir", { site: state.site, cycle: state.cycle, niveau: state.niveau, matieres: Array.from(state.matieresSelectionnees) });
  const { job_id } = res;
  state.currentDiscoveryJob = job_id;
  const tempsDebut = Date.now();
  const minuteur = setInterval(() => {
    const s = Math.floor((Date.now() - tempsDebut) / 1000);
    const m = Math.floor(s / 60);
    const reste = s % 60;
    $("#fiches-elapsed").textContent = m > 0 ? m + " min " + reste + "s \u00e9coul\u00e9es" : reste + "s \u00e9coul\u00e9es";
  }, 1000);
  ouvrirSSE(job_id, {
    onLog: (d) => logLine($("#fiches-log"), d.msg),
    onProgress: (d) => { if (d.phase === "discover") setProgress("#fiches-progress", d.current, d.total, null, null, d.label); },
    onEnd: async () => {
      clearInterval(minuteur);
      btn.disabled = false;
      btnAnnuler.style.display = "none";
      const jobRes = await apiGet("/api/job/" + job_id);
      if (jobRes.error) {
        logLine($("#fiches-log"), "\u2717 Erreur : " + jobRes.error, "err");
        $("#fiches-table-wrap").innerHTML = '<div class="empty-state"><div class="glyph">\u26a0</div>\u00c9chec de la d\u00e9couverte.</div>';
        return;
      }
      state.fiches = (jobRes.result && jobRes.result.fiches) || [];
      state.fichesSelectionnees = new Set(state.fiches.map((_, i) => i));
      afficherFiches();
    },
  });
}

function setProgress(sel, current, total, ok, err, label) {
  const root = $(sel);
  const pct = total ? Math.round((current / total) * 100) : 0;
  root.querySelector(".progress-bar-fill").style.width = pct + "%";
  const stats = root.querySelector(".progress-stats");
  let txt = current + "/" + (total || "?");
  if (label) txt += "  \u00b7  " + label;
  let okErrTxt = "";
  if (ok !== null && ok !== undefined) okErrTxt = '<span class="ok">\u2713 ' + ok + '</span> \u00b7 <span class="err">\u2717 ' + err + '</span>';
  stats.innerHTML = '<span>' + txt + '</span><span>' + okErrTxt + '</span>';
}

function estCycleSecondaire() {
  return state.cycle === "lycee" || state.fiches.some((f) => f.filiere);
}

function changerVue(vue) {
  state.vue = vue;
  document.querySelectorAll('.vbtn').forEach(function(b) { b.classList.toggle('act', b.dataset.view === vue); });
  if (state.fiches.length) rendreVue();
}

function rendreVue() {
  if (state.vue === 'cards') rendreCartes();
  else rendreTableau();
}

function afficherFiches() {
  state.fichesFiltrees = state.fiches.slice();
  state.vue = 'table';
  document.querySelectorAll('.vbtn').forEach(function(b) { b.classList.toggle('act', b.dataset.view === 'table'); });
  initialiserFiltres();
  rendreTableau();
}

function rendreTableau() {
  const wrap = $("#fiches-table-wrap");
  const avecFiliere = estCycleSecondaire();
  if (!state.fiches.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="glyph">\u2205</div>Aucune fiche trouv\u00e9e.</div>';
    $("#panel-download").style.display = "none";
    $("#filtres-row").style.display = "none";
    return;
  }
  if (!state.fichesFiltrees.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="glyph">\u2315</div>Aucune fiche ne correspond aux filtres.</div>';
    updateCompteur();
    return;
  }
  const LABELS_TRIM = { 1: "1er trim.", 2: "2e trim.", 3: "3e trim.", 0: "\u2014" };
  const rows = state.fichesFiltrees.map((f) => {
    const i = state.fiches.indexOf(f);
    const badges = [];
    if (f.type_doc === "E") badges.push('<span class="badge examen">\u0627\u0645\u062a\u062d\u0627\u0646</span>');
    if (f.type_doc === "D") badges.push('<span class="badge devoir">\u0641\u0631\u0636</span>');
    if (f.corrige) badges.push('<span class="badge corrige">\u2713 \u0645\u0635\u062d\u062d</span>');
    const annee = f.annee ? f.annee : "\u2014";
    const trim = LABELS_TRIM[f.trimestre] ?? "\u2014";
    const filiereCell = avecFiliere ? "<td>" + escapeHtml(f.filiere || "\u2014") + "</td>" : "";
    const base = MOUACHIR_API || '';
    const voirLink = f.url ? '<a href="' + base + '/api/resolve-pdf?url=' + encodeURIComponent(f.url) + '&site=' + encodeURIComponent(state.site) + '" target="_blank" class="btn-voir" title="Voir le sujet">\u{1F441}</a>' : "";
    return '<tr data-idx="' + i + '">' +
      '<td><input type="checkbox" class="fiche-check" data-idx="' + i + '"' + (state.fichesSelectionnees.has(i) ? " checked" : "") + '></td>' +
      '<td class="titre">' + escapeHtml(f.titre) + " " + voirLink + "</td>" +
      "<td>" + escapeHtml(f.matiere) + "</td>" +
      filiereCell +
      "<td>" + trim + "</td>" +
      "<td>" + annee + "</td>" +
      '<td class="badge-cell">' + badges.join(" ") + "</td>" +
      "</tr>";
  }).join("");
  wrap.innerHTML = '<table class="fiches"><thead><tr>' +
    '<th style="width:34px"><input type="checkbox" id="check-all"></th>' +
    '<th>\u0627\u0644\u0639\u0646\u0648\u0627\u0646</th>' +
    '<th>\u0627\u0644\u0645\u0627\u062f\u0629</th>' +
    (avecFiliere ? '<th>\u0627\u0644\u0634\u0639\u0628\u0629</th>' : "") +
    '<th>\u0627\u0644\u0641\u0635\u0644</th>' +
    '<th>\u0627\u0644\u0633\u0646\u0629</th>' +
    '<th>\u0627\u0644\u0646\u0648\u0639</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';
  const toutesCochees = state.fichesFiltrees.every((f) => state.fichesSelectionnees.has(state.fiches.indexOf(f)));
  $("#check-all").checked = toutesCochees;
  $("#check-all").addEventListener("change", (e) => {
    const checked = e.target.checked;
    state.fichesFiltrees.forEach((f) => { const idx = state.fiches.indexOf(f); if (checked) state.fichesSelectionnees.add(idx); else state.fichesSelectionnees.delete(idx); });
    rendreVue();
  });
  $$(".fiche-check").forEach((cb) => {
    cb.addEventListener("change", (e) => { const idx = parseInt(e.target.dataset.idx, 10); if (e.target.checked) state.fichesSelectionnees.add(idx); else state.fichesSelectionnees.delete(idx); updateCompteur(); });
  });
  updateCompteur();
  $("#panel-download").style.display = "block";
}

function rendreCartes() {
  var wrap = $("#fiches-table-wrap");
  var avecFiliere = estCycleSecondaire();
  if (!state.fiches.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="glyph">\u2205</div>Aucune fiche trouv\u00e9e.</div>';
    $("#panel-download").style.display = "none";
    $("#filtres-row").style.display = "none";
    return;
  }
  if (!state.fichesFiltrees.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="glyph">\u2315</div>Aucune fiche ne correspond aux filtres.</div>';
    updateCompteur();
    return;
  }
  const LABELS_TRIM = { 1: "1er trim.", 2: "2e trim.", 3: "3e trim.", 0: "\u2014" };
  const base = MOUACHIR_API || '';
  const cards = state.fichesFiltrees.map(function(f) {
    const i = state.fiches.indexOf(f);
    const badges = [];
    if (f.type_doc === "E") badges.push('<span class="badge examen">Examen</span>');
    if (f.type_doc === "D") badges.push('<span class="badge devoir">Devoir</span>');
    if (f.corrige) badges.push('<span class="badge corrige">\u2713 Corrig\u00e9</span>');
    const annee = f.annee ? f.annee : "\u2014";
    const trim = LABELS_TRIM[f.trimestre] || "\u2014";
    const filiereHtml = avecFiliere && f.filiere ? '<div class="c-filiere">' + escapeHtml(f.filiere) + "</div>" : "";
    const voirLink = f.url ? '<a href="' + base + '/api/resolve-pdf?url=' + encodeURIComponent(f.url) + '&site=' + encodeURIComponent(state.site) + '" target="_blank" class="btn-voir">\u{1F441}</a>' : "";
    return '<div class="fc" data-idx="' + i + '">' +
      '<label class="fc-cb"><input type="checkbox" class="fiche-check" data-idx="' + i + '"' + (state.fichesSelectionnees.has(i) ? " checked" : "") + "></label>" +
      '<div class="fc-body"><div class="fc-titre">' + escapeHtml(f.titre) + " " + voirLink + "</div>" +
      '<div class="fc-meta"><span class="fc-mat">' + escapeHtml(f.matiere) + "</span>" + filiereHtml +
      '<span class="fc-trim">' + trim + "</span><span class=\"fc-annee\">" + annee + "</span></div>" +
      '<div class="fc-badges">' + badges.join(" ") + "</div></div></div>";
  }).join("");
  wrap.innerHTML = '<div class="fc-grid">' + cards + "</div>";
  $$(".fc .fiche-check").forEach(function(cb) {
    cb.addEventListener("change", function(e) { var idx = parseInt(e.target.dataset.idx, 10); if (e.target.checked) state.fichesSelectionnees.add(idx); else state.fichesSelectionnees.delete(idx); updateCompteur(); });
  });
  updateCompteur();
  $("#panel-download").style.display = "block";
}

function updateCompteur() {
  const selSize = state.fichesSelectionnees.size;
  $("#fiches-count").innerHTML = "<b>" + selSize + "</b> / " + state.fiches.length + " fiches s\u00e9lectionn\u00e9es" +
    (selSize > 0 ? ' <span style="opacity:.7;font-size:11px;">\u2b07 ' + selSize + " seront t\u00e9l\u00e9charg\u00e9es</span>" : ' <span style="opacity:.5;">\u21d0 cochez des fiches</span>') +
    (state.fichesFiltrees.length !== state.fiches.length ? ' <span style="opacity:.6">(' + state.fichesFiltrees.length + " affich\u00e9es)</span>" : "");
  const cbAll = document.getElementById("check-all");
  if (cbAll) {
    const toutesCochees = state.fichesFiltrees.length > 0 && state.fichesFiltrees.every((f) => state.fichesSelectionnees.has(state.fiches.indexOf(f)));
    cbAll.checked = toutesCochees;
  }
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function initialiserFiltres() {
  const row = $("#filtres-row");
  if (!state.fiches.length) { row.style.display = "none"; return; }
  row.style.display = "flex";
  const avecFiliere = estCycleSecondaire();
  $("#filtre-filiere").style.display = avecFiliere ? "inline-block" : "none";
  remplirOptions("#filtre-matiere", Array.from(new Set(state.fiches.map((f) => f.matiere))).sort());
  if (avecFiliere) remplirOptions("#filtre-filiere", Array.from(new Set(state.fiches.map((f) => f.filiere).filter(Boolean))).sort());
  remplirOptions("#filtre-annee", Array.from(new Set(state.fiches.map((f) => f.annee).filter(Boolean))).sort((a, b) => b - a));
  $$(".filtre-input").forEach((el) => { el.value = ""; });
  $$(".filtre-input").forEach((el) => { el.removeEventListener("input", appliquerFiltres); el.addEventListener("input", appliquerFiltres); });
  $("#btn-effacer-filtres").onclick = () => { $$(".filtre-input").forEach((el) => { el.value = ""; }); appliquerFiltres(); };
}

function remplirOptions(selector, valeurs) {
  const sel = $(selector);
  const premiereOption = sel.querySelector("option");
  sel.innerHTML = "";
  sel.appendChild(premiereOption);
  valeurs.forEach((v) => { const opt = document.createElement("option"); opt.value = v; opt.textContent = v; sel.appendChild(opt); });
}

function appliquerFiltres() {
  const titreQ = $("#filtre-titre").value.trim().toLowerCase();
  const matiereQ = $("#filtre-matiere").value;
  const filiereQ = $("#filtre-filiere").value;
  const trimestreQ = $("#filtre-trimestre").value;
  const anneeQ = $("#filtre-annee").value;
  const typeQ = $("#filtre-type").value;
  const corrigeQ = $("#filtre-corrige").value;
  const limiteQ = parseInt($("#filtre-limite").value, 10) || 0;
  state.fichesFiltrees = state.fiches.filter((f) => {
    if (titreQ && !(f.titre || "").toLowerCase().includes(titreQ)) return false;
    if (matiereQ && f.matiere !== matiereQ) return false;
    if (filiereQ && f.filiere !== filiereQ) return false;
    if (trimestreQ && String(f.trimestre) !== trimestreQ) return false;
    if (anneeQ && String(f.annee) !== anneeQ) return false;
    if (typeQ && f.type_doc !== typeQ) return false;
    if (corrigeQ === "1" && !f.corrige) return false;
    if (corrigeQ === "0" && f.corrige) return false;
    return true;
  });
  if (limiteQ > 0 && state.fichesFiltrees.length > limiteQ) state.fichesFiltrees = state.fichesFiltrees.slice(0, limiteQ);
  state.fichesSelectionnees = new Set(state.fichesFiltrees.map((f) => state.fiches.indexOf(f)));
  rendreVue();
}

function nomDossierStable(site, niveau) {
  const capitaliser = (s) => s.replace(/(^|_|-|(?<=\d))([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
  return capitaliser(site || "site") + "_" + capitaliser((niveau || "niveau").replace(/-/g, "_"));
}

async function lancerTelechargement(mode) {
  const fiches = state.fiches.filter((_, i) => state.fichesSelectionnees.has(i));
  if (!fiches.length) { alert("S\u00e9lectionnez au moins une fiche."); return; }
  const btnNormal = $("#btn-telecharger");
  const btnZip = $("#btn-telecharger-zip");
  const btnCloud = $("#btn-telecharger-cloud");
  const btnAnnuler = $("#btn-annuler-telechargement");
  [btnNormal, btnZip, btnCloud].forEach((b) => { if (b) b.disabled = true; });
  btnAnnuler.style.display = "inline-flex";
  btnAnnuler.disabled = false;
  $("#download-progress").classList.add("visible");
  $("#download-log").innerHTML = "";
  $("#download-result").classList.remove("visible");
  setProgress("#download-progress", 0, fiches.length, 0, 0);
  const dossier = mode === "zip" ? nomDossierStable(state.site, state.niveau) + "_zip_" + Date.now() : nomDossierStable(state.site, state.niveau);
  state.dernierDossierTelecharge = dossier;
  const niveauLabel = $("#select-niveau").selectedOptions[0] ? $("#select-niveau").selectedOptions[0].textContent : state.niveau || "";
  const res = await apiPost("/api/telecharger", { site: state.site, fiches, dossier, niveau: niveauLabel, separer_corrige: $("#chk-separer-corrige") ? $("#chk-separer-corrige").checked : true, clean_pdf: $("#chk-clean-pdf") ? $("#chk-clean-pdf").checked : true, cover_footer: $("#chk-cover-footer") ? $("#chk-cover-footer").checked : false });
  const { job_id } = res;
  state.currentDownloadJob = job_id;
  ouvrirSSE(job_id, {
    onLog: (d) => logLine($("#download-log"), d.msg),
    onProgress: (d) => {
      if (d.phase === "download") {
        setProgress("#download-progress", d.current, d.total, d.ok, d.err);
        logLine($("#download-log"), (d.success ? "\u2713 " : "\u2717 ") + d.titre + "  \u2014  " + d.info, d.success ? "ok" : "err");
      }
    },
    onEnd: async () => {
      [btnNormal, btnZip, btnCloud].forEach((b) => { if (b) b.disabled = false; });
      btnAnnuler.style.display = "none";
      state.currentDownloadJob = null;
      const jobRes = await apiGet("/api/job/" + job_id);
      const banner = $("#download-result");
      banner.classList.add("visible");
      if (jobRes.error) { banner.innerHTML = "\u2717 Erreur : " + escapeHtml(jobRes.error); return; }
      const r = jobRes.result || {};
      let html = "\ud83c\udfc1 Termin\u00e9 \u2014 <b>" + (r.ok || 0) + "</b> t\u00e9l\u00e9charg\u00e9s, <b>" + (r.err || 0) + "</b> \u00e9checs. Dossier : <span class=\"dl-link\">" + escapeHtml(dossier) + "</span>";
      if (mode === "zip" && (r.ok || 0) > 0) {
        var base = MOUACHIR_API || '';
        fetch(base + "/api/zip/" + encodeURIComponent(dossier) + "?cleanup=1").then(z => z.json()).then(z => {
          if (z.ok) html += "<br>\ud83d\udce6 ZIP cr\u00e9\u00e9 : <code>" + escapeHtml(z.fichier) + "</code>";
          else html += "<br>\u2717 Erreur ZIP : " + escapeHtml(z.error || "");
          banner.innerHTML = html;
        }).catch(() => { html += "<br>\u2717 Erreur ZIP"; banner.innerHTML = html; });
      }
      banner.innerHTML = html;
    },
  });
}

async function lancerTelechargementCloud() {
  const select = $("#select-cloud-compte");
  const [provider, compte] = (select.value || "").split("::");
  if (!provider || !compte) { alert("Choisissez un compte cloud."); return; }
  const fiches = state.fiches.filter((_, i) => state.fichesSelectionnees.has(i));
  if (!fiches.length) { alert("S\u00e9lectionnez au moins une fiche."); return; }
  const btn = $("#btn-telecharger-plus-cloud");
  const btnNormal = $("#btn-telecharger");
  const btnZip = $("#btn-telecharger-zip");
  const btnCloud = $("#btn-telecharger-cloud");
  const btnAnnuler = $("#btn-annuler-telechargement");
  [btn, btnNormal, btnZip, btnCloud].forEach((b) => { if (b) b.disabled = true; });
  btnAnnuler.style.display = "inline-flex";
  btnAnnuler.disabled = false;
  $("#download-progress").classList.add("visible");
  $("#download-log").innerHTML = "";
  $("#download-result").classList.remove("visible");
  setProgress("#download-progress", 0, fiches.length, 0, 0);
  const dossier = nomDossierStable(state.site, state.niveau) + "_cloud_" + Date.now();
  state.dernierDossierTelecharge = dossier;
  const niveauLabel = $("#select-niveau").selectedOptions[0] ? $("#select-niveau").selectedOptions[0].textContent : state.niveau || "";
  const res = await apiPost("/api/telecharger-cloud", { site: state.site, fiches, dossier, niveau: niveauLabel, provider, compte, separer_corrige: $("#chk-separer-corrige") ? $("#chk-separer-corrige").checked : true, clean_pdf: $("#chk-clean-pdf") ? $("#chk-clean-pdf").checked : true, cover_footer: $("#chk-cover-footer") ? $("#chk-cover-footer").checked : false });
  const { job_id } = res;
  state.currentDownloadJob = job_id;
  ouvrirSSE(job_id, {
    onLog: (d) => logLine($("#download-log"), d.msg),
    onProgress: (d) => {
      if (d.phase === "download" || d.phase === "cloud") {
        setProgress("#download-progress", d.current, d.total, d.ok, d.err);
        if (d.titre) logLine($("#download-log"), (d.success ? "\u2713 " : "\u2717 ") + d.titre + "  \u2014  " + d.info, d.success ? "ok" : "err");
      }
    },
    onEnd: async () => {
      [btn, btnNormal, btnZip, btnCloud].forEach((b) => { if (b) b.disabled = false; });
      btnAnnuler.style.display = "none";
      state.currentDownloadJob = null;
      const jobRes = await apiGet("/api/job/" + job_id);
      const banner = $("#download-result");
      banner.classList.add("visible");
      if (jobRes.error) { banner.innerHTML = "\u2717 Erreur : " + escapeHtml(jobRes.error); return; }
      const r = jobRes.result || {};
      const cloud = r.cloud || {};
      let html = "\ud83c\udfc1 Termin\u00e9 \u2014 <b>" + (r.ok || 0) + "</b> t\u00e9l\u00e9charg\u00e9s, <b>" + (r.err || 0) + "</b> \u00e9checs.";
      if (cloud.ok !== undefined) {
        html += "<br>\u2601 Cloud (<em>" + escapeHtml(cloud.provider || provider) + "</em>) : <b>" + cloud.ok + "</b> envoy\u00e9s, <b>" + cloud.err + "</b> \u00e9checs.";
        const reussis = (cloud.fichiers || []).filter((f) => f.ok && f.url_partage);
        if (reussis.length) {
          html += '<div class="cloud-liens-list">' + reussis.map((f) => {
            const tailleKo = f.taille_octets ? Math.round(f.taille_octets / 1024) + " Ko" : "\u2014";
            return '<div class="cloud-lien-item">\ud83d\udcc4 ' + escapeHtml(f.nom) + " (" + tailleKo + ") \u2014 " +
              '<a class="dl-link" href="' + escapeHtml(f.url_partage) + '" target="_blank">lien de partage</a></div>';
          }).join("") + "</div>";
        }
      }
      banner.innerHTML = html;
    },
  });
}

async function envoyerVersCloud() {
  const dossier = state.dernierDossierTelecharge;
  if (!dossier) { alert("Utilisez le bouton \u00ab \u2b07\u2601 T\u00e9l\u00e9charger + Cloud \u00bb"); return; }
  const select = $("#select-cloud-compte");
  const [provider, compte] = (select.value || "").split("::");
  if (!provider || !compte) { alert("Choisissez un compte cloud."); return; }
  const btnCloud = $("#btn-telecharger-cloud");
  const btnAnnuler = $("#btn-annuler-telechargement");
  btnCloud.disabled = true;
  btnAnnuler.style.display = "inline-flex";
  btnAnnuler.disabled = false;
  $("#download-progress").classList.add("visible");
  $("#download-log").innerHTML = "";
  const res = await apiPost("/api/cloud-upload", { provider, compte, dossier });
  const { job_id } = res;
  state.currentDownloadJob = job_id;
  ouvrirSSE(job_id, {
    onLog: (d) => logLine($("#download-log"), d.msg),
    onEnd: async () => {
      btnCloud.disabled = false;
      btnAnnuler.style.display = "none";
      state.currentDownloadJob = null;
      const jobRes = await apiGet("/api/job/" + job_id);
      const banner = $("#download-result");
      banner.classList.add("visible");
      if (jobRes.error) { banner.innerHTML = "\u2717 Erreur cloud : " + escapeHtml(jobRes.error); return; }
      const r = jobRes.result || {};
      let html = "\u2601 Envoi vers " + escapeHtml(r.provider || "") + " (" + escapeHtml(r.compte || "") + ") termin\u00e9 \u2014 <b>" + (r.ok || 0) + "</b> envoy\u00e9s, <b>" + (r.err || 0) + "</b> \u00e9checs.";
      const reussis = (r.fichiers || []).filter((f) => f.ok && f.url_partage);
      if (reussis.length) {
        html += '<div class="cloud-liens-list">' + reussis.map((f) => {
          const tailleKo = f.taille_octets ? Math.round(f.taille_octets / 1024) + " Ko" : "\u2014";
          return '<div class="cloud-lien-item">\ud83d\udcc4 ' + escapeHtml(f.nom) + " (" + tailleKo + ") \u2014 " +
            '<a class="dl-link" href="' + escapeHtml(f.url_partage) + '" target="_blank">lien de partage</a></div>';
        }).join("") + "</div>";
      }
      banner.innerHTML = html;
    },
  });
}

function annulerDecouverteCourante() {
  if (!state.currentDiscoveryJob) return;
  var base = MOUACHIR_API || '';
  fetch(base + "/api/annuler/" + state.currentDiscoveryJob, { method: "POST" });
  logLine($("#fiches-log"), "\u23f9 Annulation demand\u00e9e...");
  $("#btn-annuler-decouverte").disabled = true;
}

function annulerTelechargementCourant() {
  if (!state.currentDownloadJob) return;
  var base = MOUACHIR_API || '';
  fetch(base + "/api/annuler/" + state.currentDownloadJob, { method: "POST" });
  logLine($("#download-log"), "\u23f9 Annulation demand\u00e9e...");
  $("#btn-annuler-telechargement").disabled = true;
}

function reinitialiserDashboard() {
  if (state.currentDiscoveryJob) { var base = MOUACHIR_API || ''; fetch(base + "/api/annuler/" + state.currentDiscoveryJob, { method: "POST" }); }
  if (state.currentDownloadJob) { var base2 = MOUACHIR_API || ''; fetch(base2 + "/api/annuler/" + state.currentDownloadJob, { method: "POST" }); }
  state.site = null; state.cycle = null; state.niveau = null;
  state.matieresDisponibles = {}; state.matieresSelectionnees = new Set();
  state.fiches = []; state.fichesFiltrees = []; state.fichesSelectionnees = new Set();
  state.currentDiscoveryJob = null; state.currentDownloadJob = null; state.dernierDossierTelecharge = null;
  $$(".site-card").forEach((c) => c.classList.remove("active"));
  $("#panel-niveau").style.display = "none";
  $("#panel-fiches").style.display = "none";
  $("#panel-download").style.display = "none";
  $("#fiches-log").innerHTML = "";
  $("#download-log").innerHTML = "";
  $("#download-result").classList.remove("visible");
  $("#fiches-progress").classList.remove("visible");
  $("#download-progress").classList.remove("visible");
  $("#btn-annuler-decouverte").style.display = "none";
  $("#btn-annuler-telechargement").style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const NOMS_PROVIDERS = { gdrive: "Google Drive", mega: "Mega", onedrive: "OneDrive" };
const _cloudConnectes = {};

async function verifierEtatCloud() {
  try {
    var base = MOUACHIR_API || '';
    const res = await fetch(base + "/api/cloud-status");
    const data = await res.json();
    if (data.pret && data.comptes && Object.keys(data.comptes).length) {
      if (data.connectes) Object.assign(_cloudConnectes, data.connectes);
      const select = $("#select-cloud-compte");
      select.innerHTML = "";
      Object.entries(data.comptes).forEach(([provider, noms]) => {
        noms.forEach((nom) => {
          const opt = document.createElement("option");
          opt.value = provider + "::" + nom;
          const key = provider + "::" + nom;
          const connecte = _cloudConnectes[key];
          let icone = "";
          if (connecte === true) icone = "\ud83d\udd13 ";
          else if (connecte === false) icone = "\ud83d\udd12 ";
          opt.textContent = icone + (NOMS_PROVIDERS[provider] || provider) + " \u2014 " + nom;
          select.appendChild(opt);
        });
      });
      $("#cloud-row").style.display = "flex";
      onCloudCompteChange();
    }
  } catch (e) {}
}

function onCloudCompteChange() {
  const select = $("#select-cloud-compte");
  const key = select.value;
  const connecte = _cloudConnectes[key];
  const btnCloud = $("#btn-telecharger-cloud");
  const btnCloudPlus = $("#btn-telecharger-plus-cloud");
  const btnConnect = $("#btn-connecter-cloud");
  if (connecte === false) { btnCloud.style.display = "none"; btnCloudPlus.style.display = "none"; btnConnect.style.display = "inline-flex"; }
  else { btnCloud.style.display = "inline-flex"; btnCloudPlus.style.display = "inline-flex"; btnConnect.style.display = "none"; }
}

document.addEventListener("click", (e) => {
  if (e.target.id === "btn-connecter-cloud") {
    const key = $("#select-cloud-compte").value;
    const [provider, compte] = key.split("::");
    if (provider === "gdrive") {
      logLine($("#download-log"), "\ud83d\udd11 Ouverture du navigateur pour l'authentification Google...");
      var base = MOUACHIR_API || '';
      fetch(base + "/api/cloud/google/auth?compte=" + encodeURIComponent(compte))
        .then(r => r.json())
        .then(d => {
          if (d.url) window.open(d.url, "cloud-oauth", "width=500,height=600,left=200,top=100");
          const poll = setInterval(() => {
            fetch(base + "/api/cloud/google/auth-status/" + encodeURIComponent(compte))
              .then(r => r.json())
              .then(sd => {
                if (sd.status === "connected") { clearInterval(poll); logLine($("#download-log"), "\ud83d\udd13 Compte " + compte + " connect\u00e9 !"); verifierEtatCloud(); }
                else if (sd.status === "error") { clearInterval(poll); logLine($("#download-log"), "\u274c \u00c9chec : " + (sd.error || "erreur inconnue")); }
              });
          }, 1500);
        })
        .catch(e => alert("Erreur : " + e.message));
    } else {
      alert("L'authentification automatique n'est pas encore support\u00e9e pour ce provider.");
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  initSiteCards();
  verifierEtatCloud();
  setInterval(verifierEtatCloud, 30000);
  $("#select-cycle").addEventListener("change", onCycleChange);
  $("#select-niveau").addEventListener("change", onNiveauChange);
  $("#btn-decouvrir").addEventListener("click", lancerDecouverte);
  $("#btn-annuler-decouverte").addEventListener("click", annulerDecouverteCourante);
  $("#btn-telecharger").addEventListener("click", () => lancerTelechargement("normal"));
  $("#btn-telecharger-zip").addEventListener("click", () => lancerTelechargement("zip"));
  $("#btn-telecharger-cloud").addEventListener("click", envoyerVersCloud);
  $("#btn-telecharger-plus-cloud").addEventListener("click", lancerTelechargementCloud);
  $("#select-cloud-compte").addEventListener("change", onCloudCompteChange);
  $("#btn-annuler-telechargement").addEventListener("click", annulerTelechargementCourant);
  $("#btn-reinitialiser").addEventListener("click", reinitialiserDashboard);
});
