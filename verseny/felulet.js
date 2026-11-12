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
    try { gsMent(); } catch (e) { }
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

    /* Nyelv: EGY kis zászló a fejlécben. Rákattintva lenyílik a menü, ahol
       külön beállítható a kezelő (rendszer) és a kivetítés (megjelenítő) nyelve. */
    function zaszlo(mod) {
      if (mod === 'sk') return '<span class="zaszlo zaszlo-sk" aria-hidden="true"></span>';
      if (mod === 'hu') return '<span class="zaszlo zaszlo-hu" aria-hidden="true"></span>';
      return '<span class="zaszlo zaszlo-hu"></span><span class="zaszlo zaszlo-sk"></span>';
    }
    function nyelvGombsor(mezo, ertek) {
      return ['hu', 'sk', 'mind'].map(function (mod) {
        var cimke = mod === 'mind' ? 'HU+SK' : mod.toUpperCase();
        return '<button class="nyelv-gomb' + (ertek === mod ? ' aktiv' : '') + '" data-t="nyelv" data-mezo="' + mezo + '" data-mod="' + mod + '">' + cimke + '</button>';
      }).join('');
    }
    var nyelvGombok = '<div class="nyelv-lenyilo">' +
        '<button class="nyelv-fej' + (S.nyelvNyitva ? ' nyitva' : '') + '" data-t="nyelv-nyit" title="' + esc(sz('nyelv')) + '">' +
          zaszlo(a.beall.nyelv) + '<i class="nyelv-nyil">▾</i></button>' +
        (S.nyelvNyitva
          ? '<div class="nyelv-opciok">' +
              '<div class="nyelv-csoport"><span class="nyelv-cim">' + esc(sz('nyelv_kezelo')) + '</span>' +
                '<div class="nyelv-gombok">' + nyelvGombsor('nyelv', a.beall.nyelv) + '</div></div>' +
              '<div class="nyelv-csoport"><span class="nyelv-cim">' + esc(sz('nyelv_kivetites')) + '</span>' +
                '<div class="nyelv-gombok">' + nyelvGombsor('nyelvKivetites', a.beall.nyelvKivetites) + '</div></div>' +
            '</div>'
          : '') +
        '</div>';
    /* a nyelvGombok már fentebb elkészült */

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
        '<h2>' + esc(sz('kezdes_cim')) + sugoIkon('kezdes_sugo') + '</h2>' +
        '<div class="beall-racs">' +
          '<label class="beall-mezo"><span class="mezo-felirat">' + esc(sz('mezo_hely_hu')) + '</span>' +
            '<input data-t="beall" data-mezo="helyHu" value="' + esc(b0.helyHu || b0.hely || '') + '" autocomplete="off"></label>' +
          '<label class="beall-mezo"><span class="mezo-felirat">' + esc(sz('mezo_hely_sk')) + '</span>' +
            '<input data-t="beall" data-mezo="helySk" value="' + esc(b0.helySk || '') + '" autocomplete="off"></label>' +
          '<label class="beall-mezo"><span class="mezo-felirat">' + esc(sz('mezo_datum')) + '</span>' +
            '<input type="date" data-t="beall" data-mezo="datum" value="' + esc(b0.datum) + '"></label>' +
          '<label class="beall-mezo kicsi"><span class="mezo-felirat">' + esc(sz('mezo_korok')) + '</span>' +
            '<input class="mini-input" data-t="beall" data-mezo="korok" value="' + esc(b0.korok) + '"></label>' +
        '</div>' +
        '<div id="hely-tippek" class="hely-tippek"></div>' +
        '<div class="kezdo-valasz">' +
          '<div class="kezdo-kerdes">' + esc(sz('kezdo_szabaly')) + '</div>' +
          '<div class="valaszto-sor">' +
            '<button class="valaszto-gomb' + (b0.jatekmod === 'helycsere' ? '' : ' aktiv') + '" data-t="jatekmod" data-mod="svajci">' + esc(sz('mod_svajci_rovid')) + '</button>' +
            '<button class="valaszto-gomb' + (b0.jatekmod === 'helycsere' ? ' aktiv' : '') + '" data-t="jatekmod" data-mod="helycsere">' + esc(sz('mod_helycsere_rovid')) + '</button>' +
          '</div>' +
          '<div class="kezdo-kerdes kezdo-kerdes-2">' + esc(sz('kezdo_kiemelt')) + '</div>' +
          '<div class="valaszto-sor">' +
            '<button class="valaszto-gomb' + (b0.kiemeltVedelem ? ' aktiv' : '') + '" data-t="kezdo-vedelem" data-ertek="1">' + esc(sz('kezdo_kiemelt_kulon')) + '</button>' +
            '<button class="valaszto-gomb' + (b0.kiemeltVedelem ? '' : ' aktiv') + '" data-t="kezdo-vedelem" data-ertek="0">' + esc(sz('kezdo_kiemelt_egyutt')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="nevezes-sor kezdo-gombok">' +
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
        ((a.korok || []).length
          ? '<p class="figyelem keso-figyelem">' + esc(sz('keso_figyelem')) + '</p>'
          : '') +
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
      var k = M.nevKulcs(q);
      return M.nevKulcs(p[0]).indexOf(k) >= 0 ||
             M.nevKulcs(p[1] || '').indexOf(k) >= 0 ||
             M.nevKulcs(p[2] || '').indexOf(k) >= 0;   /* a régi/lyukas nevét is megtalálja */
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
    /* Ha már elkezdődött a verseny, az új játékost az utolsó asztal utolsó helyére tesszük. */
    if ((S.allapot.korok || []).length) {
      var utolsoKor = S.allapot.korok[S.allapot.korok.length - 1];
      var utolsoAsztal = utolsoKor.asztalok[utolsoKor.asztalok.length - 1];
      if (utolsoAsztal) {
        utolsoAsztal.szekek = (utolsoAsztal.szekek || []).concat([id]);
        S.kesoJelzes = { nev: nevErtek, asztal: utolsoAsztal.asztal, kor: utolsoKor.kor };
      }
    }
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

  /* A következő kör beosztásának kiszámítása (a mostani állásból). */
  function beosztasSzamit() {
    var a = S.allapot;
    var helycsere = helycsereVan() && a.korok.length > 0;
    var e;
    if (helycsere) {
      var aktiv = M.aktivJatekosok(a, a.korok.length + 1);
      if (aktiv.length < 3) return { hiba: 'keves_aktiv' };
      e = M.helycsereKovetkezo(a.korok[a.korok.length - 1], aktiv.map(function (j) { return j.id; }),
        szam(a.beall.asztalLetszam, 3));
    } else {
      var rangsor = M.rangsor(a, a.korok.length).filter(function (s) {
        return !M.kilepettE(jatekos(s.id), a.korok.length + 1);
      });
      if (rangsor.length < 3) return { hiba: 'keves_aktiv' };
      var caps = M.asztalLetszamok(rangsor.length, szam(a.beall.asztalLetszam, 3), 'vegen');
      e = M.sorsolKovetkezo(rangsor.map(function (s) { return s.id; }), caps);
    }
    return { e: e, helycsere: helycsere };
  }

  /* Egy kör üres-e (még nincs benne egyetlen eredmény sem). */
  function korUresE(kor) {
    return (kor.asztalok || []).every(function (a2) {
      var e2 = a2.eredmenyek || {};
      return Object.keys(e2).every(function (k) {
        return !vanErtek(e2[k].penz) && !vanErtek(e2[k].pont);
      });
    });
  }

  /* A legutolsó (még el nem kezdett) kör ÚJRAOSZTÁSA a javított állás szerint. */
  function ujraoszt() {
    var a = S.allapot;
    if (!a.korok.length) { hiba(sz('nincs_sorsolas')); render(); return; }
    if (a.korok.length < 2) { hiba(sz('ujraoszt_elso')); render(); return; }
    var utolso = a.korok[a.korok.length - 1];
    if (!korUresE(utolso)) { hiba(sz('ujraoszt_nem_lehet')); render(); return; }
    var regiKor = utolso.kor;
    a.korok.pop();                       /* ideiglenesen kivesszük */
    var szamitott = beosztasSzamit();
    if (szamitott.hiba) {
      a.korok.push(utolso);              /* visszatesszük, ha nem sikerült */
      hiba(sz(szamitott.hiba));
      render();
      return;
    }
    var ujKor = V.korLetrehoz(a, szamitott.e.szekek, '');
    ujKor.kor = regiKor;
    a.korok.push(ujKor);
    a.aktualisKor = a.korok.length;
    mentes();
    Tarolo.biztonsagiMentes(a);
    S.nezet = 'beiras'; S.asztal = 1;
    render();
    ok(sz('ujraoszt_kesz', { kor: regiKor }));
  }

  function kovetkezoKor() {
    var a = S.allapot;
    if (!M.korKesz(a, a.korok.length - 1)) { hiba(sz('kor_nem_kesz')); return; }
    var szamit = beosztasSzamit();
    if (szamit.hiba) { hiba(sz(szamit.hiba)); return; }
    var e = szamit.e, helycsere = szamit.helycsere;
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

  /* ============ Törzslista felhő-szinkron ============ */
  var torzsIdo = null;
  /* Két lista egyesítése kód szerint (a felhő a hiteles, de ami csak helyben van, az is marad). */
  function torzsEgyesit(helyi, felho) {
    var map = {};
    (helyi || []).forEach(function (x) {
      if (!x || !x[2]) return;
      map[String(x[0])] = [Number(x[0]), x[1] || '', x[2]];
    });
    (felho || []).forEach(function (x) {
      if (!x || !x[2]) return;
      map[String(x[0])] = [Number(x[0]), x[1] || '', x[2]];
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return a[0] - b[0]; });
  }

  /* Bármilyen törzslista-változás után feltölti a felhőbe (kis késleltetéssel). */
  function torzsFelhoMent(azonnal) {
    if (!global.BEKULDES || !global.BEKULDES.torzsMent) return;
    if (torzsIdo) global.clearTimeout(torzsIdo);
    var kuld = function () {
      S.torzsAllapot = sz('torzs_kuld');
      global.BEKULDES.torzsMent(torzsLista().map(function (x) {
        return [Number(x[0]), x[1] || '', x[2] || ''];
      }), function (h) {
        S.torzsAllapot = h ? sz('torzs_hiba') : sz('torzs_mentve', { ido: oraPerc2() });
        var el = global.document && global.document.getElementById ? global.document.getElementById('torzs-allapot') : null;
        if (el) el.textContent = S.torzsAllapot;
      });
    };
    if (azonnal) kuld();
    else torzsIdo = global.setTimeout(kuld, 1500);
  }

  /* Indításkor: a felhőben lévő törzslista beolvasztása. */
  function torzsFelhoBetolt() {
    if (!global.BEKULDES || !global.BEKULDES.torzsOlvas) return;
    global.BEKULDES.torzsOlvas(function (h, d) {
      if (h || !d || !d.sorok || !d.sorok.length) return;
      var egyesitett = torzsEgyesit(torzsLista(), d.sorok);
      if (egyesitett.length === torzsLista().length) {
        /* ugyanannyi elem – csak akkor írjuk felül, ha tényleg más */
        var azonos = JSON.stringify(egyesitett) === JSON.stringify(torzsLista().map(function (x) { return [Number(x[0]), x[1] || '', x[2] || '']; }));
        if (azonos) { S.torzsAllapot = sz('torzs_mentve', { ido: new Date(d.ts || Date.now()).toLocaleTimeString() }); return; }
      }
      S.allapot.torzslista = egyesitett;
      mentes();
      S.torzsAllapot = sz('torzs_betoltve', { n: egyesitett.length });
      render();
    });
  }

  /* A hiányzó összeg: ha már csak egy játékos pénze hiányzik, kiszámoljuk.
     Egy asztalon ugyanis mindig 5 € × játékosszám az összeg (3 főnél 15 €).
     Visszaad: { id, ertek } vagy null. */
  /* A hiányzó összeg kiemelt jelzése a táblázat alatt. */
  function javaslatJel(asztal) {
    var j = penzJavaslat(asztal);
    if (!j) return '';
    return ' <span class="javaslat-jel">' + esc(sz('javasolt_penz', { penz: j.ertek })) + '</span>';
  }

  function penzJavaslat(asztal) {
    var e = asztal.eredmenyek || {};
    var szekek = (asztal.szekek || []).filter(function (x) { return x !== null && x !== undefined; });
    var kell = 5 * szekek.length;
    var ossz = 0, uresDb = 0, uresId = null;
    szekek.forEach(function (id) {
      var x = e[id] || {};
      if (vanErtek(x.penz)) ossz += szam(x.penz);
      else { uresDb++; uresId = id; }
    });
    if (uresDb !== 1) return null;
    var maradek = kell - ossz;
    if (Math.abs(maradek) < 0.005) return null;
    return { id: uresId, ertek: penz(maradek).replace('.', ',') };
  }

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
      return '<button class="asztal-gomb' + (x.asztal === S.asztal ? ' aktiv' : '') +
        (ell.kesz ? ' kesz' : ' hianyzo') + '" data-t="asztal" data-aszta="' + x.asztal + '"' +
        (ell.kesz ? '' : ' title="' + esc(sz('hianyzo_asztal_tipp')) + '"') + '>' +
        x.asztal + (ell.kesz ? '<span class="pip">✓</span>' : '') + '</button>';
    }).join('');

    var hianyzo = hianyzoAsztalok(kor);
    var asztal = asztalok[S.asztal - 1];
    var ell = M.asztalEllenorzes(asztal, a.beall);
    var pontok = ell.pontok;
    var e = asztal.eredmenyek || {};

    var elozoStat = {};
    M.statisztika(a, kor.kor - 1).forEach(function (s) { elozoStat[s.id] = s; });

    /* A verseny szabálya: egy asztalon mindig 5 € × játékosszám a befizetett pénz
       összege (3 főnél 15 €, 4 főnél 20 €). Ha már csak egy valaki hiányzik,
       felkínáljuk neki a maradékot: kattintással elfogadható, de át is írható. */
    var javObj = penzJavaslat(asztal);
    var javaslat = javObj ? javObj.ertek : '';
    var uresId = javObj ? javObj.id : null;

    var sorok = (asztal.szekek || []).filter(function (x) { return x !== null; }).map(function (id) {
      var j = jatekos(id);
      var adat = e[id] || {};
      var stat = elozoStat[id];
      return '<tr>' +
        '<td class="nev-cell">' + esc(j ? j.nev : ('#' + id)) +
          (stat ? '<span class="elozo">' + esc(sz('eddig', { pont: stat.pont, penz: penz(stat.penz) })) + '</span>' : '') + '</td>' +
        '<td><input class="penz-input' + (javaslat && id === uresId ? ' javasolt' : '') + '" type="text" inputmode="decimal" autocomplete="off" data-t="penz" data-id="' + id + '"' +
          (javaslat && id === uresId ? ' data-javaslat="' + esc(javaslat) + '" title="' + esc(sz('javasolt_penz', { penz: javaslat })) + '"' : '') +
          ' value="' + (vanErtek(adat.penz) ? esc(adat.penz) : '') + '" placeholder="' + (javaslat && id === uresId ? esc(javaslat) : '0,00') + '"></td>' +
        '<td class="pont-cell" id="pont-' + id + '">' + (vanErtek(adat.pont)
          ? '<input class="pont-input" data-t="pont" data-id="' + id + '" value="' + esc(adat.pont) + '">'
          : '<b>' + pontok[id] + '</b>') + '</td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="kartya-blokk beir-blokk">' +
        /* körválasztó – itt lehet visszamenni bármelyik kör eredményeihez */
        '<div class="kor-valaszto"><span class="kor-valaszto-felirat">' + esc(sz('kor_valaszto_felirat')) + '</span>' +
          a.korok.map(function (k4) {
            var e4 = M.korKesz(a, a.korok.indexOf(k4));
            return '<button class="kor-csempe' + (k4.kor === kor.kor ? ' aktiv' : '') + (e4 ? ' kesz' : '') +
              '" data-t="korvalt" data-kor="' + k4.kor + '" title="' + esc(sz('kor_valasz_tipp', { kor: k4.kor })) + '">' +
              k4.kor + '.' + (e4 ? '<span class="pip">✓</span>' : '') + '</button>';
          }).join('') +
        '</div>' +
        '<h2 class="beir-fej">' + esc(sz('beir_cim', { kor: kor.kor })) + '</h2>' +
        /* egyetlen, tömör sor a tudnivalókkal */
        (function () {
          var savok = [];
          if (a.lezarva) savok.push('<p class="figyelem">' + esc(sz('lezarva_ujranyitas_sugo')) + ' ' +
            '<button class="masod-gomb kicsi" data-t="ujranyit">' + esc(sz('lezarva_ujranyitas')) + '</button></p>');
          if ((kor.kor || 0) < (a.korok.length || 0)) savok.push('<p class="figyelem">' +
            esc(sz('kor_javitas_figyelem', { kor: kor.kor, kov: a.korok.length })) + '</p>');
          if (a.korok.length > 1 && korUresE(a.korok[a.korok.length - 1])) savok.push('<p class="figyelem ujraoszt-sav">' +
            esc(sz('ujraoszt_sugo')) + ' <button class="masod-gomb kicsi" data-t="ujraoszt">' + esc(sz('ujraoszt_gomb')) + '</button></p>');
          return savok.join('');
        })() +
        '<p class="haladas">' + esc(sz('haladas', { kesz: asztalok.length - hianyzo.length, ossz: asztalok.length })) +
          (hianyzo.length ? ' · <b class="hianyzo-szoveg">' + esc(sz('hianyzo_asztalok', { lista: hianyzo.join(', ') })) + '</b>' : '') +
        '</p>' +
        '<div class="asztal-gombok">' + gombok + '</div>' +
        (function () {
          if (hianyzo.length) return '';
          var utolsoKor = a.korok.length;
          var vanKov = utolsoKor < szam(a.beall.korok, 5);
          /* Ha egy korábbi kört nézünk, ne zárjunk le semmit – csak ugorjunk vissza a legutolsóhoz. */
          if (kor.kor < utolsoKor) {
            return '<div class="kor-lezaras">' +
              '<span class="ok-jel">' + esc(sz('kor_minden_kesz')) + '</span>' +
              '<button class="masod-gomb kor-lezaras-gomb" data-t="korvalt" data-kor="' + utolsoKor + '">' +
                esc(sz('ugras_utolso_korhoz', { kor: utolsoKor })) + '</button>' +
              '</div>' +
              '<p class="sugo">' + esc(sz('kor_javitas_utan_sugo')) + '</p>';
          }
          return '<div class="kor-lezaras">' +
            '<span class="ok-jel">' + esc(sz('kor_minden_kesz')) + '</span>' +
            (vanKov
              ? '<button class="fo-gomb kor-lezaras-gomb" data-t="kor-lezar">' +
                esc(sz('kor_lezar_gomb', { kor: utolsoKor + 1 })) + '</button>'
              : '<button class="fo-gomb kor-lezaras-gomb" data-t="lezar">' + esc(sz('lezar_gomb_utolso')) + '</button>') +
            '</div>' +
            '<p class="sugo">' + esc(vanKov ? kovetkezoModSzoveg() : sz('utolso_kor_sugo')) + '</p>';
        })() +
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
        '<div class="beiras-lab">' + penzLabellal(ell) + (typeof javaslatJel === 'function' ? javaslatJel(asztal) : '') + '</div>' +
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
    if (lab) lab.innerHTML = penzLabellal(ell) + javaslatJel(asztal);
    (asztal.szekek || []).forEach(function (id) {
      if (id === null) return;
      var cella = document.getElementById('pont-' + id);
      var e2 = asztal.eredmenyek[id] || {};
      if (cella && !vanErtek(e2.pont)) cella.innerHTML = '<b>' + ell.pontok[id] + '</b>';
    });
    /* A hiányzó összeget gépelés közben is felkínáljuk (szürke placeholder). */
    var jav = penzJavaslat(asztal);
    (asztal.szekek || []).forEach(function (id) {
      if (id === null || id === undefined) return;
      var inp = document.querySelector ? document.querySelector('input.penz-input[data-id="' + id + '"]') : null;
      if (!inp) return;
      var kitoltve = !!(inp.value && String(inp.value).trim());
      if (jav && jav.id === id && !kitoltve) {
        inp.placeholder = jav.ertek;
        inp.className = 'penz-input javasolt';
        inp.setAttribute('data-javaslat', jav.ertek);
      } else if (jav && jav.id === id) {
        inp.setAttribute('data-javaslat', jav.ertek);
        inp.className = 'penz-input';
      } else {
        inp.removeAttribute('data-javaslat');
        inp.className = 'penz-input';
      }
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
        /* a fejléc sorrendje: € (pénz), majd PONT – az adat is így menjen */
        korok += '<td class="szam halvany">' + (kr ? penz(kr.penz) : '·') + '</td><td class="szam' +
          (k2 + 1 < ig ? ' pont-utolso' : '') + '">' + (kr ? kr.pont : '·') + '</td>';
      }
      var dijDb = szam(a.beall.dijazott, 0);
      return '<tr class="' + (s.kiemelt ? 'kiemelt-sor ' : '') +
        (s.hely <= 3 ? 'rang-' + s.hely + ' ' : '') +
        (dijDb > 0 && s.hely <= dijDb ? 'dijazott-sor ' : '') +
        (i % 2 ? 'paros-sor' : '') + '">' +
        '<td class="szam nagy">' + s.hely + '.</td>' +
        '<td>' + esc(s.nev) + (dijDb > 0 && s.hely <= dijDb ? ' <span class="dij-jel" title="' + esc(sz('dij_tipp')) + '">🎁</span>' : '') +
          (s.kiemelt ? ' <span class="cimke">' + esc(sz('cimke_kiemelt')) + '</span>' : '') +
          (M.kilepettE(jatekos(s.id), 999) ? ' <span class="cimke kilepett">' + esc(sz('cimke_kilepett', { kor: jatekos(s.id).kilepettKor })) + '</span>' : '') + '</td>' +
        korok +
        '<td class="szam nagy ossz">' + s.pont + '</td>' +
        '<td class="szam nagy ossz">' + penz(s.penz) + '</td>' +
        '</tr>';
    }).join('');

    var korFej = '', korFej2 = '';
    for (var k3 = 0; k3 < ig; k3++) {
      korFej += '<th colspan="2">' + esc(sz('th_kor', { kor: k3 + 1 })) + '</th>';
      korFej2 += '<th class="rovid penz-fej">' + esc(sz('th_penz')) + '</th><th class="rovid pont-fej">' + esc(sz('vet_pont_rovid')) + '</th>';
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
            ((varE('lezar1')
          ? '<div class="lezar-doboz">' +
              '<p class="lezar-kerdes">' + esc(sz('lezar_kerdes')) + '</p>' +
              '<label class="beall-mezo kicsi"><span class="mezo-felirat">' + esc(sz('dij_kerdes')) + sugoIkon('dij_sugo') + '</span>' +
                '<input id="dijazott-be" class="mini-input" value="' + esc(szam(a.beall.dijazott, 0) || '') + '" placeholder="0"></label>' +
              '<div class="nevezes-sor">' +
                '<button class="fo-gomb" data-t="lezar-igen">' + esc(sz('lezar_igen')) + '</button>' +
                '<button class="masod-gomb" data-t="megerosites-nem">' + esc(sz('megse')) + '</button>' +
              '</div>' +
            '</div>'
          : '<button class="masod-gomb kicsi veszely-gomb" data-t="lezar-ker">' + esc(sz('lezar_gomb')) + '</button>') +
        '<button class="masod-gomb kicsi" data-t="excel">' + esc(sz('excel_gomb')) + '</button>' +
        '<button class="masod-gomb kicsi" data-t="elo-feltolt" title="' + esc(sz('elo_tipp')) + '">' + esc(sz('elo_gomb')) + '</button>' +
                '<span class="sugo">' + esc(sz('lezar_sugo')) + '</span>') +
          '</div>') +
      '<div class="nevezes-sor"><button class="' + (gorgetBe() ? 'fo-gomb' : 'masod-gomb') + ' kicsi" data-t="gorget">' +
        esc(gorgetBe() ? sz('gorget_ki') : sz('gorget_be')) + '</button>' +
        '<span class="sugo">' + esc(sz('gorget_sugo')) + '</span></div>' +
      '<p class="sugo">' + esc(sz('rang_sugo', { sorrend: kulcsok.map(function (k) { return sz('tb_' + k); }).join(' → ') })) + '</p>' +
      '<div class="rangsor-gorgeto" id="rangsor-gorgeto">' +
      '<table class="tabla rangsor"><thead>' +
        '<tr><th rowspan="2">' + esc(sz('th_hely')) + '</th><th rowspan="2">' + esc(sz('th_nev')) + '</th>' +
          korFej +
          '<th rowspan="2" class="ossz-fej">' + esc(sz('th_ossz_pont')) + '</th>' +
          '<th rowspan="2" class="ossz-fej">' + esc(sz('th_ossz_penz')) + '</th></tr>' +
        '<tr>' + korFej2 + '</tr>' +
        '</thead><tbody>' + sorok + '</tbody></table></div>' +
        (szam(a.beall.dijazott, 0) > 0
          ? '<p class="dij-lablec">🎁 ' + esc(sz('dij_lablec', { n: szam(a.beall.dijazott, 0) })) + '</p>'
          : '') +
      '</div>';
  }

  /* ======================= kivetítés ==================================== */

  function vetitesNezet() {
    var a = S.allapot;
    var kor = aktualisKor();
    var popup = !!global.opener;
    var gombok = ('<div class="vetites-valto">' +
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
      var utolso = S.ujJatekos ? jatekos(S.ujJatekos) : null;
      var sorok2 = jk2.map(function (j, i) {
        return '<tr class="' + (j.kiemelt ? 'kiemelt-sor ' : '') + (utolso && j.id === utolso.id ? 'most-sor' : '') + '">' +
          '<td class="szam">' + (i + 1) + '.</td>' +
          '<td class="szam">' + j.id + '</td><td class="vet-nev">' + esc(j.nev) + '</td>' +
          '<td>' + (j.kilepettKor ? esc(sz('cimke_kilepett', { kor: j.kilepettKor })) : '') + '</td></tr>';
      }).join('');
      return gombok + '<div class="vetites vet-rangsor">' +
        '<div class="vet-nevlista-fej">' +
      '<div class="rangsor-gorgeto vet-gorgeto" id="rangsor-gorgeto">' +
          '<h1>' + esc(sz('nevlista_cim')) + '</h1>' +
          '<span class="vet-szamlalo">' + esc(sz('nevlista_db', { n: jk2.length, t: caps2.length })) + '</span>' +
          (utolso ? '<span class="vet-most">' + esc(sz('vet_most', { nev: utolso.nev, kod: utolso.id })) + '</span>' : '') +
        '</div>' +
        '<table class="tabla vet-tabla"><tbody>' + sorok2 + '</tbody></table></div>';
    }

    if (S.vetites === 'rangsor') {
      var ig = a.aktualisKor || 0;
      var lista = ig ? M.rangsor(a, ig) : [];
      var sorok = lista.map(function (s, i) {
        var korok = '';
        for (var k2 = 0; k2 < ig; k2++) {
          var kr = s.korok.filter(function (x) { return x.kor === k2 + 1; })[0];
          korok += '<td class="szam">' + (kr ? penz(kr.penz) : '·') + '</td>' +
                   '<td class="szam">' + (kr ? kr.pont : '·') + '</td>';
        }
        return '<tr class="' + (s.kiemelt ? 'kiemelt-sor ' : '') +
          (s.hely <= 3 ? 'rang-' + s.hely + ' ' : '') +
          (szam(a.beall.dijazott, 0) > 0 && s.hely <= szam(a.beall.dijazott, 0) ? 'dijazott-sor ' : '') +
          (i % 2 ? 'paros-sor' : '') + '">' +
          '<td class="szam">' + s.hely + '.</td><td class="vet-nev">' + esc(s.nev) +
            (szam(a.beall.dijazott, 0) > 0 && s.hely <= szam(a.beall.dijazott, 0) ? ' <span class="dij-jel">🎁</span>' : '') + '</td>' +
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
      '<div class="rangsor-gorgeto vet-gorgeto" id="rangsor-gorgeto">' +
        '<table class="tabla vet-tabla"><thead>' +
          '<tr><th rowspan="2">#</th><th rowspan="2">' + esc(sz('th_nev')) + '</th>' +
            fej1 +
            '<th rowspan="2" class="ossz-fej">' + esc(sz('th_ossz_pont')) + '</th>' +
            '<th rowspan="2" class="ossz-fej">' + esc(sz('th_ossz_penz')) + '</th></tr><tr>' + fej2 + '</tr>' +
        '</thead><tbody>' + sorok + '</tbody></table>' +
      '</div>' +
        (szam(a.beall.dijazott, 0) > 0
          ? '<p class="dij-lablec vet-dij">🎁 ' + esc(sz('dij_lablec', { n: szam(a.beall.dijazott, 0) })) + '</p>'
          : '') +
        '</div>';
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
            '<span class="vet-nev' + ((nev(id) || '').length > 16 ? ' vet-nev-kicsi' : '') + '">' +
              esc(nev(id)) + '<i class="vet-kod">' + esc(id) + '</i></span>' +
            '<span class="vet-pont">' + (st ? st.pont : 0) + '</span>' +
            '<span class="vet-penz">' + penz(st ? st.penz : 0) + '</span></li>';
        }).join('');
      return '<div class="vet-kartya">' +
        '<div class="vet-aszta"><span class="vet-aszta-szam">' + asztal.asztal + '.</span>' +
          '<span class="vet-aszta-szo">' + esc(sz('vet_aszta_szo')) + '</span></div>' +
        '<ul class="vet-tabla">' + rovatFej + nevek + '</ul></div>';
    }).join('');
    var db = kor.asztalok.length;
    /* Azt az oszlopszámot választjuk, amelynél a NÉV a legnagyobb betűvel fér ki.
       Két korlát: mennyi hely jut a névnek vízszintesen, és mennyi egy sornak
       függőlegesen. A kisebbik dönt – ezt maximalizáljuk, így bármilyen felbontáson
       és képarányon a lehető legolvashatóbb elrendezés jön ki. */
    var szel = szam(global.innerWidth, 1366);
    var mag = szam(global.innerHeight, 768) - 100;
    var maxSzek = 3;
    kor.asztalok.forEach(function (a) {
      var n = (a.szekek || []).filter(function (x) { return x !== null && x !== undefined; }).length;
      if (n > maxSzek) maxSzek = n;
    });
    var NEV_HOSSZ = 18;                 /* a leghosszabb nevekhez is legyen hely */
    var oszlopok = 1, legjobbBetu = 0;
    for (var o = 1; o <= Math.min(db, 10); o++) {
      var sor2 = Math.ceil(db / o);
      var kartySz = szel / o - 22;
      if (szel / o < 240) continue;     /* ennél keskenyebben a nevek nem olvashatók */
      var kartyM = mag / sor2 - 10;
      var vizszintes = (kartySz - 105) / (0.5 * NEV_HOSSZ);
      var fuggoleges = kartyM / ((maxSzek + 2) * 1.3);
      var betu = Math.min(vizszintes, fuggoleges);
      if (betu > legjobbBetu) { legjobbBetu = betu; oszlopok = o; }
    }
    if (legjobbBetu <= 0) {
      oszlopok = Math.max(1, Math.min(db, Math.round(Math.sqrt(db * szel / Math.max(1, mag)))));
    }
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
      
      '<h2>' + esc(sz('nyom_cim')) + '</h2>' +
      '<p class="sugo">' + szh('nyom_sugo') + '</p>' +
      '<div class="nevezes-sor">' +
        '<label>' + esc(sz('nyom_kor')) + ' <select id="nyomtat-kor">' + szelek + '</select></label>' +
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
        '<div class="c-aszta">' +
          '<span class="c-kor">' + kor.kor + '.<i>' + esc(sz('cedula_kor_szo')) + '</i></span>' +
          '<span class="c-aszta-jel">' + asztal.asztal + '.<i>' + esc(sz('cedula_aszta_szo')) + '</i></span>' +
        '</div>' +
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
      if (gorgetSzunet > 0) { gorgetSzunet--; return; }
      /* Csak a RANGSOR TÁBLÁZATÁN belül görgetünk (nem az egész lapot),
         így a menü és a fejléc helyben marad. */
      var doboz = null;
      if (global.document) {
        doboz = global.document.getElementById('rangsor-gorgeto') ||
          (global.document.querySelector ? global.document.querySelector('.rangsor-gorgeto') : null);
      }
      if (!doboz || !doboz.scrollHeight) return;
      var b = S.allapot.beall;
      if (b.gorgetIrany === undefined) b.gorgetIrany = 1;
      var max = (doboz.scrollHeight || 0) - (doboz.clientHeight || 0);
      if (max <= 2) return;
      var sz = doboz.scrollTop || 0;
      if (b.gorgetIrany > 0 && sz >= max - 2) { b.gorgetIrany = -1; gorgetSzunet = 70; return; }
      if (b.gorgetIrany < 0 && sz <= 2) { b.gorgetIrany = 1; gorgetSzunet = 70; return; }
      doboz.scrollTop = sz + b.gorgetIrany * 1;
    }, 55);
  }
  /* A kivetített asztalok automatikus méretezése. Az alapméret a képernyő
     magasságából jön (lásd a CSS-t), és csak akkor csökkentünk, ha valami mégis
     kilógna – így soha nem lesz olvashatatlan összecsúszás, és a teljes névsor
     egyszerre látszik, görgetés nélkül. */
  function vetitesIlleszt() {
    if (!document.querySelector) return 0;
    var racs = document.querySelector('.vet-racs');
    if (!racs || !racs.style || !racs.style.setProperty) return 0;
    var kartyak = [].slice.call(racs.querySelectorAll('.vet-kartya'));
    if (!kartyak.length) return 0;
    function kilogas() {
      var v = 0;
      kartyak.forEach(function (k) {
        v = Math.max(v, (k.scrollHeight || 0) - (k.clientHeight || 0));
        var ul = k.querySelector ? k.querySelector('ul') : null;
        if (ul) v = Math.max(v, (ul.scrollHeight || 0) - (ul.clientHeight || 0));
        /* a teljes neveknek is bele kell férniük – ha csonkolódna, kisebbítünk */
        var nevek = k.querySelectorAll ? k.querySelectorAll('.vet-nev') : [];
        for (var n = 0; n < nevek.length; n++) {
          v = Math.max(v, (nevek[n].scrollWidth || 0) - (nevek[n].clientWidth || 0));
        }
      });
      return v;
    }
    var meret = 1, i;
    racs.style.setProperty('--vet-meret', meret);
    for (i = 0; i < 40 && meret > 0.35; i++) {
      if (kilogas() <= 0) break;
      meret -= 0.04;
      racs.style.setProperty('--vet-meret', meret);
    }
    S.vetMeret = meret;
    return meret;
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
      if (doboz) {
        /* a szünet osztályt is meg kell tartani, különben a kiemelés eltűnik */
        var szunetE2 = (o.mod === 'szunet');
        doboz.className = 'ora' +
          (o.fut && maradek <= 0 ? ' ora-lejart' : '') +
          (S.allapot.beall.oraVilagos ? ' ora-vilagos' : '') +
          (szunetE2 ? ' ora-szunet-mod' : '');
      }
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
    var szunetMod = (o.mod === 'szunet');
    var gomb = o.fut
      ? '<button class="masod-gomb nagy-gomb-2" data-t="ora-szunet">' + esc(sz('ora_szunet')) + '</button>'
      : (o.maradek
        ? '<button class="fo-gomb nagy-gomb-2" data-t="ora-folytat">' + esc(sz('ora_folytat')) + '</button>'
        : '<button class="fo-gomb nagy-gomb-2" data-t="ora-indit">' + esc(sz('ora_indit')) + '</button>');
    return '<div class="ora' + (lejart ? ' ora-lejart' : '') + (a.beall.oraVilagos ? ' ora-vilagos' : '') +
      (szunetMod ? ' ora-szunet-mod' : '') + '">' +
      '<button class="masod-gomb kicsi ora-vissza" data-t="vissza">← ' + esc(sz('vissza')) + '</button>' +
      '<div class="ora-fej">' +
        '<span class="ora-kor">' + esc(kor ? sz('ora_kor', { kor: kor.kor, osszes: a.beall.korok }) : sz('nincs_sorsolas')) + '</span>' +
        '<span class="ora-cim">' + esc(szunetMod ? sz('ora_szunet_cim') : sz('ora_cim')) + '</span>' +
      '</div>' +
      '<div class="ora-szam" id="ora-szam">' + M.oraSzoveg(maradek) + '</div>' +
      '<div class="ora-vege" id="ora-vege">' +
        (lejart ? esc(sz('ora_lejart')) : (vege ? esc(sz('ora_vege', { ido: M.oraIdoSzoveg(vege) })) : esc(sz('ora_nincs')))) +
      '</div>' +
      '<div class="ora-mod-valto">' +
        '<button class="ora-mod-gomb' + (szunetMod ? '' : ' aktiv') + '" data-t="ora-mod" data-mod="kor">' + esc(sz('ora_mod_kor')) + '</button>' +
        '<button class="ora-mod-gomb' + (szunetMod ? ' aktiv' : '') + '" data-t="ora-mod" data-mod="szunet">' + esc(sz('ora_mod_szunet')) + '</button>' +
      '</div>' +
      '<div class="ora-vezerlok">' +
          '<label>' + esc(sz('ora_perc')) + ' <input id="ora-perc" class="mini-input" value="' +
            esc(o.perc || (szunetMod ? (a.beall.szunetPerc || 15) : (a.beall.oraPerc || 50))) + '"></label>' +
          gomb +
          '<button class="masod-gomb" data-t="ora-nullaz">' + esc(sz('ora_nullaz')) + '</button>' +
          '<button class="masod-gomb" data-t="ora-szin">' + esc(a.beall.oraVilagos ? sz('ora_sotet') : sz('ora_vilagos')) + '</button>' +
          '<button class="masod-gomb" data-t="ora-ablak">' + esc(sz('ora_ablak')) + '</button>' +
        '</div>' +
        '<p class="sugo">' + esc(sz('ora_sugo')) + '</p>' +
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

  /* Kis „?" ikon: egérrel ráhúzva megjelenik a magyarázat – így nem kell
     hosszú szövegekkel teleírni az oldalt. */
  function sugoIkon(kulcs) {
    return ' <span class="sugo-ikon" data-sugo="' + esc(sz(kulcs)) + '" tabindex="0">?</span>';
  }

  function beallitasNezet() {
    var a = S.allapot, b = a.beall;
    var kulcsok = String(b.tiebreak || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var tiebreakSor = kulcsok.map(function (k, i) {
      return '<span class="tiebreak-elem">' + (i + 1) + '. ' + esc(sz('tb_' + k)) +
        ' <button class="ikon-gomb" data-t="tiebreak-fel" data-kulcs="' + k + '" title="' + esc(sz('tiebreak_fel')) + '">↑</button>' +
        '<button class="ikon-gomb" data-t="tiebreak-le" data-kulcs="' + k + '" title="' + esc(sz('tiebreak_le')) + '">↓</button>' +
        '<button class="ikon-gomb veszely" data-t="tiebreak-torol" data-kulcs="' + k + '">×</button></span>';
    }).join(' ');
    var marad = Object.keys(V.TIEBREAK_KULCSOK).filter(function (k) { return kulcsok.indexOf(k) < 0; })
      .map(function (k) { return '<button class="masod-gomb kicsi" data-t="tiebreak-hozzaad" data-kulcs="' + k + '">+ ' + esc(sz('tb_' + k)) + '</button>'; }).join(' ');
    var mentesek = V.Tarolo.mentesek().slice(0, 5).map(function (k) {
      return '<button class="masod-gomb kicsi" data-t="visszaallit" data-kulcs="' + esc(k) + '">' +
        esc(k.replace('mub-verseny-mentes-', '').slice(0, 16).replace('T', ' ')) + '</button>';
    }).join(' ');
    /* A szekciók nyitottságát megjegyezzük, hogy a csillagozás után ne csukódjanak össze. */
    function nyitott(kulcs) {
      return (S.nyitottDetails && S.nyitottDetails[kulcs]) ? ' open' : '';
    }
    var biztNyit = (S.biztNyitva === true);   /* alapból csukva */
    var archivNyit = (S.archivNyitva !== false);  /* az előzmények alapból nyitva */
    var tesztKi = M.tesztBetolt();
    var tesztSor = tesztKi
      ? '<div class="teszt-sor"><span class="teszt-jel">●</span> ' + esc(sz('teszt_van')) +
          ' <button class="masod-gomb" data-t="teszt-vissza">' + esc(sz('teszt_vissza')) + '</button></div>'
      : '<div class="teszt-sor"><span class="teszt-jel halvany">○</span> ' + esc(sz('teszt_nincs')) +
          ' <button class="masod-gomb" data-t="teszt-indit">' + esc(sz('teszt_indit')) + '</button></div>';

    return '' +

      /* ---------- Új verseny / tiszta lap (mindig legfelül) ---------- */
      /* ---------- Új verseny / tiszta lap ---------- */
      '<div class="kartya-blokk">' +
        '<h2>' + esc(sz('uj_kartya_cim')) + sugoIkon('uj_kartya_sugo') + '</h2>' +
        '<p class="sugo">' + esc(sz('uj_kartya_magyar')) + '</p>' +
        '<div class="nevezes-sor">' +
          '<button class="fo-gomb" data-t="ujverseny-ker">' + esc(sz('uj_kartya_gomb')) + '</button>' +
          '<button class="masod-gomb kicsi veszely-gomb" data-t="teljes-torles">' + esc(sz('uj_tiszta_gomb')) + '</button>' +
        '</div>' +
      '</div>' +

      /* ---------- Verseny adatai ---------- */
      '<div class="kartya-blokk">' +
        '<h2>' + esc(sz('beall_cim')) + sugoIkon('beall_sugo') + '</h2>' +
        '<div class="beall-racs">' +
          '<label class="beall-mezo">' + esc(sz('mezo_hely_hu')) +
            '<input data-t="beall" data-mezo="helyHu" value="' + esc(b.helyHu || b.hely || '') + '" autocomplete="off"></label>' +
          '<label class="beall-mezo">' + esc(sz('mezo_hely_sk')) +
            '<input data-t="beall" data-mezo="helySk" value="' + esc(b.helySk || '') + '" autocomplete="off"></label>' +
          '<label class="beall-mezo">' + esc(sz('mezo_datum')) +
            '<input type="date" data-t="beall" data-mezo="datum" value="' + esc(b.datum) + '"></label>' +
          '<label class="beall-mezo kicsi">' + esc(sz('mezo_korok')) +
            '<input class="mini-input" data-t="beall" data-mezo="korok" value="' + esc(b.korok) + '"></label>' +
          '<label class="beall-mezo kicsi"><span class="mezo-felirat">' + esc(sz('mezo_asztal')) + sugoIkon('mezo_asztal_sugo') + '</span>' +
            '<input class="mini-input" data-t="beall" data-mezo="asztalLetszam" value="' + esc(b.asztalLetszam) + '"></label>' +
        '</div>' +
        '<div id="hely-tippek" class="hely-tippek"></div>' +

        '<details class="beall-resz" data-dk="halado"' + nyitott('halado') + '><summary>' + esc(sz('beall_halado')) + '</summary>' +
          '<div class="beall-racs">' +
            '<label class="beall-mezo kicsi"><span class="mezo-felirat">' + esc(sz('mezo_jatekok')) + sugoIkon('mezo_jatekok_tipp') + '</span>' +
              '<input class="mini-input" data-t="beall" data-mezo="jatekokKoronkent" value="' + esc(b.jatekokKoronkent) + '"></label>' +
            '<label class="beall-mezo kicsi"><span class="mezo-felirat">' + esc(sz('mezo_befizetes')) + sugoIkon('mezo_befizetes_tipp') + '</span>' +
              '<input class="mini-input" data-t="beall" data-mezo="penzJatekonkent" value="' + esc(b.penzJatekonkent) + '"></label>' +
            '<label class="beall-mezo szeles"><span class="mezo-felirat">' + esc(sz('mezo_webcim')) + sugoIkon('webcim_mi') + '</span>' +
              '<input data-t="beall" data-mezo="webcim" value="' + esc(b.webcim || '') + '" placeholder="' + esc(sz('webcim_hely')) + '"></label>' +
          '</div>' +
          '<label class="kapcsolo"><input type="checkbox" data-t="beall" data-mezo="qrBe"' + (b.qrBe ? ' checked' : '') + '> ' + esc(sz('qr_be_rovid')) + '</label>' +
          '<label class="kapcsolo teszt-kapcsolo"><input type="checkbox" data-t="beall" data-mezo="tesztVerseny"' + (b.tesztVerseny ? ' checked' : '') + '> ' + esc(sz('teszt_verseny_kapcsolo')) + sugoIkon('teszt_verseny_sugo') + '</label>' +
          '<label class="kapcsolo"><input type="checkbox" data-t="beall" data-mezo="kiemeltVedelem"' + (b.kiemeltVedelem ? ' checked' : '') + '> ' + esc(sz('kiemelt_vedelem')) + '</label>' +
        '</details>' +
      '</div>' +

      /* ---------- Játékszabály ---------- */
      '<div class="kartya-blokk">' +
        '<h2>' + esc(sz('mod_cim')) + sugoIkon('mod_sugo') + '</h2>' +
        '<div class="valaszto-sor">' +
          '<button class="valaszto-gomb' + (b.jatekmod === 'helycsere' ? '' : ' aktiv') + '" data-t="jatekmod" data-mod="svajci">' + esc(sz('mod_svajci_rovid')) + '</button>' +
          '<button class="valaszto-gomb' + (b.jatekmod === 'helycsere' ? ' aktiv' : '') + '" data-t="jatekmod" data-mod="helycsere">' + esc(sz('mod_helycsere_rovid')) + '</button>' +
          '<label class="beall-mezo kicsi beall-inline"><span class="mezo-felirat">' + esc(sz('mod_korok')) + sugoIkon('mod_helycsere_sugo') + '</span>' +
            '<input class="mini-input" data-t="beall" data-mezo="helycsereKorok" value="' + esc(b.helycsereKorok) + '"></label>' +
        '</div>' +
      '</div>' +

      /* ---------- Kiemelt játékosok ---------- */
      '<div class="kartya-blokk">' +
        '<h2>' + esc(sz('klist_cim')) + sugoIkon('klist_sugo') + '</h2>' +
        '<div class="nevezes-sor">' +
          '<input id="kiemelt-kereso" data-t="kiemelt-kereso" class="kozepes-input" placeholder="' + esc(sz('kereso_hely')) + '" autocomplete="off">' +
          '<button class="masod-gomb kicsi" data-t="kiemelt-ment">' + esc(sz('klist_mostani')) + '</button>' +
        '</div>' +
        '<div id="kiemelt-talalatok" class="kereso-lista"></div>' +
        ((S.kiemeltLista || []).length
          ? '<div class="weblap-lista">' + (S.kiemeltLista || []).map(function (id) {
              var t = torzsKeres(String(id));
              return '<span class="weblap-elem megvan"><span class="weblap-kod">' + id + '</span>' +
                '<span>' + esc(t ? t.nev : ('#' + id)) + '</span>' +
                '<button class="torles-gomb" data-t="kiemelt-torol" data-id="' + id + '">×</button></span>';
            }).join('') + '</div>'
          : '<p class="sugo">' + esc(sz('klist_ures')) + '</p>') +
      '</div>' +

      /* ---------- Játékosok (törzslista) ---------- */
      '<div class="kartya-blokk">' +
        '<details class="beall-resz" data-dk="torzs"' + nyitott('torzs') + '><summary>' + esc(sz('torzs_cim')) + sugoIkon('torzs_szerk_sugo') +
          '<span class="ossz-jel">' + esc(sz('torzs_most', { n: torzsLista().filter(function (x) { return x[2]; }).length })) + '</span>' +
        '</summary>' +
          '<p class="sugo torzs-csillag-sugo">' + esc(sz('torzs_csillag_sugo')) + '</p>' +
          '<p id="torzs-allapot" class="sugo torzs-allapot">' + esc(S.torzsAllapot || '') + '</p>' +
          '<div class="torzs-uj nevezes-sor">' +
            '<input id="torzs-uj-kod" class="mini-input" placeholder="' + esc(sz('th_kod')) + '">' +
            '<input id="torzs-uj-nev" class="kozepes-input" placeholder="' + esc(sz('th_nev')) + '">' +
            '<input id="torzs-uj-kartya" class="mini-input" placeholder="' + esc(sz('th_kartya')) + '">' +
            '<button class="fo-gomb kicsi" data-t="torzs-uj">' + esc(sz('hozzaad')) + '</button>' +
          '</div>' +
          '<div class="torzs-lista">' +
            torzsLista().slice(0, 400).map(function (sor) {
              var kiemeltL = kiemeltListan(sor[0]);
              return '<div class="torzs-sor">' +
                '<button class="csillag-gomb' + (kiemeltL ? ' be' : '') + '" data-t="torzs-kiemelt" data-id="' + esc(sor[0]) + '"' +
                  ' title="' + esc(sz('torzs_csillag_tipp')) + '">' + (kiemeltL ? '★' : '☆') + '</button>' +
                '<span class="torzs-kod">' + esc(sor[0]) + '</span>' +
                '<input class="torzs-nev" data-t="torzs-nev" data-id="' + esc(sor[0]) + '" value="' + esc(sor[2] || '') + '">' +
                '<input class="torzs-kartya" data-t="torzs-kartya" data-id="' + esc(sor[0]) + '" value="' + esc(sor[1] || '') + '" placeholder="' + esc(sz('th_kartya')) + '">' +
                '<button class="torles-gomb" data-t="torzs-torol" data-id="' + esc(sor[0]) + '">×</button>' +
                '</div>';
            }).join('') +
          '</div>' +
          '<div class="nevezes-sor">' +
            '<button class="masod-gomb kicsi" data-t="torzs-weblap">' + esc(sz('torzs_webrol')) + '</button>' +
            '<button class="masod-gomb kicsi" data-t="torzs-feltolt">' + esc(sz('torzs_webbe')) + '</button>' +
            '<button class="masod-gomb kicsi" data-t="torzs-import">' + esc(sz('torzs_gomb')) + '</button>' +
            (a.torzslista ? '<button class="masod-gomb kicsi" data-t="torzs-alap">' + esc(sz('torzs_alap')) + '</button>' : '') +
            '<input type="file" id="torzs-fajl" accept=".csv,.txt,.tsv,.json" style="display:none">' +
            '<span id="torzs-uzenet" class="sugo"></span>' +
          '</div>' +
        '</details>' +
      '</div>' +

      /* ---------- Döntetlen sorrendje ---------- */
      '<div class="kartya-blokk">' +
        '<details class="beall-resz" data-dk="tiebreak"' + nyitott('tiebreak') + '><summary>' + esc(sz('tiebreak_cim')) + sugoIkon('tiebreak_sugo') + '</summary>' +
          '<div class="tiebreak">' + (tiebreakSor || '<i>' + esc(sz('tiebreak_nincs')) + '</i>') + '</div>' +
          '<div class="tiebreak-hozzaad">' + marad + '</div>' +
        '</details>' +
      '</div>' +

      /* ---------- Biztonsági mentés – három világos csoport ---------- */
      '<div class="kartya-blokk">' +
        '<h2><button class="kartya-fej-gomb" data-t="bizt-nyit">' +
          '<span class="kartya-nyil">' + (biztNyit ? '▾' : '▸') + '</span>' +
          esc(sz('mentes_bizt_cim')) + '</button>' + sugoIkon('mentes_bizt_sugo') + '</h2>' +
        (biztNyit
          ? '<div class="bizt-torzs">' +

              /* ---------- 1. mentés ---------- */
              '<div class="bizt-blokk">' +
                '<div class="bizt-fej">' + esc(sz('b1_cim')) + '</div>' +
                '<p class="bizt-magyar">' + esc(sz('b1_magyar')) + '</p>' +
                '<div class="nevezes-sor">' +
                  '<button class="fo-gomb" data-t="felho-ment">' + esc(sz('b1_gomb')) + '</button>' +
                  '<button class="masod-gomb" data-t="excel-bizt">' + esc(sz('b3_gomb')) + '</button>' +
                '</div>' +
                '<p id="felho-allapot" class="felho-allapot' + (S.felhoTipus ? ' ' + S.felhoTipus : '') + '">' + esc(S.felhoAllapot || '') + '</p>' +
              '</div>' +

              /* ---------- 2. visszaállítás ---------- */
              '<div class="bizt-blokk">' +
                '<div class="bizt-fej">' + esc(sz('b2_cim')) + '</div>' +
                '<p class="bizt-magyar">' + esc(sz('b2_magyar')) + '</p>' +
                '<div class="nevezes-sor">' +
                  '<button class="masod-gomb kicsi" data-t="felho-lista">' + esc(sz('nyitott_frissit')) + '</button>' +
                  '<button class="masod-gomb kicsi" data-t="felho-vissza">' + esc(sz('b2_vissza')) + '</button>' +
                  '<span class="sugo">' + esc(S.felhoListaAllapot || '') + '</span>' +
                '</div>' +
                ((S.felhoLista && S.felhoLista.length)
                  ? '<div class="felho-lista">' + S.felhoLista.map(function (x) {
                      var ido = x.ts ? new Date(x.ts) : null;
                      return '<div class="felho-elem">' +
                        '<div class="felho-elem-szov"><b>' + esc(x.nev || sz('verseny_cim_hely')) + '</b>' +
                          '<span>' + esc(x.datum || '') + (ido ? ' · ' + esc(sz('felho_mentve_rovid', { ido: ido.toLocaleString() })) : '') + '</span></div>' +
                        '<button class="masod-gomb kicsi" data-t="felho-megnyit" data-id="' + esc(x.id) + '">' + esc(sz('nyitott_megnyit')) + '</button>' +
                      '</div>';
                    }).join('') + '</div>'
                  : '') +
              '</div>' +

              /* ---------- 3. Excel ---------- */
              '<div class="bizt-blokk">' +
                '<div class="bizt-fej">' + esc(sz('b3_cim')) + '</div>' +
                '<p class="bizt-magyar">' + esc(sz('b3_magyar')) + '</p>' +
                '<div class="nevezes-sor">' +
                  '<button class="masod-gomb" data-t="excel-bizt">' + esc(sz('excel_bizt_gomb')) + '</button>' +
                  '<button class="masod-gomb" data-t="excel-vagolap">' + esc(sz('excel_vagolap_gomb')) + '</button>' +
                '</div>' +
              '</div>' +

              /* ---------- egyéb ---------- */
              '<details class="beall-resz" data-dk="egyeb"' + nyitott('egyeb') + '><summary>' + esc(sz('b4_cim')) + '</summary>' +

                '<div class="bizt-al">' +
                  '<div class="bizt-fej">' + esc(sz('b4_fajl')) + '</div>' +
                  '<p class="bizt-magyar">' + esc(sz('b4_fajl_magyar')) + '</p>' +
                  '<div class="nevezes-sor">' +
                    '<button class="masod-gomb kicsi" data-t="export">' + esc(sz('export_gomb')) + '</button>' +
                    '<button class="masod-gomb kicsi" data-t="import">' + esc(sz('import_gomb')) + '</button>' +
                    '<button class="masod-gomb kicsi" data-t="csv">' + esc(sz('csv_gomb')) + '</button>' +
                    '<input type="file" id="import-fajl" accept=".json" style="display:none">' +
                  '</div>' +
                  (mentesek ? '<p class="mentes-sor">' + esc(sz('visszaallitas_cim')) + ': ' + mentesek + '</p>' : '') +
                '</div>' +

                '<div class="bizt-al">' +
                  '<div class="bizt-fej">' + esc(sz('b4_gs')) + '</div>' +
                  '<p class="bizt-magyar">' + esc(sz('b4_gs_magyar')) + '</p>' +
                  '<label class="beall-mezo szeles"><span class="mezo-felirat">' + esc(sz('gs_url')) + '</span>' +
                    '<input data-t="beall" data-mezo="gsUrl" value="' + esc(b.gsUrl || '') + '" placeholder="https://script.google.com/macros/s/…/exec"></label>' +
                  '<div class="nevezes-sor">' +
                    '<button class="masod-gomb kicsi" data-t="gs-most">' + esc(sz('gs_most')) + '</button>' +
                    '<button class="masod-gomb kicsi" data-t="gs-vissza">' + esc(sz('gs_vissza_gomb')) + '</button>' +
                    '<span id="gs-allapot" class="sugo">' + esc(S.gsAllapot || '') + '</span>' +
                  '</div>' +
                '</div>' +

                '<div class="bizt-al bizt-veszely">' +
                  '<div class="bizt-fej">' + esc(sz('b4_teszt')) + '</div>' +
                  '<p class="bizt-magyar">' + esc(sz('b4_teszt_magyar')) + '</p>' +
                  '<div class="teszt-doboz">' + tesztSor + '</div>' +
                  (b.kezdesKesz ? '<button class="halvany-gomb kicsi" data-t="kezdes-mutat">' + esc(sz('kezdes_vissza')) + '</button>' : '') +
                  ((varE('torles1'))
                    ? megerositesSav(sz('teszt_kerdes1'), 'torles-1-igen', 'megerosites-nem')
                    : ((varE('torles2'))
                      ? megerositesSav(sz('teszt_kerdes2'), 'torles-2-igen', 'megerosites-nem')
                      : '<p class="veszely-sor"><button class="halvany-gomb kicsi veszely" data-t="teljes-torles">' + esc(sz('teszt_gomb')) + '</button></p>')) +
                '</div>' +

              '</details>' +
            '</div>'
          : '<p class="sugo bizt-vezeto">' + esc(sz('b_csukva')) + '</p>') +
      '</div>' +

      /* ---------- Előzmények: minden lefutott / félbehagyott verseny ---------- */
      '<div class="kartya-blokk elozmenyek-kartya">' +
        '<h2><button class="kartya-fej-gomb" data-t="archiv-nyit">' +
          '<span class="kartya-nyil">' + (archivNyit ? '▾' : '▸') + '</span>' +
          esc(sz('archiv_cim')) + '</button>' + sugoIkon('archiv_sugo') + '</h2>' +
        (archivNyit
          ? '<p class="sugo">' + szh('archiv_magyar') + '</p>' +
            '<div class="nevezes-sor">' +
              '<button class="masod-gomb kicsi" data-t="archiv-frissit">' + esc(sz('nyitott_frissit')) + '</button>' +
              '<button class="masod-gomb kicsi" data-t="archiv-ment">' + esc(sz('archiv_ment_gomb')) + '</button>' +
              '<span class="sugo">' + esc(S.archivAllapot || '') + '</span>' +
            '</div>' +
            ((S.archivLista && S.archivLista.length)
              ? '<div class="felho-lista">' + S.archivLista.map(function (x) {
                  var ido = x.ts ? new Date(x.ts) : null;
                  var aktivE = (S.allapot && S.allapot.esemenyId && x.esemeny &&
                    String(S.allapot.esemenyId) === String(x.esemeny));
                  return '<div class="felho-elem' + (aktivE ? ' aktiv-elem' : '') + '">' +
                    '<div class="felho-elem-szov"><b>' + esc(x.hely || x.nev || sz('verseny_cim_hely')) +
                      (x.teszt ? ' <span class="cimke teszt-cimke">' + esc(sz('archiv_teszt')) + '</span>' : '') +
                      (x.lezarva
                        ? ' <span class="cimke">' + esc(sz('archiv_lezart')) + '</span>'
                        : ' <span class="cimke kilepett">' + esc(sz('archiv_felbe')) + '</span>') +
                      (aktivE ? ' <span class="cimke aktiv-cimke">' + esc(sz('archiv_ez_van')) + '</span>' : '') +
                    '</b>' +
                      '<span>' + esc(x.datum || '') + ' · ' + x.korDb + ' ' + esc(sz('archiv_kor')) + ' · ' + x.jatekDb + ' ' + esc(sz('archiv_jatekos')) +
                      (ido ? ' · ' + esc(ido.toLocaleString()) : '') + '</span></div>' +
                    '<button class="masod-gomb kicsi" data-t="archiv-nez" data-id="' + esc(x.id) + '">' + esc(sz('archiv_nez')) + '</button>' +
                    '<button class="fo-gomb kicsi" data-t="archiv-javit" data-id="' + esc(x.id) + '">' + esc(sz('archiv_valtas')) + '</button>' +
                  '</div>';
                }).join('') + '</div>'
              : '<p class="sugo">' + esc(sz('archiv_ures')) + '</p>')
          : '<p class="sugo">' + esc(sz('archiv_csukva')) + '</p>') +
      '</div>' +



            

      /* ---------- weblap-feltöltés állapot ---------- */
      (a.korok.length && a.beall.feltoltesTiltva
        ? '<div class="kartya-blokk"><h2>' + esc(sz('weblap_cim')) + '</h2>' +
            '<p class="figyelem">' + esc(sz('feltoltes_tiltva')) + '</p></div>'
        : '') +
      (a.korok.length && !a.beall.feltoltesTiltva
        ? '<div class="kartya-blokk"><h2>' + esc(sz('weblap_cim')) + '</h2>' +
            '<p class="sugo">' + szh('weblap_sugo') + '</p>' +
            '<textarea id="weblap-szoveg" class="weblap-szoveg" rows="6" readonly>' + esc(weblapSzoveg()) + '</textarea>' +
            '<div class="nevezes-sor">' +
              '<button class="fo-gomb" data-t="weblap-masolas">' + esc(sz('weblap_masolas')) + '</button>' +
              '<button class="masod-gomb" data-t="weblap-txt">' + esc(sz('weblap_txt')) + '</button>' +
            '</div></div>'
        : '');
  }
  /* ======================= Excel export ================================ */
  /* A verseny végi eredménytábla, pontosan olyan elrendezésben, ahogy a
     papíron/Excelben megszokták: Helyezés | Kód | Név | körönként € és pont | Σ €, Σ pont. */
  function excelSzam(x, tizedes) {
    if (x === null || x === undefined || x === '') return '';
    var v = Number(x);
    if (!isFinite(v)) return '';
    if (tizedes) {
      var t = v.toFixed(2).replace('.', ',');
      if (t.slice(-1) === '0') t = t.slice(0, -1);
      if (t.slice(-2) === ',0') t = t.slice(0, -2);
      return t;
    }
    return String(Math.round(v));
  }

  function excelExport() {
    var a = S.allapot;
    var korDb = a.korok.length;
    if (!korDb) { hiba(sz('excel_nincs_kor')); render(); return; }
    var sorokSzama = Math.min(szam(a.beall.korok, 5), Math.max(korDb, 1));

    /* körönkénti eredmény játékosonként */
    var perKor = {};
    a.korok.forEach(function (kor, ki) {
      (kor.asztalok || []).forEach(function (asz) {
        var e = asz.eredmenyek || {};
        var pontok = V.Motor.asztalPontok(asz) || {};
        (asz.szekek || []).forEach(function (id, si) {
          if (id === null || id === undefined) return;
          var adat = e[id] || {};
          perKor[id] = perKor[id] || [];
          perKor[id][ki] = {
            penz: vanErtek(adat.penz) ? szam(adat.penz) : null,
            pont: (pontok[id] === undefined || pontok[id] === null) ? null : pontok[id]
          };
        });
      });
    });

    var lista = V.Motor.rangsor(a, korDb);
    var nevO = esc(sz('excel_nev'));
    var fej1 = '<tr><th rowspan="2" class="bal">' + esc(sz('excel_hely')) + '</th>' +
      '<th rowspan="2">' + esc(sz('excel_kod')) + '</th>' +
      '<th rowspan="2" class="bal">' + nevO + '</th>';
    var fej2 = '<tr>';
    for (var k = 1; k <= sorokSzama; k++) {
      fej1 += '<th colspan="2" class="korfej">' + esc(sz('excel_kor', { kor: k })) + '</th>';
      fej2 += '<th class="penzfej">€</th><th>' + esc(sz('excel_pont')) + '</th>';
    }
    fej1 += '<th colspan="2" class="korfej ossz">Σ</th></tr>';
    fej2 += '<th class="penzfej ossz">€</th><th class="ossz">' + esc(sz('excel_pont')) + '</th></tr>';

    var torzs = lista.map(function (p, i) {
      var sor = '<tr><td class="kozep">' + (i + 1) + '</td>' +
        '<td class="kozep">' + esc(p.id) + '</td>' +
        '<td class="bal nev">' + esc(p.nev) + '</td>';
      var osszPenz = 0, osszPont = 0;
      for (var k = 0; k < sorokSzama; k++) {
        var e = (perKor[p.id] || [])[k] || {};
        sor += '<td class="penz">' + excelSzam(e.penz, true) + '</td>' +
          '<td class="kozep">' + excelSzam(e.pont, false) + '</td>';
        if (e.penz !== null && e.penz !== undefined) osszPenz += Number(e.penz);
        if (e.pont !== null && e.pont !== undefined) osszPont += Number(e.pont);
      }
      sor += '<td class="penz ossz">' + excelSzam(osszPenz, true) + '</td>' +
        '<td class="kozep ossz">' + excelSzam(osszPont, false) + '</td></tr>';
      return sor;
    }).join('');

    var cim = a.beall.nev || (a.beall.helyHu || a.beall.hely || '') || sz('verseny_cim_hely');
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8">' +
      '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>' +
      '<x:Name>' + esc(sz('excel_lap')) + '</x:Name><x:WorksheetOptions><x:DisplayGridlines/>' +
      '</x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
      '<style>' +
      'body{font-family:Calibri,Arial,sans-serif;font-size:11pt}' +
      'table{border-collapse:collapse}' +
      'th,td{border:1px solid #9aa7b4;padding:3px 6px}' +
      'th{background:#eef2f6;font-weight:700;text-align:center}' +
      '.korfej{background:#dfe8f0;font-weight:800}' +
      '.ossz{background:#f6f0dc}' +
      '.bal{text-align:left}.kozep{text-align:center;mso-number-format:"\\@"}' +
      '.penz{text-align:right;mso-number-format:"0\.00"}' +
      '.nev{font-weight:700}' +
      '.cim{font-size:14pt;font-weight:800;border:none;padding:2px 0}' +
      '.alcim{font-size:10pt;border:none;padding:0 0 8px}' +
      '</style></head><body>' +
      '<table>' +
      '<tr><td colspan="' + (3 + sorokSzama * 2 + 2) + '" class="cim">' + esc(cim) + '</td></tr>' +
      '<tr><td colspan="' + (3 + sorokSzama * 2 + 2) + '" class="alcim">' +
        esc((a.beall.helyHu || a.beall.hely || '') + (a.beall.datum ? ' · ' + a.beall.datum : '') +
          ' · ' + sz('excel_osszes', { n: lista.length })) + '</td></tr>' +
      fej1 + fej2 + torzs +
      '</table></body></html>';

    var fnNev = (a.beall.helyHu || a.beall.hely || 'verseny').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    letolt('eredmeny-' + fnNev + '-' + (a.beall.datum || '') + '.xls', html, 'application/vnd.ms-excel');
    ok(sz('excel_kesz'));
  }

  /* ============ Biztonsági mentés a régi Excelbe ====================== */
  /* A megszokott „Szerkesztes" lap szerkezete:
     B = kártyakód, C = játékoskód, D = név,
     E–N = körönként (€, pont), O = Σ€, P = Σpont. */
  /* Teljes állapot a felhőbe (Firestore) – automatikus biztonsági mentés. */
  function felhoJel(szoveg, tipus) {
    S.felhoAllapot = szoveg || '';
    S.felhoTipus = tipus || '';
    var el = global.document && global.document.getElementById
      ? global.document.getElementById('felho-allapot') : null;
    if (el) { el.textContent = S.felhoAllapot; el.className = 'felho-allapot' + (tipus ? ' ' + tipus : ''); }
  }

  function tesztBlokk(csendes) {
    if (S.allapot && S.allapot.beall && S.allapot.beall.tesztVerseny) {
      if (!csendes) { hiba(sz('teszt_nincs_tovabbitas')); render(); }
      return true;
    }
    return false;
  }

  function felhoMentes(csendes) {
    if (tesztBlokk(csendes)) return;
    var a = S.allapot;
    if (!a.esemenyId) {
      if (!csendes) { felhoJel(sz('felho_nincs_esemeny'), 'hiba'); hiba(sz('felho_nincs_esemeny')); render(); }
      return;
    }
    if (!global.BEKULDES || !global.BEKULDES.mentesMent) {
      if (!csendes) { felhoJel(sz('felho_hiba'), 'hiba'); hiba(sz('felho_hiba')); render(); }
      return;
    }
    if (!csendes) felhoJel(sz('felho_kuld'), 'folyamat');
    try { global.BEKULDES.mentesMent(a.esemenyId, { nev: a.beall.nev || '', datum: a.beall.datum || '', teljes: JSON.stringify(a) }, function (h) {
      if (h) {
        if (!csendes) { felhoJel(sz('felho_hiba'), 'hiba'); hiba(sz('felho_hiba')); render(); }
        return;
      }
      S.felhoIdo = Date.now();
      if (!csendes) { felhoJel(sz('felho_mentve', { ido: oraPerc2() }), 'ok'); ok(sz('felho_kesz')); render(); }
    }); } catch (e) { if (!csendes) { felhoJel(sz('felho_hiba'), 'hiba'); } return; }
  }

  /* A felhőben lévő versenyek listájának frissítése. */
  function felhoListaFrissit() {
    if (!global.BEKULDES || !global.BEKULDES.mentesekLista) { return; }
    S.felhoListaAllapot = sz('felho_lista_tolt');
    S.felhoLista = S.felhoLista || [];
    render();
    global.BEKULDES.mentesekLista(function (h, lista) {
      S.felhoListaAllapot = h ? sz('felho_lista_hiba') : '';
      S.felhoLista = (h || !lista) ? [] : lista;
      render();
    });
  }

  /* egy felhő-verseny megnyitása ebben a böngészőben */
  function felhoMegnyit(azonosito) {
    if (!global.BEKULDES || !global.BEKULDES.mentesOlvas) { hiba(sz('felho_hiba')); render(); return; }
    global.BEKULDES.mentesOlvas(azonosito, function (h, d) {
      if (h || !d || !d.teljes) { hiba(sz('felho_vissza_hiba')); render(); return; }
      var a2 = null;
      try { a2 = JSON.parse(d.teljes); } catch (e) { a2 = null; }
      if (!a2 || !a2.beall) { hiba(sz('felho_vissza_hiba')); render(); return; }
      S.allapot = a2;
      S.allapot.esemenyId = azonosito;
      mentes(); render();
      ok(sz('felho_megnyitva'));
    });
  }

  /* ============ Helyi archívum (localStorage) – mindig működik ============ */
  var ARCHIV_KULCS = 'mub-verseny-archiv';
  var ARCHIV_MAX = 80;

  function archivHelyiLista() {
    try {
      var t = global.localStorage && global.localStorage.getItem(ARCHIV_KULCS);
      var l = t ? JSON.parse(t) : [];
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }

  function archivHelyiIr(l) {
    try {
      if (global.localStorage) global.localStorage.setItem(ARCHIV_KULCS, JSON.stringify(l.slice(0, ARCHIV_MAX)));
    } catch (e) { }
  }

  /* elmenti a mostani állapotot helyben (mindig), és visszaadja a bejegyzést */
  function archivHelyiMent(a) {
    a = a || S.allapot;
    var bej = {
      id: 'helyi-' + Date.now(),
      esemeny: a.esemenyId || '',
      nev: a.beall.nev || a.beall.helyHu || '',
      hely: a.beall.helyHu || a.beall.hely || '',
      datum: a.beall.datum || '',
      korDb: (a.korok || []).length,
      jatekDb: (a.jatekosok || []).length,
      teszt: !!a.beall.tesztVerseny,
      lezarva: !!a.lezarva,
      ts: Date.now(),
      helyi: true,
      teljes: JSON.stringify(a)
    };
    var l = archivHelyiLista();
    l.unshift(bej);
    archivHelyiIr(l);
    return bej;
  }

  function archivHelyiOlvas(id) {
    var l = archivHelyiLista();
    for (var i = 0; i < l.length; i++) if (String(l[i].id) === String(id)) return l[i];
    return null;
  }

  /* A mostani verseny mentése az archívumba (dátummal, hellyel, teszt/éles jelzéssel). */
  function archivMent(csendes) {
    var a = S.allapot;
    if (!global.BEKULDES || !global.BEKULDES.archivMent) { if (!csendes) { hiba(sz('felho_hiba')); render(); } return; }
    var csomag = {
      esemeny: a.esemenyId || '',
      nev: a.beall.nev || a.beall.helyHu || '',
      hely: a.beall.helyHu || a.beall.hely || '',
      datum: a.beall.datum || '',
      korDb: (a.korok || []).length,
      jatekDb: (a.jatekosok || []).length,
      teszt: !!a.beall.tesztVerseny,
      lezarva: !!a.lezarva,
      teljes: JSON.stringify(a)
    };
    /* 1) helyben MINDIG elmentjük */
    archivHelyiMent(a);
    /* 2) a felhőbe is megpróbáljuk */
    global.BEKULDES.archivMent(csomag, function (h) {
      if (h) {
        S.archivAllapot = sz('archiv_helyben_mentve', { ido: oraPerc2() }) + ' · ' + (h.code || h.message || '');
        if (!csendes) { render(); ok(S.archivAllapot); }
        return;
      }
      S.archivAllapot = sz('archiv_mentve', { ido: oraPerc2() });
      if (!csendes) { ok(S.archivAllapot); render(); }
    });
  }

  /* az archívum listájának betöltése */
  function archivFrissit() {
    var helyiek = archivHelyiLista();
    S.archivAllapot = sz('felho_lista_tolt');
    S.archivLista = helyiek.slice();
    render();
    if (!global.BEKULDES || !global.BEKULDES.archivLista) {
      S.archivAllapot = sz('archiv_helyben_lista');
      render();
      return;
    }
    global.BEKULDES.archivLista(function (h, lista) {
      var felho = (h || !lista) ? [] : lista;
      /* egyesítés: a felhő elemei elöl, a helyiek utána (azonos azonosító kiszűrve) */
      var latott = {};
      var egy = [];
      felho.forEach(function (x) {
        latott[String(x.id)] = 1;
        x.helyi = false;
        egy.push(x);
      });
      helyiek.forEach(function (x) {
        if (!latott[String(x.id)]) egy.push(x);
      });
      egy.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      S.archivLista = egy;
      S.archivAllapot = h
        ? sz('archiv_helyben_lista') + ' (' + (h.code || h.message || '') + ')'
        : (egy.length ? '' : sz('archiv_ures'));
      render();
    });
  }

  /* egy archív verseny megnyitása */
  /* Váltás előtt a mostani verseny is bekerül az előzményekbe (ne vesszen el). */
  function mostaniMent(cb) {
    var a = S.allapot;
    if (!a || !a.korok || !a.korok.length) { cb(); return; }
    try { archivMentesCsendes(cb); } catch (e) { cb(); }
  }

  function archivMentesCsendes(cb) {
    var a = S.allapot;
    archivHelyiMent(a);            /* váltás előtt mindig helyben is */
    if (!global.BEKULDES || !global.BEKULDES.archivMent) { cb(); return; }
    global.BEKULDES.archivMent({
      esemeny: a.esemenyId || '',
      nev: a.beall.nev || a.beall.helyHu || '',
      hely: a.beall.helyHu || a.beall.hely || '',
      datum: a.beall.datum || '',
      korDb: (a.korok || []).length,
      jatekDb: (a.jatekosok || []).length,
      teszt: !!a.beall.tesztVerseny,
      lezarva: !!a.lezarva,
      teljes: JSON.stringify(a)
    }, function () { cb(); });
  }

  function archivMegnyit(id, javitas) {
    if (!global.BEKULDES || !global.BEKULDES.archivOlvas) { hiba(sz('felho_hiba')); render(); return; }
    mostaniMent(function () { archivBetolt(id, javitas); });
  }

  function archivBetolt(id, javitas) {
    /* helyi bejegyzés? */
    var helyiBej = archivHelyiOlvas(id);
    if (helyiBej) { archivBeallit(helyiBej, javitas); return; }
    if (!global.BEKULDES || !global.BEKULDES.archivOlvas) {
      var h2 = archivHelyiOlvas(id);
      if (h2) { archivBeallit(h2, javitas); return; }
      hiba(sz('archiv_hiba')); render(); return;
    }
    global.BEKULDES.archivOlvas(id, function (h, d) {
      if (h || !d || !d.teljes) { hiba(sz('archiv_hiba')); render(); return; }
      archivBeallit(d, javitas);
    });
  }

  /* Egy archív bejegyzés betöltése az állapotba. */
  function archivBeallit(d, javitas) {
    var a2 = null;
    try { a2 = JSON.parse(d.teljes); } catch (e) { a2 = null; }
    if (!a2 || !a2.beall) { hiba(sz('archiv_hiba')); render(); return; }
    S.allapot = a2;
    if (javitas) S.allapot.lezarva = false;      /* javításhoz újranyitjuk */
    if (!S.allapot.esemenyId && d.esemeny) S.allapot.esemenyId = d.esemeny;
    mentes();
    S.nezet = javitas ? 'beiras' : 'rangsor';
    render();
    ok(javitas ? sz('archiv_javitas_kesz') : sz('archiv_megnyitva'));
  }

  function felhoVissza() {
    var a = S.allapot;
    if (!a.esemenyId) { hiba(sz('felho_nincs_esemeny')); render(); return; }
    if (!global.BEKULDES || !global.BEKULDES.mentesOlvas) { hiba(sz('felho_hiba')); render(); return; }
    global.BEKULDES.mentesOlvas(a.esemenyId, function (h, d) {
      if (h || !d || !d.teljes) { hiba(sz('felho_vissza_hiba')); render(); return; }
      var a2 = null;
      try { a2 = JSON.parse(d.teljes); } catch (e) { a2 = null; }
      if (!a2 || !a2.beall) { hiba(sz('felho_vissza_hiba')); render(); return; }
      S.allapot = a2;
      mentes(); render();
      ok(sz('felho_vissza_kesz'));
    });
  }

  /* Élő állás feltöltése a weblapra (a verseny napján mutatja). */
  function eloFeltolt() {
    if (tesztBlokk(false)) return;
    var a = S.allapot;
    if (!a.korok.length) { hiba(sz('elo_nincs_kor')); render(); return; }
    if (!a.esemenyId) { hiba(sz('elo_nincs_esemeny')); render(); return; }
    var lista = V.Motor.rangsor(a, a.aktualisKor || a.korok.length);
    var sorok = lista.map(function (p, i) {
      return { h: i + 1, nev: p.nev, pont: p.pont, penz: Math.round(p.penz * 100) / 100, kod: String(p.id) };
    });
    var csomag = {
      nev: a.beall.nev || a.beall.helyHu || '',
      hely: a.beall.helyHu || '',
      datum: a.beall.datum || '',
      kor: a.korok.length,
      dijazott: szam(a.beall.dijazott, 0),
      sorok: sorok
    };
    if (!global.BEKULDES || !global.BEKULDES.eloMent) { hiba(sz('elo_hiba')); render(); return; }
    ok(sz('elo_kuld'));
    global.BEKULDES.eloMent(a.esemenyId, csomag, function (h) {
      if (h) { hiba(sz('elo_hiba')); render(); return; }
      V.Tarolo.ment(a);
      render();
      ok(sz('elo_kesz'));
    });
  }

  /* Élő állás feltöltése üzenet nélkül (kör végén, magától). */
  function eloFeltoltCsendes() {
    if (S.allapot && S.allapot.beall && S.allapot.beall.tesztVerseny) return;
    var a = S.allapot;
    if (!a.esemenyId || !a.korok.length) return;
    if (!global.BEKULDES || !global.BEKULDES.eloMent) return;
    var lista = V.Motor.rangsor(a, a.aktualisKor || a.korok.length);
    var sorok = lista.map(function (p, i) {
      return { h: i + 1, nev: p.nev, pont: p.pont, penz: Math.round(p.penz * 100) / 100, kod: String(p.id) };
    });
    global.BEKULDES.eloMent(a.esemenyId, {
      nev: a.beall.nev || a.beall.helyHu || '',
      hely: a.beall.helyHu || '',
      datum: a.beall.datum || '',
      kor: a.korok.length,
      dijazott: szam(a.beall.dijazott, 0),
      sorok: sorok
    }, function () { });
  }

  function excelSorok() {
    var a = S.allapot;
    var korDb = a.korok.length;
    var perKor = {};
    a.korok.forEach(function (kor, ki) {
      (kor.asztalok || []).forEach(function (asz) {
        var e = asz.eredmenyek || {};
        var pontok = V.Motor.asztalPontok(asz) || {};
        (asz.szekek || []).forEach(function (id, si) {
          if (id === null || id === undefined) return;
          var adat = e[id] || {};
          perKor[id] = perKor[id] || [];
          perKor[id][ki] = {
            penz: vanErtek(adat.penz) ? szam(adat.penz) : null,
            pont: (pontok[id] === undefined || pontok[id] === null) ? null : pontok[id]
          };
        });
      });
    });
    var ki = [];
    aktivJatekosok().forEach(function (j) {
      var sor = [];
      sor.push(j.kartyakod || '');                 /* B: kártya kódja */
      sor.push(j.vendeg ? '' : String(j.id));      /* C: játékos kódja */
      sor.push(j.nev || '');                       /* D: név */
      var osszP = 0, osszE = 0;
      for (var k = 0; k < 5; k++) {
        var e2 = (perKor[j.id] || [])[k] || {};
        sor.push(e2.penz === null || e2.penz === undefined ? '' : e2.penz);
        sor.push(e2.pont === null || e2.pont === undefined ? '' : e2.pont);
        if (e2.penz) osszE += Number(e2.penz);
        if (e2.pont) osszP += Number(e2.pont);
      }
      sor.push(Math.round(osszE * 100) / 100);     /* O: Σ€ */
      sor.push(osszP);                             /* P: Σpont */
      ki.push(sor);
    });
    return ki;
  }

  /* A „Szerkesztes" lap HTML-je (Excel ezt gond nélkül megnyitja .xlsx-ként). */
  function excelBiztonsagiHtml() {
    var a = S.allapot;
    var sorok = excelSorok();
    var fej1 = '<tr><td></td>' +
      '<td><b>Kártya</b></td><td><b>Játékos</b></td><td><b>Név / Meno</b></td>' +
      [1, 2, 3, 4, 5].map(function (k) { return '<td colspan="2"><b>' + k + '. kör/kolo</b></td>'; }).join('') +
      '<td colspan="2"><b>Σ</b></td></tr>';
    var fej2 = '<tr><td></td><td><b>Kódja</b></td><td><b>Kódja</b></td><td></td>' +
      [1, 2, 3, 4, 5].map(function () { return '<td><b>€</b></td><td><b>pont/body</b></td>'; }).join('') +
      '<td><b>€</b></td><td><b>pont/body</b></td></tr>';
    var torzs = sorok.map(function (sor) {
      return '<tr>' + '<td>' + ''.replace('', '') + '</td>' +
        sor.map(function (v, i) {
          if (i === 2) return '<td>' + esc(v) + '</td>';
          if (i === 3) return '<td>' + esc(v) + '</td>';
          return '<td>' + esc(v === '' || v === null || v === undefined ? '' : v) + '</td>';
        }).join('') + '</tr>';
    }).join('');
    return '<html xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">' +
      '<style>table{border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt}' +
      'td{border:1px solid #b8c4d0;padding:2px 5px}td:first-child{border:none;width:18px}</style>' +
      '</head><body><table>' + fej1 + fej2 + torzs + '</table></body></html>';
  }

  /* Letöltés + vágólapra másolás (TSV), hogy a régi Excelbe lehessen illeszteni. */
  function excelBiztonsagiMentes() {
    var a = S.allapot;
    if (!(a.jatekosok || []).length) { hiba(sz('excel_nincs_jatekos')); render(); return; }
    var fNev = (a.beall.helyHu || a.beall.hely || 'verseny').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    letolt('mentes-' + fNev + '-' + (a.beall.datum || '') + '.xls', excelBiztonsagiHtml(), 'application/vnd.ms-excel');
    ok(sz('excel_mentes_kesz'));
  }

  function excelVagolap() {
    var sorok = excelSorok();
    if (!sorok.length) { hiba(sz('excel_nincs_jatekos')); render(); return; }
    var tsv = sorok.map(function (sor) {
      return sor.map(function (v) {
        var t = (v === null || v === undefined) ? '' : String(v);
        return t.indexOf('	') >= 0 ? t.replace(/	/g, ' ') : t;
      }).join('	');
    }).join('\n');
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(tsv).then(function () {
        ok(sz('excel_vagolap_kesz'));
      }, function () {
        hiba(sz('excel_vagolap_hiba'));
        render();
      });
    } else {
      hiba(sz('excel_vagolap_hiba'));
      render();
    }
  }

  /* ============ Google Sheets folyamatos mentés ======================= */
  /* A beállításban megadott Apps Script-webalkalmazás címére POST-olunk
     minden változás után (3 mp késleltetéssel, hogy ne terhelje a hálózatot). */
  var gsIdozito = null;
  function gsMent() {
    var a = S.allapot;
    if (!a || !a.beall) return;
    var url = String(a.beall.gsUrl || '').trim();
    if (!url) return;
    if (gsIdozito) global.clearTimeout(gsIdozito);
    gsIdozito = global.setTimeout(function () {
      gsKuld(url);
    }, 3000);
  }
  function gsKuld(url) {
    if (S.allapot && S.allapot.beall && S.allapot.beall.tesztVerseny) { S.gsAllapot = sz('teszt_nincs_tovabbitas'); gsJel(); return; }
    try {
      if (!global.fetch) { S.gsAllapot = sz('gs_nincs_fetch'); return; }
      var a = S.allapot;
      var csomag = {
        nev: a.beall.nev || a.beall.helyHu || '',
        hely: a.beall.helyHu || '',
        datum: a.beall.datum || '',
        kor: a.korok.length,
        dijazott: szam(a.beall.dijazott, 0),
        sorok: excelSorok(),
        /* a TELJES állapot, hogy másik gépen vissza lehessen tölteni */
        teljes: JSON.stringify(a)
      };
      global.fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(csomag)
      }).then(function () {
        S.gsAllapot = sz('gs_mentve', { ido: oraPerc2() });
        gsJel();
      }, function () {
        S.gsAllapot = sz('gs_hiba');
        gsJel();
      });
      S.gsAllapot = sz('gs_kuld');
      gsJel();
      /* ellenőrzés: visszaolvassuk a mentett állapotot (a no-cors miatt a POST válaszát nem látjuk) */
      global.setTimeout(function () {
        try {
          global.fetch(url, { method: 'GET' }).then(function (r) { return r.text(); })
            .then(function (t2) { S.gsAllapot = (t2 && t2.length > 20) ? sz('gs_mentve', { ido: oraPerc2() }) : sz('gs_hiba'); gsJel(); })
            .catch(function () { S.gsAllapot = sz('gs_hiba'); gsJel(); });
        } catch (e) { S.gsAllapot = sz('gs_hiba'); gsJel(); }
      }, 1500);
    } catch (e) {
      S.gsAllapot = sz('gs_hiba');
    }
  }
  /* Visszatöltés a Google-táblázatból (ha a gép megadta magát). */
  function gsVissza(url) {
    return new Promise(function (resolve) {
      try {
        if (!global.fetch) { hiba(sz('gs_nincs_fetch')); render(); return resolve(false); }
        global.fetch(url, { method: 'GET' }).then(function (r) {
          return r.text();
        }).then(function (t) {
          var a2 = null;
          try { a2 = JSON.parse(t); } catch (e) { a2 = null; }
          if (!a2 || !a2.beall) { hiba(sz('gs_vissza_hiba')); render(); return resolve(false); }
          S.allapot = a2;
          mentes();
          render();
          ok(sz('gs_vissza_kesz'));
          resolve(true);
        }).catch(function () {
          hiba(sz('gs_vissza_hiba'));
          render();
          resolve(false);
        });
      } catch (e) {
        hiba(sz('gs_vissza_hiba'));
        render();
        resolve(false);
      }
    });
  }

  function oraPerc2() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
  }
  function gsJel() {
    var el = global.document && global.document.getElementById
      ? global.document.getElementById('gs-allapot') : null;
    if (el) el.textContent = S.gsAllapot || '';
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

  /* Teszt verseny: szolid piros jelző minden nézeten. */
  function tesztJelzo() {
    if (!S.allapot || !S.allapot.beall || !S.allapot.beall.tesztVerseny) return '';
    return '<div class="teszt-jelzo">' + esc(sz('teszt_verseny_jelzo')) + '</div>';
  }

  function render() {
    var c = document.getElementById('nezet');
    if (!c || !S.allapot) return;
    rajzolasFut = true;
    var kivetes2 = !!KIVETITETT[S.nezet];
    N.mod = S.allapot.beall.nyelv || 'mind';
    var fej = (S.nezet === 'vetites' || S.nezet === 'bekuld' || S.nezet === 'ora') ? '' : fejlec();
    var lepes = (S.nezet === 'vetites' || S.nezet === 'bekuld' || S.nezet === 'ora') ? '' : lepesSav();
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
    c.innerHTML = tesztJelzo() + fej + lepes + torzs +
      (S.uzenet ? '<div class="uzenet ' + S.uzenetTipus + '">' + esc(S.uzenet) + '</div>' : '');

    var nyomtatTerulet = document.getElementById('nyomtat-terulet');
    if (nyomtatTerulet) nyomtatTerulet.innerHTML = (S.nezet === 'nyomtat' && nyomtatKor()) ? cedulaHtml(nyomtatKor()) : '';

    /* Eredménybeírásnál a kurzor rögtön az első összeg mezőben legyen,
       hogy lehessen azonnal írni (asztalváltás után is). */
    if (S.nezet === 'beiras' && document.querySelector) {
      var fok = document.activeElement;
      var marPenz = fok && fok.classList && fok.classList.contains('penz-input');
      if (!marPenz) {
        var elsoPenz = document.querySelector('.penz-input');
        if (elsoPenz && elsoPenz.focus) { try { elsoPenz.focus(); } catch (e) { } }
      }
    }

    rajzolasFut = false;
    /* apró verzió-lábjegyzet minden nézeten */
    var lab = document.getElementById('app-verzio');
    if (lab) lab.textContent = 'v' + V.VERZIO + ' · ' + sz('verzio_szo');
    if (S.nezet === 'vetites' && S.vetites === 'asztalok') vetitesIlleszt();
    /* a rangsor automatikus görgetése a kivetítőn is induljon el */
    if (S.nezet === 'rangsor' || (S.nezet === 'vetites' && S.vetites === 'rangsor')) {
      try { gorgetoIndit(); } catch (e) { }
    }
    if (S.nezet === 'vetites' && S.vetites === 'nevlista' && S.ujJatekos) {
      var mostSor = document.querySelector ? document.querySelector('.most-sor') : null;
      if (mostSor && mostSor.scrollIntoView) {
        try { mostSor.scrollIntoView({ block: 'center' }); } catch (e) { }
      }
    }
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
    /* Külön ablakban (kivetítőn) nincs hova visszalépni: bezárjuk az ablakot,
       hogy a Vissza gomb mindig csináljon valamit. */
    if (!elozo && global.opener && global.close) {
      try { global.close(); return; } catch (e) { }
    }
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
    if (t === 'ora-mod') {
      var modUj = cel.getAttribute('data-mod') || 'kor';
      S.allapot.ora = S.allapot.ora || {};
      S.allapot.ora.mod = modUj;
      S.allapot.ora.perc = (modUj === 'szunet') ? (S.allapot.beall.szunetPerc || 15) : (S.allapot.beall.oraPerc || 50);
      S.allapot.ora.fut = false;
      S.allapot.ora.vege = null;
      S.allapot.ora.maradek = null;
      mentes(); render();
      return;
    }
    if (t === 'ora-indit') {
      oraCsipogott = false;
      var pBe = document.getElementById('ora-perc');
      var szunetE = !!(S.allapot.ora && S.allapot.ora.mod === 'szunet');
      var voltOraPerc = S.allapot.beall.oraPerc;
      var inditPerc = pBe ? pBe.value : (szunetE ? (S.allapot.beall.szunetPerc || 15) : (S.allapot.beall.oraPerc || 50));
      M.oraPerc(S.allapot, inditPerc);
      if (szunetE) {
        /* a szünet hossza ne írja felül a kör hosszát */
        S.allapot.beall.oraPerc = voltOraPerc;
        S.allapot.beall.szunetPerc = szam(inditPerc, 15);
      }
      M.oraIndit(S.allapot);
      mentes(); render();
      ok(sz('ora_elindult', { perc: S.allapot.ora.perc }));
      return;
    }
    if (t === 'ora-szin') { S.allapot.beall.oraVilagos = !S.allapot.beall.oraVilagos; mentes(); render(); return; }
    if (t === 'lezar') { S.megerosites = { t: 'lezar1' }; render(); return; }
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
    if (t === 'nyelv-nyit') { S.nyelvNyitva = !S.nyelvNyitva; render(); return; }
    if (t === 'nyelv') {
      var mezo = cel.getAttribute('data-mezo') || 'nyelv';
      S.allapot.beall[mezo] = cel.getAttribute('data-mod');
      S.nyelvNyitva = false;
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
    if (t === 'lezar-ker') { S.megerosites = { t: 'lezar1' }; render(); return; }
    if (t === 'lezar-igen') {
      S.megerosites = null;
      var dijBe = document.getElementById('dijazott-be');
      S.allapot.beall.dijazott = Math.max(0, Math.min(500, szam(dijBe ? dijBe.value : 0, 0)));
      S.allapot.lezarva = true;
      mentes();
      try { archivMent(true); } catch (e) { }
      render();
      ok(sz('lezar_kesz'));
      return;
    }
    if (t === 'ujranyit') {
      S.allapot.lezarva = false;
      mentes(); render();
      ok(sz('ujranyitva'));
      return;
    }
    if (t === 'ujraoszt') { ujraoszt(); return; }
    if (t === 'kor-lezar') {
      /* A kör lezárása: beosztjuk a következő kört, és rögtön a kivetítésre váltunk,
         hogy a játékosok lássák, ki hol ül. */
      var elotteKor = S.allapot.korok.length;
      kovetkezoKor();
      if (S.allapot.korok.length > elotteKor) {
        /* biztonsági mentés MAGÁTÓL: Google Sheets + helyi pillanatkép */
        try { V.Tarolo.biztonsagiMentes(S.allapot); } catch (e) { }
        try { if (S.allapot.beall.gsUrl) gsKuld(S.allapot.beall.gsUrl); } catch (e) { }
        try { felhoMentes(true); } catch (e) { }
        try { if (S.allapot.esemenyId) setTimeout(function () { eloFeltoltCsendes(); }, 600); } catch (e) { }
        S.nezet = 'vetites';
        S.vetites = 'asztalok';
        S.asztal = 1;
        render();
        ok(sz('kor_lezarva', { kor: S.allapot.korok.length }));
      }
      return;
    }
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
    /* ---- teszt: pillanatkép, sorsolás, majd egy kattintással vissza ---- */
    if (t === 'teszt-indit') {
      if (!(S.allapot.jatekosok || []).length) { hiba(sz('teszt_nincs_jatekos')); render(); return; }
      M.tesztMent(JSON.parse(JSON.stringify(S.allapot)));
      sorsolElso();
      ok(sz('teszt_indit_kesz'));
      return;
    }
    if (t === 'teszt-vissza') {
      var mt = M.tesztBetolt();
      if (!mt) { hiba(sz('teszt_nincs_mentes')); render(); return; }
      S.allapot = mt;
      mentes();
      M.tesztTorol();
      S.nezet = 'beallitas';
      S.elozeNezetek = [];
      render();
      ok(sz('teszt_vissza_kesz'));
      return;
    }
    if (t === 'elo-feltolt') { eloFeltolt(); return; }
    if (t === 'bizt-nyit') { S.biztNyitva = (S.biztNyitva !== true); render(); return; }
    if (t === 'archiv-nyit') { S.archivNyitva = (S.archivNyitva === false); render(); return; }
    if (t === 'ujverseny-ker') {
      if (global.confirm && !global.confirm(sz('uj_verseny_kerdes2'))) return;
      /* új verseny: a beállítások megmaradnak, a helyszín/dátum/játékosok törlődnek */
      S.allapot.korok = [];
      S.allapot.aktualisKor = 0;
      S.allapot.lezarva = false;
      S.allapot.beall.nev = ''; S.allapot.beall.datum = '';
      S.allapot.beall.hely = ''; S.allapot.beall.helyHu = ''; S.allapot.beall.helySk = '';
      S.allapot.jatekosok = [];
      S.allapot.esemenyId = M.esemenyId ? M.esemenyId() : '';
      mentes();
      S.nezet = 'nevezes';
      render();
      ok(sz('uj_verseny_kesz'));
      return;
    }
    if (t === 'archiv-frissit') { archivFrissit(); return; }
    if (t === 'archiv-ment') { archivMent(false); return; }
    if (t === 'archiv-nez') { archivMegnyit(cel.getAttribute('data-id'), false); return; }
    if (t === 'archiv-javit') {
      if (!global.confirm || global.confirm(sz('archiv_javit_kerdes'))) archivMegnyit(cel.getAttribute('data-id'), true);
      return;
    }
    if (t === 'felho-lista') { felhoListaFrissit(); return; }
    if (t === 'felho-megnyit') {
      var megId = cel.getAttribute('data-id');
      if (megId && (!global.confirm || global.confirm(sz('nyitott_kerdes')))) felhoMegnyit(megId);
      return;
    }
    if (t === 'felho-ment') { felhoMentes(false); return; }
    if (t === 'felho-vissza') {
      if (!global.confirm || global.confirm(sz('felho_kerdes'))) felhoVissza();
      return;
    }
    if (t === 'excel') { excelExport(); render(); return; }
    if (t === 'excel-bizt') { excelBiztonsagiMentes(); return; }
    if (t === 'excel-vagolap') { excelVagolap(); return; }
    if (t === 'gs-vissza') {
      var urlV = String(S.allapot.beall.gsUrl || '').trim();
      if (!urlV) { hiba(sz('gs_nincs_url')); render(); return; }
      if (!global.confirm || global.confirm(sz('gs_vissza_kerdes'))) gsVissza(urlV);
      return;
    }
    if (t === 'gs-most') {
      var gsUrl2 = String(S.allapot.beall.gsUrl || '').trim();
      if (!gsUrl2) { hiba(sz('gs_nincs_url')); render(); return; }
      gsKuld(gsUrl2);
      render();
      return;
    }
    if (t === 'teljes-torles') { S.megerosites = { t: 'torles1' }; render(); return; }
    if (t === 'torles-1-igen') { S.megerosites = { t: 'torles2' }; render(); return; }
    if (t === 'torles-2-igen') {
      S.megerosites = null;
      /* Mindent elölről: a verseny törlése, a biztonsági mentések MEGMARADNAK. */
      /* a visszatérő beállítások (körszám, asztal, mód, pénz) maradjanak meg */
      var meg = S.allapot.beall;
      var mentett = {
        korok: meg.korok, asztalLetszam: meg.asztalLetszam, jatekmod: meg.jatekmod,
        helycsereKorok: meg.helycsereKorok, kiemeltVedelem: meg.kiemeltVedelem,
        jatekokKoronkent: meg.jatekokKoronkent, penzJatekonkent: meg.penzJatekonkent,
        papirDB: meg.papirDB, oraPerc: meg.oraPerc, szunetPerc: meg.szunetPerc,
        tiebreak: meg.tiebreak, nyelv: meg.nyelv, nyelvKivetites: meg.nyelvKivetites,
        gsUrl: meg.gsUrl, tesztVerseny: meg.tesztVerseny
      };
      S.allapot = V.ujAllapot();
      Object.keys(mentett).forEach(function (k) {
        if (mentett[k] !== undefined && mentett[k] !== null && mentett[k] !== '') S.allapot.beall[k] = mentett[k];
      });
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
      torzsFelhoMent();
      S.torzsValtozott = (S.torzsValtozott || []).concat([ujKod]);
      mentes(); render();
      ok(sz('torzs_hozzaadva', { nev: ujNev, kod: ujKod }));
      return;
    }
    if (t === 'torzs-kiemelt') {
      var ckId = parseInt(cel.getAttribute('data-id'), 10);
      S.kiemeltLista = S.kiemeltLista || [];
      var cix = S.kiemeltLista.indexOf(ckId);
      if (cix >= 0) S.kiemeltLista.splice(cix, 1);
      else S.kiemeltLista.push(ckId);
      V.Motor.kiemeltekMent(S.kiemeltLista);      /* tartós: localStorage */
      var cj = jatekos(ckId);
      if (cj) cj.kiemelt = S.kiemeltLista.indexOf(ckId) >= 0;
      mentes(); render();
      ok(cix >= 0 ? sz('torzs_csillag_le') : sz('torzs_csillag_fel', { n: S.kiemeltLista.length }));
      return;
    }
    if (t === 'torzs-torol') {
      var ttId = parseInt(cel.getAttribute('data-id'), 10);
      S.allapot.torzslista = torzsLista().filter(function (s2) { return Number(s2[0]) !== ttId; });
      torzsFelhoMent();
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
      S.allapot.beall[mez] = (cel.type === 'checkbox') ? !!cel.checked : cel.value;
      if (mez === 'helyHu' || mez === 'helySk') {
        helyJavaslat(cel.value);
        S.allapot.beall.nev = M.helySzoveg(S.allapot, 'hu');
      }
      mentes();
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
      torzsFelhoMent();
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
      /* Ha üres a mező, de a program felkínált egy összeget, az Enter azt elfogadja. */
      var javE = e.target.getAttribute && e.target.getAttribute('data-javaslat');
      if (javE && !String(e.target.value || '').trim()) {
        e.target.value = javE;
        var korE = aktualisKor();
        if (korE) {
          var aszE = korE.asztalok[S.asztal - 1];
          var idE = parseInt(e.target.getAttribute('data-id'), 10);
          if (aszE) {
            if (!aszE.eredmenyek[idE]) aszE.eredmenyek[idE] = {};
            aszE.eredmenyek[idE].penz = e.target.value;
            mentes(); beirasFrissit();
          }
        }
      }
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
    /* a törzslista a felhőből is (ha van internet) */
    try { torzsFelhoBetolt(); } catch (e) { }
    /* Külön ablak (kivetítő): a vezérlők lebegő sávban vannak, ami egérre vagy
       érintésre előjön, majd pár másodperc után eltűnik – így a kivetítés tiszta
       marad, de a vissza gomb és az óra vezérlői bármikor kézre esnek. */
    if (global.opener && document.body) {
      var test = document.body;
      if (String(test.className || '').indexOf('popup-mod') < 0) {
        test.className = (test.className ? test.className + ' ' : '') + 'popup-mod';
      }
      var rejtoIdo = null;
      var mutat = function () {
        test.className = String(test.className || '').split('vezerlok-latni').join('') + ' vezerlok-latni';
        if (rejtoIdo) global.clearTimeout(rejtoIdo);
        rejtoIdo = global.setTimeout(function () {
          test.className = String(test.className || '').split('vezerlok-latni').join('');
        }, 3500);
      };
      if (document.addEventListener) {
        document.addEventListener('mousemove', mutat);
        document.addEventListener('mousedown', mutat);
        document.addEventListener('touchstart', mutat);
        mutat();
      }
    }
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
    /* a lenyíló szekciók állapotának megjegyzése (ne csukódjanak be újrarajzoláskor) */
    document.addEventListener('toggle', function (e) {
      var el = e.target;
      if (!el || !el.getAttribute) return;
      var k = el.getAttribute('data-dk');
      if (!k) return;
      S.nyitottDetails = S.nyitottDetails || {};
      S.nyitottDetails[k] = !!el.open;
    }, true);
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
  V.VERZIO = '1.52';
  V._excelSorok = function () { return excelSorok(); };
  V._excelBiztHtml = function () { return excelBiztonsagiHtml(); };
  V._gsKuld = function (url) { return gsKuld(url); };
  V._vetitesMod = function (m) { S.vetites = m; };
  V._excelExport = function () { return excelExport(); };
  V._javaslatJel = function (asztal) { return javaslatJel(asztal); };
  V._jatekosFelvesz = function (id, nev, k) { return jatekosFelvesz(id, nev, k); };
  V._nyitottBeallit = function (k, v) { S.nyitottDetails = S.nyitottDetails || {}; S.nyitottDetails[k] = !!v; };
  V._felhoListaBeallit = function (l) { S.felhoLista = l || []; };
  V._biztNyit = function (v) { S.biztNyitva = !!v; };
  V._torzsEgyesit = function (a, b) { return torzsEgyesit(a, b); };
  V._archivListaBeallit = function (l) { S.archivLista = l || []; };
  V._archivHelyiMent = function () { return archivHelyiMent(); };
  V._archivHelyiLista = function () { return archivHelyiLista(); };
  V._archivHelyiBetolt = function (id, j) { return archivBeallit(archivHelyiOlvas(id), j); };
  V._archivHelyiTisztit = function () { try { global.localStorage.removeItem('mub-verseny-archiv'); } catch (e) { } };
  V._asztaBeallit = function (n) { S.asztal = n; };
  V._kovetkezoAsztal = function () { return kovetkezoHianyzoAsztal(); };
  V._kovetkezoKor = function () { return kovetkezoKor(); };
  V._korUresE = function (k) { return korUresE(k); };
  V._korElvalasztoVan = function () {
    var a3 = S.allapot;
    var ig3 = a3.aktualisKor || a3.korok.length;
    if (ig3 < 2) return false;
    var ment = S.nezet; S.nezet = 'rangsor';
    render();
    var van = document.getElementById('app') && document.getElementById('app').innerHTML.indexOf('pont-utolso') >= 0;
    S.nezet = ment; render();
    return !!van;
  };
  V._ujraoszt = function () { return ujraoszt(); };
  V._enterPenz = function (cel) {
    gombok({ key: 'Enter', preventDefault: function () { }, target: {
      classList: { contains: function (c) { return c === 'penz-input'; } },
      getAttribute: function (n) { return cel[n] === undefined ? null : String(cel[n]); },
      value: cel.value, id: '', focus: function () { }, select: function () { } } });
  };
  V._penzJavaslat = function (asztal) { return penzJavaslat(asztal); };

  V._ujJatekosBeall = function (id) { S.ujJatekos = id; };
  V._vetitesIlleszt = function () { return vetitesIlleszt(); };
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
