import {build} from 'esbuild';
await build({
  entryPoints:{'firebase-core':'scripts/firebase-core.mjs','firebase-storage':'scripts/firebase-storage.mjs'},
  outdir:'site/assets/vendor/firebase',bundle:true,format:'esm',splitting:true,minify:true,
  target:['es2020'],chunkNames:'firebase-shared',legalComments:'eof'
});
