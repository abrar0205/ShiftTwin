# ShiftTwin visual asset provenance

ShiftTwin v1.4 uses **self-authored procedural Three.js geometry** for the public digital-twin scene.

## Why the asset strategy changed

The v1.3 renderer depended on third-party mirrored GLB copies. One robot model referenced an external texture that was not vendored, which caused a production 404 and an untextured robot. The worker animation bundle also shipped far more clips than the experience used.

Rather than re-publishing mirror-sourced files, v1.4 removes those runtime models entirely.

## v1.4 scene assets

The following visible objects are authored in the application from Three.js primitives and materials:

- factory hall, structural columns, trusses and glazing;
- line beds and station platforms;
- generic unbranded vehicle silhouettes;
- anonymous worker figures and safety helmets;
- articulated industrial robot silhouettes;
- andon towers, floor rings and status lighting.

No manufacturer logos, employee identities or externally hosted textures are used.

## Runtime policy

- model payload budget: **<= 0.50 MiB**;
- current model payload: **0 MiB**;
- npm run check:assets rejects any future GLB/GLTF with an external images[].uri or buffers[].uri;
- npm run check:runtime-assets rejects runtime asset CDN references;
- the factory remains fully functional with no external 3D asset host.

If imported models are reintroduced later, they must come from the creator's official distribution, have a recorded version/license/SHA-256, embed all dependencies, and pass the 0.50 MiB budget.
