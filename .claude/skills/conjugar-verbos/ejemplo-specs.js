// Plantilla de especificación de verbos para el conjugador.
//   node conjugador.js ejemplo-specs.js --dump donner      (prueba en seco)
//   node conjugador.js ejemplo-specs.js --write            (guarda en dictionnaire.json)
//
// Solo se rellenan los verbos que AÚN NO tienen conjugación en la BD.
// Los que ya la tienen se ignoran, así que es seguro re-ejecutar.

const { regER, regIR2, T } = require('./conjugador');

const VERBS = {
  // 1) Verbo regular en -er (grupo 1). regER(raíz_ortográfica, IPA_de_la_raíz_sin_vocal_final)
  //    'parler' -> regER('parl', 'paʁl')
  'donner': { simple: regER('donn', 'dɔn'), aux: 'avoir', reflexive: false, groupe: 1 },

  // 2) Verbo regular en -ir (grupo 2, tipo finir). regIR2(raíz, IPA_raíz)
  'réussir': { simple: regIR2('réuss', 'ʁeys'), aux: 'avoir', reflexive: false, groupe: 2 },

  // 3) Verbo en -er con auxiliar être (de movimiento)
  'monter': { simple: regER('mont', 'mɔ̃t'), aux: 'être', reflexive: false, groupe: 1 },

  // 4) Verbo pronominal (reflexive:true, siempre aux 'être'). Da la raíz SIN el "se".
  //    El motor añade los clíticos (me/te/se...), la elisión (m'/t') y la liaison.
  "s'arrêter": { simple: regER('arrêt', 'aʁɛt'), aux: 'être', reflexive: true, groupe: 1 },

  // 5) Verbo IRREGULAR: se escribe la tabla a mano con T(...).
  //    Solo hacen falta los 10 tiempos SIMPLES; el motor construye los 9 compuestos
  //    a partir del participio + el auxiliar. IPA siempre SIN barras.
  //    Orden de personas: je, tu, il, nous, vous, ils.
  'ouvrir': {
    aux: 'avoir', reflexive: false, groupe: 3,
    simple: {
      present:      T(['ouvre','uvʁ'],['ouvres','uvʁ'],['ouvre','uvʁ'],['ouvrons','uvʁɔ̃'],['ouvrez','uvʁe'],['ouvrent','uvʁ']),
      imparfait:    T(['ouvrais','uvʁɛ'],['ouvrais','uvʁɛ'],['ouvrait','uvʁɛ'],['ouvrions','uvʁijɔ̃'],['ouvriez','uvʁije'],['ouvraient','uvʁɛ']),
      passe_simple: T(['ouvris','uvʁi'],['ouvris','uvʁi'],['ouvrit','uvʁi'],['ouvrîmes','uvʁim'],['ouvrîtes','uvʁit'],['ouvrirent','uvʁiʁ']),
      futur:        T(['ouvrirai','uvʁiʁe'],['ouvriras','uvʁiʁa'],['ouvrira','uvʁiʁa'],['ouvrirons','uvʁiʁɔ̃'],['ouvrirez','uvʁiʁe'],['ouvriront','uvʁiʁɔ̃']),
      cond_present: T(['ouvrirais','uvʁiʁɛ'],['ouvrirais','uvʁiʁɛ'],['ouvrirait','uvʁiʁɛ'],['ouvririons','uvʁiʁjɔ̃'],['ouvririez','uvʁiʁje'],['ouvriraient','uvʁiʁɛ']),
      subj_present: T(['ouvre','uvʁ'],['ouvres','uvʁ'],['ouvre','uvʁ'],['ouvrions','uvʁijɔ̃'],['ouvriez','uvʁije'],['ouvrent','uvʁ']),
      subj_imparfait: T(['ouvrisse','uvʁis'],['ouvrisses','uvʁis'],['ouvrît','uvʁi'],['ouvrissions','uvʁisjɔ̃'],['ouvrissiez','uvʁisje'],['ouvrissent','uvʁis']),
      imperatif:    { tu:['ouvre','uvʁ'], nous:['ouvrons','uvʁɔ̃'], vous:['ouvrez','uvʁe'] },
      part_present: ['ouvrant','uvʁɑ̃'],
      part_passe:   { ms:['ouvert','uvɛʁ'], fs:['ouverte','uvɛʁt'], mp:['ouverts','uvɛʁ'], fp:['ouvertes','uvɛʁt'] },
    },
  },
};

// Verbos que aparecen duplicados en la BD: si una copia ya tiene conjugación,
// se copia tal cual a la copia que no la tiene (no se regenera).
const COPY_FROM_TWIN = ['prendre', 'parler'];

module.exports = { VERBS, COPY_FROM_TWIN };
