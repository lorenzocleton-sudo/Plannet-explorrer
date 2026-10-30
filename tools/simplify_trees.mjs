// reduce each part with meshoptimizer's "sloppy" simplifier (ignores topology, keeps all vertex data)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const [,, inp, out, barkS, leafS] = process.argv;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const leaf = /leave/i.test(prim.getMaterial()?.getName() || ''), ratio = +(leaf ? leafS : barkS);
  const idx = prim.getIndices(), pos = prim.getAttribute('POSITION');
  const ia = Uint32Array.from(idx.getArray()), target = Math.max(3, Math.floor(ia.length * ratio / 3) * 3);
  const [res] = MeshoptSimplifier.simplifySloppy(ia, pos.getArray(), 3, null, target, 1);
  idx.setArray(pos.getCount() > 65535 ? res : Uint16Array.from(res));
}
await doc.transform(dedup(), prune());
await io.write(out, doc);
