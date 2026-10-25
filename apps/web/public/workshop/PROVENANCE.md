# Botanical Studio assets

All room geometry and maps are original Kestrel work. No Bruno Simon geometry, texture atlases, videos, or other assets are redistributed.

- `floor-ao.png`, `back-ao.png`, `left-ao.png`: generated with `node scripts/bake-workshop.mjs`. 256 × 256 grayscale ambient-occlusion maps; 48 deterministic cosine-weighted hemisphere samples against the fixed wall/furniture envelopes. These are static occlusion approximations, not full global-illumination lightmaps. Dynamic apparatus and robots are excluded and cast real-time shadows.
- Oak grain, staggered floorboards, stone and plaster: deterministic canvas textures authored in `studioMaterials.ts`, generated locally at runtime. They include subtle bump detail. No network asset service is involved.
- The filtered reflection environment is generated with the installed Three.js `RoomEnvironment` helper. It is not a photographic HDRI.

Implementation reference: Bruno Simon's `my-room-in-3d` at `5d00b3f870da81f103e901e0d12e20bbcc816834`, especially the separation of baked room surfaces from animated objects. Our AO maps are a simpler, original adaptation; they do not reproduce his three 4096² day/night/neutral atlases.
