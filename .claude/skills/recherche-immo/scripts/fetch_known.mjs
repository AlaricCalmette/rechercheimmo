#!/usr/bin/env node
// Imprime ce que le site connaît déjà, pour ne pas reproposer les mêmes biens :
//   { favoris: [url], candidats: [{ url, score }], exclus: [url] }
// Un candidat déjà présent est ignoré par l'API à l'envoi (compté « skipped ») :
// inutile de passer du temps dessus, concentre la recherche sur les nouveautés.
//
// Usage : node fetch_known.mjs

import { api } from "./lib.mjs";

process.stdout.write(JSON.stringify(await api("/api/known"), null, 2));
