# ShiftTwin visual asset provenance

ShiftTwin keeps the public demo self-hosted. No 3D model is fetched from an external host at runtime.

## Worker mannequin and animation clips

- **Visual:** KayKit neutral `Mannequin_Medium`
- **Animations:** KayKit `Rig_Medium_MovementBasic` and `Rig_Medium_General`
- **Creator:** Kay Lousberg / KayKit
- **License:** CC0 1.0
- **Used as:** anonymous factory-worker visual with runtime safety helmet and neutral material treatment
- **Source path used for the vendored files:** the KayKit reference/animation copies in `NoLimitNexus/game-models`
- **Files:** `public/models/worker.glb`, `worker-movement.glb`, `worker-general.glb`

The imported model carries no employee identity. ShiftTwin shows at most one fully rigged worker per workcell and uses lightweight anonymous staffing markers for additional assigned positions to protect frame rate.

## Vehicle

- **Visual:** `sedan.glb` from Kenney Car Kit
- **Creator:** Kenney
- **License:** CC0 1.0
- **Source path used for the vendored file:** Kenney CC0 mirror in `Hidencod/tge-assets/packs/car-kit/sedan.glb`
- **File:** `public/models/sedan.glb`

The sedan is deliberately generic. ShiftTwin adds neutral runtime material treatment and does not use manufacturer names, logos or recognizable branded vehicle styling.

## Industrial robot

- **Visual:** `robot-arm-a.glb` from Kenney Factory Kit
- **Creator:** Kenney
- **License:** CC0 1.0
- **Source path used for the vendored file:** a Kenney Factory Kit copy in `HunterHo07/O1-3d-Assets-1`
- **File:** `public/models/robot-arm-a.glb`

The model contains a hierarchical base, six arm elements and two claw meshes. ShiftTwin drives those joints from the existing station-work cycle; the imported arm does not play a decorative canned sequence.

## Environment

The current v1.3 Phase 2 build keeps ShiftTwin's local procedural cube-map environment. A candidate HDR transfer was rejected during integration because the copied blob was incomplete; no broken or externally fetched HDR is shipped.

The factory hall geometry, reflective floor, structural steel, glazing and lighting are generated in the application and are therefore self-authored.

## Runtime policy

- all runtime model URLs resolve under `import.meta.env.BASE_URL`;
- external asset CDN URLs fail CI through `npm run check:runtime-assets`;
- `npm run check:assets` fails if the self-hosted model payload exceeds 3 MiB or contains an empty asset.
