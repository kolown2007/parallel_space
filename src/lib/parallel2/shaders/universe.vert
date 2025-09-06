precision mediump float;

// Attributes
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

// Uniforms
uniform mat4 worldViewProjection;
uniform mat4 world;
uniform vec3 cameraPosition;

// Varyings
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewDirection;
varying vec2 vUV;

void main() {
    // Transform position to world space
    vec4 worldPos = world * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    
    // Transform normal to world space
    vNormal = normalize((world * vec4(normal, 0.0)).xyz);
    
    // Calculate view direction for fresnel effect
    vViewDirection = normalize(cameraPosition - vWorldPosition);
    
    // Pass through other varyings
    vPosition = position;
    vUV = uv;
    
    // Transform to clip space
    gl_Position = worldViewProjection * vec4(position, 1.0);
}
