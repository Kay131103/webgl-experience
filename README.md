# 🌌 NEBULA

An interactive WebGL particle galaxy — 25,000 GPU-driven particles with differential
rotation, cursor "gravity wells" that bend spacetime, and an optional **audio-reactive**
mode that pulses the whole galaxy to your microphone. Pure visual wow, zero backend.

## Try it
- **Move the cursor** — particles bend away from you
- **Drag** — orbit · **Scroll** — zoom · **Double-click** — swap color palette
- **🎙 Audio-reactive** — talk/play music, watch the galaxy pulse

## How it works
- Custom GLSL vertex/fragment shaders — all animation happens on the GPU; JS only
  pushes a few uniforms per frame (time, pointer raycast, mic amplitude).
- Pointer position is raycast onto a camera-facing plane through the galaxy core,
  so the gravity well feels correct from any orbit angle.
- Mic FFT → smoothed amplitude → shader uniform. No audio is stored or uploaded.
- Built with [Three.js](https://threejs.org), deployed as a static site.

**Cost:** $0. Static hosting only (Cloudflare Pages / Netlify / GitHub Pages).

## Dev
```bash
npm install
npm run dev      # → http://localhost:5173
```

## Build & deploy
```bash
npm run build    # → dist/
```
Cloudflare Pages: build command `npm run build`, output directory `dist`.
