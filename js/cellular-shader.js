const shaderParkUrl =
  "https://unpkg.com/shader-park-core/dist/shader-park-core.esm.js";

function detectShaderDefaults() {
  const screenW = window.screen.width;
  const screenH = window.screen.height;
  const dpr = window.devicePixelRatio || 1;
  const screenPixels = screenW * screenH;

  // 4K and other large / high-DPI displays: lower internal resolution and cap FPS.
  if (screenPixels >= 3840 * 2160 || screenW >= 2560) {
    return { maxDpr: 1, renderScale: 0.32, maxPixelWidth: 768, maxPixelHeight: 432, targetFps: 30 };
  }
  if (screenPixels >= 2560 * 1440 || dpr >= 2) {
    return { maxDpr: 1, renderScale: 0.38, maxPixelWidth: 896, maxPixelHeight: 504, targetFps: 30 };
  }
  return { maxDpr: 1, renderScale: 0.45, maxPixelWidth: 1024, maxPixelHeight: 576, targetFps: 60 };
}

function getShaderConfig() {
  return { ...detectShaderDefaults(), ...(window.BTR_SHADER_CONFIG || {}) };
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let activeCleanup = null;
let activeResize = null;
let resizeTimer = null;
let initGeneration = 0;

function cleanupActiveRenderer() {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
  activeResize = null;
}

function createContainerRenderer(canvas, container, fragmentSource, vertexSource) {
  let frameId = 0;
  let disposed = false;
  let isVisible = true;
  let isDocumentVisible = !document.hidden;
  let lastDrawTime = 0;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 not available");

  const vertices = [-1.0, -1.0, 0.0, 3.0, -1.0, 0.0, -1.0, 3.0, 0.0];
  const indices = [0, 1, 2];

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  const vertShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertShader, vertexSource);
  gl.compileShader(vertShader);

  const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragShader, fragmentSource);
  gl.compileShader(fragShader);

  const logShaderCompile = (shader, label) => {
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(`${label} shader compile log:`, gl.getShaderInfoLog(shader));
    }
  };
  logShaderCompile(vertShader, "Vertex");
  logShaderCompile(fragShader, "Fragment");

  const program = gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link log:", gl.getProgramInfoLog(program));
  }

  gl.useProgram(program);
  const coord = gl.getAttribLocation(program, "coordinates");
  gl.vertexAttribPointer(coord, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(coord);
  gl.clearColor(1.0, 1.0, 1.0, 0.9);

  const startTime = Date.now();
  const timeLoc = gl.getUniformLocation(program, "time");
  const scaleLoc = gl.getUniformLocation(program, "_scale");
  const resolutionLoc = gl.getUniformLocation(program, "resolution");
  const opacityLoc = gl.getUniformLocation(program, "opacity");
  gl.uniform1f(opacityLoc, 1.0);
  gl.uniform1f(scaleLoc, 1.0);

  let renderWidth = 1;
  let renderHeight = 1;

  function resizeCanvas() {
    const { maxDpr, renderScale, maxPixelWidth, maxPixelHeight } = getShaderConfig();
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    let width = Math.max(1, Math.floor(rect.width * dpr * renderScale));
    let height = Math.max(1, Math.floor(rect.height * dpr * renderScale));

    if (width > maxPixelWidth || height > maxPixelHeight) {
      const fitScale = Math.min(maxPixelWidth / width, maxPixelHeight / height);
      width = Math.max(1, Math.floor(width * fitScale));
      height = Math.max(1, Math.floor(height * fitScale));
    }

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    renderWidth = width;
    renderHeight = height;
    return { width, height };
  }

  function resize() {
    if (disposed) return;
    resizeCanvas();
  }

  function draw(timestamp) {
    if (disposed) return;
    frameId = window.requestAnimationFrame(draw);

    if (!isVisible || !isDocumentVisible || prefersReducedMotion()) return;

    const { targetFps = 60 } = getShaderConfig();
    const frameInterval = 1000 / targetFps;
    if (timestamp - lastDrawTime < frameInterval) return;
    lastDrawTime = timestamp;

    gl.uniform1f(timeLoc, (Date.now() - startTime) * 0.001);
    gl.uniform2fv(resolutionLoc, [renderWidth, renderHeight]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  }

  function setVisible(nextVisible) {
    isVisible = nextVisible;
    if (isVisible && isDocumentVisible && !prefersReducedMotion()) {
      lastDrawTime = 0;
    }
  }

  function setDocumentVisible(nextVisible) {
    isDocumentVisible = nextVisible;
    if (isDocumentVisible && isVisible && !prefersReducedMotion()) {
      lastDrawTime = 0;
    }
  }

  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      setVisible(entries.some((entry) => entry.isIntersecting));
    },
    { root: null, threshold: 0 }
  );
  visibilityObserver.observe(container);

  const onDocumentVisibility = () => {
    setDocumentVisible(!document.hidden);
  };
  document.addEventListener("visibilitychange", onDocumentVisibility);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener("resize", resize);
  resizeCanvas();
  frameId = window.requestAnimationFrame(draw);

  return {
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onDocumentVisibility);
      visibilityObserver.disconnect();
      resizeObserver.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
    resize,
  };
}

async function initShaderPark(canvas, container) {
  const { sculptToFullGLSLSource, minimalVertexSource } = await import(shaderParkUrl);
  const shader = `
    setMaxIterations(3);
    setStepSize(0.55);
    setGeometryQuality(0.08);

    let t = time * 0.01;

    let pathRadius = 0.5;
    let pathSpeed = 0.15;

    let px = sin(time * pathSpeed * 1.0) * pathRadius;
    let py = cos(time * pathSpeed * 0.7) * pathRadius * 0.6;
    let pz = sin(time * pathSpeed * 1.3 + 1.5) * pathRadius * 0.8;

    displace(px, py, pz);

    rotateY(time * pathSpeed * 1.3 + sin(time * 0.1) * 0.4);
    rotateZ(cos(time * pathSpeed * 1.0) * 0.4);
    rotateX(sin(time * pathSpeed * 1.3 + 1.5) * 0.3);

    rotateY(sin(time * 0.1) * 0.01);
    rotateZ(sin(time * 0.5) * 0.05);
    rotateX(cos(time * 0.45) * 0.06);

    let s = getSpace();
    let flatSpace = vec3(s.x, s.y, s.z * 2.2);
    setSpace(flatSpace);

    let wobble = noise(flatSpace * 1.3 + vec3(0, t * 0.6, 0)) * 0.025;
    let breath = sin(time * 0.7) * 0.012;

    let ciliaWave = noise(flatSpace * 24.0 + vec3(0, t * 6.0, 0)) * 0.012;
    let ciliaWave2 = noise(flatSpace * 32.0 + vec3(t * 4.0, 0, 0)) * 0.008;
    let cilia = ciliaWave + ciliaWave2;

    let grain = fractalNoise(flatSpace * 2.5 + vec3(t * 0.15, 0, 0));
    let detail = fractalNoise(flatSpace * 6.0 + vec3(0, t * 0.2, 0));
    let pore = noise(flatSpace * 12.0 + vec3(t * 0.1, 50.0, 100.0));
    let tone = grain * 0.5 + detail * 0.85 + pore * 0.15;
    tone = smoothstep(0.34, 0.66, tone);

    let gray = -tone;
    color(vec3(gray));

    metal(1.0);
    shine(0.8);

    blend(0.15);

    displace(0, 0.15, 0);
    sphere(0.25 + wobble + breath + cilia);
    reset();

    displace(0, -0.25, 0);
    sphere(0.12 + wobble * 0.7 + cilia);
    reset();

    displace(0, -0.05, 0);
    sphere(0.28 + wobble * 0.8 + cilia);
  `;

  const fragmentSource = sculptToFullGLSLSource(shader);
  return createContainerRenderer(canvas, container, fragmentSource, minimalVertexSource);
}

async function initCellularMotion() {
  const generation = ++initGeneration;
  cleanupActiveRenderer();

  const container = document.querySelector(".hero");
  const canvas = document.getElementById("cellular-canvas");
  if (!container || !canvas) return;

  const renderer = await initShaderPark(canvas, container);
  if (generation !== initGeneration) {
    renderer.dispose();
    return;
  }

  activeCleanup = renderer.dispose;
  activeResize = renderer.resize;
}

function scheduleResize() {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    activeResize?.();
  }, 50);
}

window.addEventListener("btr:render", initCellularMotion);
window.addEventListener("btr:resize", scheduleResize);
window.addEventListener("resize", scheduleResize);
window.addEventListener("orientationchange", scheduleResize);
initCellularMotion();
