#!/usr/bin/env node
import { validateWikipkgDir } from './validate.js';

async function main() {
  const [, , cmd, ...args] = process.argv;
  if (cmd === 'validate') {
    const dir = args[0];
    if (!dir) {
      console.error('usage: wikipkg validate <dir>');
      process.exit(2);
    }
    const r = await validateWikipkgDir(dir);
    if (r.ok) {
      console.log(`OK: ${dir} validates as wikipkg schema_version=${r.manifest.schema_version}`);
      process.exit(0);
    } else {
      for (const e of r.errors) {
        console.error(`[${e.code}] ${e.path ? e.path + ': ' : ''}${e.message}`);
      }
      process.exit(1);
    }
  }
  if (cmd === 'pack') {
    const [dir, out] = args;
    if (!dir || !out) {
      console.error('usage: wikipkg pack <dir> <out.wikipkg.tar.gz>');
      process.exit(2);
    }
    const { packWikipkg } = await import('./pack.js');
    const r = await packWikipkg(dir, out);
    if (r.ok) {
      console.log(`OK: packed ${r.entries} top-level entries → ${r.outPath}`);
      process.exit(0);
    } else {
      for (const e of r.errors) {
        console.error(`[${e.code}] ${e.path ? e.path + ': ' : ''}${e.message}`);
      }
      process.exit(1);
    }
  }
  console.error(`unknown command: ${cmd}\nusage: wikipkg <validate|pack> ...`);
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
