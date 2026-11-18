import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const fixture = JSON.parse(readFileSync(new URL('../examples/fictional-mainland.geojson', import.meta.url)));
const points = fixture.geometry.coordinates[0];
const outline = points => ({crs:'EPSG:4326',region:'mainland_china',orientation:'CCW',points});

test('CLI ranks candidates independently of labels and keeps invalid batch results', () => {
  const dir=mkdtempSync(join(tmpdir(),'outline-cli-'));
  try {
    const good=join(dir,'good.json'), shifted=join(dir,'shift.json'), invalid=join(dir,'bad.json');
    writeFileSync(good,JSON.stringify(outline(points)));
    writeFileSync(shifted,JSON.stringify(outline(points.map(([x,y])=>[x+2,y+2]))));
    writeFileSync(invalid,'{broken');
    const run = labels => spawnSync(process.execPath,['scripts/score.mjs','--reference','examples/fictional-mainland.geojson',...labels.flatMap(x=>['--label',x]),shifted,invalid,good],{cwd:root,encoding:'utf8'});
    const first=run(['better','bad','worse']), second=run(['x','y','z']);
    assert.equal(first.status,2,first.stderr);
    assert.equal(second.status,2,second.stderr);
    const a=JSON.parse(first.stdout), b=JSON.parse(second.stdout);
    assert.deepEqual(a.results.map(r=>r.label),['worse','better','bad']);
    assert.deepEqual(a.results.map(r=>r.valid),[true,true,false]);
    assert.equal(a.results[0].score,100);
    assert.ok(a.results[1].score < a.results[0].score);
    assert.deepEqual(a.results.map(r=>r.score),b.results.map(r=>r.score));
    assert.ok(a.results[2].error);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
