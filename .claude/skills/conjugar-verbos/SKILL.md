---
name: conjugar-verbos
description: Añade conjugaciones francesas completas (19 tiempos, con IPA) a los verbos de dictionnaire.json que aún no las tienen. Úsalo cuando el usuario quiera "añadir/rellenar conjugaciones", incorporar verbos nuevos, o regenerar el campo `conjugaisons`. Genera datos que respetan exactamente la convención de la BD y se validan contra los verbos de referencia antes de escribir.
---

# Conjugar verbos (francés) para dictionnaire.json

Motor determinista que rellena el campo `conjugaisons` de los verbos de `dictionnaire.json`.
Reproduce **byte a byte** la convención que ya usan los verbos existentes (validado contra
`parler`, `finir`, `se lever`, `aller`).

## Cuándo usarlo
- "Añade las conjugaciones a los verbos que no tienen."
- "He metido verbos nuevos en el diccionario, conjúgalos."
- "Regenera la conjugación de X."

## Flujo de trabajo

1. **Mira qué falta.** Lista los verbos sin conjugación:
   ```bash
   node -e "const d=require('./dictionnaire.json');for(const c of d.categories)for(const s of c.subcategories||[])for(const m of s.mots||[])if(m.type_mot==='verbe'&&!(m.conjugaisons&&Object.keys(m.conjugaisons).length))console.log(m.mot,m.ipa)"
   ```
2. **Escribe las especificaciones** en un archivo (copia `ejemplo-specs.js`). Una entrada por verbo.
3. **Prueba en seco** y revisa un verbo concreto:
   ```bash
   node .claude/skills/conjugar-verbos/conjugador.js mis-specs.js --dump prendre
   ```
   El conjugador primero hace una **auto-prueba**: regenera los verbos de referencia y
   aborta si dejaran de coincidir con la BD (señal de que cambió la convención).
4. **Escribe** cuando el volcado sea correcto:
   ```bash
   node .claude/skills/conjugar-verbos/conjugador.js mis-specs.js --write
   ```
   Solo toca los verbos que aún no tenían conjugación; preserva el formato del archivo
   (CRLF + indentación de 2 espacios) para que el diff sea mínimo.

## Formato de una especificación

Cada verbo es `mot -> { simple, aux, reflexive, groupe }`:
- `aux`: `'avoir'` o `'être'`.
- `reflexive`: `true` para pronominales (siempre `aux:'être'`).
- `groupe`: 1 (-er), 2 (-ir tipo finir), 3 (irregulares).
- `simple`: las 10 conjugaciones **simples**. El motor deriva solos los 9 tiempos
  **compuestos** (passé composé, plus-que-parfait, etc.) a partir del participio + auxiliar.

### Generadores automáticos
- `regER(raíz, ipaRaíz)` — regular en -er. La `ipaRaíz` termina en consonante, sin la vocal
  final: `regER('parl','paʁl')`, `regER('donn','dɔn')`.
- `regIR2(raíz, ipaRaíz)` — regular en -ir grupo 2 (finir): `regIR2('fin','fin')`.

Sirven también para pronominales regulares (`reflexive:true`, das la raíz **sin** el "se":
`regER('arrêt','aʁɛt')`) y para verbos en -er con `être` (`monter`).

### Verbos irregulares
Se escribe la tabla `simple` a mano con `T(...)`. Claves: `present, imparfait, passe_simple,
futur, cond_present, subj_present, subj_imparfait` (cada uno = 6 formas en orden
**je, tu, il, nous, vous, ils**), `imperatif {tu,nous,vous}`, `part_present [forma,ipa]`,
`part_passe {ms,fs,mp,fp}`. Ver `ouvrir` en `ejemplo-specs.js`.

## Convenciones de la BD (las aplica el motor, no las escribas tú)
- **IPA**: en las specs va **sin** barras; el motor añade `/.../`.
- **Sin pronombre sujeto** en las formas (ej. `ai parlé`, no `j'ai parlé`); subjuntivo sin `que`.
- **Tiempos compuestos** = auxiliar + participio. Con `avoir` el participio es invariable;
  con `être` concuerda y se muestra con marcas `(e)`, `(e)s`, `(e)(s)` (la IPA las ignora).
- **Pronominales**: clíticos `me/te/se/nous/vous/se`, con elisión ante vocal (`m'arrête`),
  liaison de `nous/vous` (`nous arrêtons` → `/nu zaʁɛtɔ̃/`), e imperativo con `-toi/-nous/-vous`.
- **Verbos duplicados**: si un verbo aparece dos veces y una copia ya está conjugada, ponlo en
  `COPY_FROM_TWIN` para copiarla a la otra en vez de regenerarla.

## Archivos
- `conjugador.js` — motor + auto-prueba + inyección/validación + CLI. No editar salvo para
  corregir la convención (y entonces re-validar contra los verbos de referencia).
- `ejemplo-specs.js` — plantilla con los 5 casos (regular -er, -ir g2, être, pronominal, irregular).

## Notas de calidad
- Para verbos con cambios ortográficos (`-ger`, `-cer`, `é→è`, `-yer`, `-ier`) y todos los
  irregulares, escribe la tabla a mano: los generadores automáticos solo cubren los regulares "limpios".
- Verbos defectivos (p. ej. `frire`): rellena las formas atestiguadas; las raras pueden
  reconstruirse según el patrón, anotándolo.
- IPA tras grupo obstruente+líquida (`-dr-`, `-vr-`, `-tr-`): el sufijo `-ions/-iez` se
  transcribe `/ij/` (`ouvrions` → `/uvʁijɔ̃/`), no `/j/`.
