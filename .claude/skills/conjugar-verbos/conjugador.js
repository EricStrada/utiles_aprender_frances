// Motor de conjugación francesa para dictionnaire.json.
// Genera el objeto `conjugaisons` (19 tiempos) con la misma convención que la BD:
//   - IPA interno SIN barras; se añaden /.../ al emitir.
//   - tiempos compuestos construidos a partir del participio + auxiliar (avoir/être).
//   - verbos pronominales (reflexive:true) con clíticos, elisión y liaison.
//
// Uso:  node conjugador.js <specs.js> [--write] [--dump <verbo>]
//   <specs.js> exporta { VERBS, COPY_FROM_TWIN } (ver SKILL.md).
//   Sin --write hace una pasada en seco (valida pero no guarda).
//
// Antes de inyectar nada, el script REGENERA los verbos de referencia
// (parler, finir, se lever, aller) y aborta si no coinciden byte a byte
// con la BD: así garantizamos que el motor sigue fiel a la convención.

const fs = require('fs');
const path = require('path');

const PERS = ['je', 'tu', 'il', 'nous', 'vous', 'ils'];

const AUX = {
  avoir: {
    passe_compose:      [['ai','e'],['as','a'],['a','a'],['avons','avɔ̃'],['avez','ave'],['ont','ɔ̃']],
    plus_que_parfait:   [['avais','avɛ'],['avais','avɛ'],['avait','avɛ'],['avions','avjɔ̃'],['aviez','avje'],['avaient','avɛ']],
    passe_anterieur:    [['eus','y'],['eus','y'],['eut','y'],['eûmes','ym'],['eûtes','yt'],['eurent','yʁ']],
    futur_anterieur:    [['aurai','oʁe'],['auras','oʁa'],['aura','oʁa'],['aurons','oʁɔ̃'],['aurez','oʁe'],['auront','oʁɔ̃']],
    conditionnel_passe: [['aurais','oʁɛ'],['aurais','oʁɛ'],['aurait','oʁɛ'],['aurions','oʁjɔ̃'],['auriez','oʁje'],['auraient','oʁɛ']],
    subjonctif_passe:   [['aie','ɛ'],['aies','ɛ'],['ait','ɛ'],['ayons','ɛjɔ̃'],['ayez','ɛje'],['aient','ɛ']],
    subjonctif_pqp:     [['eusse','ys'],['eusses','ys'],['eût','y'],['eussions','ysjɔ̃'],['eussiez','ysje'],['eussent','ys']],
    gerondif_passe:     ['ayant','ɛjɑ̃'],
  },
  être: {
    passe_compose:      [['suis','sɥi'],['es','ɛ'],['est','ɛ'],['sommes','sɔm'],['êtes','ɛt'],['sont','sɔ̃']],
    plus_que_parfait:   [['étais','etɛ'],['étais','etɛ'],['était','etɛ'],['étions','etjɔ̃'],['étiez','etje'],['étaient','etɛ']],
    passe_anterieur:    [['fus','fy'],['fus','fy'],['fut','fy'],['fûmes','fym'],['fûtes','fyt'],['furent','fyʁ']],
    futur_anterieur:    [['serai','səʁe'],['seras','səʁa'],['sera','səʁa'],['serons','səʁɔ̃'],['serez','səʁe'],['seront','səʁɔ̃']],
    conditionnel_passe: [['serais','səʁɛ'],['serais','səʁɛ'],['serait','səʁɛ'],['serions','səʁjɔ̃'],['seriez','səʁje'],['seraient','səʁɛ']],
    subjonctif_passe:   [['sois','swa'],['sois','swa'],['soit','swa'],['soyons','swajɔ̃'],['soyez','swaje'],['soient','swa']],
    subjonctif_pqp:     [['fusse','fys'],['fusses','fys'],['fût','fy'],['fussions','fysjɔ̃'],['fussiez','fysje'],['fussent','fys']],
    gerondif_passe:     ['étant','etɑ̃'],
  },
};

const COMPOUND_TENSES = {
  'indicatif_passé_composé': 'passe_compose',
  'indicatif_plus_que_parfait': 'plus_que_parfait',
  'indicatif_passé_antérieur': 'passe_anterieur',
  'indicatif_futur_antérieur': 'futur_anterieur',
  'conditionnel_passé': 'conditionnel_passe',
  'subjonctif_passé': 'subjonctif_passe',
  'subjonctif_plus_que_parfait': 'subjonctif_pqp',
};
const SIMPLE_TENSES = {
  'indicatif_présent': 'present',
  'indicatif_imparfait': 'imparfait',
  'indicatif_passé_simple': 'passe_simple',
  'indicatif_futur_simple': 'futur',
  'conditionnel_présent': 'cond_present',
  'subjonctif_présent': 'subj_present',
  'subjonctif_imparfait': 'subj_imparfait',
};

const VOWEL = /^[aeiouyàâäéèêëîïôöûüœh]/i;
const isVowelStart = s => VOWEL.test(s);

const REFL = ['me', 'te', 'se', 'nous', 'vous', 'se'];
const REFL_IPA = ['mə', 'tə', 'sə', 'nu', 'vu', 'sə'];
const REFL_ELIDE = ["m'", "t'", "s'", null, null, "s'"];
const REFL_ELIDE_IPA = ['m', 't', 's', null, null, 's'];

const VOUS_DOUBLE_NONREFL = new Set(['passe_compose', 'plus_que_parfait', 'futur_anterieur', 'conditionnel_passe']);
const VOUS_DOUBLE_REFL = new Set(['passe_compose', 'plus_que_parfait']);
function etreSuffix(person, slot, reflexive) {
  if (person === 'vous') return (reflexive ? VOUS_DOUBLE_REFL : VOUS_DOUBLE_NONREFL).has(slot) ? '(e)(s)' : '(e)s';
  return { je: '(e)', tu: '(e)', il: '', nous: '(e)s', ils: 's' }[person];
}

const wrap = ipa => '/' + ipa + '/';
const T = (...rows) => rows;   // azúcar para escribir tablas: T(['parle','paʁl'], ...)

function finite(arr) {
  const o = {};
  PERS.forEach((p, i) => { o[p] = { forme: arr[i][0], ipa: wrap(arr[i][1]) }; });
  return o;
}

// ── Generador regular -er ──  stem (ortografía), ic (IPA terminada en consonante)
function regER(stem, ic) {
  const inf = stem + 'er', fut = ic + 'əʁ';
  return {
    present: [[stem+'e',ic],[stem+'es',ic],[stem+'e',ic],[stem+'ons',ic+'ɔ̃'],[stem+'ez',ic+'e'],[stem+'ent',ic]],
    imparfait: [[stem+'ais',ic+'ɛ'],[stem+'ais',ic+'ɛ'],[stem+'ait',ic+'ɛ'],[stem+'ions',ic+'jɔ̃'],[stem+'iez',ic+'je'],[stem+'aient',ic+'ɛ']],
    passe_simple: [[stem+'ai',ic+'e'],[stem+'as',ic+'a'],[stem+'a',ic+'a'],[stem+'âmes',ic+'am'],[stem+'âtes',ic+'at'],[stem+'èrent',ic+'ɛʁ']],
    futur: [[inf+'ai',fut+'e'],[inf+'as',fut+'a'],[inf+'a',fut+'a'],[inf+'ons',fut+'ɔ̃'],[inf+'ez',fut+'e'],[inf+'ont',fut+'ɔ̃']],
    cond_present: [[inf+'ais',fut+'ɛ'],[inf+'ais',fut+'ɛ'],[inf+'ait',fut+'ɛ'],[inf+'ions',fut+'jɔ̃'],[inf+'iez',fut+'je'],[inf+'aient',fut+'ɛ']],
    subj_present: [[stem+'e',ic],[stem+'es',ic],[stem+'e',ic],[stem+'ions',ic+'jɔ̃'],[stem+'iez',ic+'je'],[stem+'ent',ic]],
    subj_imparfait: [[stem+'asse',ic+'as'],[stem+'asses',ic+'as'],[stem+'ât',ic+'a'],[stem+'assions',ic+'asjɔ̃'],[stem+'assiez',ic+'asje'],[stem+'assent',ic+'as']],
    imperatif: { tu: [stem+'e',ic], nous: [stem+'ons',ic+'ɔ̃'], vous: [stem+'ez',ic+'e'] },
    part_present: [stem+'ant', ic+'ɑ̃'],
    part_passe: { ms:[stem+'é',ic+'e'], fs:[stem+'ée',ic+'e'], mp:[stem+'és',ic+'e'], fp:[stem+'ées',ic+'e'] },
  };
}

// ── Generador regular -ir grupo 2 ──  root (ortografía), ic (IPA de la raíz)
function regIR2(root, ic) {
  const inf = root + 'ir', futi = ic + 'iʁ';
  return {
    present: [[root+'is',ic+'i'],[root+'is',ic+'i'],[root+'it',ic+'i'],[root+'issons',ic+'isɔ̃'],[root+'issez',ic+'ise'],[root+'issent',ic+'is']],
    imparfait: [[root+'issais',ic+'isɛ'],[root+'issais',ic+'isɛ'],[root+'issait',ic+'isɛ'],[root+'issions',ic+'isjɔ̃'],[root+'issiez',ic+'isje'],[root+'issaient',ic+'isɛ']],
    passe_simple: [[root+'is',ic+'i'],[root+'is',ic+'i'],[root+'it',ic+'i'],[root+'îmes',ic+'im'],[root+'îtes',ic+'it'],[root+'irent',ic+'iʁ']],
    futur: [[inf+'ai',futi+'e'],[inf+'as',futi+'a'],[inf+'a',futi+'a'],[inf+'ons',futi+'ɔ̃'],[inf+'ez',futi+'e'],[inf+'ont',futi+'ɔ̃']],
    cond_present: [[inf+'ais',futi+'ɛ'],[inf+'ais',futi+'ɛ'],[inf+'ait',futi+'ɛ'],[inf+'ions',futi+'jɔ̃'],[inf+'iez',futi+'je'],[inf+'aient',futi+'ɛ']],
    subj_present: [[root+'isse',ic+'is'],[root+'isses',ic+'is'],[root+'isse',ic+'is'],[root+'issions',ic+'isjɔ̃'],[root+'issiez',ic+'isje'],[root+'issent',ic+'is']],
    subj_imparfait: [[root+'isse',ic+'is'],[root+'isses',ic+'is'],[root+'ît',ic+'i'],[root+'issions',ic+'isjɔ̃'],[root+'issiez',ic+'isje'],[root+'issent',ic+'is']],
    imperatif: { tu:[root+'is',ic+'i'], nous:[root+'issons',ic+'isɔ̃'], vous:[root+'issez',ic+'ise'] },
    part_present: [root+'issant', ic+'isɑ̃'],
    part_passe: { ms:[root+'i',ic+'i'], fs:[root+'ie',ic+'i'], mp:[root+'is',ic+'i'], fp:[root+'ies',ic+'i'] },
  };
}

function buildCompound(slot, simple, aux, reflexive) {
  const para = AUX[aux][slot], pp = simple.part_passe.ms, o = {};
  PERS.forEach((p, i) => {
    const [af, ai] = para[i], suf = etreSuffix(p, slot, reflexive);
    if (!reflexive && aux === 'avoir') {
      o[p] = { forme: af + ' ' + pp[0], ipa: wrap(ai + ' ' + pp[1]) };
    } else if (!reflexive && aux === 'être') {
      o[p] = { forme: af + ' ' + pp[0] + suf, ipa: wrap(ai + ' ' + pp[1]) };
    } else {
      const auxVowel = isVowelStart(af);
      let forme, ipa;
      if (p === 'nous' || p === 'vous') {
        const liaison = ai[0] === 'e' ? 'z' : '';
        forme = REFL[i] + ' ' + af + ' ' + pp[0] + suf;
        ipa = REFL_IPA[i] + ' ' + liaison + ai + ' ' + pp[1];
      } else if (auxVowel) {
        forme = REFL_ELIDE[i] + af + ' ' + pp[0] + suf;
        ipa = REFL_ELIDE_IPA[i] + ai + ' ' + pp[1];
      } else {
        forme = REFL[i] + ' ' + af + ' ' + pp[0] + suf;
        ipa = REFL_IPA[i] + ' ' + ai + ' ' + pp[1];
      }
      o[p] = { forme, ipa: wrap(ipa) };
    }
  });
  return o;
}

function reflFinite(arr) {
  const o = {};
  PERS.forEach((p, i) => {
    const [f, ic] = arr[i];
    let forme, ipa;
    if (p === 'nous' || p === 'vous') {
      forme = REFL[i] + ' ' + f;
      ipa = REFL_IPA[i] + ' ' + (isVowelStart(f) ? 'z' : '') + ic;
    } else if (isVowelStart(f)) {
      forme = REFL_ELIDE[i] + f;
      ipa = REFL_ELIDE_IPA[i] + ic;
    } else {
      forme = REFL[i] + ' ' + f;
      ipa = REFL_IPA[i] + ' ' + ic;
    }
    o[p] = { forme, ipa: wrap(ipa) };
  });
  return o;
}

const ORDER = ['indicatif_présent','indicatif_imparfait','indicatif_passé_composé','indicatif_passé_simple','indicatif_plus_que_parfait','indicatif_passé_antérieur','indicatif_futur_simple','indicatif_futur_antérieur','conditionnel_présent','conditionnel_passé','subjonctif_présent','subjonctif_passé','subjonctif_imparfait','subjonctif_plus_que_parfait','impératif_présent','gérondif_présent','gérondif_passé','participe_présent','participe_passé'];

function assemble(simple, aux, reflexive) {
  const c = {};
  for (const [k, slot] of Object.entries(SIMPLE_TENSES))
    c[k] = reflexive ? reflFinite(simple[slot]) : finite(simple[slot]);

  const imp = {};
  for (const p of ['tu', 'nous', 'vous']) {
    const [f, ic] = simple.imperatif[p];
    if (reflexive) {
      const clitic = p === 'tu' ? 'toi' : p;
      const cIpa = p === 'tu' ? 'twa' : (p === 'nous' ? 'nu' : 'vu');
      imp[p] = { forme: f + '-' + clitic, ipa: wrap(ic + ' ' + cIpa) };
    } else imp[p] = { forme: f, ipa: wrap(ic) };
  }
  c['impératif_présent'] = imp;

  for (const [k, slot] of Object.entries(COMPOUND_TENSES))
    c[k] = buildCompound(slot, simple, aux, reflexive);

  const [ppf, ppi] = simple.part_present;
  if (reflexive) {
    const refl = isVowelStart(ppf) ? "s'" : 'se ', reflI = isVowelStart(ppf) ? 's' : 'sə ';
    c['participe_présent'] = { unique: { forme: refl + ppf, ipa: wrap(reflI + ppi) } };
    c['gérondif_présent'] = { unique: { forme: 'en ' + refl + ppf, ipa: wrap('ɑ̃ ' + reflI + ppi) } };
  } else {
    c['participe_présent'] = { unique: { forme: ppf, ipa: wrap(ppi) } };
    c['gérondif_présent'] = { unique: { forme: 'en ' + ppf, ipa: wrap('ɑ̃ ' + ppi) } };
  }

  const [gaf, gai] = AUX[aux].gerondif_passe, pp = simple.part_passe.ms;
  if (reflexive) {
    const av = isVowelStart(gaf), refl = av ? "s'" : 'se ', reflI = av ? 's' : 'sə ';
    c['gérondif_passé'] = { base: { forme: 'en ' + refl + gaf + ' ' + pp[0] + '(e)', ipa: wrap('ɑ̃ ' + reflI + gai + ' ' + pp[1]) } };
  } else if (aux === 'être') {
    c['gérondif_passé'] = { base: { forme: 'en ' + gaf + ' ' + pp[0], ipa: wrap('ɑ̃ ' + gai + ' ' + pp[1]) } };
  } else {
    c['gérondif_passé'] = { base: { forme: 'en ' + gaf + ' ' + pp[0], ipa: wrap('ɑ̃ ' + gai + ' ' + pp[1]) } };
  }

  const q = simple.part_passe;
  c['participe_passé'] = {
    ms: { forme: q.ms[0], ipa: wrap(q.ms[1]) }, fs: { forme: q.fs[0], ipa: wrap(q.fs[1]) },
    mp: { forme: q.mp[0], ipa: wrap(q.mp[1]) }, fp: { forme: q.fp[0], ipa: wrap(q.fp[1]) },
  };

  const ordered = {};
  for (const k of ORDER) ordered[k] = c[k];
  return ordered;
}

// ── Verbos de referencia para la auto-prueba del motor ──
const GOLDEN = {
  'parler': () => assemble(regER('parl', 'paʁl'), 'avoir', false),
  'finir':  () => assemble(regIR2('fin', 'fin'), 'avoir', false),
  'se lever': () => assemble({
    present: T(['lève','lɛv'],['lèves','lɛv'],['lève','lɛv'],['levons','ləvɔ̃'],['levez','ləve'],['lèvent','lɛv']),
    imparfait: T(['levais','ləvɛ'],['levais','ləvɛ'],['levait','ləvɛ'],['levions','ləvjɔ̃'],['leviez','ləvje'],['levaient','ləvɛ']),
    passe_simple: T(['levai','ləve'],['levas','ləva'],['leva','ləva'],['levâmes','ləvam'],['levâtes','ləvat'],['levèrent','ləvɛʁ']),
    futur: T(['lèverai','lɛvʁe'],['lèveras','lɛvʁa'],['lèvera','lɛvʁa'],['lèverons','lɛvʁɔ̃'],['lèverez','lɛvʁe'],['lèveront','lɛvʁɔ̃']),
    cond_present: T(['lèverais','lɛvʁɛ'],['lèverais','lɛvʁɛ'],['lèverait','lɛvʁɛ'],['lèverions','lɛvʁjɔ̃'],['lèveriez','lɛvʁje'],['lèveraient','lɛvʁɛ']),
    subj_present: T(['lève','lɛv'],['lèves','lɛv'],['lève','lɛv'],['levions','ləvjɔ̃'],['leviez','ləvje'],['lèvent','lɛv']),
    subj_imparfait: T(['levasse','ləvas'],['levasses','ləvas'],['levât','ləva'],['levassions','ləvasjɔ̃'],['levassiez','ləvasje'],['levassent','ləvas']),
    imperatif: { tu:['lève','lɛv'], nous:['levons','ləvɔ̃'], vous:['levez','ləve'] },
    part_present: ['levant','ləvɑ̃'],
    part_passe: { ms:['levé','ləve'], fs:['levée','ləve'], mp:['levés','ləve'], fp:['levées','ləve'] },
  }, 'être', true),
  'aller': () => assemble({
    present: T(['vais','vɛ'],['vas','va'],['va','va'],['allons','alɔ̃'],['allez','ale'],['vont','vɔ̃']),
    imparfait: T(['allais','alɛ'],['allais','alɛ'],['allait','alɛ'],['allions','aljɔ̃'],['alliez','alje'],['allaient','alɛ']),
    passe_simple: T(['allai','ale'],['allas','ala'],['alla','ala'],['allâmes','alam'],['allâtes','alat'],['allèrent','alɛʁ']),
    futur: T(['irai','iʁe'],['iras','iʁa'],['ira','iʁa'],['irons','iʁɔ̃'],['irez','iʁe'],['iront','iʁɔ̃']),
    cond_present: T(['irais','iʁɛ'],['irais','iʁɛ'],['irait','iʁɛ'],['irions','iʁjɔ̃'],['iriez','iʁje'],['iraient','iʁɛ']),
    subj_present: T(['aille','aj'],['ailles','aj'],['aille','aj'],['allions','aljɔ̃'],['alliez','alje'],['aillent','aj']),
    subj_imparfait: T(['allasse','alas'],['allasses','alas'],['allât','ala'],['allassions','alasjɔ̃'],['allassiez','alasje'],['allassent','alas']),
    imperatif: { tu:['va','va'], nous:['allons','alɔ̃'], vous:['allez','ale'] },
    part_present: ['allant','alɑ̃'],
    part_passe: { ms:['allé','ale'], fs:['allée','ale'], mp:['allés','ale'], fp:['allées','ale'] },
  }, 'être', false),
};

function deepDiff(path, a, b, out) {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    if (a !== b) out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
    return;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) deepDiff(path ? path+'.'+k : k, a[k], b[k], out);
}

function findVerb(db, n) {
  for (const c of db.categories) for (const s of c.subcategories || []) for (const m of s.mots || [])
    if (m.mot === n && m.conjugaisons && Object.keys(m.conjugaisons).length) return m;
}

function selfTest(db) {
  let ok = true;
  for (const [name, gen] of Object.entries(GOLDEN)) {
    const gold = findVerb(db, name);
    if (!gold) { console.log(`⚠️  ${name}: no está en la BD (omito)`); continue; }
    const out = [];
    deepDiff('', gen(), gold.conjugaisons, out);
    if (out.length) { ok = false; console.log(`❌ auto-prueba ${name}: ${out.length} diferencias`); out.slice(0,10).forEach(l=>console.log('   '+l)); }
    else console.log(`✅ auto-prueba ${name}`);
  }
  return ok;
}

// ── Inyección + validación estructural ──
function injectAndValidate(db, VERBS, COPY = []) {
  const copySet = new Set(COPY);
  const twins = {};
  for (const c of db.categories) for (const s of c.subcategories || []) for (const m of s.mots || [])
    if (copySet.has(m.mot) && m.conjugaisons && Object.keys(m.conjugaisons).length)
      twins[m.mot] = { conjugaisons: m.conjugaisons, groupe: m.groupe, auxiliaire: m.auxiliaire };

  let filled = 0; const touched = [];
  for (const c of db.categories) for (const s of c.subcategories || []) for (const m of s.mots || []) {
    if (m.type_mot !== 'verbe') continue;
    if (m.conjugaisons && Object.keys(m.conjugaisons).length) continue;
    if (copySet.has(m.mot) && twins[m.mot]) {
      m.conjugaisons = twins[m.mot].conjugaisons;
      if (m.groupe == null) m.groupe = twins[m.mot].groupe;
      if (m.auxiliaire == null) m.auxiliaire = twins[m.mot].auxiliaire;
      m.__t = true; filled++; touched.push(m); continue;
    }
    const spec = VERBS[m.mot];
    if (!spec) { console.log(`⚠️  sin especificación para "${m.mot}" (lo dejo sin conjugar)`); continue; }
    m.conjugaisons = assemble(spec.simple, spec.aux, spec.reflexive);
    m.groupe = spec.groupe; m.auxiliaire = spec.aux;
    m.__t = true; filled++; touched.push(m);
  }

  const FIN = ['je','tu','il','nous','vous','ils']; let problems = 0;
  for (const m of touched) {
    const cj = m.conjugaisons;
    if (Object.keys(cj).length !== 19) { console.log(`ESTRUCT: ${m.mot} tiene ${Object.keys(cj).length} tiempos`); problems++; continue; }
    for (const [t, dd] of Object.entries(cj)) {
      if (t === 'participe_passé') { for (const k of ['ms','fs','mp','fp']) if (!dd[k]) { console.log(`ESTRUCT: ${m.mot}.${t} falta ${k}`); problems++; } continue; }
      if (t === 'gérondif_présent' || t === 'participe_présent') { if (!dd.unique) { console.log(`ESTRUCT: ${m.mot}.${t} falta unique`); problems++; } continue; }
      if (t === 'gérondif_passé') { if (!dd.base) { console.log(`ESTRUCT: ${m.mot}.${t} falta base`); problems++; } continue; }
      if (t === 'impératif_présent') { for (const k of ['tu','nous','vous']) if (!dd[k]) { console.log(`ESTRUCT: ${m.mot}.${t} falta ${k}`); problems++; } continue; }
      for (const p of FIN) if (!dd[p] || !dd[p].forme || !dd[p].ipa) { console.log(`ESTRUCT: ${m.mot}.${t} mal ${p}`); problems++; }
    }
  }
  touched.forEach(m => delete m.__t);
  return { filled, problems };
}

function run(specsPath, opts = {}) {
  const dbPath = opts.dbPath || path.resolve(__dirname, '../../../dictionnaire.json');
  const raw = fs.readFileSync(dbPath, 'utf8');
  const db = JSON.parse(raw);

  console.log('— Auto-prueba del motor contra la BD —');
  if (!selfTest(db)) { console.log('\n⛔ El motor ya no coincide con la BD. Revisa la convención antes de continuar.'); process.exit(1); }

  const specs = require(path.resolve(specsPath));
  const { filled, problems } = injectAndValidate(db, specs.VERBS || {}, specs.COPY_FROM_TWIN || []);
  console.log(`\nRellenados ${filled} verbos. Problemas estructurales: ${problems}`);
  if (problems > 0) { console.log('⛔ ABORTO por problemas estructurales.'); process.exit(1); }

  if (opts.dump) {
    const m = findVerb(db, opts.dump) || (() => { for (const c of db.categories) for (const s of c.subcategories||[]) for (const x of s.mots||[]) if (x.mot===opts.dump) return x; })();
    if (m) { console.log(`\n=== ${m.mot} (g${m.groupe}, ${m.auxiliaire}) ===`);
      for (const [t, dd] of Object.entries(m.conjugaisons)) console.log(t + ': ' + Object.entries(dd).map(([k,v])=>k+'='+v.forme+' '+v.ipa).join('  |  ')); }
  }

  if (opts.write) {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2).replace(/\n/g, '\r\n'), 'utf8');
    console.log('\n✅ Guardado dictionnaire.json');
  } else {
    console.log('\n(pasada en seco — añade --write para guardar)');
  }
}

module.exports = { regER, regIR2, assemble, T, run };

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const specsPath = args.find(a => !a.startsWith('--'));
  if (!specsPath) { console.log('Uso: node conjugador.js <specs.js> [--write] [--dump <verbo>]'); process.exit(1); }
  const dumpIdx = args.indexOf('--dump');
  run(specsPath, { write: args.includes('--write'), dump: dumpIdx >= 0 ? args[dumpIdx + 1] : null });
}
