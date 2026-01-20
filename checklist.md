- Avoid calling get(droneControl) every frame; subscribe once and cache; read drone.position for actual position.

- Don't store heavy Scene/mesh objects in stores; store IDs/minimal state and ensure explicit cleanup.

- Centralize store updates and lifecycle cleanup to stop scattered imperative mutations and per-frame store.get().