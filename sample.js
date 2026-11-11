// Putt Lab sample putt: renders the overhead tripod view of a putt (camera above the putter, offset to the far
// side of the line), frame by frame, with a known tempo, path, start line and backstroke.
(function (root) {
  "use strict";
  const R = 2.1335;
  function makeSample(W, H, spec) {
    const s = Object.assign({ camF: -12, camOut: 40, camH: 115, lookF: -12, hfov: 64, puttFt: 8, aimF: 52, backS: 0.66, fwdS: 0.34, lenCm: 25, pathDeg: 2, startDeg: 0.8,
      hand: "R", fps: 30, address: 1.0, after: 0.9, seed: 7, noise: 0, flicker: 0 }, spec || {});
    const side = s.hand === "L" ? -1 : 1; // +1: golfer on the left of the line (y > 0)
    // world: x = toward target, y = golfer's side for a right-hander, z = up. Lateral "right of the line" X = -y.
    const C = [s.camF, -side * s.camOut, s.camH], T = [s.lookF, 0, 0];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l); }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const fwd = nrm(sub(T, C)); let right = [1, 0, 0]; right = nrm(sub(right, fwd.map(v => v * dot(right, fwd)))); const down = cross(fwd, right);
    const f = (W / 2) / Math.tan(s.hfov / 2 * Math.PI / 180), cx = W / 2, cy = H / 2;
    const P = (x, y, z) => { const d = sub([x, y, z], C), zc = dot(d, fwd); return { x: cx + f * dot(d, right) / zc, y: cy + f * dot(d, down) / zc, z: zc }; };
    const PX = (F, X, Z) => P(F, -X, Z || 0); // ball-relative helpers: F forward, X right of the line
    let seed = s.seed; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const tex = document.createElement("canvas"); tex.width = W; tex.height = H; const tc = tex.getContext("2d");
    tc.fillStyle = "#4a8d40"; tc.fillRect(0, 0, W, H);
    const id = tc.getImageData(0, 0, W, H); for (let i = 0; i < id.data.length; i += 4) { const n = (rnd() - 0.5) * 22; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n * 0.6; } tc.putImageData(id, 0, 0);
    const tImp = s.address + s.backS + s.fwdS, dur = tImp + s.after;
    const tanP = Math.tan(s.pathDeg * Math.PI / 180) * side, tanS = Math.tan(s.startDeg * Math.PI / 180);
    const ease = u => u * u * (3 - 2 * u);
    function face(t) {
      if (t <= s.address) return -R;
      if (t <= s.address + s.backS) return -R - s.lenCm * ease((t - s.address) / s.backS);
      if (t <= tImp) { const u = (t - s.address - s.backS) / s.fwdS; return -R - s.lenCm * (1 - u * u); }
      const u = Math.min(1, (t - tImp) / 0.35); return -R + s.lenCm * 0.55 * (1 - (1 - u) * (1 - u));
    }
    const L = s.puttFt * 30.48;
    const ballF = t => { if (t <= tImp) return 0; const v0 = Math.sqrt(2 * 62 * L), tt = t - tImp; return Math.min(L, v0 * tt - 0.5 * 62 * tt * tt); };
    const poly = (ctx, pts, fill) => { if (pts.some(p => p.z <= 1)) return; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    const blob = (ctx, F, X, Z, rad, fill) => { const c = PX(F, X, Z); if (c.z <= 1) return; ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(c.x, c.y, f * rad / c.z, 0, 6.283); ctx.fill(); };
    function draw(ctx, t, opt) {
      ctx.drawImage(tex, 0, 0);
      // aim marker: a coin on the line
      { const c = []; for (let a = 0; a < 20; a++) c.push(PX(s.aimF + 1.2 * Math.cos(a / 20 * 6.283), 1.2 * Math.sin(a / 20 * 6.283), 0.1)); poly(ctx, c, "#c9c4b4"); }
      // shoes on the golfer's side
      for (const F of [-16, 16]) { const c = []; for (let a = 0; a < 16; a++) c.push(PX(F + 15 * Math.sin(a / 16 * 6.283), -side * (46 + 5 * Math.cos(a / 16 * 6.283)), 0)); poly(ctx, c, "#22252a"); }
      const fc = face(t), off = fc + R, Xp = tanP * off, bF = ballF(t), bX = tanS * bF;
      const items = [];
      if (!(opt && opt.hideBall)) items.push({ z: PX(bF, bX, R).z, fn: () => { const c = PX(bF, bX, R), rr = f * R / c.z; const g = ctx.createRadialGradient(c.x - rr * .3, c.y - rr * .3, rr * .1, c.x, c.y, rr); g.addColorStop(0, "#fff"); g.addColorStop(1, "#d8dcd6"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, 6.283); ctx.fill(); } });
      items.push({ z: PX(fc - 2, Xp, 1).z, fn: () => {
        const hw = 5.5, dp = 4, hh = 2.6, F0 = fc - dp, F1 = fc, xo = Xp + hw * side, xi = Xp - hw * side; // xo: far (outside) side
        poly(ctx, [PX(F0, xo, 0), PX(F1, xo, 0), PX(F1, xo, hh), PX(F0, xo, hh)], "#2b2f35");
        poly(ctx, [PX(F0, xi, 0), PX(F0, xo, 0), PX(F0, xo, hh), PX(F0, xi, hh)], "#2b2f35");
        poly(ctx, [PX(F0, xi, hh), PX(F0, xo, hh), PX(F1, xo, hh), PX(F1, xi, hh)], "#8d949c");
        const heel = PX(fc - 2, Xp - side * 4, hh), hands = PX(fc * 0.4 + 3, -side * 22, 78);
        if (hands.z > 1) { ctx.strokeStyle = "#c9ced3"; ctx.lineWidth = Math.max(1.2, f * 0.9 / hands.z); ctx.beginPath(); ctx.moveTo(heel.x, heel.y); ctx.lineTo(hands.x, hands.y); ctx.stroke(); }
        blob(ctx, fc * 0.4 + 3, -side * 22, 78, 5, "#b98b6c");
      } });
      items.sort((a, b) => b.z - a.z).forEach(it => it.fn());
      if (s.noise) { const im = ctx.getImageData(0, 0, W, H), dd = im.data, gain = 1 + (rnd() - 0.5) * s.flicker; for (let i = 0; i < dd.length; i += 4) { const n = (rnd() - 0.5) * s.noise; dd[i] = dd[i] * gain + n; dd[i + 1] = dd[i + 1] * gain + n; dd[i + 2] = dd[i + 2] * gain + n; } ctx.putImageData(im, 0, 0); }
    }
    return { W, H, dur, fps: s.fps, spec: s, draw, ballTap: PX(0, 0, R), aimTap: PX(s.aimF, 0, 0),
      truth: { ratio: s.backS / s.fwdS, back: s.backS, through: s.fwdS, pathDeg: s.pathDeg, startDeg: s.startDeg, lengthIn: s.lenCm / 2.54 } };
  }
  root.PuttSample = { makeSample };
})(window);
