**Gameplay Guide for "Chrono_Escape_2050"**

**Objective:**
Guide the drone through a time tunnel to reach the end, using dopamine fuel to maintain progress. Participants interact by tapping a heart button to provide fuel and can trigger brief scene changes by bumping into special objects.

**Core Mechanics:**

1. **Drone Control:**
   - The drone moves automatically through the tunnel.
   - Participants tap a heart button to provide dopamine fuel, which keeps the drone moving forward.

2. **Dopamine Fuel:**
   - Display a fuel gauge on the screen.
   - If the fuel depletes to zero, the drone begins to drift backward.
   - Participants must tap the heart button or collect heart-shaped power-ups to replenish fuel.

3. **Interactive Objects:**
   - Place distinct objects within the tunnel that trigger scene changes when bumped by the drone.
   - Each object triggers a different brief scene, offering visual or narrative experiences.

4. **Scene Changes:**
   - Design seamless transitions to and from these scenes.
   - Keep scenes brief (e.g., 5-10 seconds) to maintain the flow of the main gameplay.

5. **Visual and Audio Feedback:**
   - Use visual effects (e.g., flashes, color changes) and sound cues to indicate successful interactions, such as fuel replenishment or scene triggers.

6. **Continuous Play:**
   - The game runs continuously, allowing new participants to join at any time.
   - Design the experience to be engaging for both short and extended interactions.

7. **Collaborative Play:**
   - Multiple participants can tap the heart button simultaneously, encouraging collaboration.

**Design Elements:**

- **Visuals:**
  - Use vibrant and dynamic visuals to attract attention and enhance the immersive experience.
  - Design the tunnel with a futuristic aesthetic, incorporating elements that reflect the 2050 setting.

- **Audio:**
  - Implement a dynamic soundtrack that adapts to the gameplay, with variations for different scenes.
  - Use sound effects to reinforce actions, such as fuel collection and scene transitions.

**Development Considerations:**

- Ensure the game is intuitive and requires minimal instructions.
- Optimize for performance to handle multiple interactions simultaneously.
- Test the game in the installation environment to ensure it meets the desired engagement and accessibility goals.

---
roadmap 
 
### Implementation pointers

1. Use Babylon.js for the 3D runtime: keep a single authoritative scene instance on the display server and expose a small API (spawn, applyImpulse, triggerScene) for remote control.
2. Audience clients connect via a lightweight WebSocket gateway; client messages are translated server-side to the Babylon API calls (e.g., "fuel", "bump", "pulse").
3. Batch frequent inputs server-side (e.g., aggregate taps per second) to avoid flooding the render loop — send periodic deltas to the scene instead of every click.
4. Keep physics and heavy updates on the display server; let clients only send intent. Use short-lived lightweight ACKs for critical actions.
5. Rate-limit and sanitise incoming commands; implement simple authority (signed tokens or session ids) to prevent abuse.
6. For visuals, update only the minimal scene graph on each tick (e.g., fuel bar updates, spawn/despawn small items) to minimize draw and physics churn.
7. Visual inconsistency allowed: the wormhole aesthetic permits non‑literal visuals. Do not rely on rendered visuals for authoritative state — keep a separate server-side route/state that tracks the drone's canonical location inside the tunnel.
https://redis.io/industries/gaming/