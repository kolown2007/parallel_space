precision highp float;

varying vec3 vNormalW;
varying vec2 vUV;

uniform vec3 uColor;

void main(void) {
    vec3 light = normalize(vec3(0.5, 1.0, 0.6));
    float ndl = max(dot(normalize(vNormalW), light), 0.0);
    vec3 col = uColor * (0.2 + 0.8 * ndl);
    gl_FragColor = vec4(col, 1.0);
}
