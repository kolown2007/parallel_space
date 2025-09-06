precision mediump float;

// Uniforms
uniform vec2 iResolution;
uniform float iTime;
uniform sampler2D uTexture; // Optional texture

// Varyings from vertex shader
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewDirection;
varying vec2 vUV;

// Procedural noise function for dynamic textures
float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smooth interpolation
    
    float a = noise(i);
    float b = noise(i + vec2(1.0, 0.0));
    float c = noise(i + vec2(0.0, 1.0));
    float d = noise(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    vec2 st = gl_FragCoord.xy / iResolution;
    
    // Normalize the normal and view direction
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewDirection);
    
    // === STATIC SECTIONAL COLORS FOR POSITION REFERENCE ===
    
    // 1. Create sections based on world position around the torus
    float angle = atan(vWorldPosition.z, vWorldPosition.x); // Angle around torus
    float sectionAngle = angle + 3.14159; // Normalize to 0-2π
    
    // 2. Create smooth interpolation between sections
    float numSections = 8.0;
    float normalizedAngle = sectionAngle / (6.28318 / numSections); // 0-8 range
    
    // 3. Define vibrant section colors
    vec3 sectionColors[8];
    sectionColors[0] = vec3(1.0, 0.0, 0.0);    // Red
    sectionColors[1] = vec3(1.0, 0.5, 0.0);    // Orange  
    sectionColors[2] = vec3(1.0, 1.0, 0.0);    // Yellow
    sectionColors[3] = vec3(0.0, 1.0, 0.0);    // Green
    sectionColors[4] = vec3(0.0, 1.0, 1.0);    // Cyan
    sectionColors[5] = vec3(0.0, 0.0, 1.0);    // Blue
    sectionColors[6] = vec3(0.5, 0.0, 1.0);    // Purple
    sectionColors[7] = vec3(1.0, 0.0, 1.0);    // Magenta
    
    // 4. Create smooth transitions between sections
    float transitionWidth = 1.0; // How wide the transition zone is (0-1) - increased for smoother blending
    
    float currentSectionFloat = floor(normalizedAngle);
    int currentSection = int(mod(currentSectionFloat, 8.0));
    int nextSection = int(mod(currentSectionFloat + 1.0, 8.0));
    float sectionProgress = fract(normalizedAngle);
    
    vec3 currentColor = sectionColors[currentSection];
    vec3 nextColor = sectionColors[nextSection];
    
    // Create smooth transition only at boundaries
    float transitionFactor;
    if (sectionProgress < transitionWidth * 0.5) {
        // Transition from previous section
        int prevSection = int(mod(currentSectionFloat + 7.0, 8.0)); // currentSection - 1, wrapped
        vec3 prevColor = sectionColors[prevSection];
        float t = (sectionProgress + (1.0 - transitionWidth * 0.5)) / transitionWidth;
        t = smoothstep(0.0, 1.0, t);
        currentColor = mix(prevColor, currentColor, t);
    } else if (sectionProgress > (1.0 - transitionWidth * 0.5)) {
        // Transition to next section
        float t = (sectionProgress - (1.0 - transitionWidth * 0.5)) / transitionWidth;
        t = smoothstep(0.0, 1.0, t);
        currentColor = mix(currentColor, nextColor, t);
    }
    
    vec3 sectionColor = currentColor;
    
    // 5. Add subtle radial variation within each section
    float radialDist = length(vec2(vWorldPosition.x, vWorldPosition.z));
    float radialVariation = sin(radialDist * 0.1) * 0.2 + 0.8;
    
    // 6. Static tunnel wall texture (non-moving)
    vec2 staticUV = vUV;
    float tunnelTexture = smoothNoise(staticUV * 6.0);
    tunnelTexture += smoothNoise(staticUV * 12.0) * 0.5;
    tunnelTexture = tunnelTexture / 1.5; // Normalize
    
    // 7. Section transition boundaries - enhanced visibility
    float transitionZone = 0.15; // Width of transition zone
    float distFromBoundary = abs(sectionProgress - 0.5) * 2.0; // 0 at center, 1 at edges
    float boundaryEffect = 1.0 - smoothstep(1.0 - transitionZone, 1.0, distFromBoundary);
    
    // Create brighter highlights at section boundaries
    float boundaryHighlight = boundaryEffect * 0.7;
    
    // === BASE UNIVERSE COLORS WITH SECTIONAL MODULATION ===
    
    // Sample texture for each section
    vec2 textureUV = vUV * 2.0; // Scale texture for more detail
    vec3 textureColor = texture2D(uTexture, textureUV).rgb;
    
    // Boost sectional colors for better visibility from inside the tunnel
    vec3 boostedSectionColor = sectionColor * 1.5; // Increase color intensity
    
    // Blend texture with sectional color - reduce texture influence for stronger colors
    vec3 baseColor = boostedSectionColor * (0.85 + textureColor * 0.15); // Sectional color strongly dominates
    
    // Reduce depth darkening to keep colors more vibrant inside the tunnel
    float d = distance(st, vec2(0.5, 0.5));
    d = clamp(d, 0.0, 1.0);
    
    // Much lighter darkening towards edges to preserve color visibility
    float depthDarken = 1.0 - d * 0.1; // Reduced from 0.3 to 0.1
    baseColor *= depthDarken;
    
    // Apply radial variation within section
    baseColor *= radialVariation;
    
    // Apply static tunnel wall texture with reduced influence
    baseColor *= (0.9 + tunnelTexture * 0.1); // Reduced texture influence
    
    // Enhanced boundary highlights for better section transitions visibility
    baseColor += vec3(1.0, 1.0, 1.0) * boundaryHighlight * 1.5; // Increased highlight intensity
    
    // === 3D TUNNEL LIGHTING ENHANCEMENTS ===
    
    // 1. Enhanced directional lighting with tunnel depth
    vec3 lightDir1 = normalize(vec3(1.0, 2.0, 1.0));
    vec3 lightDir2 = normalize(vec3(-0.5, -1.0, 0.5));
    
    float ndotl1 = max(dot(normal, lightDir1), 0.0);
    float ndotl2 = max(dot(normal, lightDir2), 0.0) * 0.3;
    
    // Tunnel depth factor - light falloff based on distance from camera
    float tunnelDepth = length(vWorldPosition - vec3(0.0, 0.0, 0.0)); // Assuming camera at origin
    float depthFalloff = 1.0 / (1.0 + tunnelDepth * 0.008); // Gradual falloff
    
    // Combine lighting with depth falloff for tunnel effect
    float lighting = (0.3 + ndotl1 * 0.7 + ndotl2) * depthFalloff;
    
    // 2. Enhanced fresnel rim lighting for tunnel edges
    float fresnel = 1.0 - max(dot(normal, viewDir), 0.0);
    fresnel = pow(fresnel, 1.5); // Sharpen the effect for tunnel walls
    
    // Enhanced rim light - stronger on tunnel walls
    vec3 rimColor = vec3(0.4, 0.8, 1.2);
    vec3 rimLight = rimColor * fresnel * 1.2;
    
    // 3. Tunnel depth-based variation using world position
    float depth = length(vWorldPosition) * 0.01;
    float depthVariation = sin(depth * 3.14159 + iTime * 0.5) * 0.15 + 1.0;
    
    // 4. Tunnel atmospheric perspective - distant parts get hazier
    float atmosphericDepth = tunnelDepth * 0.012;
    float atmosphericFade = exp(-atmosphericDepth);
    vec3 fogColor = vec3(0.1, 0.15, 0.25); // Darker tunnel fog
    
    // 5. Static surface detail for consistent reference points
    vec2 detailUV = vUV * 12.0;
    float surfaceNoise = sin(detailUV.x * 6.28) * sin(detailUV.y * 6.28) * 0.08 + 1.0;
    
    // Add static detail patterns based on world position
    float staticDetail = smoothNoise(vWorldPosition.xz * 0.1) * 0.15 + 1.0;
    
    // 5. Subtle pulsing animation with tunnel breathing effect
    float pulse = sin(iTime * 1.5) * 0.12 + 1.0;
    
    // === COMBINE ALL TUNNEL EFFECTS WITH SECTIONAL COLORS ===
    vec3 finalColor = baseColor;
    
    // Apply tunnel lighting with depth
    finalColor *= lighting;
    
    // Apply depth variation
    finalColor *= depthVariation;
    
    // Apply static surface details
    finalColor *= surfaceNoise;
    finalColor *= staticDetail;
    
    // Apply tunnel pulse (subtle)
    finalColor *= pulse;
    
    // Add enhanced rim lighting for tunnel walls
    finalColor += rimLight;
    
    // Apply atmospheric perspective for tunnel depth
    finalColor = mix(fogColor, finalColor, atmosphericFade);
    
    // Ensure we don't exceed 1.0
    finalColor = clamp(finalColor, 0.0, 1.0);
    
    // Enhanced contrast for better tunnel depth perception
    finalColor = pow(finalColor, vec3(1.2));
    
    gl_FragColor = vec4(finalColor, 1.0);
}
