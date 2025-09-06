precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 worldViewProjection;
uniform mat4 world;
uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;

varying vec3 vNormalW;
varying vec2 vUV;

void main(void) {
    vUV = uv;
    vNormalW = normalize((world * vec4(normal, 0.0)).xyz);

    vec3 worldPos = (world * vec4(position, 1.0)).xyz;
    float angle = atan(worldPos.z, worldPos.x);

    // sinusoidal deformation around major circle
    float offset = sin(angle * uFrequency + uTime) * uAmplitude;

    vec3 displaced = position + normal * offset;

    gl_Position = worldViewProjection * vec4(displaced, 1.0);
}
