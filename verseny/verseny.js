/* ============================================================================
   Máriás versenykezelő – motor és felület
   ----------------------------------------------------------------------------
   Egy fájlban, keretrendszer nélkül. Fut böngészőben (file:// is) és Node-ban
   (a motor teszteléséhez). Minden adat a böngésző tárolójában marad, internet
   nélkül is teljes értékűen működik.

   A verseny menete:
     nevezés  ->  1. kör sorsolása (kiemelt-védelemmel)  ->  eredménybeírás
     asztal szerint  ->  élő rangsor  ->  következő kör sorsolása a rangsor
     szerint  ->  ...  ->  zárás, eredmény átadása a weblapnak.

   A pontozás:
     - egy körben egy asztalnál a pénz összege  = játékok száma × játékosok
     - a kör pontjai: aki nyert 5, aki második 3, aki harmadik 1
     - a pénz dönti el, ki hanyadik; holtversenynél a helyek pontjainak átlaga:
         első kettő holtversenye  -> 4 / 4 / 1
         második-harmadiké        -> 5 / 2 / 2
       (négyes asztalnál 5 / 3 / 3 / 1, holtversenynél ugyanígy átlagolva)
     - ezért asztalonként: Σ€ = 5 × helyek, Σpont = 3 × helyek
   ========================================================================== */
(function (global) {
  'use strict';

  /* ======================= 1. Alapértelmezések ========================== */

  var ALAP = {
    nev: '', datum: '', hely: '',
    korok: 5,                 // hány körös a verseny
    asztalLetszam: 3,         // hányan ülnek egy asztalnál (alapesetben)
    jatekokKoronkent: 5,      // egy körben hány játékot játszanak
    penzJatekonkent: 1,       // egy játékban egy játékos befizetése
    sorsolasSeed: 1,          // ebből számol a sorsolás (visszakereshető!)
    tiebreak: 'pont,penz,otos,legjobbKor,kod',
    pontAuto: true,           // a pontot a pénz sorrendjéből számolja
    kiemeltVedelem: true,     // az 1. körben a kiemeltek külön asztalra kerülnek
    nyelv: 'mind',            // a kezelő felület nyelve (hu | sk | mind)
    nyelvKivetites: 'mind',   // a kivetített/nyomtatott felületek nyelve
    negyFosHely: 'vegen',     // a 4 fős asztal(ok) helye: vegen | elol | szetszorva
    webcim: '',               // a weblapon futó program címe (a beküldő QR-hoz)
    oraPerc: 50,              // a visszaszámláló hossza percben
    oraVilagos: false,        // az óra világos (inverz) színnel
    papirDB: 8,               // hány eredménycédula fér egy A4-es lapra
    jatekmod: 'svajci',       // svajci | helycsere
    helycsereKorok: 2,        // hány körön át ülnek át a helycserélő rendszer szerint
    helyHu: '',               // a helyszín magyarul (ez egyben a verseny neve is)
    helySk: '',               // a helyszín szlovákul
    kezdesKesz: false,        // az első indítási adatlap kitöltve
    weblapJelentkezok: null,  // a weblapról átvett jelentkezők [{nev, kod}]
    weblapVerseny: '',        // a weblapi verseny azonosítója
    lezarva: false,           // a verseny le van zárva
    gorget: false,            // automatikus görgetés a rangsor kivetítésénél
    gorgetIrany: 1,           // 1 = lefelé, -1 = felfelé
    beszed: ''                // szabad jegyzet
  };

  /* Az érvényes döntetlen-szempontok. A megjelenő nevük a nyelvi szótárban van
     (tb_pont, tb_penz, …), mert magyarul és szlovákul is meg kell jelennie. */
  var TIEBREAK_KULCSOK = {
    pont: 1, penz: 1, otos: 1, kozep: 1, utolso: 1, legjobbKor: 1, kod: 1
  };
  var TIEBREAK_NEVEK = TIEBREAK_KULCSOK;

  function alapsablon() {
    var b = {};
    for (var k in ALAP) b[k] = ALAP[k];
    return b;
  }

  /* ======================= 2. Segédfüggvények =========================== */

  function szam(v, alap) {
    if (v === '' || v === null || v === undefined) return alap === undefined ? 0 : alap;
    var n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : (alap === undefined ? 0 : alap);
  }
  function kerekit(n, t) { var m = Math.pow(10, t === undefined ? 2 : t); return Math.round(n * m) / m; }
  function penz(n) { return (Math.round((n || 0) * 100) / 100).toFixed(2); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function vanErtek(v) { return v !== '' && v !== null && v !== undefined; }

  /* determinisztikus véletlen – ugyanaz a seed mindig ugyanazt adja */
  function prng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function kever(lista, rnd) {
    for (var i = lista.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = lista[i]; lista[i] = lista[j]; lista[j] = t;
    }
    return lista;
  }

  /* ======================= 3. Motor ==================================== */

  var Motor = {

    /* Asztalok létszámai.
       79 játékos, 3 fős asztal -> 26 asztal: 25 db hármas + 1 db négyes.
       80 játékos -> 26 asztal: 24 db hármas + 2 db négyes.
       A maradék (letszam mod alapl) db asztal kap egy plusz játékost; ezek a
       "hol" szerint a végén, az elején vagy szétszórva vannak. */
    asztalLetszamok: function (letszam, alapl, hol) {
      if (!letszam) return [];
      var T = Math.floor(letszam / alapl);
      var r = letszam - T * alapl;
      if (T === 0) return [letszam];
      if (r > T) { T = T + 1; r = letszam - T * alapl; }   // pl. 5 fő: 2 asztal (3 + 2)
      var caps = [];
      for (var i = 0; i < T; i++) caps.push(alapl);
      if (r < 0) {
        /* kevesebb játékos, mint hely: az utolsó asztalokról elveszünk */
        for (var d = 0; d < -r; d++) caps[T - 1 - d] = Math.max(2, caps[T - 1 - d] - 1);
      } else if (r > 0) {
        var helyek = [];
        if (hol === 'elol') {
          for (var a = 0; a < r; a++) helyek.push(a);
        } else if (hol === 'szetszorva') {
          for (var b = 0; b < r; b++) helyek.push(Math.min(T - 1, Math.floor(b * T / r + (T / r - 1) / 2)));
        } else {
          for (var c = 0; c < r; c++) helyek.push(T - r + c);
        }
        helyek.forEach(function (idx) { caps[idx] = alapl + 1; });
      }
      return caps;
    },

    /* Egy helyezés pontja: első 5, utolsó 1, a középsők 3. */
    helyPont: function (hely, letszam) {
      if (letszam <= 1) return 5;
      if (letszam === 2) return hely === 0 ? 5 : 1;
      if (hely === 0) return 5;
      if (hely === letszam - 1) return 1;
      return 3;
    },

    /* Pontok a pénzösszegekből, holtversenynél átlagolva. */
    pontok: function (penzek) {
      var n = penzek.length;
      var idx = [];
      for (var i = 0; i < n; i++) idx.push({ i: i, p: szam(penzek[i]) });
      idx.sort(function (a, b) { return (b.p - a.p) || (a.i - b.i); });
      var ki = new Array(n);
      var i2 = 0;
      while (i2 < n) {
        var j = i2;
        while (j + 1 < n && idx[j + 1].p === idx[i2].p) j++;
        var ossz = 0;
        for (var k = i2; k <= j; k++) ossz += Motor.helyPont(k, n);
        var atlag = kerekit(ossz / (j - i2 + 1), 2);
        for (var k2 = i2; k2 <= j; k2++) ki[idx[k2].i] = atlag;
        i2 = j + 1;
      }
      return ki;
    },

    /* Egy asztal elvárt összegei. */
    vartPenz: function (helyek, beall) { return szam(beall.jatekokKoronkent, 5) * szam(beall.penzJatekonkent, 1) * helyek; },
    vartPont: function (helyek) { return helyek <= 1 ? 5 : 3 * helyek; },

    /* 1. kör sorsolása. vedelem = false -> tiszta véletlen (a régi sorsolás),
       vedelem = true  -> a kiemeltek külön asztalra kerülnek. */
    sorsolElso: function (jatekosok, caps, seed, vedelem) {
      var rnd = prng(seed);
      var T = caps.length;
      var kiemeltek = [], tobbiek = [];
      jatekosok.forEach(function (j) { ((vedelem !== false && j.kiemelt) ? kiemeltek : tobbiek).push(j.id); });
      kever(tobbiek, rnd);
      kever(kiemeltek, rnd);

      var szekek = caps.map(function (c) { var a = []; for (var i = 0; i < c; i++) a.push(null); return a; });
      var tablaSorrend = [];
      for (var t = 0; t < T; t++) tablaSorrend.push(t);
      kever(tablaSorrend, rnd);

      var elhelyezettKiemelt = 0;
      kiemeltek.forEach(function (id, i) {
        if (i < T) { szekek[tablaSorrend[i]][0] = id; elhelyezettKiemelt++; }
        else { tobbiek.push(id); }          // több kiemelt, mint asztal
      });

      var ptr = 0;
      for (var t2 = 0; t2 < T; t2++) {
        for (var s = 0; s < szekek[t2].length; s++) {
          if (szekek[t2][s] === null) szekek[t2][s] = (ptr < tobbiek.length) ? tobbiek[ptr++] : null;
        }
      }
      return {
        szekek: szekek,
        kiemeltekSzama: kiemeltek.length,
        vedelem: vedelem !== false,
        figyelmeztetes: (vedelem === false)
          ? 'Teljesen véletlen sorsolás (kiemelt-védelem nélkül).'
          : (kiemeltek.length > T
            ? ('Több kiemelt van (' + kiemeltek.length + '), mint asztal (' + T + ') – ' + (kiemeltek.length - T) + ' kiemelt a többiekkel kerül egy asztalra.')
            : (elhelyezettKiemelt > 0 ? (elhelyezettKiemelt + ' kiemelt játékos külön asztalra került.') : 'Nincs kiemelt játékos, mindenki véletlenszerűen került asztalhoz.'))
      };
    },

    /* Következő kör: a rangsor sorrendjében, 3-asával az asztalokhoz. */
    sorsolKovetkezo: function (sorrendIdk, caps) {
      var szekek = caps.map(function (c) { var a = []; for (var i = 0; i < c; i++) a.push(null); return a; });
      var p = 0;
      for (var t = 0; t < szekek.length; t++) {
        for (var s = 0; s < szekek[t].length; s++) {
          szekek[t][s] = (p < sorrendIdk.length) ? sorrendIdk[p++] : null;
        }
      }
      return { szekek: szekek, figyelmeztetes: '' };
    },

    /* Egy asztal pontjai: a kézzel felülírt pont, különben a pénzből számolt. */
    /* ---- helycserélő („győztes fel, vesztes le") következő kör ----
       Az előző kör asztalai alapján:
         - az asztal legjobbja (1. hely) EGY asztallal feljebb ül, a 3. helyre;
         - a legrosszabb (3. hely, négyes asztalnál a 4.) EGY asztallal lejjebb, az 1. helyre;
         - a középsők (2. hely) a helyükön maradnak;
         - az első asztal legjobbja és az utolsó asztal legrosszabbja nem mozdul.
       A helyezés az asztalon belül a pénz szerint dől el (holtversenynél a pont). */
    asztalSorrend: function (asztal) {
      var e = asztal.eredmenyek || {};
      var pontok = Motor.asztalPontok(asztal);
      return (asztal.szekek || []).filter(function (id) { return id !== null && id !== undefined; })
        .slice()
        .sort(function (x, y) {
          var px = e[x] && vanErtek(e[x].penz) ? szam(e[x].penz) : null;
          var py = e[y] && vanErtek(e[y].penz) ? szam(e[y].penz) : null;
          if (px === null && py !== null) return 1;         /* akihez nincs beírva, a végére */
          if (py === null && px !== null) return -1;
          if (px !== null && py !== null && py !== px) return py - px;
          return (pontok[y] || 0) - (pontok[x] || 0);
        });
    },
    helycsereKovetkezo: function (elozoKor, aktivIdk, alapLetszam) {
      var aktiv = null;
      if (aktivIdk) { aktiv = {}; aktivIdk.forEach(function (id) { aktiv[String(id)] = true; }); }
      var asztalok = (elozoKor && elozoKor.asztalok) || [];
      /* Az átrendezés az EREDETI asztal-összeállításból indul (a kilépőkkel együtt),
         különben a „legrosszabb" helyére a második kerülne. */
      var sorok = asztalok.map(function (a) { return Motor.asztalSorrend(a); })
        .filter(function (sor) { return sor.length > 0; });
      var T = sorok.length;
      var uj = sorok.map(function (sor, i) {
        var felso = (i > 0) ? sorok[i - 1] : null;
        var also = (i < T - 1) ? sorok[i + 1] : null;
        var szekek = [];
        szekek[0] = (i === 0) ? (sor[0] || null) : (felso[felso.length - 1] || null);
        szekek[1] = sor[1] || null;
        szekek[2] = (i === T - 1) ? (sor[sor.length - 1] || null) : (also[0] || null);
        for (var p = 3; p < sor.length; p++) szekek[p] = sor[p] || null;
        return szekek;
      });
      /* Aki kilépett, azt kivesszük, és a megüresedett helyeket feltöltjük. */
      if (aktiv) {
        uj = uj.map(function (t) {
          return t.map(function (id) {
            return (id !== null && id !== undefined && !aktiv[String(id)]) ? null : id;
          });
        });
        uj = Motor.asztalokKiegyenlit(uj, szam(alapLetszam, 3));
      }
      return { szekek: uj, figyelmeztetes: '' };
    },

    /* A meglévő játékosokat a szabályos asztalméretekbe rendezi (a lyukak eltűnnek). */
    asztalokKiegyenlit: function (szekek, alapLetszam) {
      var lapos = [];
      szekek.forEach(function (t) {
        t.forEach(function (id) { if (id !== null && id !== undefined) lapos.push(id); });
      });
      if (!lapos.length) return [];
      var caps = Motor.asztalLetszamok(lapos.length, szam(alapLetszam, 3), 'vegen');
      var ki = [], p = 0;
      caps.forEach(function (c) {
        var sor = [];
        for (var i = 0; i < c; i++) sor.push(p < lapos.length ? lapos[p++] : null);
        ki.push(sor);
      });
      return ki;
    },

    asztalPontok: function (asztal) {
      var e = asztal.eredmenyek || {};
      var ids = (asztal.szekek || []).filter(function (id) { return id !== null && id !== undefined; });
      var penzek = ids.map(function (id) { return e[id] && vanErtek(e[id].penz) ? szam(e[id].penz) : 0; });
      var auto = Motor.pontok(penzek);
      var ki = {};
      ids.forEach(function (id, i) {
        var kezi = e[id] && vanErtek(e[id].pont);
        ki[id] = kezi ? szam(e[id].pont) : auto[i];
      });
      return ki;
    },

    /* Egy asztal állapota és ellenőrzése. */
    asztalEllenorzes: function (asztal, beall) {
      var e = asztal.eredmenyek || {};
      var ids = (asztal.szekek || []).filter(function (id) { return id !== null && id !== undefined; });
      var kitoltve = ids.filter(function (id) { return e[id] && vanErtek(e[id].penz); });
      var penzOssz = 0, i;
      for (i = 0; i < ids.length; i++) if (e[ids[i]] && vanErtek(e[ids[i]].penz)) penzOssz += szam(e[ids[i]].penz);
      var pontok = Motor.asztalPontok(asztal);
      var pontOssz = 0;
      for (i = 0; i < ids.length; i++) pontOssz += szam(pontok[ids[i]]);
      var vp = Motor.vartPenz(ids.length, beall), vt = Motor.vartPont(ids.length);
      return {
        letszam: ids.length,
        kitoltve: kitoltve.length,
        kesz: ids.length === 0 || kitoltve.length === ids.length,
        penzOssz: kerekit(penzOssz), pontOssz: kerekit(pontOssz),
        vartPenz: kerekit(vp), vartPont: vt,
        penzOk: Math.abs(penzOssz - vp) < 0.005,
        pontOk: Math.abs(pontOssz - vt) < 0.005,
        pontok: pontok
      };
    },

    /* Egy kör összes asztala kész-e. */
    korKesz: function (allapot, korIndex) {
      var kor = allapot.korok[korIndex];
      if (!kor || !kor.asztalok || !kor.asztalok.length) return false;
      return kor.asztalok.every(function (a) {
        return Motor.asztalEllenorzes(a, allapot.beall).kesz;
      });
    },

    /* Ki játszik az adott körben: aki addig nem lépett ki. */
    aktivJatekosok: function (allapot, kor) {
      var ig = kor || 0;
      return (allapot.jatekosok || []).filter(function (j) {
        return !j.kilepettKor || j.kilepettKor > ig;
      });
    },
    kilepettE: function (j, kor) { return !!j && !!j.kilepettKor && j.kilepettKor <= (kor || 0); },

    /* Valaki hazamegy: a megadott körtől nem ül asztalhoz. A korábbi körei
       megmaradnak, a megadott és a későbbi körökből kikerül a helye. */
    kilepes: function (allapot, id, kortol) {
      var j = null;
      (allapot.jatekosok || []).forEach(function (x) { if (x.id === id) j = x; });
      if (!j) return null;
      j.kilepettKor = kortol;
      var kivett = 0;
      (allapot.korok || []).forEach(function (kor) {
        if (kor.kor < kortol) return;
        (kor.asztalok || []).forEach(function (a) {
          if ((a.szekek || []).indexOf(id) >= 0) {
            a.szekek = a.szekek.filter(function (x) { return x !== id; });
            if (a.eredmenyek && a.eredmenyek[id] !== undefined) delete a.eredmenyek[id];
            kivett++;
          }
        });
      });
      return { jatekos: j, kor: kortol, kivett: kivett };
    },

    /* Visszatér: a következő sorsolásnál már asztalhoz kerül. */
    visszater: function (allapot, id) {
      var j = null;
      (allapot.jatekosok || []).forEach(function (x) { if (x.id === id) j = x; });
      if (!j) return null;
      j.kilepettKor = null;
      return j;
    },

    /* Melyik körtől nem játszik: ha az aktuális körben már van eredménye,
       akkor csak a következőtől. */
    kilepesKortol: function (allapot, id) {
      var korok = allapot.korok || [];
      if (!korok.length) return 1;
      var kor = korok[(allapot.aktualisKor || korok.length) - 1] || korok[korok.length - 1];
      if (!kor) return 1;
      var marJatszott = false;
      (kor.asztalok || []).forEach(function (a) {
        var e = (a.eredmenyek || {})[id];
        if (e && ((e.penz !== undefined && e.penz !== null && e.penz !== '') ||
                  (e.pont !== undefined && e.pont !== null && e.pont !== ''))) marJatszott = true;
      });
      return marJatszott ? kor.kor + 1 : kor.kor;
    },

    /* Új, véletlen sorsolási azonosító (seed). Ebből számol a program, ezért
       ugyanaz a szám mindig ugyanazt a sorsolást adja – de nem kell vele
       foglalkozni: a program magától ad újat. */
    ujSeed: function () {
      return Math.floor(Math.random() * 900000) + 100000;
    },

    /* ---- visszaszámláló óra ---- */
    oraPerc: function (allapot, perc) {
      if (!allapot.ora) allapot.ora = { perc: 50, fut: false, vege: null, maradek: null };
      var t = String(perc === undefined || perc === null ? '' : perc).trim();
      if (!t) {                                   /* üresen hagyva: marad a mostani */
        var m = allapot.ora.perc || allapot.beall.oraPerc || 50;
        allapot.beall.oraPerc = m;
        return m;
      }
      var n = Number(t.replace(',', '.'));
      if (!isFinite(n)) n = 50;
      var p = Math.max(1, Math.min(300, Math.round(n)));
      allapot.ora.perc = p;
      allapot.beall.oraPerc = p;
      return p;
    },
    oraIndit: function (allapot, most) {
      if (!allapot.ora) allapot.ora = { perc: 50, fut: false, vege: null, maradek: null };
      var p = allapot.ora.perc || allapot.beall.oraPerc || 50;
      allapot.ora.perc = p;
      allapot.ora.vege = (most || Date.now()) + p * 60000;
      allapot.ora.fut = true;
      allapot.ora.maradek = null;
      return allapot.ora.vege;
    },
    oraSzunet: function (allapot, most) {
      var o = allapot.ora;
      if (!o || !o.fut) return null;
      o.maradek = Math.max(0, o.vege - (most || Date.now()));
      o.fut = false;
      o.vege = null;
      return o.maradek;
    },
    oraFolytat: function (allapot, most) {
      var o = allapot.ora;
      if (!o || o.fut) return null;
      var m = (o.maradek === null || o.maradek === undefined) ? (o.perc || 50) * 60000 : o.maradek;
      o.vege = (most || Date.now()) + m;
      o.fut = true;
      o.maradek = null;
      return o.vege;
    },
    oraNullaz: function (allapot) {
      var o = allapot.ora || {};
      o.fut = false; o.vege = null; o.maradek = null;
      allapot.ora = o;
      return o;
    },
    oraMaradek: function (allapot, most) {
      var o = allapot.ora;
      if (!o) return 0;
      if (o.fut && o.vege) return Math.max(0, o.vege - (most || Date.now()));
      if (o.maradek !== null && o.maradek !== undefined) return Math.max(0, o.maradek);
      return (o.perc || 50) * 60000;
    },
    oraSzoveg: function (ms) {
      var t = Math.max(0, Math.round(ms / 1000));
      var p = Math.floor(t / 60), mp = t % 60;
      return (p < 10 ? '0' : '') + p + ':' + (mp < 10 ? '0' : '') + mp;
    },
    oraVegIdo: function (allapot) {
      var o = allapot.ora;
      if (!o) return null;
      if (o.fut && o.vege) return new Date(o.vege);
      if (o.maradek) return new Date(Date.now() + o.maradek);
      return null;
    },
    oraIdoSzoveg: function (d) {
      if (!d) return '';
      return d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    },

    /* A helyszín (egyben a verseny neve) a mindenkori nyelven. */
    helySzoveg: function (allapot, mod) {
      var b = (allapot && allapot.beall) || {};
      var hu = b.helyHu || b.hely || '';
      var sk = b.helySk || '';
      if (mod === 'sk') return sk || hu;
      if (mod === 'hu') return hu || sk;
      if (hu && sk && hu !== sk) return hu + ' / ' + sk;
      return hu || sk;
    },

    /* A szokásos helyszínek (a weblapról és a régi eredményekből) – két nyelven. */
    HELYEK: [
      ['Nagykapos', 'Veľké Kapušany'],
      ['Királyhelmec', 'Kráľovský Chlmec'],
      ['Bodrogszerdahely', 'Streda nad Bodrogom'],
      ['Ruszka', 'Ruská'],
      ['Kisgéres', 'Malý Horeš'],
      ['Nagyszelmenc', 'Veľké Slemence'],
      ['Szelmenc', 'Slemence'],
      ['Csicser', 'Čičarovce'],
      ['Zétény', 'Zatín'],
      ['Parchovany', 'Parchovany'],
      ['Kelecseny', ''],
      ['Véke', ''],
      ['Dobóruszka', ''],
      ['Szőlőske', ''],
      ['Kaposkelecsény', '']
    ],

    /* Név-egyeztető kulcs: ékezet és kis/nagybetű nem számít. */
    nevKulcs: function (s) {
      var t = String(s === null || s === undefined ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
      try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { }
      return t;
    },
    /* A weblapi jelentkezők közül ki az, aki a versenyben még nincs benne. */
    hianyzoJelentkezok: function (jelentkezok, jatekosok) {
      var megvan = {};
      (jatekosok || []).forEach(function (j) {
        megvan[Motor.nevKulcs(j.nev)] = true;
        megvan['k:' + String(j.id)] = true;
        if (j.kartyakod) megvan['c:' + String(j.kartyakod)] = true;
      });
      return (jelentkezok || []).filter(function (r) {
        if (megvan['k:' + String(r.kod)]) return false;
        if (r.kod && megvan['c:' + String(r.kod)]) return false;
        return !megvan[Motor.nevKulcs(r.nev)];
      });
    },

    /* Név alapján megkeresi a törzslistában azt a játékost, akire a beírt név
       illik: először a pontos egyezést (fordított sorrendben is), aztán a
       részlegeset. Így a névből felismert játékos nem lesz vendég. */
    nevEgyezes: function (lista, nev) {
      function nrm(s) {
        var t = String(s === null || s === undefined ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
        try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { }
        return t;
      }
      var q = nrm(nev);
      if (q.length < 3) return [];
      var qFord = q.split(' ').reverse().join(' ');
      var pontos = [], resz = [];
      (lista || []).forEach(function (sor) {
        if (!sor || !sor[2]) return;
        var n = nrm(sor[2]);
        var o = { id: sor[0], kartyakod: String(sor[1] || ''), nev: sor[2] };
        if (n === q || n === qFord) { o.pontos = true; pontos.push(o); }
        else if (n.indexOf(q) >= 0 || q.indexOf(n) >= 0) { resz.push(o); }
      });
      return pontos.length ? pontos : resz;
    },

    /* Név szerinti keresés a törzslistában (ha a kód nem található). */
    nevKeres: function (lista, szoveg, max) {
      function egyszerus(s) {
        var t = String(s === null || s === undefined ? '' : s).toLowerCase();
        try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { }
        return t;
      }
      var t = String(szoveg === null || szoveg === undefined ? '' : szoveg).trim();
      if (t.length < 2) return [];
      var q = egyszerus(t);
      var ki = [];
      (lista || []).forEach(function (sor) {
        if (!sor || !sor[2]) return;
        var nev = egyszerus(sor[2]);
        var kod = String(sor[0]);
        var kartya = String(sor[1] || '');
        var rangsor = -1;
        if (kod === t) rangsor = 0;                                  /* pontos kód */
        else if (nev.indexOf(q) === 0) rangsor = 1;                  /* név eleje */
        else if (nev.indexOf(q) > 0) rangsor = 2;                    /* név közepe */
        else if (t.length >= 5 && kartya.indexOf(t) >= 0) rangsor = 3; /* kártyaszám részlete */
        if (rangsor >= 0) ki.push({ id: sor[0], kartyakod: kartya, nev: sor[2], r: rangsor });
      });
      ki.sort(function (a, b) { return a.r - b.r; });
      return ki.slice(0, max || 8);
    },

    /* Van-e már eredmény abban a körben? */
    korEredmenyVan: function (allapot, korSzam) {
      var kor = (allapot.korok || [])[korSzam - 1];
      if (!kor) return false;
      return (kor.asztalok || []).some(function (a) {
        var e = a.eredmenyek || {};
        return Object.keys(e).some(function (id) {
          return e[id] && ((e[id].penz !== undefined && e[id].penz !== null && e[id].penz !== '') ||
                           (e[id].pont !== undefined && e[id].pont !== null && e[id].pont !== ''));
        });
      });
    },

    /* Melyik asztalhoz üljön a későn érkező: ahol a legkevesebben vannak
       (hogy háromfős asztal négyfős legyen). */
    ajanlottAsztal: function (allapot, korSzam) {
      var kor = (allapot.korok || [])[korSzam - 1];
      if (!kor || !(kor.asztalok || []).length) return 1;
      var legjobb = null;
      (kor.asztalok || []).forEach(function (a) {
        var n = (a.szekek || []).filter(function (x) { return x !== null && x !== undefined; }).length;
        if (legjobb === null || n < legjobb.n) legjobb = { asztal: a.asztal, n: n };
      });
      return legjobb ? legjobb.asztal : 1;
    },

    /* Későn érkező beültetése egy asztalhoz (négyfős lesz). */
    ulesBe: function (allapot, korSzam, asztalSzam, id) {
      var kor = (allapot.korok || [])[korSzam - 1];
      if (!kor) return { ok: false, hiba: 'nincs kor' };
      var asztal = null;
      (kor.asztalok || []).forEach(function (a) { if (a.asztal === asztalSzam) asztal = a; });
      if (!asztal) return { ok: false, hiba: 'nincs asztal' };
      /* ha máshol ül, onnan kivesszük */
      (kor.asztalok || []).forEach(function (a) {
        a.szekek = (a.szekek || []).filter(function (x) { return x !== id; });
        if (a.eredmenyek && a.eredmenyek[id] !== undefined && a.asztal !== asztalSzam) delete a.eredmenyek[id];
      });
      if (asztal.szekek.indexOf(id) < 0) asztal.szekek.push(id);
      return { ok: true, asztal: asztal.asztal, letszam: asztal.szekek.length };
    },

    /* A mostani kör újrasorsolása (ha még nincs eredmény) – így a későn érkező
       is rendes helyet kap, nem kell a meglévő asztalokat bontani. */
    ujrasorsolKor: function (allapot, korSzam, seed) {
      var kor = (allapot.korok || [])[korSzam - 1];
      if (!kor) return null;
      var aktiv = Motor.aktivJatekosok(allapot, korSzam);
      var alapl = allapot.beall.asztalLetszam || 3;
      var caps = Motor.asztalLetszamok(aktiv.length, alapl, allapot.beall.negyFosHely);
      var e;
      if (korSzam === 1) {
        e = Motor.sorsolElso(aktiv, caps, seed || allapot.beall.sorsolasSeed || 1, allapot.beall.kiemeltVedelem);
      } else {
        var aktivIdk = {};
        aktiv.forEach(function (j) { aktivIdk[j.id] = true; });
        var sorrend = Motor.rangsor(allapot, korSzam - 1)
          .filter(function (s) { return aktivIdk[s.id]; })
          .map(function (s) { return s.id; });
        e = Motor.sorsolKovetkezo(sorrend, caps);
      }
      kor.asztalok = e.szekek.map(function (sz, i) {
        return { asztal: i + 1, szekek: sz, eredmenyek: {} };
      });
      kor.figyelmeztetes = e.figyelmeztetes || '';
      return { ok: true, asztalok: kor.asztalok.length, figyelmeztetes: kor.figyelmeztetes };
    },

    /* Egy beérkezett (mobil) beküldés átvétele az eredmények közé.
       Csak akkor fogadja el, ha ugyanazok a játékosok ülnek ott. */
    bekuldAlkalmaz: function (allapot, b) {
      if (!b) return { ok: false, hiba: 'ures' };
      var kor = (allapot.korok || [])[(b.kor || 0) - 1];
      if (!kor) return { ok: false, hiba: 'nincs ilyen kor' };
      var asztal = null;
      (kor.asztalok || []).forEach(function (a) { if (a.asztal === b.asztal) asztal = a; });
      if (!asztal) return { ok: false, hiba: 'nincs ilyen asztal' };
      var szekek = (asztal.szekek || []).filter(function (x) { return x !== null && x !== undefined; });
      var kodok = b.kodok || [];
      if (szekek.length !== kodok.length) return { ok: false, hiba: 'mas jatekosok' };
      for (var i = 0; i < szekek.length; i++) if (Number(szekek[i]) !== Number(kodok[i])) return { ok: false, hiba: 'mas jatekosok' };
      if (!b.penzek || b.penzek.length !== szekek.length) return { ok: false, hiba: 'hianyos penz' };
      szekek.forEach(function (id, i2) {
        if (!asztal.eredmenyek[id]) asztal.eredmenyek[id] = {};
        asztal.eredmenyek[id].penz = b.penzek[i2];
      });
      return { ok: true, asztal: asztal.asztal, kor: kor.kor };
    },

    /* Ki hol ül – minden körre. */
    jatekosAsztala: function (allapot, id) {
      var ki = [];
      (allapot.korok || []).forEach(function (kor, i) {
        var hol = null;
        (kor.asztalok || []).forEach(function (a) {
          if ((a.szekek || []).indexOf(id) >= 0) hol = a.asztal;
        });
        ki.push(hol);
      });
      return ki;
    },

    /* Statisztika minden játékosról a megadott körig (1-alapú darabszám). */
    statisztika: function (allapot, igKor) {
      var sorok = {};
      (allapot.jatekosok || []).forEach(function (j) {
        sorok[j.id] = {
          id: j.id, nev: j.nev, kiemelt: !!j.kiemelt, vendeg: !!j.vendeg,
          pont: 0, penz: 0, otos: 0, kozep: 0, utolso: 0, legjobbKor: 0,
          helyek: {}, korok: [], asztalok: []
        };
      });
      var korok = allapot.korok || [];
      var ig = Math.min(igKor === undefined ? korok.length : igKor, korok.length);
      for (var k = 0; k < ig; k++) {
        var kor = korok[k];
        (kor.asztalok || []).forEach(function (a) {
          var ids = (a.szekek || []).filter(function (id) { return id !== null && id !== undefined && sorok[id]; });
          if (!ids.length) return;
          /* félkész asztal eredménye még nem számít – így az élő rangsor nem ugrál */
          if (!Motor.asztalEllenorzes(a, allapot.beall).kesz) return;
          var pontok = Motor.asztalPontok(a);
          var e = a.eredmenyek || {};
          ids.forEach(function (id) {
            var s = sorok[id];
            var p = szam(pontok[id]);
            var penzErtek = e[id] && vanErtek(e[id].penz) ? szam(e[id].penz) : 0;
            s.pont += p;
            s.penz += penzErtek;
            s.korok.push({ kor: kor.kor, asztal: a.asztal, pont: p, penz: penzErtek });
            s.asztalok.push(a.asztal);
            if (p === 5) s.otos++;              // megnyerte a körét az asztalán
            else if (p === 1) s.utolso++;
            else s.kozep++;
            s.helyek[p] = (s.helyek[p] || 0) + 1;
            if (penzErtek > s.legjobbKor) s.legjobbKor = penzErtek;
          });
        });
      }
      var lista = [];
      for (var id2 in sorok) if (sorok.hasOwnProperty(id2)) {
        var s2 = sorok[id2];
        s2.pont = kerekit(s2.pont); s2.penz = kerekit(s2.penz); s2.legjobbKor = kerekit(s2.legjobbKor);
        lista.push(s2);
      }
      return lista;
    },

    /* Rangsor a döntetlen-lánc szerint. */
    rangsor: function (allapot, igKor) {
      var lista = Motor.statisztika(allapot, igKor);
      var kulcsok = String(allapot.beall.tiebreak || 'pont,penz').split(',')
        .map(function (s) { return s.trim(); }).filter(function (s) { return s && TIEBREAK_NEVEK[s]; });
      function ertek(s, kulcs) {
        switch (kulcs) {
          case 'pont': return s.pont;
          case 'penz': return s.penz;
          case 'otos': return s.otos;
          case 'kozep': return s.kozep;
          case 'utolso': return -s.utolso;
          case 'legjobbKor': return s.legjobbKor;
          case 'kod': return -s.id;
        }
        return 0;
      }
      lista.sort(function (a, b) {
        for (var i = 0; i < kulcsok.length; i++) {
          var d = ertek(b, kulcsok[i]) - ertek(a, kulcsok[i]);
          if (d) return d;
        }
        return a.id - b.id;
      });
      lista.forEach(function (s, i) { s.hely = i + 1; });
      return lista;
    },

    /* Melyik döntetlen-szempont döntött – kiíráshoz. */
    dontetlenOk: function (allapot, a, b) {
      var kulcsok = String(allapot.beall.tiebreak || 'pont,penz').split(',')
        .map(function (s) { return s.trim(); }).filter(Boolean);
      var elotte = null;
      for (var i = 0; i < kulcsok.length; i++) {
        var k = kulcsok[i];
        var ea, eb;
        switch (k) {
          case 'pont': ea = a.pont; eb = b.pont; break;
          case 'penz': ea = a.penz; eb = b.penz; break;
          case 'otos': ea = a.otos; eb = b.otos; break;
          case 'kozep': ea = a.kozep; eb = b.kozep; break;
          case 'utolso': ea = -a.utolso; eb = -b.utolso; break;
          case 'legjobbKor': ea = a.legjobbKor; eb = b.legjobbKor; break;
          case 'kod': ea = -a.id; eb = -b.id; break;
          default: ea = 0; eb = 0;
        }
        if (ea !== eb) return k;
        elotte = k;
      }
      return null;
    },

    /* Új vendég kód: 900 fölött, hogy az 1..150-es kártyakódok szabadok maradjanak. */
    ujVendegKod: function (jatekosok) {
      var max = 900;
      (jatekosok || []).forEach(function (j) { if (j.id > max) max = j.id; });
      return max + 1;
    },

    /* Keresés kód vagy kártyakód szerint. */
    keres: function (jatekosok, beirt) {
      var t = String(beirt || '').trim();
      if (!t) return null;
      var n = parseInt(t, 10);
      var talalt = null;
      (jatekosok || []).forEach(function (j) {
        if (talalt) return;
        if (String(j.id) === t || (j.kartyakod && String(j.kartyakod) === t)) talalt = j;
      });
      if (talalt) return talalt;
      if (isFinite(n)) {
        (jatekosok || []).forEach(function (j) {
          if (talalt) return;
          if (String(j.id) === String(n)) talalt = j;
        });
      }
      return talalt;
    }
  };

  /* ======================= 4. Tároló ==================================== */

  var WEBLAP_KULCS = 'mub-verseny-import';   /* ide írja a weblap az indítandó versenyt */
  var KULCS = 'mub-verseny';
  var MENTES_KULCS = 'mub-verseny-mentes-';
  var MENTESEK_MAX = 8;

  var Tarolo = {
    betolt: function () {
      try {
        var t = global.localStorage.getItem(KULCS);
        if (!t) return null;
        var a = JSON.parse(t);
        if (!a || !a.beall) return null;
        return a;
      } catch (e) { return null; }
    },
    ment: function (allapot) {
      try {
        global.localStorage.setItem(KULCS, JSON.stringify(allapot));
        return true;
      } catch (e) { return false; }
    },
    biztonsagiMentes: function (allapot) {
      try {
        var kulcsok = [];
        for (var i = 0; i < global.localStorage.length; i++) {
          var k = global.localStorage.key(i);
          if (k && k.indexOf(MENTES_KULCS) === 0) kulcsok.push(k);
        }
        kulcsok.sort();
        while (kulcsok.length >= MENTESEK_MAX) {
          global.localStorage.removeItem(kulcsok.shift());
        }
        var nev = MENTES_KULCS + new Date().toISOString().replace(/[:.]/g, '-');
        global.localStorage.setItem(nev, JSON.stringify(allapot));
      } catch (e) { /* tele a tároló – nem baj */ }
    },
    mentesek: function () {
      var ki = [];
      try {
        for (var i = 0; i < global.localStorage.length; i++) {
          var k = global.localStorage.key(i);
          if (k && k.indexOf(MENTES_KULCS) === 0) ki.push(k);
        }
      } catch (e) { }
      return ki.sort().reverse();
    },
    visszaallit: function (kulcs) {
      try { return JSON.parse(global.localStorage.getItem(kulcs)); } catch (e) { return null; }
    }
  };

  /* ======================= 5. Új verseny ================================ */

  /* rövid, jól olvasható azonosító a versenyhez (a beküldő linkekben) */
  function veletlenId() {
    var abc = 'abcdefghjkmnpqrstuvwxyz23456789', s = '';
    for (var i = 0; i < 8; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
    return s;
  }

  function ujAllapot() {
    return {
      v: 2,
      esemenyId: veletlenId(),
      beall: alapsablon(),
      jatekosok: [],
      korok: [],
      aktualisKor: 0,
      ora: { perc: 50, fut: false, vege: null, maradek: null },
      letrehozva: new Date().toISOString()
    };
  }

  function korLetrehoz(allapot, szekek, figyelmeztetes) {
    var asztalok = szekek.map(function (sz, i) {
      return { asztal: i + 1, szekek: sz, eredmenyek: {}, figyelmeztetes: null };
    });
    return {
      kor: allapot.korok.length + 1,
      asztalok: asztalok,
      sorsolva: new Date().toISOString(),
      figyelmeztetes: figyelmeztetes || ''
    };
  }

  function törzsBetölt(allapot, torzs) {
    var megvan = {};
    (allapot.jatekosok || []).forEach(function (j) { megvan[j.id] = true; });
    var uj = 0;
    (torzs || []).forEach(function (sor) {
      if (megvan[sor[0]] || !sor[2]) return;
      allapot.jatekosok.push({ id: sor[0], nev: sor[2], kartyakod: String(sor[1] || ''), kiemelt: false, vendeg: false });
      uj++;
    });
    return uj;
  }

  /* ======================= 6. Export ==================================== */

  var API = {
    Motor: Motor,
    Tarolo: Tarolo,
    ALAP: ALAP,
    WEBLAP_KULCS: WEBLAP_KULCS,
    TIEBREAK_KULCSOK: TIEBREAK_KULCSOK,
    TIEBREAK_NEVEK: TIEBREAK_NEVEK,
    alapsablon: alapsablon,
    ujAllapot: ujAllapot,
    korLetrehoz: korLetrehoz,
    törzsBetölt: törzsBetölt
  };
  global.VERSENY = global.VERSENY || {};
  for (var kulcs in API) if (API.hasOwnProperty(kulcs)) global.VERSENY[kulcs] = API[kulcs];
  if (typeof module !== 'undefined' && module.exports) module.exports = global.VERSENY;

})(typeof window !== 'undefined' ? window : globalThis);
