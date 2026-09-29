/* ============================================================================
   Máriás versenykezelő – QR-kód előállítás (külső könyvtár nélkül)

   A beküldő linket tesszük a cédulára QR-kódban. Csak bájt-módot használunk,
   és a maszkot rögzítjük (0), mert így egyszerűbb és pontosan ellenőrizhető;
   a szabvány szerint bármelyik maszk érvényes szimbólumot ad.

   Ellenőrzés: a _qr_teszt.mjs összeveti a Python „qrcode" könyvtár kimenetével.
   ========================================================================== */
(function (global) {
  'use strict';

  /* --- a szabvány táblázatai, 1–10 verzió, L és M hibajavítási szint --- */
  /* teljes kódszavak száma verziónként */
  var TELJES = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
  /* [EC kódszavak blokkonként, blokkok, adat kódszavak blokkonként] + 2. csoport */
  var BLOKK = {
    L: [
      [7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0],
      [26, 1, 108, 0, 0], [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0],
      [30, 2, 116, 0, 0], [18, 2, 68, 2, 69]
    ],
    M: [
      [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0],
      [24, 2, 43, 0, 0], [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39],
      [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]
    ]
  };
  /* igazítási minták helyei verziónként (2–10) */
  var IGAZITAS = {
    2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  /* --- GF(256) a Reed–Solomonhoz --- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function gfSzor(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }
  function rsGeneral(deg) {
    var g = [1];
    for (var i = 0; i < deg; i++) {
      var kov = new Array(g.length + 1);
      for (var j = 0; j < kov.length; j++) kov[j] = 0;
      for (var j2 = 0; j2 < g.length; j2++) {
        kov[j2] ^= gfSzor(g[j2], EXP[i]);   /* az α^i-s tényező */
        kov[j2 + 1] ^= g[j2];               /* az x-szel szorzás */
      }
      g = kov;
    }
    return g;
  }
  function rsKod(data, ecHossz) {
    /* az osztáshoz a generátor „magas fokú tag elöl" alakja kell */
    var g = rsGeneral(ecHossz).slice().reverse();
    var maradek = data.slice();
    for (var i = 0; i < ecHossz; i++) maradek.push(0);
    for (var i2 = 0; i2 < data.length; i2++) {
      var egyutthato = maradek[i2];
      if (egyutthato === 0) continue;
      for (var j = 0; j < g.length; j++) maradek[i2 + j] ^= gfSzor(g[j], egyutthato);
    }
    return maradek.slice(data.length, data.length + ecHossz);
  }

  /* --- bájtok UTF-8-ra --- */
  function utf8(szoveg) {
    var ki = [];
    for (var i = 0; i < szoveg.length; i++) {
      var c = szoveg.charCodeAt(i);
      if (c < 0x80) ki.push(c);
      else if (c < 0x800) { ki.push(0xC0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < szoveg.length) {
        var c2 = szoveg.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        ki.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else { ki.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return ki;
  }

  var QR = {
    /* hány bájt fér bele az adott verzióba és szintbe */
    kapacitas: function (verzio, szint) {
      var b = BLOKK[szint][verzio - 1];
      var adat = b[1] * b[2] + b[3] * b[4];
      var fej = 4 + (verzio < 10 ? 8 : 16);      /* mód + hossz */
      return Math.floor((adat * 8 - fej) / 8);
    },

    /* a legkisebb verzió, amelybe belefér */
    verzioValaszt: function (hossz, szint) {
      for (var v = 1; v <= 10; v++) if (QR.kapacitas(v, szint) >= hossz) return v;
      return 0;
    },

    /* a bitsorozat előállítása */
    adatKodszavak: function (bajtok, verzio, szint) {
      var b = BLOKK[szint][verzio - 1];
      var adatHossz = b[1] * b[2] + b[3] * b[4];
      var bitek = [];
      function ir(ertek, hossz) { for (var i = hossz - 1; i >= 0; i--) bitek.push((ertek >> i) & 1); }
      ir(4, 4);                                   /* bájt-mód */
      ir(bajtok.length, verzio < 10 ? 8 : 16);    /* hossz */
      bajtok.forEach(function (x) { ir(x, 8); });
      var maxBit = adatHossz * 8;
      for (var i = 0; i < 4 && bitek.length < maxBit; i++) bitek.push(0);
      while (bitek.length % 8 !== 0) bitek.push(0);
      var kodszavak = [];
      for (var j = 0; j < bitek.length; j += 8) {
        var x2 = 0;
        for (var k = 0; k < 8; k++) x2 = (x2 << 1) | bitek[j + k];
        kodszavak.push(x2);
      }
      var pad = [0xEC, 0x11], p = 0;
      while (kodszavak.length < adatHossz) { kodszavak.push(pad[p % 2]); p++; }
      return kodszavak;
    },

    /* adat + hibajavítás, blokkonként összefésülve */
    vegsoKodszavak: function (adat, verzio, szint) {
      var b = BLOKK[szint][verzio - 1];
      var ecHossz = b[0], blokk1 = b[1], adat1 = b[2], blokk2 = b[3], adat2 = b[4];
      var blokkok = [], ecBlokkok = [], poz = 0, i;
      for (i = 0; i < blokk1; i++) {
        var d1 = adat.slice(poz, poz + adat1); poz += adat1;
        blokkok.push(d1); ecBlokkok.push(rsKod(d1, ecHossz));
      }
      for (i = 0; i < blokk2; i++) {
        var d2 = adat.slice(poz, poz + adat2); poz += adat2;
        blokkok.push(d2); ecBlokkok.push(rsKod(d2, ecHossz));
      }
      var ki = [], maxAdat = Math.max(adat1, adat2);
      for (var k = 0; k < maxAdat; k++) {
        for (var j = 0; j < blokkok.length; j++) if (k < blokkok[j].length) ki.push(blokkok[j][k]);
      }
      for (var k2 = 0; k2 < ecHossz; k2++) {
        for (var j2 = 0; j2 < ecBlokkok.length; j2++) ki.push(ecBlokkok[j2][k2]);
      }
      return ki;
    },

    /* a mátrix felépítése */
    matrix: function (szoveg, szint, kertVerzio) {
      szint = szint || 'M';
      var bajtok = utf8(szoveg);
      var verzio = kertVerzio || QR.verzioValaszt(bajtok.length, szint);
      if (!verzio) return null;
      var meret = 17 + 4 * verzio;
      var m = [], r, c;
      for (r = 0; r < meret; r++) { m.push([]); for (c = 0; c < meret; c++) m[r].push(null); }
      var foglalt = [];
      for (r = 0; r < meret; r++) { foglalt.push([]); for (c = 0; c < meret; c++) foglalt[r].push(false); }

      function finder(sor, oszlop) {
        for (var i = -1; i <= 7; i++) {
          for (var j = -1; j <= 7; j++) {
            var rr = sor + i, cc = oszlop + j;
            if (rr < 0 || cc < 0 || rr >= meret || cc >= meret) continue;
            var belso = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
                        (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
                        (i >= 2 && i <= 4 && j >= 2 && j <= 4);
            m[rr][cc] = belso ? 1 : 0;
            foglalt[rr][cc] = true;
          }
        }
      }
      function idozito() {
        for (var i = 8; i < meret - 8; i++) {
          var ertek = (i % 2 === 0) ? 1 : 0;
          m[6][i] = ertek; foglalt[6][i] = true;
          m[i][6] = ertek; foglalt[i][6] = true;
        }
      }
      function igazitas(kozep) {
        var n = kozep.length;
        for (var i = 0; i < n; i++) {
          for (var j = 0; j < n; j++) {
            /* a három sarok a finder-minták helyén van – azokat kihagyjuk.
               (A helykitöltés alapján nem lehet dönteni: a 7. verziótól vannak
               olyan igazítási minták, amelyek középpontja az időzítő vonalára esik.) */
            if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
            var rr = kozep[i], cc = kozep[j];
            for (var a = -2; a <= 2; a++) {
              for (var b2 = -2; b2 <= 2; b2++) {
                var belso = (Math.max(Math.abs(a), Math.abs(b2)) !== 1);
                m[rr + a][cc + b2] = belso ? 1 : 0;
                foglalt[rr + a][cc + b2] = true;
              }
            }
          }
        }
      }

      finder(0, 0); finder(meret - 7, 0); finder(0, meret - 7);
      idozito();
      if (IGAZITAS[verzio]) igazitas(IGAZITAS[verzio]);

      /* a sötét modul és a formátum-infó helyének kijelölése */
      m[meret - 8][8] = 1; foglalt[meret - 8][8] = true;
      for (var i2 = 0; i2 < 9; i2++) {
        if (!foglalt[8][i2]) { foglalt[8][i2] = true; m[8][i2] = 0; }
        if (!foglalt[i2][8]) { foglalt[i2][8] = true; m[i2][8] = 0; }
      }
      for (var i3 = 0; i3 < 8; i3++) {
        if (!foglalt[8][meret - 1 - i3]) { foglalt[8][meret - 1 - i3] = true; m[8][meret - 1 - i3] = 0; }
        if (!foglalt[meret - 1 - i3][8]) { foglalt[meret - 1 - i3][8] = true; m[meret - 1 - i3][8] = 0; }
      }
      /* verzió-infó (7. verziótól) */
      if (verzio >= 7) {
        var vinfo = verzioInfo(verzio);
        for (var i4 = 0; i4 < 18; i4++) {
          var bit = (vinfo >> i4) & 1;
          var rr2 = Math.floor(i4 / 3), cc2 = i4 % 3;
          m[rr2][meret - 11 + cc2] = bit; foglalt[rr2][meret - 11 + cc2] = true;   /* jobbra fent */
          m[meret - 11 + cc2][rr2] = bit; foglalt[meret - 11 + cc2][rr2] = true;   /* lent balra */
        }
      }

      /* adatbitek elhelyezése cikk-cakkban */
      var kodszavak = QR.vegsoKodszavak(QR.adatKodszavak(bajtok, verzio, szint), verzio, szint);
      var bitSor = [];
      kodszavak.forEach(function (x) { for (var i = 7; i >= 0; i--) bitSor.push((x >> i) & 1); });
      var irany = -1, sor = meret - 1, bitPoz = 0;
      for (var oszlop = meret - 1; oszlop > 0; oszlop -= 2) {
        if (oszlop === 6) oszlop = 5;
        while (true) {
          for (var k2 = 0; k2 < 2; k2++) {
            var cc3 = oszlop - k2;
            if (!foglalt[sor][cc3] && m[sor][cc3] === null) {
              m[sor][cc3] = bitPoz < bitSor.length ? bitSor[bitPoz++] : 0;
            }
          }
          sor += irany;
          if (sor < 0 || sor >= meret) { sor -= irany; irany = -irany; break; }
        }
      }

      /* maszk (rögzített 0) + formátum-infó */
      var maszk = 0;
      for (var r2 = 0; r2 < meret; r2++) {
        for (var c2 = 0; c2 < meret; c2++) {
          if (!foglalt[r2][c2] && maszkBit(maszk, r2, c2)) m[r2][c2] ^= 1;
        }
      }
      var finfo = formatInfo(szint, maszk);
      /* első példány: a bal felső sarok körül (függőlegesen a 0–5. bit,
         vízszintesen a 9–14. bit) */
      for (var i5 = 0; i5 <= 5; i5++) m[i5][8] = (finfo >> i5) & 1;
      m[7][8] = (finfo >> 6) & 1;
      m[8][8] = (finfo >> 7) & 1;
      m[8][7] = (finfo >> 8) & 1;
      for (var i6 = 9; i6 < 15; i6++) m[8][14 - i6] = (finfo >> i6) & 1;
      /* második példány: jobbra fent, illetve lent a függőleges sávban */
      for (var i7 = 0; i7 < 8; i7++) m[8][meret - 1 - i7] = (finfo >> i7) & 1;
      for (var i8 = 8; i8 < 15; i8++) m[meret - 15 + i8][8] = (finfo >> i8) & 1;
      m[meret - 8][8] = 1;

      return { matrix: m, verzio: verzio, szint: szint, maszk: maszk, meret: meret };
    }
  };

  function maszkBit(maszk, r, c) {
    switch (maszk) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
    return false;
  }

  /* 15 bites formátum-infó: szint + maszk, BCH(15,5) */
  function formatInfo(szint, maszk) {
    var szintBitek = { L: 1, M: 0, Q: 3, H: 2 }[szint];
    var adat = (szintBitek << 3) | maszk;
    var maradek = adat << 10;
    for (var i = 14; i >= 10; i--) {
      if ((maradek >> i) & 1) maradek ^= 0x537 << (i - 10);
    }
    return ((adat << 10) | maradek) ^ 0x5412;
  }

  /* 18 bites verzió-infó: BCH(18,6) */
  function verzioInfo(verzio) {
    var maradek = verzio << 12;
    for (var i = 17; i >= 12; i--) {
      if ((maradek >> i) & 1) maradek ^= 0x1F25 << (i - 12);
    }
    return (verzio << 12) | maradek;
  }

  QR.rsGeneral = rsGeneral;
  QR.maszkBit = maszkBit;
  QR.formatInfo = formatInfo;
  QR.verzioInfo = verzioInfo;
  QR.rsKod = rsKod;

  global.QR = QR;
  if (typeof module !== 'undefined' && module.exports) module.exports = QR;

})(typeof window !== 'undefined' ? window : globalThis);
