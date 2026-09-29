/* ============================================================================
   Máriás versenykezelő – mobil eredménybeküldés hálózati rétege

   A játékos a telefonján megnyitja a cédulán lévő QR-kódot, beírja a pénzt,
   és elküldi. A beküldés a weblap Firebase-projektjének egy külön gyűjteményébe
   (verseny_bekuld) kerül, ahonnan a szervező programja átveszi.

   A Firebase-t csak akkor töltjük be, amikor tényleg kell – így a program
   internet nélkül, fájlból is hibátlanul indul.
   ========================================================================== */
(function (global) {
  'use strict';

  var GY = 'verseny_bekuld';          /* a gyűjtemény neve */

  /* A weblap saját (nyilvános) Firebase-konfigurációja – ugyanaz, mint az index.html-ben. */
  var CONFIG = {
    apiKey: 'AIzaSyCIZwZB-O-uFyp19zOpMnCk8nwp_hLIKDc',
    authDomain: 'mub-versenyek.firebaseapp.com',
    projectId: 'mub-versenyek',
    storageBucket: 'mub-versenyek.firebasestorage.app',
    messagingSenderId: '93113038120',
    appId: '1:93113038120:web:c9b3f8189c7a46cd5e0c1d'
  };

  var SDK = [
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js'
  ];

  var db = null, allapot = 'nincs';

  function sdkBetolt(cb) {
    if (global.firebase && global.firebase.firestore) return cb(null);
    if (typeof document === 'undefined') return cb(new Error('nincs böngésző'));
    var i = 0;
    (function kov() {
      if (i >= SDK.length) return cb(null);
      var s = document.createElement('script');
      s.src = SDK[i++];
      s.onload = kov;
      s.onerror = function () { allapot = 'nincs net'; cb(new Error('nincs net')); };
      document.head.appendChild(s);
    })();
  }

  function keszul(cb) {
    if (db) return cb(null, db);
    if (typeof global.navigator !== 'undefined' && global.navigator.onLine === false) {
      allapot = 'nincs net';
      return cb(new Error('nincs net'));
    }
    sdkBetolt(function (h) {
      if (h) { allapot = 'nincs net'; return cb(h); }
      try {
        if (!global.firebase.apps || !global.firebase.apps.length) global.firebase.initializeApp(CONFIG);
        db = global.firebase.firestore();
        allapot = 'kész';
        cb(null, db);
      } catch (e) { allapot = 'hiba'; cb(e); }
    });
  }

  var Bekuldes = {
    gyujtemeny: GY,
    config: CONFIG,
    allapot: function () { return allapot; },

    /* egy beküldés: { e, kor, asztal, kodok, penzek, nev } */
    kuld: function (bekuld, cb) {
      keszul(function (h, db2) {
        if (h) return cb(h);
        bekuld.ts = Date.now();
        db2.collection(GY).add(bekuld)
          .then(function (ref) { cb(null, ref.id); })
          .catch(function (e) { cb(e); });
      });
    },

    /* a szervezőnek: az adott versenyhez érkezett beküldések (idő szerint, a szűrő
       csak egy mezőre szól, hogy ne kelljen összetett indexet beállítani) */
    listaz: function (esemenyId, cb) {
      keszul(function (h, db2) {
        if (h) return cb(h);
        db2.collection(GY).where('e', '==', String(esemenyId)).limit(50).get()
          .then(function (snap) {
            var ki = [];
            snap.forEach(function (d) { var x = d.data() || {}; x.id = d.id; ki.push(x); });
            ki.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
            cb(null, ki);
          })
          .catch(function (e) { cb(e); });
      });
    },

    /* a beküldés törlése, ha a szervező elveti vagy már feldolgozta */
    torol: function (id, cb) {
      keszul(function (h, db2) {
        if (h) return cb(h);
        db2.collection(GY).doc(String(id)).delete().then(function () { cb(null); }).catch(function (e) { cb(e); });
      });
    }
  };

  global.BEKULDES = Bekuldes;
  if (typeof module !== 'undefined' && module.exports) module.exports = Bekuldes;

})(typeof window !== 'undefined' ? window : globalThis);
