/* ============================================================================
   Máriás versenykezelő – felület

   A motor a verseny.js-ben van, a feliratok a nyelv.js-ben (magyar/szlovák).
   Ez a fájl csak a képernyőt és a kattintásokat tartalmazza.
   ========================================================================== */
(function (global) {
  'use strict';

  var V = global.VERSENY;
  if (!V) { console.error('A verseny.js nem töltődött be a felület előtt.'); return; }
  var M = V.Motor, Tarolo = V.Tarolo, N = global.NYELV;

  /* ======================= segédek ====================================== */

  /* Ezek a felületek a közönségnek szólnak – ezeknek külön nyelvük van. */
  var KIVETITETT = { vetites: 1, rangsor: 1, nyomtat: 1, ora: 1, bekuld: 1 };

  function sz(kulcs, ertekek) { return N.sz(kulcs, ertekek); }
  function helySzoveg() { return M.helySzoveg(S.allapot, N.mod); }
  function szh(kulcs, ertekek) { return N.szhHtml(kulcs, ertekek); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function szam(v, alap) {
    if (v === '' || v === null || v === undefined) return alap === undefined ? 0 : alap;
    var n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : (alap === undefined ? 0 : alap);
  }
  function penz(n) { return (Math.round((n || 0) * 100) / 100).toFixed(2); }
  function vanErtek(v) { return v !== '' && v !== null && v !== undefined; }

  /* ======================= állapot ====================================== */

  var S = {
    allapot: null,
    nezet: 'nevezes',
    asztal: 1,
    uzenet: '',
    uzenetTipus: 'info',
    vetites: 'asztalok',
    elozoNezetek: [],      /* a Vissza gombhoz */
    beillesztNyitva: false, /* a nevezés lapon nyitva van-e a beillesztő doboz */
    torzsValtozott: [],    /* a programban módosított törzslista-sorok (a weblapra töltéshez) */
    torzsToroltek: [],     /* a programban törölt kódok */

    megerosites: null,     /* beépített megerősítés (nem böngésző-ablak) */
    ujJatekos: null,       /* későn érkező, akit el kell helyezni */
    kesoAsztal: null,
    bekuld: null,          /* a játékos beküldő oldala */
    bekuldKesz: false,
    bekuldLista: null      /* a szervezőhöz beérkezett beküldések */
  };

  var rajzolasFut = false;
  function uzen(tipus, szoveg) {
    S.uzenetTipus = tipus; S.uzenet = szoveg;
    /* ha épp nem rajzolunk, azonnal meg is jelenítjük – így nem veszik el */
    if (!rajzolasFut) render();
  }
  function hiba(szoveg) { uzen('hiba', szoveg); }
  function ok(szoveg) { uzen('ok', szoveg); }

  function mentes() {
    if (!Tarolo.ment(S.allapot)) hiba(sz('mentes_hiba'));
  }

  function jatekos(id) {
    var ki = null;
    (S.allapot.jatekosok || []).forEach(function (j) { if (j.id === id) ki = j; });
    return ki;
  }
  function nev(id) { var j = jatekos(id); return j ? j.nev : ('#' + id); }
  function aktivJatekosok() { return (S.allapot.jatekosok || []).slice(); }

  /* A címből: #bekuld/<kör>/<asztal>?e=<verseny>&k=<kódok>&n=<vendégnevek> */
  function bekuldCimOlvas(hash) {
    var t = String(hash || '').replace(/^#\/?/, '');
    if (t.indexOf('bekuld') !== 0) return null;
    var kerdo = t.indexOf('?');
    var ut = (kerdo < 0 ? t : t.slice(0, kerdo)).split('/');
    var p = {};
    if (kerdo >= 0) {
      t.slice(kerdo + 1).split('&').forEach(function (x) {
        var i = x.indexOf('=');
        if (i > 0) p[decodeURIComponent(x.slice(0, i))] = decodeURIComponent(x.slice(i + 1));
      });
    }
    var kodok = String(p.k || '').split(',').filter(function (x) { return x !== ''; }).map(Number);
    var vendeg = String(p.n || '').split('|').filter(function (x) { return x !== ''; });
    var nevek = [], vi = 0;
    kodok.forEach(function (id) {
      var t2 = torzsKeres(String(id));
      if (t2) nevek.push(t2.nev);
      else nevek.push(vendeg[vi++] || ('#' + id));
    });
    return {
      esemeny: p.e || '',
      kor: parseInt(ut[1], 10) || 0,
      asztal: parseInt(ut[2], 10) || 0,
      kodok: kodok,
      nevek: nevek
    };
  }
  function asztalLetszamok(korSzam) {
    var a = S.allapot;
    var kor = a.korok[(korSzam || 0) - 1];
    if (kor && kor.asztalok) return kor.asztalok.map(function (x) { return (x.szekek || []).length; });
    var aktiv = M.aktivJatekosok(a, (a.korok.length || 0) + 1);
    /* a négyes asztalok mindig a végére kerülnek */
    return M.asztalLetszamok(aktiv.length, szam(a.beall.asztalLetszam, 3), 'vegen');
  }
  function aktivDb() { return M.aktivJatekosok(S.allapot, (S.allapot.korok.length || 0) + 1).length; }
  function aktualisKor() { return S.allapot.korok[S.allapot.aktualisKor - 1] || null; }

  /* QR-kód SVG-ben (a qr.js mátrixából) */
  function qrSvg(szoveg, modul) {
    if (!global.QR || !szoveg) return '';
    var q = global.QR.matrix(szoveg, 'M');
    if (!q) return '';
    var m = modul || 3, csend = 2, meret = (q.meret + csend * 2) * m;
    var ut = '';
    for (var r = 0; r < q.meret; r++) {
      for (var c = 0; c < q.meret; c++) {
        if (q.matrix[r][c]) ut += 'M' + ((c + csend) * m) + ' ' + ((r + csend) * m) + 'h' + m + 'v' + m + 'h-' + m + 'z';
      }
    }
    return '<svg class="qr" width="' + meret + '" height="' + meret + '" viewBox="0 0 ' + meret + ' ' + meret +
      '" role="img" aria-label="QR"><rect width="' + meret + '" height="' + meret + '" fill="#fff"/><path d="' + ut + '" fill="#000"/></svg>';
  }

  /* A játékosnak szóló beküldő link. A kódokat visszük, a nevet csak a
     törzslistán nem szereplő (vendég) játékosoknál. */
  function bekuldoLink(korSzam, asztalSzam, szekek) {
    /* QR-kód csak akkor kerül a cédulára, ha be van kapcsolva. A címet nem kell
       beírni: ha üres, a program a saját (mub.sk) címét használja. */
    if (!S.allapot.beall.qrBe) return '';
    var cim = String(S.allapot.beall.webcim || S.allapot.beall.webcimAlap || V.ALAP.webcimAlap || '').trim();
    if (!cim) return '';
    if (cim.indexOf('#') >= 0) cim = cim.slice(0, cim.indexOf('#'));
    var kodok = [], vendegNevek = [];
    (szekek || []).forEach(function (id) {
      if (id === null || id === undefined) return;
      kodok.push(id);
      if (!torzsKeres(String(id))) vendegNevek.push(nev(id));
    });
    var link = cim + '#bekuld/' + korSzam + '/' + asztalSzam + '?e=' + encodeURIComponent(S.allapot.esemenyId || '') + '&k=' + kodok.join(',');
    if (vendegNevek.length) {
      var jelolt = link + '&n=' + encodeURIComponent(vendegNevek.join('|'));
      /* A vendégnevek csak kényelmi okból vannak benne. Ha túl hosszú lenne,
         kihagyjuk, hogy a QR-kód kényelmesen olvasható maradjon. */
      if (jelolt.length <= 240) link = jelolt;
    }
    return link;
  }

  /* A weblapról átvett verseny adatai a beállításokba. */
  function importAlkalmaz(imp) {
    if (!imp) return;
    var b = S.allapot.beall;
    /* A weblap a helyszínt két nyelven is átadhatja; ha csak egy van, azt használjuk. */
    b.helyHu = imp.helyHu || imp.hely || b.helyHu || b.hely || '';
    b.helySk = imp.helySk || (imp.helySk === '' ? '' : (imp.hely || b.helySk || ''));
    b.hely = b.helyHu;
    b.nev = imp.nev || b.helyHu || b.nev;
    b.datum = imp.datum || b.datum;
    if (imp.korok) b.korok = szam(imp.korok, b.korok);
    b.weblapJelentkezok = (imp.jelentkezok || []).slice();
    if (imp.teszt) b.feltoltesTiltva = true;
    b.weblapVerseny = imp.azonosito || '';
    S.fuggobenImport = null;
    mentes();
    S.uzenetTipus = 'ok';
    S.uzenet = sz('import_kesz', { nev: b.nev, n: b.weblapJelentkezok.length });
  }

  /* A weblapról jelentkezettek: ki van már a helyszínen, és ki hiányzik. */
  function weblapJelentkezokKartya() {
    var a = S.allapot;
    var jl = a.beall.weblapJelentkezok;
    if (!jl || !jl.length) return '';
    var hianyzo = M.hianyzoJelentkezok(jl, a.jatekosok);
    var ott = jl.length - hianyzo.length;
    /* szám szerint sorba: a kód szerint növekvő, a kód nélküliek a végére */
    var sorba = jl.map(function (r, i) { return { r: r, i: i }; }).sort(function (x, y) {
      var kx = parseInt(x.r.kod, 10), ky = parseInt(y.r.kod, 10);
      var vx = isFinite(kx) ? kx : 1e9, vy = isFinite(ky) ? ky : 1e9;
      if (vx !== vy) return vx - vy;
      return String(x.r.nev).localeCompare(String(y.r.nev), 'hu');
    });
    return '<div class="kartya-blokk weblap-kartya">' +
      '<h2>' + esc(sz('weblap_cim')) + '</h2>' +
      '<p class="sugo">' + esc(sz('weblap_db', { n: jl.length, k: ott, h: hianyzo.length })) + '</p>' +
      '<p class="sugo">' + esc(sz('weblap_kattints')) + '</p>' +
      '<div class="weblap-lista">' +
        sorba.map(function (x) {
          var r = x.r;
          var mar = M.hianyzoJelentkezok([r], a.jatekosok).length === 0;
          return '<button class="weblap-elem' + (mar ? ' megvan' : '') + '"' +
            (mar ? ' disabled' : ' data-t="weblap-felvesz" data-idx="' + x.i + '"') + '>' +
            '<span class="weblap-jel">' + (mar ? '✓' : '☐') + '</span>' +
            (r.kod ? '<span class="weblap-kod">' + esc(r.kod) + '</span>' : '') +
            '<span>' + esc(r.nev) + '</span>' +
            '</button>';
        }).join('') +
      '</div></div>';
  }

  /* Egy játékos felvétele kód vagy név alapján (a weblapi listához és a beillesztéshez).
     Visszaad: 'uj' (felvéve), 'mar' (már benevezve), 'vendeg' (nem volt a törzslistán). */
  function felveszNevbol(nev, kod) {
    var t = kod ? torzsKeres(String(kod)) : null;
    if (!t) { var e = M.nevEgyezes(torzsLista(), nev); if (e.length === 1) t = e[0]; }
    if (t) {
      if (M.keres(S.allapot.jatekosok, String(t.id))) return 'mar';
      jatekosFelvesz(t.id, t.nev, t.kartyakod);
      return 'uj';
    }
    var uj = M.ujVendegKod(S.allapot.jatekosok);
    S.allapot.jatekosok.push({ id: uj, nev: nev, kartyakod: '', kiemelt: false, vendeg: true });
    S.ujJatekos = S.allapot.korok.length ? uj : null;
    return 'vendeg';
  }

  /* Ha az illető a weblapon is jelentkezett, jelezzük. */
  function webesJelzes(nev, id) {
    var jl = S.allapot && S.allapot.beall && S.allapot.beall.weblapJelentkezok;
    if (!jl || !jl.length) return '';
    var kulcs = M.nevKulcs(nev);
    var volt = jl.some(function (r) {
      return M.nevKulcs(r.nev) === kulcs || (r.kod && String(r.kod) === String(id));
    });
    return volt ? ' ' + sz('weblap_volt') : '';
  }

  /* A beépített lista (roster.js) a weblap névsora. Ha a szervező betölti a
     sajátját (pl. 100 fölötti új kártyákkal), akkor az az érvényes. */
  function torzsLista() {
    var sajat = S.allapot && S.allapot.torzslista;
    return (sajat && sajat.length) ? sajat : (global.TORZSLISTA || []);
  }

  /* „kód; kártyaszám; név" sorok szövegből (tabulátor, pontosvessző vagy vessző) */
  function torzsSorok(szoveg) {
    var ki = [];
    String(szoveg || '').split(/\r?\n/).forEach(function (sor) {
      var t = String(sor).replace(/\u00a0/g, ' ').trim();
      if (!t) return;
      var mezok = (t.indexOf('\t') >= 0 ? t.split('\t') : (t.indexOf(';') >= 0 ? t.split(';') : t.split(',')))
        .map(function (x) { return x.trim().replace(/^"|"$/g, ''); });
      if (mezok.length < 3) return;
      var kod = parseInt(mezok[0], 10);
      if (!isFinite(kod) || kod <= 0) return;               /* fejléc vagy hibás sor */
      var kartya = String(mezok[1] || '').replace(/[^0-9]/g, '');
      var nev = mezok.slice(2).join(' ').replace(/\s+/g, ' ').trim();
      if (!nev) return;
      ki.push([kod, kartya, nev]);
    });
    return ki;
  }

  function torzsBetolt(fajl) {
    if (!fajl) return;
    var olvaso = new global.FileReader();
    olvaso.onload = function () {
      var sorok = torzsSorok(olvaso.result);
      if (sorok.length < 10) { hiba(sz('torzs_hiba')); render(); return; }
      S.allapot.torzslista = sorok;
      mentes(); render();
      ok(sz('torzs_kesz', { n: sorok.length }));
    };
    olvaso.readAsText(fajl);
  }

  function torzsKeres(kod) {
    var t = String(kod === null || kod === undefined ? '' : kod).trim();
    if (!t) return null;
    var lista = torzsLista();
    var n = parseInt(t, 10);
    for (var i = 0; i < lista.length; i++) {
      var sor = lista[i];
      if (!sor || !sor[2]) continue;
      if (String(sor[0]) === t || String(sor[1]) === t) return { id: sor[0], nev: sor[2], kartyakod: String(sor[1] || '') };
      if (isFinite(n) && parseInt(sor[0], 10) === n) return { id: sor[0], nev: sor[2], kartyakod: String(sor[1] || '') };
    }
    return null;
  }

  /* ======================= következő lépés =============================== */

  function hianyzoAsztalok(kor) {
    if (!kor) return [];
    return kor.asztalok.filter(function (a) {
      return !M.asztalEllenorzes(a, S.allapot.beall).kesz;
    }).map(function (a) { return a.asztal; });
  }

  function kovetkezoLepes() {
    var a = S.allapot;
    if (!aktivJatekosok().length) {
      return { cim: sz('lepes_nevezes'), sugo: sz('lepes_nevezes_sugo'), nezet: 'nevezes' };
    }
    if (!a.korok.length) {
      return { cim: sz('lepes_sorsolas'), sugo: sz('lepes_sorsolas_sugo'), nezet: 'sorsolas' };
    }
    var kor = aktualisKor() || a.korok[a.korok.length - 1];
    var hianyzo = hianyzoAsztalok(kor);
    if (hianyzo.length) {
      return {
        cim: sz('lepes_beiras', { asztal: hianyzo[0] }),
        sugo: sz('lepes_beiras_sugo', { n: hianyzo.length }),
        nezet: 'beiras', asztal: hianyzo[0]
      };
    }
    if (a.korok.length < szam(a.beall.korok, 5)) {
      return { cim: sz('lepes_uj_kor', { kor: a.korok.length + 1 }), sugo: sz('lepes_uj_kor_sugo'), nezet: 'sorsolas' };
    }
    return { cim: sz('lepes_vege'), sugo: sz('lepes_vege_sugo'), nezet: 'rangsor' };
  }

  /* ======================= fejléc ======================================= */

  function fejlec() {
    var a = S.allapot;
    var gombok = [
      ['nevezes', 'nav_nevezes'],
      ['sorsolas', (S.allapot && S.allapot.korok && S.allapot.korok.length) ? 'nav_beosztas' : 'nav_sorsolas'],
      ['beiras', 'nav_beiras'], ['ora', 'nav_ora'],
      ['rangsor', 'nav_rangsor'], ['vetites', 'nav_vetites'], ['nyomtat', 'nav_nyomtat'],
      ['beallitas', 'nav_beallitas'], ['sugo', 'nav_sugo']
    ];
    var nav = (S.elozoNezetek.length || S.nezet !== 'nevezes'
        ? '<button class="nav-gomb vissza-gomb" data-t="vissza">← ' + esc(sz('vissza')) + '</button>'
        : '') + gombok.map(function (g) {
      return '<button class="nav-gomb' + (S.nezet === g[0] ? ' aktiv' : '') + '" data-t="nezet" data-nezet="' + g[0] + '">' + esc(sz(g[1])) + '</button>';
    }).join('');

    var kor = aktualisKor();
    var korSzoveg = a.aktualisKor > 0
      ? sz('kor_jelzo', { kor: a.aktualisKor, osszes: a.beall.korok })
      : sz('nincs_sorsolas');
    if (kor && kor.asztalok.length) {
      var kesz = kor.asztalok.filter(function (x) { return M.asztalEllenorzes(x, a.beall).kesz; }).length;
      korSzoveg += ' · ' + sz('kesz_asztal', { kesz: kesz, ossz: kor.asztalok.length });
    }

    var caps = asztalLetszamok(a.korok.length ? a.aktualisKor : 0);   /* a négyes asztalok mindig a végén */
    var negyDb = caps.filter(function (c) { return c > szam(a.beall.asztalLetszam, 3); }).length;
    var alapltSzam = szam(a.beall.asztalLetszam, 3);
    var eloszlas = caps.length
      ? (!negyDb
        ? sz('minden_asztal_alap', { t: caps.length, alap: alapltSzam })
        : ((caps.length - negyDb) === 0
          ? sz('asztal_elosztas_nagy', { t: caps.length, nagy: alapltSzam + 1 })
          : sz('asztal_elosztas', { t: caps.length, a: caps.length - negyDb, alap: alapltSzam, b: negyDb, nagy: alapltSzam + 1 })))
      : '';

    function nyelvSor(mezo, ertek, tipus) {
      return '<div class="nyelv-sor"><span>' + esc(sz(tipus)) + '</span>' +
        ['hu', 'sk', 'mind'].map(function (mod) {
          var cimke = mod === 'mind' ? 'HU+SK' : mod.toUpperCase();
          return '<button class="nyelv-gomb' + (ertek === mod ? ' aktiv' : '') + '" data-t="nyelv" data-mezo="' + mezo + '" data-mod="' + mod + '">' + cimke + '</button>';
        }).join('') + '</div>';
    }
    var nyelvGombok = nyelvSor('nyelv', a.beall.nyelv, 'nyelv_kezelo') +
      nyelvSor('nyelvKivetites', a.beall.nyelvKivetites, 'nyelv_kivetites');

    return '' +
      '<header class="fej">' +
        '<div class="fej-bal">' +
          '<div class="cim">' + esc(a.beall.nev || helySzoveg() || sz('verseny_cim_hely')) + '</div>' +
          '<div class="alcim">' +
            (helySzoveg() ? esc(helySzoveg()) + ' · ' : '') +
            (a.beall.datum ? esc(a.beall.datum) + ' · ' : '') +
            sz('jatekos_db', { n: aktivDb() }) +
            (eloszlas ? ' · ' + eloszlas : '') +
            ' · ' + esc(sz('offline')) +
          '</div>' +
        '</div>' +
        '<div class="fej-jobb">' +
          '<div class="korjelzo">' + esc(korSzoveg) + '</div>' +
          '<div class="nyelv-valto" title="' + esc(sz('nyelv')) + '">' + nyelvGombok + '</div>' +
        '</div>' +
      '</header>' +
      '<nav class="nav">' + nav + '</nav>';
  }

  function lepesSav() {
    if (S.nezet === 'vetites' || S.nezet === 'nyomtat') return '';
    var l = kovetkezoLepes();
    return '<div class="lepes-sav">' +
      '<span class="lepes-felirat">' + esc(sz('lepes_felirat')) + '</span>' +
      '<b class="lepes-cim">' + esc(l.cim) + '</b>' +
      '<span class="lepes-sugo">' + esc(l.sugo) + '</span>' +
      '<button class="fo-gomb kicsi" data-t="nezet" data-nezet="' + l.nezet + '"' +
        (l.asztal ? ' data-aszta="' + l.asztal + '"' : '') + '>' + esc(sz('lepes_ugras')) + '</button>' +
      '</div>';
  }

  /* ======================= nevezés ====================================== */

  function nevezesNezet() {
    var a = S.allapot;
    var jk = aktivJatekosok();
    var lista = jk.map(function (j) {
      var cimkek = (j.vendeg ? ' <span class="cimke vendeg">' + esc(sz('cimke_vendeg')) + '</span>' : '') +
        (j.kilepettKor ? ' <span class="cimke kilepett">' + esc(sz('cimke_kilepett', { kor: j.kilepettKor })) + '</span>' : '');
      var torles = (varE('torol') && S.megerosites.id === j.id)
        ? megerositesSav(sz('torles_biztos', { nev: j.nev }), 'torol-igen', 'megerosites-nem', j.id)
        : '<button class="torles-gomb" data-t="torol" data-id="' + j.id + '" title="' + esc(sz('torles_tipp')) + '">' + esc(sz('gomb_torles')) + '</button>';
      return '<tr class="' + (j.kiemelt ? 'kiemelt-sor' : '') + '">' +
        '<td><input class="mini kod-input" data-t="kod" data-id="' + j.id + '" value="' + j.id + '" title="' + esc(sz('kod_tipp')) + '"></td>' +
        '<td><input class="nev-input" data-t="nev" data-id="' + j.id + '" value="' + esc(j.nev) + '" title="' + esc(sz('nev_tipp')) + '">' + cimkek + '</td>' +
        '<td><input class="mini" data-t="kartya" data-id="' + j.id + '" value="' + esc(j.kartyakod || '') + '" placeholder="' + esc(sz('th_kartya')) + '" size="12"></td>' +
        '<td><button class="ikon-gomb' + (j.kiemelt ? ' kiemelt' : '') + '" data-t="kiemelt" data-id="' + j.id + '" title="' + esc(sz('kiemelt_tipp')) + '">' + (j.kiemelt ? '★' : '☆') + '</button>' +
          ((varE('kilepes') && S.megerosites.id === j.id)
            ? megerositesSav(M.kilepesKortol(S.allapot, j.id) === ((aktualisKor() || {}).kor || 0)
                ? sz('kilepes_biztos_most') : sz('kilepes_biztos_kovetkezo'), 'kilepes-igen', 'megerosites-nem', j.id)
            : (M.kilepettE(j, 999)
              ? '<button class="halvany-gomb" data-t="visszater" data-id="' + j.id + '" title="' + esc(sz('visszater_tipp')) + '">' + esc(sz('gomb_visszater')) + '</button>'
              : '<button class="halvany-gomb" data-t="kilepes" data-id="' + j.id + '" title="' + esc(sz('kilepes_tipp')) + '">' + esc(sz('gomb_kilepes')) + '</button>')) +
          torles + '</td>' +
        '</tr>';
    }).join('');

    var importKartya = '';
    if (S.fuggobenImport) {
      importKartya = '<div class="kartya-blokk kezdo-kartya">' +
        '<h2>' + esc(sz('import_cim')) + '</h2>' +
        '<p class="sugo">' + esc(sz('import_sugo', {
          nev: S.fuggobenImport.nev,
          datum: S.fuggobenImport.datum || '',
          n: (S.fuggobenImport.jelentkezok || []).length
        })) + '</p>' +
        '<div class="nevezes-sor">' +
          '<button class="fo-gomb" data-t="import-atvesz">' + esc(sz('import_gomb')) + '</button>' +
          '<button class="masod-gomb" data-t="import-elvet">' + esc(sz('import_elvet')) + '</button>' +
        '</div></div>';
    }
    var kezdoKartya = '';
    if (!a.beall.kezdesKesz) {
      var b0 = a.beall;
      function mezo(kulcs, cimke, tipus, szelesseg) {
        return '<label>' + esc(sz(cimke)) + '<input class="' + (szelesseg || 'mini-input') + '" data-t="beall" data-mezo="' + kulcs +
          '" value="' + esc(b0[kulcs] === undefined || b0[kulcs] === null ? '' : b0[kulcs]) + '"' +
          (tipus ? ' type="' + tipus + '"' : '') + '></label>';
      }
      kezdoKartya = '<div class="kartya-blokk kezdo-kartya">' +
        '<h2>' + esc(sz('kezdes_cim')) + '</h2>' +
        '<p class="sugo">' + szh('kezdes_sugo') + '</p>' +
        '<div class="urlap">' +
          mezo('helyHu', 'mezo_hely_hu', '', 'nagy-input') +
          mezo('helySk', 'mezo_hely_sk', '', 'nagy-input') +
          mezo('datum', 'mezo_datum', 'date', 'datum-input') +
          mezo('korok', 'mezo_korok') +
        '</div>' +
        '<div id="hely-tippek" class="hely-tippek"></div>' +
        '<div class="urlap kezdo-valasz">' +
          '<div><div class="kezdo-kerdes">' + esc(sz('kezdo_szabaly')) + '</div>' +
            '<div class="nevezes-sor">' +
              '<button class="' + (b0.jatekmod === 'helycsere' ? 'masod-gomb' : 'fo-gomb') + '" data-t="jatekmod" data-mod="svajci">' + esc(sz('mod_svajci')) + '</button>' +
              '<button class="' + (b0.jatekmod === 'helycsere' ? 'fo-gomb' : 'masod-gomb') + '" data-t="jatekmod" data-mod="helycsere">' + esc(sz('mod_helycsere')) + '</button>' +
            '</div></div>' +
          '<div><div class="kezdo-kerdes">' + esc(sz('kezdo_kiemelt')) + '</div>' +
            '<div class="nevezes-sor">' +
              '<button class="' + (b0.kiemeltVedelem ? 'fo-gomb' : 'masod-gomb') + '" data-t="kezdo-vedelem" data-ertek="1">' + esc(sz('kezdo_kiemelt_kulon')) + '</button>' +
              '<button class="' + (b0.kiemeltVedelem ? 'masod-gomb' : 'fo-gomb') + '" data-t="kezdo-vedelem" data-ertek="0">' + esc(sz('kezdo_kiemelt_egyutt')) + '</button>' +
            '</div></div>' +
        '</div>' +
        '<div class="nevezes-sor">' +
          '<button class="fo-gomb" data-t="kezdes-kesz">' + esc(sz('kezdes_gomb')) + '</button>' +
          '<span class="sugo">' + esc(sz('kezdes_sugo2')) + '</span>' +
        '</div>' +
        '</div>';
    }

    return '' +
      importKartya + kezdoKartya +
      (a.beall.kezdesKesz ? weblapJelentkezokKartya() : '') +
      '<div class="kartya-blokk">' +
        '<h2>' + esc(sz('nevezes_cim')) + '</h2>' +
        szamlalo() +
        '<p class="sugo">' + szh('nevezes_sugo') + '</p>' +
        '<div class="nevezes-sor">' +
          '<input id="kod-be" data-t="kodbemenet" class="nagy-input" placeholder="' + esc(sz('kod_hely')) + '" autocomplete="off">' +
          '<input id="nev-be" class="kozepes-input" placeholder="' + esc(sz('nev_hely')) + '" autocomplete="off">' +
          '<button class="fo-gomb" data-t="hozzaad">' + esc(sz('hozzaad')) + '</button>' +
          (varE('ujverseny')
          ? megerositesSav(sz('uj_verseny_biztos'), 'ujverseny-igen', 'megerosites-nem')
          : '<button class="masod-gomb" data-t="ujverseny">' + esc(sz('uj_verseny')) + '</button>') +
          '<button class="halvany-gomb" data-t="beilleszt">' + esc(S.beillesztNyitva ? sz('beilleszt_bezar') : sz('beilleszt_gomb')) + '</button>' +
        '</div>' +
        (S.beillesztNyitva
          ? '<div class="beilleszt-doboz">' +
              '<p class="sugo">' + esc(sz('beilleszt_sugo')) + '</p>' +
              '<textarea id="beilleszt-be" class="beilleszt-mezo" rows="6" placeholder="' + esc(sz('beilleszt_hely')) + '"></textarea>' +
              '<div class="nevezes-sor">' +
                '<button class="fo-gomb" data-t="beilleszt-felvesz">' + esc(sz('beilleszt_felvesz')) + '</button>' +
                '<span class="sugo">' + esc(sz('beilleszt_sugo2')) + '</span>' +
              '</div>' +
            '</div>'
          : '') +
        '<div id="kod-visszajelzes" class="kod-visszajelzes"></div>' +
        '<div class="nevezes-sor kereso-sor">' +
          '<input id="nev-kereso" data-t="kereso" class="kozepes-input" placeholder="' + esc(sz('kereso_hely')) + '" autocomplete="off">' +
          '<span class="sugo">' + esc(sz('kereso_sugo')) + '</span>' +
        '</div>' +
        '<div id="kereso-lista" class="kereso-lista"></div>' +
        (jk.length < 3 ? '<p class="figyelem">' + esc(sz('min_harom')) + '</p>' : '') +
      '</div>' +
      kesoKartya() +
      '<div class="kartya-blokk">' +
        '<h3>' + esc(sz('nevezettek')) + ' (' + jk.length + ')</h3>' +
        (jk.length
          ? '<table class="tabla nevezett-tabla"><thead><tr><th>' + esc(sz('th_kod')) + '</th><th>' + esc(sz('th_nev')) + '</th><th>' + esc(sz('th_kartya')) + '</th><th>' + esc(sz('th_kiemelt')) + '</th><th></th></tr></thead><tbody>' + lista + '</tbody></table>'
          : '<p class="sugo">' + esc(sz('nincs_nevezve')) + '</p>') +
      '</div>';
  }

  /* Későn érkező: a sorsolás után nevezi be magát. */
  function kesoKartya() {
    var id = S.ujJatekos;
    if (!id) return '';
    var j = jatekos(id);
    if (!j || !S.allapot.korok.length) return '';
    var kor = aktualisKor() || S.allapot.korok[S.allapot.korok.length - 1];
    var vanEredmeny = M.korEredmenyVan(S.allapot, kor.kor);
    var ajanlott = S.kesoAsztal || M.ajanlottAsztal(S.allapot, kor.kor);
    var valasztek = kor.asztalok.map(function (a) {
      var n = (a.szekek || []).filter(function (x) { return x !== null; }).length;
      return '<option value="' + a.asztal + '"' + (a.asztal === ajanlott ? ' selected' : '') + '>' +
        esc(sz('asztal_szam', { n: a.asztal })) + ' (' + n + ' ' + esc(sz('fo')) + ')</option>';
    }).join('');
    return '<div class="kartya-blokk keso-blokk">' +
      '<h3>' + esc(sz('keso_cim', { nev: j.nev })) + '</h3>' +
      '<p class="sugo">' + esc(sz(vanEredmeny ? 'keso_sugo_van' : 'keso_sugo_nincs', { kor: kor.kor })) + '</p>' +
      '<div class="nevezes-sor">' +
        '<label>' + esc(sz('keso_asztal')) + ' <select id="keso-asztal">' + valasztek + '</select></label>' +
        '<button class="fo-gomb" data-t="keso-be">' + esc(sz('keso_be')) + '</button>' +
        '<button class="masod-gomb" data-t="keso-var">' + esc(sz('keso_var')) + '</button>' +
        (vanEredmeny ? '' : '<button class="masod-gomb" data-t="keso-ujrasorsol">' + esc(sz('keso_ujrasorsol')) + '</button>') +
      '</div>' +
      '<p class="sugo">' + esc(sz('keso_magyarazat')) + '</p>' +
      '</div>';
  }

  function bevitelTisztit() {
    var k = document.getElementById('kod-be');
    if (k) { k.value = ''; k.focus(); }
    var n = document.getElementById('nev-be');
    if (n) n.value = '';
  }

  /* Nagy számláló: hányan vannak benevezve, és az hány asztalt jelent. */
  function szamlalo() {
    var jk = aktivJatekosok();
    var aktiv = M.aktivJatekosok(S.allapot, (S.allapot.korok.length || 0) + 1);
    var caps = M.asztalLetszamok(aktiv.length, szam(S.allapot.beall.asztalLetszam, 3), 'vegen');
    var alapl = szam(S.allapot.beall.asztalLetszam, 3);
    var negyDb = caps.filter(function (c) { return c > alapl; }).length;
    var reszlet = caps.length
      ? (!negyDb
        ? sz('minden_asztal_alap', { t: caps.length, alap: alapl })
        : ((caps.length - negyDb) === 0
          ? sz('asztal_elosztas_nagy', { t: caps.length, nagy: alapl + 1 })
          : sz('asztal_elosztas', { t: caps.length, a: caps.length - negyDb, alap: alapl, b: negyDb, nagy: alapl + 1 })))
      : '';
    var kilepett = jk.filter(function (j) { return j.kilepettKor; }).length;
    return '<div class="szamlalo">' +
      '<div class="szam-doboz"><b>' + aktiv.length + '</b><span>' + esc(sz('szamlalo_jatekos')) + '</span></div>' +
      '<div class="szam-doboz"><b>' + caps.length + '</b><span>' + esc(sz('szamlalo_asztal')) + '</span></div>' +
      '<div class="szam-reszlet">' + esc(reszlet) +
        (kilepett ? '<br>' + esc(sz('szamlalo_kilepett', { n: kilepett })) : '') + '</div>' +
      '</div>';
  }

  /* Beépített megerősítés: nem használunk böngésző-felugró ablakot, mert azt a
     böngésző egyszer letilthatja, és akkor a művelet csendben nem történne meg. */
  function megerositesSav(kerdes, igenT, nemT, id) {
    return '<span class="megerosites"><span class="megerosites-kerdes">' + esc(kerdes) + '</span>' +
      '<button class="fo-gomb kicsi" data-t="' + igenT + '" data-id="' + (id === undefined || id === null ? '' : id) + '">' + esc(sz('igen')) + '</button>' +
      '<button class="masod-gomb kicsi" data-t="' + nemT + '">' + esc(sz('megse')) + '</button></span>';
  }
  function varE(mit) { return !!(S.megerosites && S.megerosites.t === mit); }

  /* Gépelés közben felkínálja a szokásos helyszíneket – kattintásra mindkét
     nyelvet beírja. Csak akkor jelenik meg, ha már van mit keresni. */
  function helyJavaslat(szoveg) {
    var cel = document.getElementById('hely-tippek');
    if (!cel) return;
    var q = String(szoveg || '').trim();
    if (q.length < 2) { cel.innerHTML = ''; return; }
    var tal = (M.HELYEK || []).filter(function (p) {
      return M.nevKulcs(p[0]).indexOf(M.nevKulcs(q)) >= 0 ||
             M.nevKulcs(p[1] || '').indexOf(M.nevKulcs(q)) >= 0;
    }).slice(0, 8);
    cel.innerHTML = tal.map(function (p) {
      return '<button class="hely-tipp" data-t="hely-tipp" data-hu="' + esc(p[0]) + '" data-sk="' + esc(p[1] || '') + '">' +
        esc(p[0]) + (p[1] ? ' / ' + esc(p[1]) : '') + '</button>';
    }).join('');
  }

  /* A tartós kiemelt-listán van-e ez a játékos? */
  function kiemeltListan(id) {
    return (S.kiemeltLista || []).indexOf(Number(id)) >= 0;
  }
  function kiemeltMent() {
    V.Motor.kiemeltekMent(S.kiemeltLista || []);
  }

  /* A beállítás lap kiemelt-lista szakasza. */
  function kiemeltListaKartya() {
    var lista = S.kiemeltLista || [];
    var jk = S.allapot.jatekosok || [];
    return '<h3>' + esc(sz('klist_cim')) + '</h3>' +
      '<p class="sugo">' + szh('klist_sugo') + '</p>' +
      '<input id="kiemelt-kereso" data-t="kiemelt-kereso" class="kozepes-input" placeholder="' + esc(sz('kereso_hely')) + '" autocomplete="off">' +
      '<div id="kiemelt-talalatok" class="kereso-lista"></div>' +
      (lista.length
        ? '<div class="weblap-lista">' + lista.map(function (id) {
            var t = torzsKeres(String(id));
            var bent = jk.some(function (j) { return Number(j.id) === Number(id); });
            return '<span class="weblap-elem' + (bent ? ' megvan' : '') + '">' +
              '<span class="weblap-kod">' + id + '</span>' +
              '<span>' + esc(t ? t.nev : ('#' + id)) + '</span>' +
              '<button class="torles-gomb" data-t="kiemelt-torol" data-id="' + id + '" title="' + esc(sz('gomb_torles')) + '">×</button>' +
              '</span>';
          }).join('') + '</div>'
        : '<p class="sugo">' + esc(sz('klist_ures')) + '</p>') +
      '<div class="nevezes-sor">' +
        '<button class="masod-gomb kicsi" data-t="kiemelt-ment">' + esc(sz('klist_mostani')) + '</button>' +
        '<span class="sugo">' + esc(sz('klist_mostani_sugo')) + '</span>' +
      '</div>';
  }

  function keresoListaHtml(lista) {
    return (lista || []).map(function (x) {
      var mar = M.keres(S.allapot.jatekosok, String(x.id));
      return '<button class="kereso-elem' + (mar ? ' mar' : '') + '" data-t="kereso-hozzaad" data-id="' + x.id + '">' +
        '<b>' + x.id + '</b> ' + esc(x.nev) +
        '<span>' + esc(x.kartyakod) + '</span>' +
        (mar ? '<i>' + esc(sz('kereso_mar')) + '</i>' : '<i>+ ' + esc(sz('hozzaad')) + '</i>') +
        '</button>';
    }).join('');
  }

  /* Egy játékos felvétele a versenybe (közös út a kód, a név és a kereső számára). */
  function jatekosFelvesz(id, nevErtek, kartyakod) {
    if (M.keres(S.allapot.jatekosok, String(id))) return false;
    S.allapot.jatekosok.push({
      id: id, nev: nevErtek, kartyakod: kartyakod || '',
      kiemelt: kiemeltListan(id), vendeg: false
    });
    S.ujJatekos = S.allapot.korok.length ? id : null;
    S.kesoAsztal = null;
    return true;
  }

  function jatekosHozzaad() {
    var kodBe = document.getElementById('kod-be');
    var nevBe = document.getElementById('nev-be');
    var kod = kodBe ? kodBe.value.trim() : '';
    var nevErtek = nevBe ? nevBe.value.trim() : '';
    if (!kod && !nevErtek) return;
    if (kod && !/^[0-9]+$/.test(kod) && !nevErtek) { nevErtek = kod; kod = ''; }

    var mar = kod ? M.keres(S.allapot.jatekosok, kod) : null;
    if (mar) { hiba(sz('uzen_mar_nevezve', { nev: mar.nev, kod: mar.id })); bevitelTisztit(); return; }

    var t = kod ? torzsKeres(kod) : null;
    if (t) {
      jatekosFelvesz(t.id, t.nev, t.kartyakod);
      mentes();
      ok(sz('uzen_hozzaadva', { nev: t.nev, kod: t.id }) + webesJelzes(t.nev, t.id));
      bevitelTisztit(); render();
      return;
    }

    /* A beírt név benne van a törzslistában? Akkor az a játékos, nem vendég. */
    var hosszuKartya = kod && /^[0-9]{6,}$/.test(kod);
    if (nevErtek) {
      var talalat = M.nevEgyezes(torzsLista(), nevErtek);
      if (talalat.length === 1) {
        var t2 = talalat[0];
        if (M.keres(S.allapot.jatekosok, String(t2.id))) {
          hiba(sz('uzen_mar_nevezve', { nev: t2.nev, kod: t2.id }));
          bevitelTisztit(); return;
        }
        jatekosFelvesz(t2.id, t2.nev, hosszuKartya ? kod : t2.kartyakod);
        mentes(); bevitelTisztit(); render();
        ok(sz(t2.pontos ? 'uzen_nevbol_talalva' : 'uzen_nevbol_kozel',
             { nev: t2.nev, kod: t2.id, beirt: nevErtek }) + webesJelzes(t2.nev, t2.id));
        return;
      }
      if (talalat.length > 1) {
        hiba(sz('uzen_tobb_ilyen_nev', { nev: nevErtek, n: talalat.length }));
        render();
        var kl = document.getElementById('kereso-lista');
        if (kl) kl.innerHTML = keresoListaHtml(talalat);
        return;
      }
    }

    if (!nevErtek) { hiba(sz('uzen_nincs_torzs', { kod: kod })); return; }
    var ujId = M.ujVendegKod(S.allapot.jatekosok);
    S.allapot.jatekosok.push({ id: ujId, nev: nevErtek, kartyakod: hosszuKartya ? kod : '', kiemelt: false, vendeg: true });
    S.ujJatekos = S.allapot.korok.length ? ujId : null;
    S.kesoAsztal = null;
    mentes();
    ok(hosszuKartya ? sz('uzen_vendeg_kartya', { nev: nevErtek, kod: ujId }) : sz('uzen_vendeg', { nev: nevErtek, kod: ujId }));
    bevitelTisztit(); render();
  }

  /* ======================= sorsolás ===================================== */

  function sorsolasNezet() {
    var a = S.allapot;
    var jk = aktivJatekosok();
    var caps = asztalLetszamok();
    var kiemeltek = jk.filter(function (j) { return j.kiemelt; });

    if (!jk.length) {
      return '<div class="kartya-blokk"><h2>' + esc(sz('sors_cim')) + '</h2><p class="sugo">' + esc(sz('nincs_jatekos')) + '</p></div>';
    }

    var html = '';
    var alaplt = szam(a.beall.asztalLetszam, 3);
    var negyDb = caps.filter(function (c) { return c > alaplt; }).length;
    if (!a.korok.length) {
      html += '<div class="kartya-blokk">' +
        '<h2>' + esc(sz('sors_elso_cim')) + '</h2>' +
        '<p class="sugo">' + szh('sors_sugo') + '</p>' +
        '<div class="nevezes-sor">' +
          '<span class="sugo">' + esc(sz('seed_auto', { seed: a.beall.sorsolasSeed })) + '</span>' +
          '<label class="kapcsolo"><input type="checkbox" id="vedelem-be" data-t="beall" data-mezo="kiemeltVedelem"' + (a.beall.kiemeltVedelem ? ' checked' : '') + '> ' + esc(sz('kiemelt_vedelem')) + '</label>' +
          '<button class="fo-gomb" data-t="sorsol"' + (jk.length < 3 ? ' disabled' : '') + '>' + esc(sz('sorsol_gomb')) + '</button>' +
        '</div>' +
        (negyDb
          ? '<p class="sugo">' + esc((caps.length - negyDb) === 0
            ? sz('asztal_elosztas_nagy', { t: caps.length, nagy: alaplt + 1 })
            : sz('asztal_elosztas', { t: caps.length, a: caps.length - negyDb, alap: alaplt, b: negyDb, nagy: alaplt + 1 })) + '. ' + esc(sz('negyfos_magyarazat')) + '</p>'
          : '<p class="sugo">' + esc(sz('minden_asztal_alap', { t: caps.length, alap: alaplt })) + '</p>') +
        (a.beall.kiemeltVedelem
          ? (kiemeltek.length
            ? '<p class="sugo"><b>' + esc(sz('kiemeltek_felsorolas', { n: kiemeltek.length, nevek: kiemeltek.map(function (j) { return j.nev; }).join(', ') })) + '</b></p>'
            : '<p class="sugo">' + esc(sz('nincs_kiemelt')) + '</p>')
          : '<p class="figyelem">' + szh('vedelem_ki') + '</p>') +
        (a.beall.kiemeltVedelem && kiemeltek.length > caps.length
          ? '<p class="figyelem">' + esc(sz('tobb_kiemelt', { k: kiemeltek.length, t: caps.length, marad: kiemeltek.length - caps.length })) + '</p>' : '') +
        '</div>';
      return html;
    }

    var utolsoKesz = M.korKesz(a, a.korok.length - 1);
    html += '<div class="kartya-blokk">' +
      '<h2>' + esc(sz('korok_cim')) + '</h2>' +
      '<p class="sugo">' + szh('korok_sugo') + '</p>' +
      '<div class="kor-gombok">' +
      a.korok.map(function (kor, i) {
        var kesz = M.korKesz(a, i);
        return '<button class="kor-gomb' + (a.aktualisKor === kor.kor ? ' aktiv' : '') + (kesz ? ' kesz' : '') + '" data-t="korvalt" data-kor="' + kor.kor + '">' +
          esc(sz('kor_gomb', { kor: kor.kor })) + (kesz ? ' ✓' : '') + '</button>';
      }).join('') +
      '</div>';
    if (a.korok.length < szam(a.beall.korok, 5)) {
      html += '<div class="nevezes-sor">' +
        '<button class="fo-gomb" data-t="kovetkezokor"' + (utolsoKesz ? '' : ' disabled') + '>' + esc(sz('kovetkezo_kor_gomb', { kor: a.korok.length + 1 })) + '</button>' +
        '<span class="sugo">' + esc(kovetkezoModSzoveg()) + '</span>' +
        (utolsoKesz ? '' : '<span class="figyelem">' + esc(sz('kor_lezarva_figyelem')) + '</span>') +
        '</div>';
    } else {
      html += '<p class="sugo">' + szh('minden_kor_kesz') + '</p>';
    }
    html += '</div>';
    html += asztalListaHtml(aktualisKor() || a.korok[a.korok.length - 1]);
    return html;
  }

  /* Ellenőrzés: a kiemeltek tényleg külön asztalnál ülnek-e? */
  function kiemeltEllenorzes(allapot, korSzam) {
    var kor = (allapot.korok || [])[korSzam - 1];
    var kiemeltDb = 0, egyuttDb = 0, hol = [];
    if (kor) {
      (kor.asztalok || []).forEach(function (a) {
        var k = (a.szekek || []).filter(function (id) {
          var j = jatekos(id);
          return j && j.kiemelt;
        });
        kiemeltDb += k.length;
        if (k.length > 1) { egyuttDb++; hol.push(a.asztal + '. asztal (' + k.length + ')'); }
      });
    }
    return { kiemeltDb: kiemeltDb, egyuttDb: egyuttDb, hol: hol.join(', ') };
  }

  function asztalListaHtml(kor) {
    if (!kor) return '';
    var sorok = kor.asztalok.map(function (asztal) {
      var ell = M.asztalEllenorzes(asztal, S.allapot.beall);
      var nevek = (asztal.szekek || []).filter(function (x) { return x !== null; })
        .map(function (id) { return esc(nev(id)); }).join(' · ');
      return '<tr class="' + (ell.kesz ? 'kesz-sor' : '') + '">' +
        '<td class="szam nagy">' + esc(sz('asztal_szam', { n: asztal.asztal })) + '</td>' +
        '<td>' + nevek + '</td>' +
        '<td class="szam">' + (ell.kesz ? '✓ ' + penz(ell.penzOssz) + ' € / ' + ell.pontOssz : (ell.kitoltve ? ell.kitoltve + '/' + ell.letszam : '–')) + '</td>' +
        '</tr>';
    }).join('');
    var ke = kiemeltEllenorzes(S.allapot, kor.kor);
    return '<div class="kartya-blokk"><h3>' + esc(sz('beosztas_cim', { kor: kor.kor })) + '</h3>' +
      (kor.figyelmeztetes ? '<p class="figyelem">' + esc(kor.figyelmeztetes) + '</p>' : '') +
      (ke.kiemeltDb
        ? '<p class="' + (ke.egyuttDb ? 'figyelem' : 'ok-jel') + '">' +
          esc(ke.egyuttDb ? sz('kiemelt_egyutt_figyelem', ke) : sz('kiemelt_ellenorzes', ke)) + '</p>'
        : '') +
      '<table class="tabla"><tbody>' + sorok + '</tbody></table></div>';
  }

  function sorsolElso() {
    var seedBe = document.getElementById('seed-be');
    /* Minden sorsolásnál új véletlen azonosító: így a „Sorsolás" gomb mindig
       más beosztást ad, nem kell hozzá semmit beírni. */
    var seed = V.Motor.ujSeed();
    S.allapot.beall.sorsolasSeed = seed;
    var vedBe = document.getElementById('vedelem-be');
    if (vedBe) S.allapot.beall.kiemeltVedelem = !!vedBe.checked;
    var jk = M.aktivJatekosok(S.allapot, 1);
    if (!jk.length) { hiba(sz('nincs_jatekos')); return; }
    if (jk.length < 3) { hiba(sz('min_harom')); return; }
    var e = M.sorsolElso(jk, M.asztalLetszamok(jk.length, szam(S.allapot.beall.asztalLetszam, 3), 'vegen'), seed, S.allapot.beall.kiemeltVedelem);
    S.allapot.korok = [V.korLetrehoz(S.allapot, e.szekek, e.figyelmeztetes)];
    S.allapot.aktualisKor = 1;
    mentes();
    Tarolo.biztonsagiMentes(S.allapot);
    var kiemeltEll = kiemeltEllenorzes(S.allapot, 1);
    ok(sz('sors_kesz', { figyelem: (e.figyelmeztetes || '') + (kiemeltEll.kiemeltDb
      ? ' ' + (kiemeltEll.egyuttDb
        ? sz('kiemelt_egyutt_figyelem', kiemeltEll)
        : sz('kiemelt_ellenorzes', kiemeltEll))
      : '') }));
    S.nezet = 'beiras'; S.asztal = 1;
    render();
  }

  function kovetkezoKor() {
    var a = S.allapot;
    if (!M.korKesz(a, a.korok.length - 1)) { hiba(sz('kor_nem_kesz')); return; }
    var helycsere = helycsereVan() && a.korok.length > 0;
    var e;
    if (helycsere) {
      var aktiv = M.aktivJatekosok(a, a.korok.length + 1);
      if (aktiv.length < 3) { hiba(sz('keves_aktiv')); return; }
      e = M.helycsereKovetkezo(a.korok[a.korok.length - 1], aktiv.map(function (j) { return j.id; }),
        szam(a.beall.asztalLetszam, 3));
    } else {
      var rangsor = M.rangsor(a, a.korok.length).filter(function (s) {
        return !M.kilepettE(jatekos(s.id), a.korok.length + 1);
      });
      if (rangsor.length < 3) { hiba(sz('keves_aktiv')); return; }
      var caps = M.asztalLetszamok(rangsor.length, szam(a.beall.asztalLetszam, 3), 'vegen');
      e = M.sorsolKovetkezo(rangsor.map(function (s) { return s.id; }), caps);
    }
    a.korok.push(V.korLetrehoz(a, e.szekek, ''));
    a.aktualisKor = a.korok.length;
    mentes();
    Tarolo.biztonsagiMentes(a);
    ok(sz('uj_kor_kesz_mod', { kor: a.aktualisKor, mod: sz(helycsere ? 'mod_helycsere' : 'mod_svajci') }));
    S.nezet = 'beiras'; S.asztal = 1;
    render();
  }

  /* A helycserélő rendszer addig tart, ahány kört beállítottak. */
  function helycsereVan() {
    var b = S.allapot && S.allapot.beall;
    if (!b || b.jatekmod !== 'helycsere') return false;
    return S.allapot.korok.length <= szam(b.helycsereKorok, 2);
  }
  function kovetkezoModSzoveg() {
    var a = S.allapot;
    if (!a.korok.length) return '';
    var hk = a.beall.jatekmod === 'helycsere' && a.korok.length <= szam(a.beall.helycsereKorok, 2);
    return sz('kovetkezo_mod', { mod: sz(hk ? 'mod_helycsere' : 'mod_svajci') });
  }

  /* ======================= eredménybeírás =============================== */

  function beirasNezet() {
    var kor = aktualisKor();
    if (!kor) {
      return '<div class="kartya-blokk"><h2>' + esc(sz('nav_beiras')) + '</h2><p class="sugo">' + esc(sz('nincs_sorsolas_beir')) + '</p></div>';
    }
    var a = S.allapot;
    var asztalok = kor.asztalok;
    if (S.asztal > asztalok.length) S.asztal = asztalok.length;
    if (S.asztal < 1) S.asztal = 1;

    var gombok = asztalok.map(function (x) {
      var ell = M.asztalEllenorzes(x, a.beall);
      return '<button class="asztal-gomb' + (x.asztal === S.asztal ? ' aktiv' : '') + (ell.kesz ? ' kesz' : '') + '" data-t="asztal" data-aszta="' + x.asztal + '">' +
        x.asztal + (ell.kesz ? '<span class="pip">✓</span>' : '') + '</button>';
    }).join('');

    var hianyzo = hianyzoAsztalok(kor);
    var asztal = asztalok[S.asztal - 1];
    var ell = M.asztalEllenorzes(asztal, a.beall);
    var pontok = ell.pontok;
    var e = asztal.eredmenyek || {};

    var elozoStat = {};
    M.statisztika(a, kor.kor - 1).forEach(function (s) { elozoStat[s.id] = s; });

    var sorok = (asztal.szekek || []).filter(function (x) { return x !== null; }).map(function (id) {
      var j = jatekos(id);
      var adat = e[id] || {};
      var stat = elozoStat[id];
      return '<tr>' +
        '<td class="nev-cell">' + esc(j ? j.nev : ('#' + id)) +
          (stat ? '<span class="elozo">' + esc(sz('eddig', { pont: stat.pont, penz: penz(stat.penz) })) + '</span>' : '') + '</td>' +
        '<td><input class="penz-input" type="text" inputmode="decimal" autocomplete="off" data-t="penz" data-id="' + id + '" value="' + (vanErtek(adat.penz) ? esc(adat.penz) : '') + '" placeholder="0,00"></td>' +
        '<td class="pont-cell" id="pont-' + id + '">' + (vanErtek(adat.pont)
          ? '<input class="pont-input" data-t="pont" data-id="' + id + '" value="' + esc(adat.pont) + '">'
          : '<b>' + pontok[id] + '</b>') + '</td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="kartya-blokk">' +
        '<h2>' + esc(sz('beir_cim', { kor: kor.kor })) + '</h2>' +
        (kor.kor < a.korok.length
          ? '<p class="figyelem">' + szh('kor_javitas_figyelem', { kor: kor.kor, kov: a.korok.length }) + '</p>'
          : '') +
        '<p class="sugo">' + szh('beir_sugo') + '</p>' +
        '<div class="asztal-gombok">' + gombok + '</div>' +
        (hianyzo.length
          ? '<p class="figyelem">' + esc(sz('hianyzo_asztalok', { lista: hianyzo.join(', ') })) + '</p>'
          : '<p class="ok-jel">' + esc(sz('kor_minden_kesz')) + '</p>') +
        '<p class="sugo">' + esc(kovetkezoModSzoveg()) + '</p>' +
      '</div>' +
      (S.allapot.beall.webcim
        ? '<div class="kartya-blokk"><h3>' + esc(sz('bekuld_cim_szervezo')) +
            (S.bekuldLista ? ' (' + S.bekuldLista.length + ')' : '') + '</h3>' +
            '<div class="nevezes-sor"><button class="masod-gomb" data-t="bekuld-frissit">' + esc(sz('bekuld_frissit')) + '</button>' +
            '<span class="sugo">' + esc(sz('bekuld_szervezo_sugo')) + '</span></div>' +
            (S.bekuldLista === null ? '' :
              (S.bekuldLista.length
                ? '<table class="tabla"><thead><tr><th>' + esc(sz('th_aszta')) + '</th><th>' + esc(sz('th_jatekos')) + '</th><th>' + esc(sz('th_penz')) + '</th><th></th></tr></thead><tbody>' +
                  S.bekuldLista.map(function (x) {
                    return '<tr><td class="szam nagy">' + x.asztal + '.</td><td>' + esc((x.nevek || []).join(' · ')) + '</td>' +
                      '<td class="szam">' + (x.penzek || []).map(function (p) { return penz(szam(p)); }).join(' / ') + '</td>' +
                      '<td><button class="fo-gomb kicsi" data-t="bekuld-elfogad" data-id="' + esc(x.id) + '">' + esc(sz('bekuld_elfogad')) + '</button> ' +
                      '<button class="masod-gomb kicsi" data-t="bekuld-elvet" data-id="' + esc(x.id) + '">' + esc(sz('bekuld_elvet')) + '</button></td></tr>';
                  }).join('') + '</tbody></table>'
                : '<p class="sugo">' + esc(sz('bekuld_nincs')) + '</p>')) +
            '</div>'
        : '') +
      '<div class="kartya-blokk beiras-blokk">' +
        '<h3>' + esc(sz('asztal_cim', { n: asztal.asztal })) + '</h3>' +
        '<table class="tabla beiras"><thead><tr><th>' + esc(sz('th_jatekos')) + '</th><th>' + esc(sz('th_penz')) + '</th><th>' + esc(sz('th_kor_pont')) + '</th></tr></thead><tbody>' + sorok + '</tbody></table>' +
        '<div class="beiras-lab">' + penzLabellal(ell) + '</div>' +
        (bekuldoLink(kor.kor, asztal.asztal, asztal.szekek)
          ? '<div class="bekuld-qr"><div>' + qrSvg(bekuldoLink(kor.kor, asztal.asztal, asztal.szekek), 3) + '</div>' +
            '<div class="bekuld-qr-szoveg"><b>' + esc(sz('bekuld_qr_cim')) + '</b><br>' + esc(sz('bekuld_qr_sugo')) + '</div></div>'
          : '') +
        '<div class="beiras-gombok">' +
          '<button class="fo-gomb" data-t="mentes-kovetkezo">' + esc(sz('mentes_kovetkezo')) + '</button>' +
          '<button class="masod-gomb" data-t="elozo-asztal">' + esc(sz('elozo_asztal')) + '</button>' +
          '<button class="masod-gomb" data-t="kor-lezarasa">' + esc(sz('kor_lezarasa')) + '</button>' +
        '</div>' +
      '</div>';
  }

  function penzLabellal(ell) {
    if (ell.kitoltve === ell.letszam && ell.letszam > 0) {
      return ell.penzOk
        ? '<span class="ok-jel">✓ ' + esc(sz('penz_rendben', { penz: penz(ell.penzOssz) })) + '</span>'
        : '<span class="hiba-jel">✗ ' + esc(sz('penz_hiba', { ossz: penz(ell.penzOssz), vart: penz(ell.vartPenz) })) + '</span>';
    }
    return '<span class="semleges-jel">' + esc(sz('penz_reszben', { kesz: ell.kitoltve, ossz: ell.letszam, vart: penz(ell.vartPenz) })) + '</span>';
  }

  function beirasFrissit() {
    var kor = aktualisKor();
    if (!kor) return;
    var asztal = kor.asztalok[S.asztal - 1];
    if (!asztal) return;
    var ell = M.asztalEllenorzes(asztal, S.allapot.beall);
    var lab = document.querySelector('.beiras-lab');
    if (lab) lab.innerHTML = penzLabellal(ell);
    (asztal.szekek || []).forEach(function (id) {
      if (id === null) return;
      var cella = document.getElementById('pont-' + id);
      var e2 = asztal.eredmenyek[id] || {};
      if (cella && !vanErtek(e2.pont)) cella.innerHTML = '<b>' + ell.pontok[id] + '</b>';
    });
  }

  /* ======================= rangsor ====================================== */

  function rangsorNezet() {
    var a = S.allapot;
    if (!a.korok.length) {
      return '<div class="kartya-blokk"><h2>' + esc(sz('nav_rangsor')) + '</h2><p class="sugo">' + esc(sz('nincs_eredmeny')) + '</p></div>';
    }
    var ig = a.aktualisKor || a.korok.length;
    var lista = M.rangsor(a, ig);
    var kulcsok = String(a.beall.tiebreak || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);

    var sorok = lista.map(function (s, i) {
      var korok = '';
      for (var k2 = 0; k2 < ig; k2++) {
        var kr = s.korok.filter(function (x) { return x.kor === k2 + 1; })[0];
        korok += '<td class="szam">' + (kr ? kr.pont : '·') + '</td><td class="szam halvany">' + (kr ? penz(kr.penz) : '·') + '</td>';
      }
      return '<tr class="' + (s.kiemelt ? 'kiemelt-sor' : '') + '">' +
        '<td class="szam nagy">' + s.hely + '.</td>' +
        '<td>' + esc(s.nev) + (s.kiemelt ? ' <span class="cimke">' + esc(sz('cimke_kiemelt')) + '</span>' : '') +
          (M.kilepettE(jatekos(s.id), 999) ? ' <span class="cimke kilepett">' + esc(sz('cimke_kilepett', { kor: jatekos(s.id).kilepettKor })) + '</span>' : '') + '</td>' +
        korok +
        '<td class="szam nagy ossz">' + s.pont + '</td>' +
        '<td class="szam nagy ossz">' + penz(s.penz) + '</td>' +
        '</tr>';
    }).join('');

    var korFej = '', korFej2 = '';
    for (var k3 = 0; k3 < ig; k3++) {
      korFej += '<th colspan="2">' + esc(sz('th_kor', { kor: k3 + 1 })) + '</th>';
      korFej2 += '<th class="rovid">' + esc(sz('th_penz')) + '</th><th class="rovid">' + esc(sz('vet_pont_rovid')) + '</th>';
    }

    return '<div class="kartya-blokk">' +
      '<button class="masod-gomb kicsi vissza-gomb" data-t="vissza">← ' + esc(sz('vissza')) + '</button>' +
      '<h2>' + esc(sz('rang_cim', { kor: ig })) + '</h2>' +
      (a.beall.lezarva
        ? '<p class="ok-jel">' + esc(sz('lezarva_jel')) + '</p>' +
          '<div class="nevezes-sor">' +
            '<button class="fo-gomb" data-t="export">' + esc(sz('export_gomb')) + '</button>' +
            '<button class="masod-gomb" data-t="nezet" data-nezet="beallitas">' + esc(sz('lezarva_feltoltes')) + '</button>' +
            (varE('ujverseny')
              ? megerositesSav(sz('uj_verseny_biztos'), 'ujverseny-igen', 'megerosites-nem')
              : '<button class="masod-gomb" data-t="ujverseny">' + esc(sz('uj_verseny')) + '</button>') +
          '</div>'
        : '<div class="nevezes-sor">' +
            (varE('lezar')
              ? megerositesSav(sz('lezar_biztos'), 'lezar-igen', 'megerosites-nem')
              : '<button class="masod-gomb kicsi" data-t="lezar">' + esc(sz('lezar_gomb')) + '</button>' +
                '<span class="sugo">' + esc(sz('lezar_sugo')) + '</span>') +
          '</div>') +
      '<div class="nevezes-sor"><button class="' + (gorgetBe() ? 'fo-gomb' : 'masod-gomb') + ' kicsi" data-t="gorget">' +
        esc(gorgetBe() ? sz('gorget_ki') : sz('gorget_be')) + '</button>' +
        '<span class="sugo">' + esc(sz('gorget_sugo')) + '</span></div>' +
      '<p class="sugo">' + esc(sz('rang_sugo', { sorrend: kulcsok.map(function (k) { return sz('tb_' + k); }).join(' → ') })) + '</p>' +
      '<table class="tabla rangsor"><thead>' +
        '<tr><th rowspan="2">' + esc(sz('th_hely')) + '</th><th rowspan="2">' + esc(sz('th_nev')) + '</th>' +
          korFej +
          '<th rowspan="2" class="ossz-fej">' + esc(sz('th_ossz_pont')) + '</th>' +
          '<th rowspan="2" class="ossz-fej">' + esc(sz('th_ossz_penz')) + '</th></tr>' +
        '<tr>' + korFej2 + '</tr>' +
        '</thead><tbody>' + sorok + '</tbody></table>' +
      '</div>';
  }

  /* ======================= kivetítés ==================================== */

  function vetitesNezet() {
    var a = S.allapot;
    var kor = aktualisKor();
    var popup = !!global.opener;
    var gombok = popup ? '' : ('<div class="vetites-valto">' +
      '<button class="nav-gomb vissza-gomb" data-t="vissza">← ' + esc(sz('vissza')) + '</button>' +
      '<button class="nav-gomb' + (S.vetites === 'asztalok' ? ' aktiv' : '') + '" data-t="vetites" data-mod="asztalok">' + esc(sz('vet_asztalok')) + '</button>' +
      '<button class="nav-gomb' + (S.vetites === 'rangsor' ? ' aktiv' : '') + '" data-t="vetites" data-mod="rangsor">' + esc(sz('vet_rangsor')) + '</button>' +
      '<button class="nav-gomb' + (S.vetites === 'nevlista' ? ' aktiv' : '') + '" data-t="vetites" data-mod="nevlista">' + esc(sz('vet_nevlista')) + '</button>' +
      (S.vetites === 'rangsor'
        ? '<button class="nav-gomb' + (gorgetBe() ? ' aktiv' : '') + '" data-t="gorget">' + esc(gorgetBe() ? sz('gorget_ki') : sz('gorget_be')) + '</button>'
        : '') +
      '<button class="nav-gomb" data-t="vetites-ablak">' + esc(sz('vet_ablak')) + '</button>' +
      '<button class="nav-gomb" data-t="ora-ablak">' + esc(sz('ora_ablak')) + '</button>' +
      '</div>');

    if (S.vetites === 'nevlista') {
      var jk2 = aktivJatekosok();
      var caps2 = M.asztalLetszamok(M.aktivJatekosok(a, (a.korok.length || 0) + 1).length,
        szam(a.beall.asztalLetszam, 3), 'vegen');
      var sorok2 = jk2.map(function (j, i) {
        return '<tr' + (j.kiemelt ? ' class="kiemelt-sor"' : '') + '><td class="szam">' + (i + 1) + '.</td>' +
          '<td class="szam">' + j.id + '</td><td class="vet-nev">' + esc(j.nev) + '</td>' +
          '<td>' + (j.kilepettKor ? esc(sz('cimke_kilepett', { kor: j.kilepettKor })) : '') + '</td></tr>';
      }).join('');
      return gombok + '<div class="vetites vet-rangsor"><h1>' + esc(sz('nevlista_cim')) +
        ' <span class="vet-db">' + esc(sz('nevlista_db', { n: jk2.length, t: caps2.length })) + '</span></h1>' +
        '<table class="tabla vet-tabla"><tbody>' + sorok2 + '</tbody></table></div>';
    }

    if (S.vetites === 'rangsor') {
      var ig = a.aktualisKor || 0;
      var lista = ig ? M.rangsor(a, ig) : [];
      var sorok = lista.map(function (s) {
        var korok = '';
        for (var k2 = 0; k2 < ig; k2++) {
          var kr = s.korok.filter(function (x) { return x.kor === k2 + 1; })[0];
          korok += '<td class="szam">' + (kr ? penz(kr.penz) : '·') + '</td>' +
                   '<td class="szam">' + (kr ? kr.pont : '·') + '</td>';
        }
        return '<tr' + (s.kiemelt ? ' class="kiemelt-sor"' : '') + '>' +
          '<td class="szam">' + s.hely + '.</td><td class="vet-nev">' + esc(s.nev) + '</td>' +
          korok +
          '<td class="szam nagy ossz">' + s.pont + '</td><td class="szam nagy ossz">' + penz(s.penz) + '</td></tr>';
      }).join('');
      var fej1 = '', fej2 = '';
      for (var k4 = 0; k4 < ig; k4++) {
        fej1 += '<th colspan="2">' + esc(sz('th_kor', { kor: k4 + 1 })) + '</th>';
        fej2 += '<th class="rovid">' + esc(sz('th_penz')) + '</th><th class="rovid">' + esc(sz('vet_pont_rovid')) + '</th>';
      }
      return gombok + '<div class="vetites vet-rangsor">' +
        '<h1>' + esc(ig ? sz('vet_allas', { kor: ig }) : sz('vet_rangsor')) + '</h1>' +
        '<table class="tabla vet-tabla"><thead>' +
          '<tr><th rowspan="2">#</th><th rowspan="2">' + esc(sz('th_nev')) + '</th>' +
            fej1 +
            '<th rowspan="2" class="ossz-fej">' + esc(sz('th_ossz_pont')) + '</th>' +
            '<th rowspan="2" class="ossz-fej">' + esc(sz('th_ossz_penz')) + '</th></tr><tr>' + fej2 + '</tr>' +
        '</thead><tbody>' + sorok + '</tbody></table></div>';
    }

    if (!kor) return gombok + '<div class="vetites"><h1>' + esc(sz('vet_nincs_sorsolas')) + '</h1></div>';
    /* az élő állás: a mostani körrel együtt (a kör elején még nulla) */
    var eddigi = {};
    M.statisztika(a, kor.kor).forEach(function (s2) { eddigi[s2.id] = s2; });
    /* A rovatok felirata egyszer, felül van – így minden sorban csak a szám áll,
       és a névnek sokkal több hely marad (nem kell lerövidíteni). */
    var rovatFej = '<li class="vet-fejlec-li">' +
      '<span class="vet-sorszam"></span><span class="vet-nev"></span>' +
      '<span class="vet-pont">' + esc(sz('vet_pont_rovid')) + '</span>' +
      '<span class="vet-penz">' + esc(sz('th_penz')) + '</span></li>';
    var kartyak = kor.asztalok.map(function (asztal) {
      var nevek = (asztal.szekek || []).filter(function (x) { return x !== null; })
        .map(function (id, i) {
          var st = eddigi[id];
          return '<li class="vet-hely vet-hely-' + (i + 1) + '">' +
            '<span class="vet-sorszam">' + (i + 1) + '.</span>' +
            '<span class="vet-nev' + ((nev(id) || '').length > 16 ? ' vet-nev-kicsi' : '') + '">' + esc(nev(id)) + '</span>' +
            '<span class="vet-pont">' + (st ? st.pont : 0) + '</span>' +
            '<span class="vet-penz">' + penz(st ? st.penz : 0) + '</span></li>';
        }).join('');
      return '<div class="vet-kartya"><div class="vet-aszta">' + asztal.asztal + '.</div>' +
        '<ul class="vet-tabla">' + rovatFej + nevek + '</ul></div>';
    }).join('');
    var db = kor.asztalok.length;
    /* Széles képernyőn 4 asztal fér el egymás mellett, keskenyebben 3, telefonon 2. */
    var szel = szam(global.innerWidth, 1366);
    var maxOszlop = szel >= 1250 ? 4 : (szel >= 1000 ? 3 : 2);
    var oszlopok = Math.max(1, Math.min(maxOszlop, db));
    var sorok = Math.ceil(db / oszlopok);
    return gombok + '<div class="vetites"><h1>' + esc(sz('vet_ki_hol_ul', { kor: kor.kor })) + '</h1>' +
      '<div class="vet-racs" style="--oszlopok:' + oszlopok + ';--sorok:' + sorok + '">' + kartyak + '</div></div>';
  }

  /* ======================= nyomtatás ==================================== */

  function nyomtatKor() {
    var sel = document.getElementById('nyomtat-kor');
    var ertek = sel ? parseInt(sel.value, 10) : 0;
    if (!ertek) ertek = S.allapot.aktualisKor || 1;
    return S.allapot.korok[ertek - 1] || aktualisKor();
  }

  function nyomtatNezet() {
    var a = S.allapot;
    var kor = aktualisKor();
    if (!kor) return '<div class="kartya-blokk"><h2>' + esc(sz('nyom_cim')) + '</h2><p class="sugo">' + esc(sz('nincs_sorsolas_beir')) + '</p></div>';
    var szelek = a.korok.map(function (k) {
      return '<option value="' + k.kor + '"' + (k.kor === kor.kor ? ' selected' : '') + '>' + esc(sz('kor_gomb', { kor: k.kor })) + '</option>';
    }).join('');
    var db = szam(a.beall.papirDB, 8);
    return '<div class="kartya-blokk">' +
      '<button class="masod-gomb kicsi vissza-gomb nyomtat-vissza" data-t="vissza">← ' + esc(sz('vissza')) + '</button>' +
      '<h2>' + esc(sz('nyom_cim')) + '</h2>' +
      '<p class="sugo">' + szh('nyom_sugo') + '</p>' +
      '<div class="nevezes-sor">' +
        '<label>' + esc(sz('nyom_kor')) + ' <select id="nyomtat-kor">' + szelek + '</select></label>' +
        '<label class="kapcsolo"><input type="checkbox" data-t="beall" data-mezo="qrBe"' + (a.beall.qrBe ? ' checked' : '') + '> ' + esc(sz('qr_be')) + '</label>' +
        '<label>' + esc(sz('nyom_db')) + ' <select data-t="beall" data-mezo="papirDB">' +
          [2, 4, 6, 8].map(function (n) { return '<option value="' + n + '"' + (db === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
        '</select></label>' +
        '<button class="fo-gomb" data-t="nyomtat">' + esc(sz('nyom_gomb')) + '</button>' +
      '</div>' +
      '</div>' + cedulaHtml(kor);
  }

  function cedulaHtml(kor) {
    var a = S.allapot;
    var db = szam(a.beall.papirDB, 8);
    /* Két oszlop: így a cédula hosszúkás (nem tömzsi), és 8 is kifér egy lapra.
       A magasságot az EGY LAPRA kerülő cédulák száma adja, nem az összes asztalé. */
    var oszlopok = 2;
    var sorok = Math.max(1, Math.ceil(db / oszlopok));
    var magassag = Math.min(95, (190 - (sorok - 1) * 3.5) / sorok);
    var kartyak = kor.asztalok.map(function (asztal) {
      var sorok = (asztal.szekek || []).filter(function (x) { return x !== null; }).map(function (id) {
        var j = jatekos(id);
        return '<tr><td class="c-szam">' + (j && !j.vendeg ? id : '') + '</td><td class="c-nev">' + esc(j ? j.nev : '') + '</td>' +
          '<td class="c-ir"></td><td class="c-ir"></td></tr>';
      }).join('');
      var link = bekuldoLink(kor.kor, asztal.asztal, asztal.szekek);
      var negySzek = (asztal.szekek || []).filter(function (x) { return x !== null; }).length > 3;
      return '<div class="cedula' + (negySzek ? ' cedula-negy' : '') + '">' +
        '<div class="c-fej"><span class="c-hely">' + esc(helySzoveg()) + '</span><span class="c-datum">' + esc(a.beall.datum || '') + '</span></div>' +
        '<div class="c-aszta">' + esc(sz('cedula_aszta', { n: asztal.asztal, kor: kor.kor })) + '</div>' +
        '<table class="c-tabla">' +
        '<colgroup><col class="c-col-id"><col><col class="c-col-ir"><col class="c-col-ir"></colgroup>' +
        '<thead><tr><th>' + esc(sz('cedula_id')) + '</th><th>' + esc(sz('cedula_nev')) + '</th><th>' + esc(sz('cedula_penz')) + '</th><th>' + esc(sz('cedula_pont')) + '</th></tr></thead>' +
        '<tbody>' + sorok + '</tbody></table>' +
        (link ? '<div class="c-qr-sor">' + qrSvg(link, 1) + '</div>' : '') +
        '</div>';
    }).join('');
    return '<div class="cedulak" style="--cedula-oszlop:' + oszlopok + ';--cedula-magassag:' +
      magassag.toFixed(1) + 'mm">' + kartyak + '</div>';
  }

  /* ======================= visszaszámláló óra ========================== */

  /* Lassú, oda-vissza görgetés a kivetített rangsorhoz, hogy mindenki lásson mindent. */
  var gorgeto = null, gorgetSzunet = 0;
  function gorgetBe() { return !!(S.allapot && S.allapot.beall && S.allapot.beall.gorget); }
  function gorgetoIndit() {
    if (gorgeto) return;
    gorgeto = global.setInterval(function () {
      if (!gorgetBe()) return;
      if (!global.scrollBy) return;
      if (gorgetSzunet > 0) { gorgetSzunet--; return; }
      var sz = global.scrollY || global.pageYOffset || 0;
      var lat = global.innerHeight || 800;
      var teljes = (global.document && global.document.documentElement)
        ? (global.document.documentElement.scrollHeight || 0) : 0;
      var b = S.allapot.beall;
      if (b.gorgetIrany === undefined) b.gorgetIrany = 1;
      if (b.gorgetIrany > 0 && teljes && sz + lat >= teljes - 6) { b.gorgetIrany = -1; gorgetSzunet = 45; return; }
      if (b.gorgetIrany < 0 && sz <= 6) { b.gorgetIrany = 1; gorgetSzunet = 45; return; }
      global.scrollBy(0, b.gorgetIrany * 2);
    }, 40);
  }
  function gorgetoLeall() {
    if (gorgeto) { global.clearInterval(gorgeto); gorgeto = null; }
  }

  /* Rövid hangjelzés, ha lejárt az idő (nincs külső hangfájl). */
  var oraCsipogott = false;
  function csipog() {
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      var ctx = new AC();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.18;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      global.setTimeout(function () { try { o.stop(); ctx.close(); } catch (e) { } }, 420);
      global.setTimeout(function () {
        try {
          var ctx2 = new AC(), o2 = ctx2.createOscillator(), g2 = ctx2.createGain();
          o2.type = 'sine'; o2.frequency.value = 1180; g2.gain.value = 0.18;
          o2.connect(g2); g2.connect(ctx2.destination);
          o2.start();
          global.setTimeout(function () { try { o2.stop(); ctx2.close(); } catch (e) { } }, 620);
        } catch (e) { }
      }, 460);
      return true;
    } catch (e) { return false; }
  }
  /* Ha épp lejárt, egyszer jelez (és amíg nem indítják újra, nem ismétli). */
  function oraLejartFigyelmeztetes() {
    var o = (S.allapot && S.allapot.ora) || {};
    var maradek = M.oraMaradek(S.allapot, Date.now());
    if (o.fut && maradek <= 0) {
      if (!oraCsipogott) { oraCsipogott = true; csipog(); return true; }
    } else if (maradek > 0) {
      oraCsipogott = false;
    }
    return false;
  }

  var oraTickFut = false;
  function oraTickIndit() {
    if (oraTickFut) return;
    oraTickFut = true;
    global.setInterval(function () {
      if (S.nezet !== 'ora' || !S.allapot) return;
      var el = document.getElementById('ora-szam');
      if (!el) return;
      var o = S.allapot.ora || {};
      var maradek = M.oraMaradek(S.allapot, Date.now());
      oraLejartFigyelmeztetes();
      el.textContent = M.oraSzoveg(maradek);
      var v = document.getElementById('ora-vege');
      if (v) {
        if (o.fut && maradek <= 0) v.textContent = sz('ora_lejart');
        else {
          var d = M.oraVegIdo(S.allapot);
          v.textContent = d ? sz('ora_vege', { ido: M.oraIdoSzoveg(d) }) : sz('ora_nincs');
        }
      }
      var doboz = document.querySelector('.ora');
      if (doboz) doboz.className = 'ora' + (o.fut && maradek <= 0 ? ' ora-lejart' : '') +
        (S.allapot.beall.oraVilagos ? ' ora-vilagos' : '');
    }, 1000);
  }

  function oraNezet() {
    var a = S.allapot;
    var o = a.ora || { perc: a.beall.oraPerc || 50, fut: false, vege: null, maradek: null };
    var popup = !!global.opener;
    var kor = aktualisKor();
    var maradek = M.oraMaradek(a, Date.now());
    var vege = M.oraVegIdo(a);
    var lejart = o.fut && maradek <= 0;
    var gomb = o.fut
      ? '<button class="masod-gomb nagy-gomb-2" data-t="ora-szunet">' + esc(sz('ora_szunet')) + '</button>'
      : (o.maradek
        ? '<button class="fo-gomb nagy-gomb-2" data-t="ora-folytat">' + esc(sz('ora_folytat')) + '</button>'
        : '<button class="fo-gomb nagy-gomb-2" data-t="ora-indit">' + esc(sz('ora_indit')) + '</button>');
    return '<div class="ora' + (lejart ? ' ora-lejart' : '') + (a.beall.oraVilagos ? ' ora-vilagos' : '') + '">' +
      (popup ? '' : '<button class="masod-gomb kicsi ora-vissza" data-t="vissza">← ' + esc(sz('vissza')) + '</button>') +
      '<div class="ora-fej">' +
        '<span class="ora-kor">' + esc(kor ? sz('ora_kor', { kor: kor.kor, osszes: a.beall.korok }) : sz('nincs_sorsolas')) + '</span>' +
        '<span class="ora-cim">' + esc(sz('ora_cim')) + '</span>' +
      '</div>' +
      '<div class="ora-szam" id="ora-szam">' + M.oraSzoveg(maradek) + '</div>' +
      '<div class="ora-vege" id="ora-vege">' +
        (lejart ? esc(sz('ora_lejart')) : (vege ? esc(sz('ora_vege', { ido: M.oraIdoSzoveg(vege) })) : esc(sz('ora_nincs')))) +
      '</div>' +
      (popup ? '' :
        '<div class="ora-vezerlok">' +
          '<label>' + esc(sz('ora_perc')) + ' <input id="ora-perc" class="mini-input" value="' + esc(o.perc || a.beall.oraPerc || 50) + '"></label>' +
          gomb +
          '<button class="masod-gomb" data-t="ora-nullaz">' + esc(sz('ora_nullaz')) + '</button>' +
          '<button class="masod-gomb" data-t="ora-szin">' + esc(a.beall.oraVilagos ? sz('ora_sotet') : sz('ora_vilagos')) + '</button>' +
          '<button class="masod-gomb" data-t="ora-ablak">' + esc(sz('ora_ablak')) + '</button>' +
        '</div>' +
        '<p class="sugo">' + esc(sz('ora_sugo')) + '</p>') +
      '</div>';
  }

  /* ======================= beküldő (játékos) nézet ====================== */

  function bekuldNezet() {
    var b = S.bekuld;
    if (!b || !b.kodok.length) {
      return '<div class="bekuldo"><h1>' + esc(sz('bekuld_cim')) + '</h1><p>' + esc(sz('bekuld_hibas_link')) + '</p></div>';
    }
    if (S.bekuldKesz) {
      return '<div class="bekuldo bekuldo-kesz">' +
        '<div class="nagy-pipa">✓</div>' +
        '<h1>' + esc(sz('bekuld_elkuldve')) + '</h1>' +
        '<p>' + esc(sz('bekuld_elkuldve_sugo')) + '</p>' +
        '<div class="bekuld-osszeg">' + bekuldOsszegHtml() + '</div>' +
        '<button class="masod-gomb" data-t="bekuld-ujra">' + esc(sz('bekuld_ujra')) + '</button>' +
        '</div>';
    }
    var sorok = b.kodok.map(function (id, i) {
      return '<tr><td class="bekuld-nev">' + esc(b.nevek[i] || ('#' + id)) + '</td>' +
        '<td><input class="penz-input bekuld-penz" type="text" inputmode="decimal" autocomplete="off" data-bekuld="' + i + '" value="' + (b.penzek[i] === undefined || b.penzek[i] === null ? '' : esc(b.penzek[i])) + '" placeholder="0,00"></td>' +
        '<td class="pont-cell" id="bekuld-pont-' + i + '">' + (bekuldPontok()[i] === undefined ? '·' : bekuldPontok()[i]) + '</td></tr>';
    }).join('');
    var vart = 5 * b.kodok.length;
    return '<div class="bekuldo">' +
      '<h1>' + esc(sz('bekuld_aszta', { asztal: b.asztal, kor: b.kor })) + '</h1>' +
      '<p>' + esc(sz('bekuld_sugo')) + '</p>' +
      '<table class="tabla bekuld-tabla"><thead><tr><th>' + esc(sz('th_jatekos')) + '</th><th>' + esc(sz('th_penz')) + '</th><th>' + esc(sz('th_kor_pont')) + '</th></tr></thead><tbody>' + sorok + '</tbody></table>' +
      '<p class="bekuld-lab" id="bekuld-lab">' + esc(sz('bekuld_vart', { vart: vart })) + '</p>' +
      (S.uzenet ? '<p class="hiba-jel">' + esc(S.uzenet) + '</p>' : '') +
      '<button class="fo-gomb nagy-gomb" data-t="bekuld-kuld">' + esc(sz('bekuld_kuld')) + '</button>' +
      '<p class="bekuld-lablec">' + esc(sz('bekuld_nincs_net')) + '</p>' +
      '</div>';
  }

  function bekuldPontok() {
    var b = S.bekuld;
    if (!b) return [];
    var van = b.kodok.some(function (_, i) { return vanErtek(b.penzek[i]); });
    if (!van) return [];
    return M.pontok(b.penzek.map(function (x) { return szam(x); }));
  }

  function bekuldOsszegHtml() {
    var b = S.bekuld, p = bekuldPontok();
    return b.kodok.map(function (id, i) {
      return '<div class="bekuld-sor"><span>' + esc(b.nevek[i]) + '</span><b>' + penz(szam(b.penzek[i])) + ' €</b><span>' + (p[i] === undefined ? '' : p[i] + ' ' + sz('th_kor_pont')) + '</span></div>';
    }).join('');
  }

  /* ======================= beállítás ==================================== */

  function beallitasNezet() {
    var a = S.allapot, b = a.beall;
    var kulcsok = String(b.tiebreak || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var tiebreakSor = kulcsok.map(function (k, i) {
      return '<span class="tiebreak-elem">' + (i + 1) + '. ' + esc(sz('tb_' + k)) +
        ' <button class="ikon-gomb" data-t="tiebreak-fel" data-kulcs="' + k + '" title="' + esc(sz('tiebreak_fel')) + '">↑</button>' +
        '<button class="ikon-gomb" data-t="tiebreak-le" data-kulcs="' + k + '" title="' + esc(sz('tiebreak_le')) + '">↓</button>' +
        '<button class="ikon-gomb veszely" data-t="tiebreak-torol" data-kulcs="' + k + '">×</button></span>';
    }).join(' ');
    var marad = Object.keys(V.TIEBREAK_KULCSOK).filter(function (k) { return kulcsok.indexOf(k) < 0; })
      .map(function (k) { return '<button class="masod-gomb kicsi" data-t="tiebreak-hozzaad" data-kulcs="' + k + '">+ ' + esc(sz('tb_' + k)) + '</button>'; }).join(' ');

    var mentesek = Tarolo.mentesek().slice(0, 5).map(function (k) {
      return '<button class="masod-gomb kicsi" data-t="visszaallit" data-kulcs="' + esc(k) + '">' +
        esc(k.replace('mub-verseny-mentes-', '').slice(0, 16).replace('T', ' ')) + '</button>';
    }).join(' ');

    return '' +
      '<div class="kartya-blokk">' +
        '<h2>' + esc(sz('beall_cim')) + '</h2>' +
        '<div class="urlap">' +
          '<p class="sugo">' + szh('webcim_mi') + '</p>' +
        '<label>' + esc(sz('mezo_hely_hu')) + ' <input data-t="beall" data-mezo="helyHu" value="' + esc(b.helyHu || b.hely || '') + '"></label>' +
          '<label>' + esc(sz('mezo_hely_sk')) + ' <input data-t="beall" data-mezo="helySk" value="' + esc(b.helySk || '') + '"></label>' +
          '<label>' + esc(sz('mezo_datum')) + ' <input type="date" data-t="beall" data-mezo="datum" value="' + esc(b.datum) + '"></label>' +
          '<label>' + esc(sz('mezo_korok')) + ' <input class="mini-input" data-t="beall" data-mezo="korok" value="' + esc(b.korok) + '"></label>' +
          '<label>' + esc(sz('mezo_asztal')) + ' <input class="mini-input" data-t="beall" data-mezo="asztalLetszam" value="' + esc(b.asztalLetszam) + '"></label>' +
          '<label title="' + esc(sz('mezo_jatekok_tipp')) + '">' + esc(sz('mezo_jatekok')) + ' <input class="mini-input" data-t="beall" data-mezo="jatekokKoronkent" value="' + esc(b.jatekokKoronkent) + '"></label>' +
          '<label title="' + esc(sz('mezo_befizetes_tipp')) + '">' + esc(sz('mezo_befizetes')) + ' <input class="mini-input" data-t="beall" data-mezo="penzJatekonkent" value="' + esc(b.penzJatekonkent) + '"></label>' +
            '<label class="szeles">' + esc(sz('mezo_webcim')) + ' <input placeholder="' + esc(sz('webcim_hely')) + '" data-t="beall" data-mezo="webcim" value="' + esc(b.webcim || '') + '" placeholder="https://…/verseny/verseny.html"></label>' +
          '<label class="kapcsolo"><input type="checkbox" data-t="beall" data-mezo="kiemeltVedelem"' + (b.kiemeltVedelem ? ' checked' : '') + '> ' + esc(sz('kiemelt_vedelem')) + '</label>' +
        '</div>' +
        '<p class="sugo">' + szh('beall_sugo') + '</p>' +
        '<p class="sugo">' + esc(sz('negyfos_vegen_mindig')) + '</p>' +
        '<p class="sugo">' + szh('penz_mezo_sugo') + '</p>' +
        (!b.kezdesKesz
          ? ''
          : '<p class="sugo">' + esc(sz('kezdes_vissza_sugo')) + ' ' +
            '<button class="masod-gomb kicsi" data-t="kezdes-mutat">' + esc(sz('kezdes_vissza')) + '</button></p>') +
        kiemeltListaKartya() +
        '<h3>' + esc(sz('mod_cim')) + '</h3>' +
        '<p class="sugo">' + szh('mod_sugo') + '</p>' +
        '<div class="nevezes-sor">' +
          '<button class="' + (b.jatekmod === 'helycsere' ? 'masod-gomb' : 'fo-gomb') + '" data-t="jatekmod" data-mod="svajci">' + esc(sz('mod_svajci')) + '</button>' +
          '<button class="' + (b.jatekmod === 'helycsere' ? 'fo-gomb' : 'masod-gomb') + '" data-t="jatekmod" data-mod="helycsere">' + esc(sz('mod_helycsere')) + '</button>' +
        '</div>' +
        '<p class="sugo">' + szh('mod_helycsere_sugo') + '</p>' +
        '<label>' + esc(sz('mod_korok')) + ' <input class="mini-input" data-t="beall" data-mezo="helycsereKorok" value="' + esc(b.helycsereKorok) + '"></label>' +
        '<h3>' + esc(sz('torzs_cim')) + '</h3>' +
        '<p class="sugo">' + szh('torzs_szerk_sugo') + '</p>' +
        '<div class="torzs-uj nevezes-sor">' +
          '<input id="torzs-uj-kod" class="mini-input" placeholder="' + esc(sz('th_kod')) + '">' +
          '<input id="torzs-uj-nev" class="kozepes-input" placeholder="' + esc(sz('th_nev')) + '">' +
          '<input id="torzs-uj-kartya" class="mini-input" placeholder="' + esc(sz('th_kartya')) + '">' +
          '<button class="fo-gomb" data-t="torzs-uj">' + esc(sz('hozzaad')) + '</button>' +
        '</div>' +
        '<div class="torzs-lista">' +
          torzsLista().slice(0, 400).map(function (sor) {
            return '<div class="torzs-sor">' +
              '<span class="torzs-kod">' + esc(sor[0]) + '</span>' +
              '<input class="torzs-nev" data-t="torzs-nev" data-id="' + esc(sor[0]) + '" value="' + esc(sor[2] || '') + '">' +
              '<input class="torzs-kartya" data-t="torzs-kartya" data-id="' + esc(sor[0]) + '" value="' + esc(sor[1] || '') + '" placeholder="' + esc(sz('th_kartya')) + '">' +
              '<button class="torles-gomb" data-t="torzs-torol" data-id="' + esc(sor[0]) + '">×</button>' +
              '</div>';
          }).join('') +
        '</div>' +
        '<div class="nevezes-sor">' +
          '<button class="masod-gomb" data-t="torzs-weblap">' + esc(sz('torzs_webrol')) + '</button>' +
          '<button class="masod-gomb" data-t="torzs-feltolt">' + esc(sz('torzs_webbe')) + '</button>' +
          '<span id="torzs-uzenet" class="sugo"></span>' +
        '</div>' +
        '<p class="sugo">' + szh('torzs_sugo') + '</p>' +
        '<div class="nevezes-sor">' +
          '<button class="masod-gomb" data-t="torzs-import">' + esc(sz('torzs_gomb')) + '</button>' +
          '<input type="file" id="torzs-fajl" accept=".csv,.txt,.tsv,.json" style="display:none">' +
          (a.torzslista ? '<button class="masod-gomb" data-t="torzs-alap">' + esc(sz('torzs_alap')) + '</button>' : '') +
          '<span class="sugo">' + esc(sz('torzs_most', { n: torzsLista().filter(function (x) { return x[2]; }).length })) + '</span>' +
        '</div>' +
        (b.webcim ? '<p class="sugo">' + esc(sz('beall_esemeny', { id: a.esemenyId || '—' })) + '</p>' : '<p class="sugo">' + esc(sz('beall_webcim_sugo')) + '</p>') +
      '</div>' +
      '<div class="kartya-blokk">' +
        '<h2>' + esc(sz('tiebreak_cim')) + '</h2>' +
        '<p class="sugo">' + szh('tiebreak_sugo') + '</p>' +
        '<div class="tiebreak">' + (tiebreakSor || '<i>' + esc(sz('tiebreak_nincs')) + '</i>') + '</div>' +
        '<div class="tiebreak-hozzaad">' + marad + '</div>' +
      '</div>' +
      '<div class="kartya-blokk">' +
        '<h2>' + esc(sz('mentes_cim')) + '</h2>' +
        '<p class="sugo">' + szh('mentes_sugo') + '</p>' +
        '<div class="nevezes-sor">' +
          '<button class="fo-gomb" data-t="export">' + esc(sz('export_gomb')) + '</button>' +
          '<button class="masod-gomb" data-t="import">' + esc(sz('import_gomb')) + '</button>' +
          '<input type="file" id="import-fajl" accept=".json" style="display:none">' +
          '<button class="masod-gomb" data-t="csv">' + esc(sz('csv_gomb')) + '</button>' +
        '</div>' +
        (mentesek ? '<p class="sugo">' + esc(sz('visszaallitas_cim')) + ': ' + mentesek + '</p>' : '') +
      '</div>' +
      '<div class="kartya-blokk teszt-blokk">' +
        '<h3>' + esc(sz('teszt_cim')) + '</h3>' +
        '<p class="sugo">' + szh('teszt_sugo') + '</p>' +
        ((varE('torles1'))
          ? megerositesSav(sz('teszt_kerdes1'), 'torles-1-igen', 'megerosites-nem')
          : ((varE('torles2'))
            ? megerositesSav(sz('teszt_kerdes2'), 'torles-2-igen', 'megerosites-nem')
            : '<button class="halvany-gomb" data-t="teljes-torles">' + esc(sz('teszt_gomb')) + '</button>')) +
      '</div>' +
      (a.korok.length && a.beall.feltoltesTiltva
        ? '<div class="kartya-blokk">' +
            '<h2>' + esc(sz('weblap_cim')) + '</h2>' +
            '<p class="figyelem">' + esc(sz('feltoltes_tiltva')) + '</p>' +
          '</div>'
        : '') +
      (a.korok.length && !a.beall.feltoltesTiltva
        ? '<div class="kartya-blokk">' +
            '<h2>' + esc(sz('weblap_cim')) + '</h2>' +
            '<p class="sugo">' + szh('weblap_sugo') + '</p>' +
            '<p class="sugo"><b>' + esc(sz('weblap_lepesek')) + '</b></p>' +
            '<textarea id="weblap-szoveg" class="weblap-szoveg" rows="6" readonly>' + esc(weblapSzoveg()) + '</textarea>' +
            '<div class="nevezes-sor">' +
              '<button class="fo-gomb" data-t="weblap-masolas">' + esc(sz('weblap_masolas')) + '</button>' +
              '<button class="masod-gomb" data-t="weblap-txt">' + esc(sz('weblap_txt')) + '</button>' +
              '<span class="sugo">' + esc(sz('weblap_sorok', { n: aktivJatekosok().length, kor: ig2() })) + '</span>' +
            '</div>' +
            (ig2() < 5 ? '<p class="figyelem">' + esc(sz('weblap_figyelem')) + '</p>' : '') +
          '</div>'
        : '');
  }

  function ig2() { return Math.min(S.allapot.aktualisKor || S.allapot.korok.length || 0, 5); }

  /* ======================= súgó ========================================= */

  function sugoNezet() {
    var lepesek = [1, 2, 3, 4, 5, 6, 7].map(function (i) {
      return '<div class="sugo-lepes"><h3>' + esc(sz('sugo_' + i + '_cim')) + '</h3><p>' + szh('sugo_' + i) + '</p></div>';
    }).join('');
    return '<div class="kartya-blokk">' +
      '<h2>' + esc(sz('sugo_cim')) + '</h2>' +
      '<div class="sugo-racs">' + lepesek + '</div>' +
      '</div>' +
      '<div class="kartya-blokk">' +
      '<h3>' + esc(sz('sugo_offline_cim')) + '</h3><p class="sugo">' + szh('sugo_offline') + '</p>' +
      '<h3>' + esc(sz('sugo_mentes_cim')) + '</h3><p class="sugo">' + szh('sugo_mentes') + '</p>' +
      '<p class="sugo">' + szh('sugo_megjegyzes') + '</p>' +
      '</div>';
  }

  /* ======================= renderelés =================================== */

  function render() {
    var c = document.getElementById('nezet');
    if (!c || !S.allapot) return;
    rajzolasFut = true;
    var kivetes2 = !!KIVETITETT[S.nezet];
    N.mod = S.allapot.beall.nyelv || 'mind';
    var fej = (S.nezet === 'vetites' || S.nezet === 'nyomtat' || S.nezet === 'bekuld' || S.nezet === 'ora') ? '' : fejlec();
    var lepes = (S.nezet === 'vetites' || S.nezet === 'nyomtat' || S.nezet === 'bekuld' || S.nezet === 'ora') ? '' : lepesSav();
    N.mod = kivetes2 ? (S.allapot.beall.nyelvKivetites || 'mind') : (S.allapot.beall.nyelv || 'mind');

    var torzs = '';
    switch (S.nezet) {
      case 'nevezes': torzs = nevezesNezet(); break;
      case 'sorsolas': torzs = sorsolasNezet(); break;
      case 'beiras': torzs = beirasNezet(); break;
      case 'rangsor': torzs = rangsorNezet(); break;
      case 'vetites': torzs = vetitesNezet(); break;
      case 'nyomtat': torzs = nyomtatNezet(); break;
      case 'beallitas': torzs = beallitasNezet(); break;
      case 'sugo': torzs = sugoNezet(); break;
      case 'bekuld': torzs = bekuldNezet(); break;
      case 'ora': torzs = oraNezet(); break;
      default: torzs = nevezesNezet();
    }
    var kivetes = (S.nezet === 'vetites' || S.nezet === 'nyomtat' || S.nezet === 'bekuld' || S.nezet === 'ora' || S.nezet === 'ora-kivetites');
    var teljes = document.getElementById('teljes');
    if (teljes) teljes.className = kivetes ? 'kivetes' : '';
    /* A színtéma a mindenkori nyelvhez igazodik: szlovákul kék, magyarul/vegyesen zöld. */
    if (document.body && document.body.className !== undefined) {
      document.body.className = (N.mod === 'sk') ? 'tema-kek' : 'tema-zold';
    }
    if (S.folytatasUzenet) {
      torzs = '<div class="uzenet ok folytatas">' + esc(S.folytatasUzenet) + '</div>' + torzs;
      S.folytatasUzenet = '';
    }
    c.innerHTML = fej + lepes + torzs +
      (S.uzenet ? '<div class="uzenet ' + S.uzenetTipus + '">' + esc(S.uzenet) + '</div>' : '');

    var nyomtatTerulet = document.getElementById('nyomtat-terulet');
    if (nyomtatTerulet) nyomtatTerulet.innerHTML = (S.nezet === 'nyomtat' && nyomtatKor()) ? cedulaHtml(nyomtatKor()) : '';

    rajzolasFut = false;
    var rangsorban = (S.nezet === 'rangsor' || (S.nezet === 'vetites' && S.vetites === 'rangsor'));
    if (gorgetBe() && rangsorban) gorgetoIndit(); else gorgetoLeall();
    if (S.nezet === 'ora') oraTickIndit();
    if (S.nezet === 'nevezes') {
      var be = document.getElementById('kod-be');
      /* a kód mező mindig kapja meg a fókuszt, hogy gyorsan lehessen egymás után nevezni */
      if (be) be.focus();
    }
    S.uzenet = '';
  }

  /* ======================= események ==================================== */

  /* A cím (hash) követi a nézetet, hogy a böngésző Vissza gombja is működjön. */
  function hashIr(nezet) {
    try {
      var uj = '#/' + (nezet === 'vetites' ? 'vetites-' + (S.vetites || 'asztalok') : nezet);
      if (global.location.hash !== uj) global.location.hash = uj;
    } catch (e) { /* fájlból nyitva is működik, csak az előzmény marad el */ }
  }

  function nezetValt(nezet, asztal) {
    if (asztal) S.asztal = asztal;
    if (nezet === S.nezet) { render(); return; }
    S.elozoNezetek.push(S.nezet);
    if (S.elozoNezetek.length > 30) S.elozoNezetek.shift();
    S.nezet = nezet;
    hashIr(nezet);
    render();
  }

  function vissza() {
    var elozo = S.elozoNezetek.pop();
    S.nezet = elozo || 'nevezes';
    hashIr(S.nezet);
    render();
  }

  function kovetkezoHianyzoAsztal() {
    var kor = aktualisKor();
    if (!kor) return;
    for (var i = 0; i < kor.asztalok.length; i++) {
      var idx = (S.asztal - 1 + i + 1) % kor.asztalok.length;
      if (!M.asztalEllenorzes(kor.asztalok[idx], S.allapot.beall).kesz) { S.asztal = idx + 1; render(); return; }
    }
    S.asztal = Math.min(S.asztal + 1, kor.asztalok.length);
    render();
  }

  function letolt(nevFajl, tartalom, tipus) {
    if (!global.document || !global.Blob) return;
    var blob = new global.Blob(['\ufeff' + tartalom], { type: tipus + ';charset=utf-8' });
    var url = global.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nevFajl;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); global.URL.revokeObjectURL(url); }, 100);
  }

  function exportFajl() {
    var nevFajl = 'verseny-' + (S.allapot.beall.datum || new Date().toISOString().slice(0, 10)) + '.json';
    letolt(nevFajl, JSON.stringify(S.allapot, null, 1), 'application/json');
    Tarolo.biztonsagiMentes(S.allapot);
    ok(sz('export_kesz', { fajl: nevFajl }));
    render();
  }

  function csvLetolt() {
    var a = S.allapot;
    var ig = a.aktualisKor || a.korok.length;
    var lista = M.rangsor(a, ig);
    var fej = ['hely', 'kod', 'nev', 'osszpont', 'osszpenz', 'elso_helyek'];
    for (var k = 0; k < ig; k++) { fej.push((k + 1) + ' kor EUR'); fej.push((k + 1) + ' kor pont'); }
    var sorok = [fej.join(';')];
    lista.forEach(function (s) {
      var sor = [s.hely, s.id, '"' + s.nev.replace(/"/g, '""') + '"', s.pont, penz(s.penz), s.otos];
      for (var k2 = 0; k2 < ig; k2++) {
        var kr = s.korok.filter(function (x) { return x.kor === k2 + 1; })[0];
        sor.push(kr ? penz(kr.penz) : '');
        sor.push(kr ? kr.pont : '');
      }
      sorok.push(sor.join(';'));
    });
    letolt('eredmeny-' + (a.beall.datum || '') + '.csv', sorok.join('\r\n'), 'text/csv');
  }

  /* A weblap „szervező formátuma": helyezés, ID, név, majd 5 × (kör €, kör pont),
     végül az össz € és az össz pont – tabulátorral elválasztva.
     Ezt a weblap Admin → Kézi eredményfelvétel rovatába kell beilleszteni. */
  function weblapSzoveg() {
    var a = S.allapot;
    var ig = a.aktualisKor || a.korok.length;
    var lista = M.rangsor(a, ig);
    var sorok = lista.map(function (s) {
      var mezok = [s.hely, s.id, String(s.nev).replace(/[\t\r\n]+/g, ' ')];
      for (var k = 0; k < 5; k++) {
        var kr = s.korok.filter(function (x) { return x.kor === k + 1; })[0];
        mezok.push(kr ? penz(kr.penz) : '0');
        mezok.push(kr ? kr.pont : '0');
      }
      mezok.push(penz(s.penz));
      mezok.push(s.pont);
      return mezok.join('\t');
    });
    return sorok.join('\r\n');
  }

  function importFajl(fajl) {
    if (!fajl) return;
    var olvaso = new global.FileReader();
    olvaso.onload = function () {
      try {
        var a = JSON.parse(olvaso.result);
        if (!a || !a.beall || !a.jatekosok) throw new Error('?');
        S.allapot = a;
        mentes(); render();
        ok(sz('import_kesz', { nev: a.beall.nev || '—', n: a.jatekosok.length }));
      } catch (e) { hiba(sz('import_hiba', { uzenet: e.message })); render(); }
    };
    olvaso.readAsText(fajl);
  }

  function tiebreakMozgat(kulcs, irany) {
    var kulcsok = String(S.allapot.beall.tiebreak || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var i = kulcsok.indexOf(kulcs);
    if (i < 0) return;
    var j = i + irany;
    if (j < 0 || j >= kulcsok.length) return;
    var t = kulcsok[i]; kulcsok[i] = kulcsok[j]; kulcsok[j] = t;
    S.allapot.beall.tiebreak = kulcsok.join(',');
    mentes(); render();
  }

  function kodModosit(cel) {
    var j = jatekos(parseInt(cel.getAttribute('data-id'), 10));
    if (!j) return;
    var uj = parseInt(cel.value, 10);
    if (!isFinite(uj) || uj <= 0) { hiba(sz('uzen_kod_pozitiv')); render(); return; }
    if (jatekos(uj)) { hiba(sz('uzen_kod_hasznalt', { kod: uj })); render(); return; }
    var regi = j.id;
    j.id = uj;
    (S.allapot.korok || []).forEach(function (kor) {
      (kor.asztalok || []).forEach(function (a) {
        a.szekek = (a.szekek || []).map(function (x) { return x === regi ? uj : x; });
        if (a.eredmenyek && a.eredmenyek[regi] !== undefined) {
          a.eredmenyek[uj] = a.eredmenyek[regi];
          delete a.eredmenyek[regi];
        }
      });
    });
    mentes(); render();
    ok(sz('uzen_kod_modositva', { regi: regi, uj: uj }));
  }

  function esemeny(e) {
    var cel = e.target.closest ? e.target.closest('[data-t]') : null;
    if (!cel) return;
    S.uzenet = null; S.uzenetTipus = null;      /* az előző üzenet eltűnik */
    var t = cel.getAttribute('data-t');

    if (t === 'nezet') { nezetValt(cel.getAttribute('data-nezet'), parseInt(cel.getAttribute('data-aszta'), 10) || 0); return; }
    if (t === 'vissza') { vissza(); return; }
    if (t === 'ora-indit') {
      oraCsipogott = false;
      var pBe = document.getElementById('ora-perc');
      M.oraPerc(S.allapot, pBe ? pBe.value : (S.allapot.beall.oraPerc || 50));
      M.oraIndit(S.allapot);
      mentes(); render();
      ok(sz('ora_elindult', { perc: S.allapot.ora.perc }));
      return;
    }
    if (t === 'ora-szin') { S.allapot.beall.oraVilagos = !S.allapot.beall.oraVilagos; mentes(); render(); return; }
    if (t === 'lezar') { S.megerosites = { t: 'lezar' }; render(); return; }
    if (t === 'lezar-igen') {
      S.megerosites = null;
      S.allapot.beall.lezarva = true;
      mentes(); render();
      ok(sz('lezar_kesz', { kor: S.allapot.korok.length }));
      return;
    }
    if (t === 'gorget') {
      S.allapot.beall.gorget = !gorgetBe();
      S.allapot.beall.gorgetIrany = 1;
      if (!S.allapot.beall.gorget) gorgetoLeall();
      else if (global.scrollTo) global.scrollTo(0, 0);
      mentes(); render();
      ok(S.allapot.beall.gorget ? sz('gorget_be') : sz('gorget_ki'));
      return;
    }
    if (t === 'ora-szunet') { M.oraSzunet(S.allapot); mentes(); render(); return; }
    if (t === 'ora-folytat') { M.oraFolytat(S.allapot); mentes(); render(); return; }
    if (t === 'ora-nullaz') { M.oraNullaz(S.allapot); mentes(); render(); return; }
    if (t === 'vetites-ablak') {
      try {
        var cim2 = String(global.location.href).split('#')[0] + '#/vetites-' + (S.vetites || 'asztalok');
        var scr = global.screen || {};
        var szel2 = Math.max(1000, (scr.availWidth || scr.width || 1600) - 40);
        var mag2 = Math.max(700, (scr.availHeight || scr.height || 900) - 60);
        var ab2 = global.open(cim2, 'mubVetites', 'width=' + szel2 + ',height=' + mag2);
        if (ab2) ab2.focus(); else hiba(sz('ora_ablak_hiba'));
      } catch (e) { hiba(sz('ora_ablak_hiba')); }
      render();
      return;
    }
    if (t === 'ora-ablak') {
      try {
        var cim = String(global.location.href).split('#')[0] + '#/ora';
        var ablak = global.open(cim, 'mubOra', 'width=1150,height=800');
        if (ablak) ablak.focus();
        else hiba(sz('ora_ablak_hiba'));
      } catch (e) { hiba(sz('ora_ablak_hiba')); }
      render();
      return;
    }
    if (t === 'nyelv') {
      var mezo = cel.getAttribute('data-mezo') || 'nyelv';
      S.allapot.beall[mezo] = cel.getAttribute('data-mod');
      if (!S.allapot.beall.nyelvKivetites) S.allapot.beall.nyelvKivetites = S.allapot.beall.nyelv;
      mentes(); render(); return;
    }
    if (t === 'hozzaad') { jatekosHozzaad(); return; }
    if (t === 'kiemelt') {
      var j = jatekos(parseInt(cel.getAttribute('data-id'), 10));
      if (j) { j.kiemelt = !j.kiemelt; mentes(); render(); }
      return;
    }
    if (t === 'torol') {
      S.megerosites = { t: 'torol', id: parseInt(cel.getAttribute('data-id'), 10) };
      render();
      return;
    }
    if (t === 'torol-igen') {
      var idT = parseInt(cel.getAttribute('data-id'), 10);
      var j2 = jatekos(idT);
      S.megerosites = null;
      S.allapot.jatekosok = S.allapot.jatekosok.filter(function (x) { return x.id !== idT; });
      (S.allapot.korok || []).forEach(function (kor) {
        (kor.asztalok || []).forEach(function (asz) {
          asz.szekek = (asz.szekek || []).filter(function (x) { return x !== idT; });
          if (asz.eredmenyek && asz.eredmenyek[idT] !== undefined) delete asz.eredmenyek[idT];
        });
      });
      mentes(); render();
      ok(sz('torles_kesz', { nev: j2 ? j2.nev : idT }));
      return;
    }
    if (t === 'megerosites-nem') { S.megerosites = null; render(); return; }
    if (t === 'ujverseny') { S.megerosites = { t: 'ujverseny' }; render(); return; }
    if (t === 'ujverseny-igen') {
      S.megerosites = null;
      S.allapot.korok = [];
      S.allapot.aktualisKor = 0;
      S.allapot.beall.nev = ''; S.allapot.beall.datum = ''; S.allapot.beall.hely = '';
      S.allapot.beall.helyHu = ''; S.allapot.beall.helySk = '';
      mentes(); render();
      ok(sz('uj_verseny_kesz'));
      return;
    }
    if (t === 'keso-be') {
      var kid = S.ujJatekos;
      var sel = document.getElementById('keso-asztal');
      var asztalSzam = sel ? parseInt(sel.value, 10) : 1;
      var kor2 = aktualisKor() || S.allapot.korok[S.allapot.korok.length - 1];
      var e2 = M.ulesBe(S.allapot, kor2.kor, asztalSzam, kid);
      if (!e2.ok) { hiba(sz('keso_hiba')); render(); return; }
      S.ujJatekos = null; S.kesoAsztal = null;
      mentes(); render();
      S.asztal = asztalSzam;
      ok(sz('keso_be_kesz', { nev: nev(kid), kor: kor2.kor, asztal: asztalSzam, letszam: e2.letszam }));
      return;
    }
    if (t === 'keso-var') {
      var vnev = nev(S.ujJatekos);
      S.ujJatekos = null; S.kesoAsztal = null;
      render();
      ok(sz('keso_var_kesz', { nev: vnev }));
      return;
    }
    if (t === 'keso-ujrasorsol') {
      var kor3 = aktualisKor() || S.allapot.korok[S.allapot.korok.length - 1];
      if (M.korEredmenyVan(S.allapot, kor3.kor)) { hiba(sz('keso_van_eredmeny')); render(); return; }
      /* (nincs felugró ablak: a gomb megnyomása maga a megerősítés) */
      var uj = M.ujrasorsolKor(S.allapot, kor3.kor, Math.floor(Math.random() * 900000) + 100000);
      S.ujJatekos = null; S.kesoAsztal = null;
      mentes(); render();
      ok(sz('keso_ujrasorsol_kesz', { kor: kor3.kor, asztalok: uj.asztalok }));
      return;
    }
    if (t === 'kereso-hozzaad') {
      var kId = parseInt(cel.getAttribute('data-id'), 10);
      var kT = torzsKeres(String(kId));
      if (!kT) { hiba(sz('uzen_nincs_torzs', { kod: kId })); render(); return; }
      if (M.keres(S.allapot.jatekosok, String(kId))) {
        hiba(sz('uzen_mar_nevezve', { nev: kT.nev, kod: kT.id })); render(); return;
      }
      jatekosFelvesz(kT.id, kT.nev, kT.kartyakod);
      mentes(); render();
      ok(sz('uzen_hozzaadva', { nev: kT.nev, kod: kT.id }));
      return;
    }
    if (t === 'kilepes') {
      S.megerosites = { t: 'kilepes', id: parseInt(cel.getAttribute('data-id'), 10) };
      render();
      return;
    }
    if (t === 'kilepes-igen') {
      var jk2 = jatekos(parseInt(cel.getAttribute('data-id'), 10));
      S.megerosites = null;
      if (jk2) {
        var kortol = M.kilepesKortol(S.allapot, jk2.id);
        var eredmeny = M.kilepes(S.allapot, jk2.id, kortol);
        mentes(); render();
        ok(sz('kilepes_kesz', { nev: jk2.nev, kor: kortol, db: eredmeny.kivett }));
      }
      return;
    }
    if (t === 'visszater') {
      var jk3 = jatekos(parseInt(cel.getAttribute('data-id'), 10));
      if (jk3) {
        M.visszater(S.allapot, jk3.id);
        mentes(); render();
        ok(sz('visszater_kesz', { nev: jk3.nev }));
      }
      return;
    }
    if (t === 'bekuld-kuld') {
      var b2 = S.bekuld;
      var hianyos = false;
      b2.penzek = b2.penzek.map(function (x) { return vanErtek(x) ? x : null; });
      b2.penzek.forEach(function (x) { if (x === null) hianyos = true; });
      if (hianyos) { S.uzenet = sz('bekuld_hianyos'); render(); return; }
      var bekuld = {
        e: b2.esemeny, kor: b2.kor, asztal: b2.asztal,
        kodok: b2.kodok, nevek: b2.nevek,
        penzek: b2.penzek.map(function (x) { return szam(x); })
      };
      uzen('info', sz('bekuld_kuldes'));
      render();
      if (!global.BEKULDES) { S.uzenet = sz('bekuld_nincs_net'); render(); return; }
      global.BEKULDES.kuld(bekuld, function (h) {
        if (h) { S.uzenet = sz('bekuld_hiba'); render(); return; }
        S.bekuldKesz = true; S.uzenet = ''; render();
      });
      return;
    }
    if (t === 'bekuld-ujra') { S.bekuldKesz = false; S.bekuld.penzek = []; render(); return; }
    if (t === 'bekuld-frissit') {
      if (!global.BEKULDES) { uzen('hiba', sz('bekuld_nincs_net')); render(); return; }
      uzen('info', sz('bekuld_toltes'));
      render();
      global.BEKULDES.listaz(S.allapot.esemenyId, function (h, lista) {
        if (h) { uzen('hiba', sz('bekuld_hiba')); render(); return; }
        S.bekuldLista = lista || [];
        render();
      });
      return;
    }
    if (t === 'bekuld-elfogad' || t === 'bekuld-elvet') {
      var bid = cel.getAttribute('data-id');
      var egy = null;
      (S.bekuldLista || []).forEach(function (x) { if (x.id === bid) egy = x; });
      if (!egy) return;
      if (t === 'bekuld-elvet') {
        if (global.BEKULDES) global.BEKULDES.torol(bid, function () { });
        S.bekuldLista = (S.bekuldLista || []).filter(function (x) { return x.id !== bid; });
        render();
        return;
      }
      var eredmeny = M.bekuldAlkalmaz(S.allapot, { kor: egy.kor, asztal: egy.asztal, kodok: egy.kodok, penzek: egy.penzek });
      if (!eredmeny.ok) { hiba(sz('bekuld_nem_egyezik')); render(); return; }
      mentes();
      if (global.BEKULDES) global.BEKULDES.torol(bid, function () { });
      S.bekuldLista = (S.bekuldLista || []).filter(function (x) { return x.id !== bid; });
      S.asztal = eredmeny.asztal;
      ok(sz('bekuld_atveve', { asztal: eredmeny.asztal, kor: eredmeny.kor }));
      S.nezet = 'beiras';
      render();
      return;
    }
    if (t === 'sorsol') { sorsolElso(); return; }
    if (t === 'kovetkezokor') { kovetkezoKor(); return; }
    if (t === 'korvalt') { S.allapot.aktualisKor = parseInt(cel.getAttribute('data-kor'), 10); S.asztal = 1; mentes(); render(); return; }
    if (t === 'asztal') { S.asztal = parseInt(cel.getAttribute('data-aszta'), 10); render(); var be = document.querySelector('.penz-input'); if (be) be.focus(); return; }
    if (t === 'elozo-asztal') { S.asztal = Math.max(1, S.asztal - 1); render(); return; }
    if (t === 'mentes-kovetkezo') { mentes(); kovetkezoHianyzoAsztal(); return; }
    if (t === 'kor-lezarasa') {
      if (M.korKesz(S.allapot, S.allapot.aktualisKor - 1)) {
        if (S.allapot.korok.length < szam(S.allapot.beall.korok, 5)) kovetkezoKor();
        else { ok(sz('kor_kesz_uzen')); S.nezet = 'rangsor'; render(); }
      } else { hiba(sz('kor_nem_kesz')); render(); }
      return;
    }
    if (t === 'vetites') { S.vetites = cel.getAttribute('data-mod'); render(); return; }
    if (t === 'nyomtat') {
      var kor2 = nyomtatKor();
      var terulet = document.getElementById('nyomtat-terulet');
      if (terulet && kor2) { terulet.innerHTML = cedulaHtml(kor2); global.print(); }
      return;
    }
    if (t === 'import-atvesz') {
      var imp = S.fuggobenImport;
      S.allapot = V.ujAllapot();
      importAlkalmaz(imp);
      render();
      return;
    }
    if (t === 'import-elvet') { S.fuggobenImport = null; render(); return; }
    if (t === 'teljes-torles') { S.megerosites = { t: 'torles1' }; render(); return; }
    if (t === 'torles-1-igen') { S.megerosites = { t: 'torles2' }; render(); return; }
    if (t === 'torles-2-igen') {
      S.megerosites = null;
      /* Mindent elölről: a verseny törlése, a biztonsági mentések MEGMARADNAK. */
      S.allapot = V.ujAllapot();
      mentes();
      S.nezet = 'nevezes';
      S.asztal = 1;
      render();
      ok(sz('teszt_kesz'));
      return;
    }
    if (t === 'kezdes-mutat') {
      S.allapot.beall.kezdesKesz = false;
      mentes();
      S.nezet = 'nevezes';
      render();
      ok(sz('kezdes_ujra'));
      return;
    }
    if (t === 'kiemelt-hozzaad') {
      var kId2 = parseInt(cel.getAttribute('data-id'), 10);
      if (isFinite(kId2) && !kiemeltListan(kId2)) {
        S.kiemeltLista = (S.kiemeltLista || []).concat([kId2]);
        kiemeltMent();
        /* a mostani versenyben is megjelöljük */
        var jj = jatekos(kId2);
        if (jj) jj.kiemelt = true;
        mentes(); render();
        var t3 = torzsKeres(String(kId2));
        ok(sz('klist_hozzaadva', { nev: t3 ? t3.nev : kId2 }));
      }
      return;
    }
    if (t === 'kiemelt-torol') {
      var kId3 = parseInt(cel.getAttribute('data-id'), 10);
      S.kiemeltLista = (S.kiemeltLista || []).filter(function (x) { return Number(x) !== kId3; });
      kiemeltMent();
      render();
      ok(sz('klist_torolve'));
      return;
    }
    if (t === 'kiemelt-ment') {
      var ujDb = 0;
      (S.allapot.jatekosok || []).forEach(function (j) {
        if (j.kiemelt && !kiemeltListan(j.id)) { S.kiemeltLista = (S.kiemeltLista || []).concat([j.id]); ujDb++; }
      });
      kiemeltMent(); render();
      ok(sz('klist_mentve', { n: ujDb, ossz: (S.kiemeltLista || []).length }));
      return;
    }
    if (t === 'weblap-felvesz') {
      var idx = parseInt(cel.getAttribute('data-idx'), 10);
      var r = (S.allapot.beall.weblapJelentkezok || [])[idx];
      if (!r) return;
      var eredmeny = felveszNevbol(r.nev, r.kod);
      mentes(); render();
      if (eredmeny === 'mar') { hiba(sz('uzen_mar_nevezve', { nev: r.nev, kod: r.kod || '' })); return; }
      var jUj = S.allapot.jatekosok.filter(function (j) { return M.nevKulcs(j.nev) === M.nevKulcs(r.nev) || (r.kod && String(j.id) === String(r.kod)); })[0];
      ok(sz(eredmeny === 'vendeg' ? 'uzen_vendeg' : 'uzen_hozzaadva',
            { nev: r.nev, kod: jUj ? jUj.id : (r.kod || '') }) + webesJelzes(r.nev, jUj ? jUj.id : ''));
      return;
    }
    /* Névsor beillesztése (Excelből is) */
    if (t === 'beilleszt') { S.beillesztNyitva = !S.beillesztNyitva; render(); return; }
    if (t === 'beilleszt-felvesz') {
      var ta = document.getElementById('beilleszt-be');
      var lista = M.nevlista(ta ? ta.value : '');
      if (!lista.length) { hiba(sz('beilleszt_ures')); render(); return; }
      var ujDb = 0, marDb = 0, vendDb = 0;
      lista.forEach(function (x) {
        var e2 = felveszNevbol(x.nev, x.kod);
        if (e2 === 'uj') ujDb++;
        else if (e2 === 'vendeg') { ujDb++; vendDb++; }
        else marDb++;
      });
      mentes();
      S.beillesztNyitva = false;
      render();
      ok(sz('beilleszt_kesz', { uj: ujDb, mar: marDb, vendeg: vendDb }));
      return;
    }
    if (t === 'hely-tipp') {
      var b3 = S.allapot.beall;
      b3.helyHu = cel.getAttribute('data-hu') || '';
      b3.helySk = cel.getAttribute('data-sk') || b3.helyHu;
      b3.nev = b3.helyHu;
      mentes(); render();
      var jt = document.getElementById('hely-tippek');
      if (jt) jt.innerHTML = '';
      return;
    }
    if (t === 'kezdo-vedelem') {
      S.allapot.beall.kiemeltVedelem = cel.getAttribute('data-ertek') === '1';
      mentes(); render();
      return;
    }
    if (t === 'jatekmod') {
      S.allapot.beall.jatekmod = cel.getAttribute('data-mod') === 'helycsere' ? 'helycsere' : 'svajci';
      mentes(); render();
      ok(sz('mod_kesz', { mod: sz(S.allapot.beall.jatekmod === 'helycsere' ? 'mod_helycsere' : 'mod_svajci') }));
      return;
    }
    if (t === 'kezdes-kesz') {
      S.allapot.beall.kezdesKesz = true;
      mentes(); render();
      var be0 = document.getElementById('kod-be');
      if (be0) be0.focus();
      ok(sz('kezdes_kesz'));
      return;
    }
    /* ---- törzslista szerkesztése a programban ---- */
    if (t === 'torzs-uj') {
      var ujKod = parseInt((document.getElementById('torzs-uj-kod') || {}).value, 10);
      var ujNev = String((document.getElementById('torzs-uj-nev') || {}).value || '').trim();
      var ujKartya = String((document.getElementById('torzs-uj-kartya') || {}).value || '').replace(/[^0-9]/g, '');
      if (!ujNev) { hiba(sz('torzs_nincs_nev')); render(); return; }
      if (!isFinite(ujKod) || ujKod <= 0) {
        var maxK = 0;
        torzsLista().forEach(function (s2) { if (s2[0] > maxK && s2[0] < 900) maxK = s2[0]; });
        ujKod = maxK + 1;
      }
      if (torzsLista().some(function (s2) { return Number(s2[0]) === ujKod; })) { hiba(sz('torzs_kod_foglalt', { kod: ujKod })); render(); return; }
      S.allapot.torzslista = torzsLista().concat([[ujKod, ujKartya, ujNev]]);
      S.torzsValtozott = (S.torzsValtozott || []).concat([ujKod]);
      mentes(); render();
      ok(sz('torzs_hozzaadva', { nev: ujNev, kod: ujKod }));
      return;
    }
    if (t === 'torzs-torol') {
      var ttId = parseInt(cel.getAttribute('data-id'), 10);
      S.allapot.torzslista = torzsLista().filter(function (s2) { return Number(s2[0]) !== ttId; });
      S.torzsToroltek = (S.torzsToroltek || []);
      if (S.torzsToroltek.indexOf(ttId) < 0) S.torzsToroltek.push(ttId);
      mentes(); render();
      ok(sz('torzs_torolve'));
      return;
    }
    if (t === 'torzs-weblap') {
      var celU = document.getElementById('torzs-uzenet');
      if (celU) celU.textContent = sz('torzs_toltes');
      global.BEKULDES.jatekosok(function (h, lista4) {
        if (h || !lista4) { hiba(sz('torzs_web_hiba')); render(); return; }
        var sajat = {};
        torzsLista().forEach(function (s2) { sajat[String(s2[0])] = true; });
        var ujak = lista4.filter(function (x) { return x.name && !sajat[String(x.code)]; })
          .map(function (x) { return [Number(x.code), x.nfcCode || '', x.name]; });
        S.allapot.torzslista = torzsLista().concat(ujak);
        mentes(); render();
        ok(sz('torzs_webrol_kesz', { n: ujak.length, ossz: torzsLista().length }));
      });
      return;
    }
    if (t === 'torzs-feltolt') {
      var valtozott = (S.torzsValtozott || []);
      var toroltek = (S.torzsToroltek || []);
      if (!valtozott.length && !toroltek.length) {
        var celF0 = document.getElementById('torzs-uzenet');
        if (celF0) celF0.textContent = sz('torzs_nincs_valtozas');
        render();
        var celF0b = document.getElementById('torzs-uzenet');
        if (celF0b) celF0b.textContent = sz('torzs_nincs_valtozas');
        return;
      }
      global.BEKULDES.bejelentkezve(function (email) {
        if (!email) { hiba(sz('torzs_nincs_bejelentkezve')); render(); return; }
        var hatra = valtozott.length + toroltek.length;
        var hibak = 0;
        function kesz() {
          if (hatra > 0) return;
          S.torzsValtozott = []; S.torzsToroltek = [];
          render();
          if (hibak) hiba(sz('torzs_feltoltes_hiba', { n: hibak }));
          else ok(sz('torzs_feltoltes_kesz', { email: email }));
        }
        valtozott.forEach(function (kod) {
          var sor2 = torzsLista().filter(function (s2) { return Number(s2[0]) === Number(kod); })[0];
          if (!sor2) { hatra--; kesz(); return; }
          global.BEKULDES.jatekosMent(sor2[0], sor2[2], sor2[1], function (h2) {
            if (h2) hibak++;
            hatra--; kesz();
          });
        });
        toroltek.forEach(function (kod) {
          global.BEKULDES.jatekosTorol(kod, function (h2) { if (h2) hibak++; hatra--; kesz(); });
        });
      });
      return;
    }
    if (t === 'torzs-import') { var tf = document.getElementById('torzs-fajl'); if (tf) tf.click(); return; }
    if (t === 'torzs-alap') {
      delete S.allapot.torzslista;
      mentes(); render();
      ok(sz('torzs_alap_kesz', { n: (global.TORZSLISTA || []).filter(function (x) { return x[2]; }).length }));
      return;
    }
    if (t === 'export') { exportFajl(); return; }
    if (t === 'weblap-masolas') {
      var ta = document.getElementById('weblap-szoveg');
      if (ta) {
        ta.focus(); ta.select();
        var sikerult = false;
        try { sikerult = document.execCommand('copy'); } catch (e) { sikerult = false; }
        if (!sikerult && global.navigator && global.navigator.clipboard) {
          try { global.navigator.clipboard.writeText(ta.value); sikerult = true; } catch (e2) { sikerult = false; }
        }
        ok(sz(sikerult ? 'weblap_masolva' : 'weblap_figyelem'));
        render();
      }
      return;
    }
    if (t === 'weblap-txt') {
      letolt('eredmeny-weblap-' + (S.allapot.beall.datum || '') + '.txt', weblapSzoveg(), 'text/plain');
      return;
    }
    if (t === 'csv') { csvLetolt(); return; }
    if (t === 'import') { var f = document.getElementById('import-fajl'); if (f) f.click(); return; }
    if (t === 'visszaallit') {
      var a2 = Tarolo.visszaallit(cel.getAttribute('data-kulcs'));
      if (a2) { S.allapot = a2; S.megerosites = null; mentes(); render(); ok(sz('visszaallitva')); }
      return;
    }
    if (t === 'tiebreak-fel') { tiebreakMozgat(cel.getAttribute('data-kulcs'), -1); return; }
    if (t === 'tiebreak-le') { tiebreakMozgat(cel.getAttribute('data-kulcs'), 1); return; }
    if (t === 'tiebreak-torol') {
      var kk = String(S.allapot.beall.tiebreak).split(',').map(function (s) { return s.trim(); })
        .filter(function (s) { return s && s !== cel.getAttribute('data-kulcs'); });
      S.allapot.beall.tiebreak = kk.join(','); mentes(); render(); return;
    }
    if (t === 'tiebreak-hozzaad') {
      var kk2 = String(S.allapot.beall.tiebreak || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      kk2.push(cel.getAttribute('data-kulcs'));
      S.allapot.beall.tiebreak = kk2.join(','); mentes(); render(); return;
    }
  }

  function bevitel(e) {
    var cel = e.target.closest ? e.target.closest('[data-t]') : null;
    if (!cel) return;
    var t = cel.getAttribute('data-t');
    var kor = aktualisKor();
    if (t === 'penz') {
      if (!kor) return;
      var asztal = kor.asztalok[S.asztal - 1];
      var id = parseInt(cel.getAttribute('data-id'), 10);
      if (!asztal.eredmenyek[id]) asztal.eredmenyek[id] = {};
      asztal.eredmenyek[id].penz = cel.value;
      mentes(); beirasFrissit();
      return;
    }
    if (t === 'pont') {
      if (!kor) return;
      var asztal2 = kor.asztalok[S.asztal - 1];
      var id2 = parseInt(cel.getAttribute('data-id'), 10);
      if (!asztal2.eredmenyek[id2]) asztal2.eredmenyek[id2] = {};
      asztal2.eredmenyek[id2].pont = cel.value === '' ? null : cel.value;
      mentes(); beirasFrissit();
      return;
    }
    if (e.target.getAttribute && e.target.getAttribute('data-bekuld') !== null && cel.getAttribute('data-bekuld') !== null) {
      var bi = parseInt(cel.getAttribute('data-bekuld'), 10);
      S.bekuld.penzek[bi] = cel.value;
      var p2 = bekuldPontok();
      var cel2 = document.getElementById('bekuld-pont-' + bi);
      if (cel2) cel2.textContent = p2[bi] === undefined ? '·' : p2[bi];
      var lab2 = document.getElementById('bekuld-lab');
      if (lab2) {
        var ossz = S.bekuld.penzek.reduce(function (x, y) { return x + szam(y); }, 0);
        var vart2 = 5 * S.bekuld.kodok.length;
        var kesz2 = S.bekuld.penzek.filter(function (x) { return vanErtek(x); }).length;
        lab2.textContent = kesz2 === S.bekuld.kodok.length
          ? (Math.abs(ossz - vart2) < 0.005 ? sz('penz_rendben', { penz: penz(ossz) }) : sz('penz_hiba', { ossz: penz(ossz), vart: penz(vart2) }))
          : sz('penz_reszben', { kesz: kesz2, ossz: S.bekuld.kodok.length, vart: penz(vart2) });
      }
      return;
    }
    /* helyszín gépelése közben felkínáljuk a szokásos neveket */
    if (t === 'beall') {
      var mez = cel.getAttribute('data-mezo');
      if (mez === 'helyHu' || mez === 'helySk') helyJavaslat(cel.value);
      return;
    }
    if (t === 'kiemelt-kereso') {
      var celK2 = document.getElementById('kiemelt-talalatok');
      if (celK2) {
        var tal2 = M.nevKeres(torzsLista(), cel.value, 8).filter(function (x) { return !kiemeltListan(x.id); });
        celK2.innerHTML = tal2.map(function (x) {
          return '<button class="kereso-elem" data-t="kiemelt-hozzaad" data-id="' + x.id + '">' +
            '<b>' + x.id + '</b> ' + esc(x.nev) + '<i>+ ' + esc(sz('hozzaad')) + '</i></button>';
        }).join('');
      }
      return;
    }
    if (t === 'torzs-nev' || t === 'torzs-kartya') {
      var tkId = parseInt(cel.getAttribute('data-id'), 10);
      S.allapot.torzslista = torzsLista().map(function (s2) {
        if (Number(s2[0]) !== tkId) return s2;
        var uj3 = s2.slice();
        if (t === 'torzs-nev') uj3[2] = cel.value.trim();
        else uj3[1] = cel.value.replace(/[^0-9]/g, '');
        return uj3;
      });
      S.torzsValtozott = (S.torzsValtozott || []);
      if (S.torzsValtozott.indexOf(tkId) < 0) S.torzsValtozott.push(tkId);
      mentes();
      return;
    }
    /* gépelés közben megmutatjuk, kié a beírt kód */
    if (t === 'kodbemenet') {
      var celK = document.getElementById('kod-visszajelzes');
      if (celK) {
        var beirt = String(cel.value || '').trim();
        if (beirt.length >= 1) {
          var tal = torzsKeres(beirt);
          var marfent = tal ? M.keres(S.allapot.jatekosok, String(tal.id)) : null;
          if (tal && marfent) celK.innerHTML = '<span class="kv-hiba">' + esc(sz('kod_vissz_mar', { nev: tal.nev, kod: tal.id })) + '</span>';
          else if (tal) celK.innerHTML = '<span class="kv-jo">✓ ' + tal.id + ' — ' + esc(tal.nev) + '</span>';
          else celK.innerHTML = '<span class="kv-hiba">' + esc(sz('kod_vissz_nincs', { kod: beirt })) + '</span>';
        } else celK.innerHTML = '';
      }
      return;
    }
    if (t === 'kereso') {
      var cel2 = document.getElementById('kereso-lista');
      if (cel2) cel2.innerHTML = keresoListaHtml(M.nevKeres(torzsLista(), e.target.value, 8));
      return;
    }
    if (t === 'kartya') {
      var j = jatekos(parseInt(cel.getAttribute('data-id'), 10));
      if (j) { j.kartyakod = cel.value.trim(); mentes(); }
      return;
    }
    if (t === 'nev') {
      var jn = jatekos(parseInt(cel.getAttribute('data-id'), 10));
      if (jn) { jn.nev = cel.value.trim() || jn.nev; mentes(); }
      return;
    }
    if (t === 'beall') {
      var mezo = cel.getAttribute('data-mezo');
      S.allapot.beall[mezo] = (cel.type === 'checkbox') ? !!cel.checked : cel.value;
      /* A verseny neve a helyszín – mindig kövesse. */
      if (mezo === 'helyHu' || mezo === 'helySk' || mezo === 'hely') {
        S.allapot.beall.nev = M.helySzoveg(S.allapot, 'hu');
      }
      mentes();
      if (mezo === 'kiemeltVedelem' || mezo === 'negyFosHely' || mezo === 'qrBe') render();
      return;
    }
  }

  function gombok(e) {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'kod-be' || e.target.id === 'nev-be') { e.preventDefault(); jatekosHozzaad(); return; }
    if (e.target.classList && e.target.classList.contains('penz-input')) {
      e.preventDefault();
      var bemenetek = Array.prototype.slice.call(document.querySelectorAll('.penz-input'));
      var i = bemenetek.indexOf(e.target);
      if (i >= 0 && i + 1 < bemenetek.length) { bemenetek[i + 1].focus(); bemenetek[i + 1].select(); }
      else { mentes(); kovetkezoHianyzoAsztal(); }
    }
  }

  /* ======================= indítás ====================================== */

  function indit() {
    if (!global.document) return;
    S.allapot = Tarolo.betolt() || V.ujAllapot();
    /* A weblapról indított verseny átvétele (a weblap a böngésző tárolójába írja). */
    S.fuggobenImport = null;
    S.kiemeltLista = V.Motor.kiemeltekBetolt();
    try {
      var nyers = global.localStorage.getItem(V.WEBLAP_KULCS);
      if (nyers) {
        var imp = JSON.parse(nyers);
        global.localStorage.removeItem(V.WEBLAP_KULCS);
        /* „Új teszt": a weblapról kérve az előző versenyt teljesen töröljük. */
        if (imp && imp.teszt) S.allapot = V.ujAllapot();
        if (imp && imp.nev) {
          if (!S.allapot.jatekosok.length && !S.allapot.korok.length) importAlkalmaz(imp);
          else S.fuggobenImport = imp;
        }
      }
    } catch (e) { }
    /* Minden indításkor új véletlen sorsolási azonosítót kapunk – így nem kell
       kézzel beírni, és mindig friss sorsolás jön ki. */
    S.allapot.beall.sorsolasSeed = V.Motor.ujSeed();
    if (!S.allapot.beall.tiebreak) S.allapot.beall.tiebreak = V.ALAP.tiebreak;
    if (!S.allapot.beall.nyelv) S.allapot.beall.nyelv = V.ALAP.nyelv;
    N.mod = S.allapot.beall.nyelv;

    if (S.allapot.jatekosok && S.allapot.jatekosok.length) {
      S.uzenetTipus = 'ok';
      S.uzenet = V.NYELV ? '' : '';
      S.uzenet = '';
      S.folytatasUzenet = sz('folytatva', {
        nev: S.allapot.beall.nev || sz('verseny_cim_hely'),
        kor: S.allapot.korok.length
      });
    } else {
      S.folytatasUzenet = '';
    }
    document.addEventListener('click', esemeny);
    document.addEventListener('input', bevitel);
    document.addEventListener('change', function (e) {
      if (e.target.id === 'import-fajl') importFajl(e.target.files[0]);
      else if (e.target.id === 'torzs-fajl') torzsBetolt(e.target.files[0]);
      else if (e.target.id === 'nyomtat-kor') {
        var k = S.allapot.korok[parseInt(e.target.value, 10) - 1];
        var pt = document.getElementById('nyomtat-terulet');
        if (pt && k) pt.innerHTML = cedulaHtml(k);
      }
      else if (e.target.getAttribute && e.target.getAttribute('data-t') === 'kod') kodModosit(e.target);
      else bevitel(e);
    });
    document.addEventListener('keydown', gombok);

    /* Ha átméretezik az ablakot (vagy a kivetítő más felbontású), újraszámoljuk. */
    var atmeretIdo = null;
    global.addEventListener('resize', function () {
      if (!S.allapot) return;
      if (atmeretIdo) global.clearTimeout(atmeretIdo);
      atmeretIdo = global.setTimeout(function () {
        atmeretIdo = null;
        if (S.nezet === 'vetites') render();
      }, 250);
    });
    global.addEventListener('hashchange', function () {
      var b1 = bekuldCimOlvas(global.location.hash);
      if (b1) { S.bekuld = b1; S.bekuld.penzek = []; S.nezet = 'bekuld'; render(); return; }
      var h = (global.location.hash || '').replace('#/', '');
      var m1 = h.match(/^vetites-(asztalok|rangsor|nevlista)$/);
      if (m1) { S.vetites = m1[1]; S.nezet = 'vetites'; render(); return; }
      if (!h) h = 'nevezes';
      if (h === S.nezet) return;
      /* ha a böngésző Vissza gombjával jöttünk, a saját előzményünkből is vegyük ki */
      if (S.elozoNezetek.length && S.elozoNezetek[S.elozoNezetek.length - 1] === h) S.elozoNezetek.pop();
      else S.elozoNezetek.push(S.nezet);
      S.nezet = h;
      render();
    });
    function cimBeallit(hash) {
      var b0 = bekuldCimOlvas(hash);
      if (b0) { S.bekuld = b0; S.bekuld.penzek = []; S.nezet = 'bekuld'; return; }
      var h0 = String(hash || '').replace('#/', '');
      var m = h0.match(/^vetites-(asztalok|rangsor|nevlista)$/);
      if (m) { S.vetites = m[1]; S.nezet = 'vetites'; return; }
      if (h0) S.nezet = h0;
    }
    cimBeallit(global.location.hash);
    global.__cimBeallit = cimBeallit;

    /* a kivetítő ablak átveszi a másik ablak mentéseit – internet nélkül */
    global.setInterval(function () {
      if (S.nezet !== 'vetites' && S.nezet !== 'ora') return;
      try {
        var t = global.localStorage.getItem('mub-verseny');
        if (t && t !== JSON.stringify(S.allapot)) { S.allapot = JSON.parse(t); render(); }
      } catch (e) { }
    }, 1500);

    render();
  }

  /* ======================= export ======================================= */

  V.indit = indit;
  V._beallit = function (a) { S.allapot = a; };
  V._allapot = function () { return S.allapot; };
  V._nezetValt = function (n, asztal) { nezetValt(n, asztal); };
  V._uzenet = function () { return S.uzenet; };
  V._nezet = function () { return S.nezet; };
  V._weblapSzoveg = function () { return weblapSzoveg(); };
  V._bekuldoLink = function (kor, asztal, szekek) { return bekuldoLink(kor, asztal, szekek); };
  V._bekuldCimOlvas = function (hash) { return bekuldCimOlvas(hash); };
  V._bekuldBeallit = function (b) { S.bekuld = b; S.bekuld.penzek = []; S.nezet = 'bekuld'; render(); };
  V._kesoBeallit = function (id) { S.ujJatekos = id; S.kesoAsztal = null; S.nezet = 'nevezes'; render(); };
  V._vissza = function () { vissza(); };
  V._torzsSorok = function (szoveg) { return torzsSorok(szoveg); };
  V._jatekosHozzaad = function () { jatekosHozzaad(); };
  V._ujSeed = function () { return V.Motor.ujSeed(); };
  V._csipog = function () { return csipog(); };
V._torzsValtozott = function () { return S.torzsValtozott || []; };
  V._torzsToroltek = function () { return S.torzsToroltek || []; };
  V._torzsLista = function () { return torzsLista(); };
  V._teljesTorles = function () {
    S.allapot = V.ujAllapot();
    mentes();
    return S.allapot;
  };
  V._oraLejart = function () { return oraLejartFigyelmeztetes(); };
  V._helyJavaslat = function (szoveg) { helyJavaslat(szoveg); return (document.getElementById('hely-tippek') || {}).innerHTML || ''; };
  V._kiemeltLista = function () { return S.kiemeltLista || []; };
  V._beilleszt = function (szoveg) {
    var lista = M.nevlista(szoveg);
    var uj = 0, mar = 0, vend = 0;
    lista.forEach(function (x) {
      var e = felveszNevbol(x.nev, x.kod);
      if (e === 'mar') mar++; else { uj++; if (e === 'vendeg') vend++; }
    });
    return { lista: lista, uj: uj, mar: mar, vendeg: vend };
  };
  V._importAlkalmaz = function (imp) { importAlkalmaz(imp); return S.allapot; };
  V._webesKulcs = function () { return V.WEBLAP_KULCS; };
  V._torzsLista = function () { return torzsLista(); };
  V._kiemeltEllenorzes = function (kor) { return kiemeltEllenorzes(S.allapot, kor || 1); };
  V.verzio = '0.9';

})(typeof window !== 'undefined' ? window : globalThis);
