// Attempt to load GLSL sources from static files at runtime, falling back to embedded strings
let _vertex = `precision highp float;
// Attributes
attribute vec3 position;
attribute vec2 uv;
// Uniforms
uniform mat4 worldViewProjection;
// Varyings
varying vec3 vPosition;
varying vec2 vUV;
void main() {
    vPosition = position;
    vUV = uv;
    gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

let _fragment = `precision highp float;
varying vec3 vPosition;
varying vec2 vUV;
uniform float iTime;
uniform vec2 iResolution;

// Minimal, soft gradient: dominant black with a warm red band (~30%) and
// a small orange highlight near the far end (~5%). No stars, no noise.
void main() {
    float z = (vPosition.z + 500.0) / 1000.0;
    z = clamp(z, 0.0, 1.0);

    vec3 black = vec3(0.0);
    vec3 red = vec3(0.80, 0.06, 0.05);
    vec3 orange = vec3(0.95, 0.45, 0.10);

    vec3 color = black;

    float redCenter = 0.8;
    float redWidth = 0.30;
    float redMask = smoothstep(redCenter - redWidth * 0.5, redCenter + redWidth * 0.5, z);
    redMask = smoothstep(0.0, 1.0, redMask);

    float orangeStart = 0.95;
    float orangeWidth = 0.05;
    float orangeMask = smoothstep(orangeStart, orangeStart + orangeWidth, z);

    color = mix(color, red, redMask);
    color = mix(color, orange, orangeMask);

    float r = length(vPosition.xy) / 40.0;
    float vign = smoothstep(0.95, 0.2, r);
    color *= vign;

    color = pow(color, vec3(0.95));
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
}
`;

// Helper: tries to fetch a static shader file relative to the site root
async function _fetchShader(path: string): Promise<string | null> {
    try {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.text();
    } catch (e) {
        return null;
    }
}

// Public loader that will attempt to replace embedded sources with fetched ones.
export async function loadExternalShaders(): Promise<void> {
    // prefer .vert/.frag, then fall back to older .vert.glsl/.frag.glsl
    const v = await _fetchShader('/static/shaders/universe.vert') || await _fetchShader('/shaders/universe.vert') ||
              await _fetchShader('/static/shaders/universe.vert.glsl') || await _fetchShader('/shaders/universe.vert.glsl');
    const f = await _fetchShader('/static/shaders/universe.frag') || await _fetchShader('/shaders/universe.frag') ||
              await _fetchShader('/static/shaders/universe.frag.glsl') || await _fetchShader('/shaders/universe.frag.glsl');
    if (v) _vertex = v;
    if (f) _fragment = f;
}

export const vertex = _vertex;
export const fragment = _fragment;
