Title: WebGPU texture lifetime / GLB texture loss on refresh (Windows)

Summary
-------
On Windows, while running the project with the WebGPU engine enabled, meshes (GLB model "jollibee") sometimes render as a white silhouette after a refresh. The browser console shows WebGPU GPUValidationError messages about destroyed textures used in a submit. The issue appears related to two problems that occur together:

1) WebGPU texture lifetime / swapchain shared-image destruction on Windows (GPUValidationError: "Destroyed texture ... used in a submit").
2) GLB asset cloning/instancing behavior that sometimes results in clones/instances losing their texture bindings on refresh/cache.

Repro steps
-----------
1. Clone the repository and install deps:
   - npm install
2. Start dev server:
   - npm run dev
3. Open the app on Windows (Chrome/Edge with WebGPU enabled) and navigate to the scene.
4. On first load models may appear textured. Refresh the page.
5. Observe that the Jollibee model(s) render as white silhouettes (no albedo textures visible) and console contains WebGPU validation errors.

Observed behavior
-----------------
- Console shows repeated WebGPU validation errors similar to:
  "WebGPU uncaptured error: GPUValidationError - Destroyed texture [Texture \"D3DImageBacking_...\"] used in a submit. - While calling [Queue].Submit([[CommandBuffer from CommandEncoder \"upload\"], [CommandBuffer from CommandEncoder \"render\"]])"
- GLB load log appears: "Loaded model jollibee successfully: __root__, node0"
- Immediately after spawn, asset creation logs: "Asset jollibee spawn: mesh=... material=... textures=[]" or warnings that clones have no material.
- Physics aggregation occasionally fails with: "Error creating asset: Error: No valid mesh was provided for mesh or convex hull shape parameter. Please provide a mesh with valid geometry (number of vertices greater than 0)."

Expected behavior
-----------------
- Models should keep their albedo/baseColor textures after refresh and not display as white silhouettes.
- No GPUValidationError should occur during normal rendering.

Environment
-----------
- OS: Windows (observed)
- Browsers: Chrome / Edge (WebGPU path)
- Babylon.js: v8.10.0
- Engine selection: WebGPUEngine (used on supported platforms by default)
- Project: parallel_space (local dev)

Relevant files (local)
----------------------
- src/lib/parallel2/engine.ts  (engine selection / WebGPU fallback implemented)
- src/lib/parallel2/assets.ts  (asset load/clone/instance and debug logging)
- src/lib/parallel2/mainScene.ts (scene init / markers / temporary camera light)

Temporary workarounds we applied
--------------------------------
- Force fallback to WebGL on Windows (engine chooses WebGL if userAgent indicates Windows). This avoids the WebGPU GPUValidationError.
- Added a cache-busting query param for local dev GLB loads to reduce stale/corrupted cache issues.
- Modified asset creation: prefer Mesh.createInstance(), fallback to clone, and when clones/instances lack textures, reassign the original source material. Created invisible physics clones to avoid attaching physics to instanced meshes.

Suggested investigation steps for maintainers
--------------------------------------------
1. Investigate Windows/WebGPU D3D shared-surface / swapchain texture lifetime behavior. The GPUValidationError indicates the platform/driver destroyed a swap or shared texture while it was still referenced by a command buffer. Check WebGPU backend (D3D12) and swapchain/unique image lifetime handling.
2. Reproduce with a minimal WebGPU sample that uploads a texture then renders a mesh repeatedly across reloads to confirm driver/swapchain issue.
3. Review GLTF loader / cloning semantics with respect to texture references when cloning meshes/instances on repeated loads. Ensure that cloned materials maintain texture references even after cache reloads.
4. Consider making loader clone/instance logic robust: when creating clones, clone the material and explicitly copy texture references (albedo/baseColor/diffuse/emissive/etc.). For physics, clone an invisible mesh to host PhysicsAggregate rather than using instances.

How to provide additional debugging info
---------------------------------------
- Reproduce the issue and capture console logs (copy stack traces and full WebGPU messages).
- Supply output of chrome://gpu and navigator.userAgent, and GPU driver version.
- If possible, test in alternate browsers (Firefox Nightly) or with updated GPU drivers to see if behavior changes.

Suggested immediate fixes
------------------------
- Short-term: prefer WebGL on Windows (done as a stable fallback).
- Medium-term: harden GLTF clone/instance code to preserve material texture bindings across reloads (clone materials and copy texture references explicitly).
- Long-term: file a WebGPU/driver bug with the browser vendor if the GPUValidationError persists after driver updates.

Contact / Attachments
---------------------
- Logs and console traces included above. If you want I can attach full console output and a small repro branch with the minimal test case.

-- End of report
