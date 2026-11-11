// Putt Lab engine: analyzes a putting clip filmed from a tripod above the putter, looking down at the ball,
// offset to the far side of the line so the golfer can still see the putter head.
// Input: grayscale frames {t (s), g (Uint8Array W*H)}, the ball and an aim spot (a tee, coin or the hole)
// tapped on the first frame, and the setup (putt length, handedness). Scale comes from the ball's size.
(function (root) {
  "use strict";
  const BALL_R = 2.1335; // cm, regulation ball radius
  const deg = r => r * 180 / Math.PI;
  const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  function fitSlope(xs, ys) {
    const n = xs.length; if (n < 2) return null; let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; } mx /= n; my /= n;
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; } return sxx > 1e-9 ? sxy / sxx : null;
  }

  // the bright blob (the ball) nearest (cx, cy) within radius `rad`
  function findBlob(g, W, H, cx, cy, rad, thr, minArea) {
    const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(W - 1, Math.ceil(cx + rad)), y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(H - 1, Math.ceil(cy + rad));
    if (x1 < x0 || y1 < y0) return null;
    const bw = x1 - x0 + 1, seen = new Uint8Array(bw * (y1 - y0 + 1)); let best = null, bestD = Infinity;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = (y - y0) * bw + (x - x0); if (seen[k] || g[y * W + x] < thr) continue;
      let n = 0, sx = 0, sy = 0; const st = [k]; seen[k] = 1;
      while (st.length) {
        const q = st.pop(), qx = q % bw + x0, qy = (q / bw | 0) + y0; n++; sx += qx; sy += qy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = qx + dx, ny = qy + dy; if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue; const nk = (ny - y0) * bw + (nx - x0); if (seen[nk] || g[ny * W + nx] < thr) continue; seen[nk] = 1; st.push(nk); }
      }
      if (n < minArea) continue; const mx = sx / n, my = sy / n, d = Math.hypot(mx - cx, my - cy);
      if (d < bestD) { bestD = d; best = { x: mx, y: my, area: n }; }
    }
    return best;
  }
  function calibrateBall(g, W, H, tap, rad) {
    const R0 = rad || Math.max(10, Math.min(W, H) * 0.08); let mx = -1, mxx = tap.x, mxy = tap.y;
    for (let y = Math.max(0, tap.y - R0 | 0); y < Math.min(H, tap.y + R0); y++) for (let x = Math.max(0, tap.x - R0 | 0); x < Math.min(W, tap.x + R0); x++) {
      if (Math.hypot(x - tap.x, y - tap.y) > R0) continue; const v = g[y * W + x]; if (v > mx) { mx = v; mxx = x; mxy = y; } }
    const ring = []; for (let a = 0; a < 64; a++) { const x = Math.round(tap.x + R0 * 1.4 * Math.cos(a / 64 * 6.2832)), y = Math.round(tap.y + R0 * 1.4 * Math.sin(a / 64 * 6.2832)); if (x >= 0 && x < W && y >= 0 && y < H) ring.push(g[y * W + x]); }
    const bg = median(ring); if (mx - bg < 35) return null;
    const thr = bg + 0.5 * (mx - bg), b = findBlob(g, W, H, mxx, mxy, R0, thr, 3); if (!b) return null;
    return { x: b.x, y: b.y, r: Math.sqrt(b.area / Math.PI), area: b.area, thr };
  }

  function analyze(frames, W, H, taps, setup) {
    if (frames.length < 15) return { error: "The clip is too short. Record from address until the ball is rolling." };
    const hand = setup.hand === "L" ? -1 : 1;
    const ball = calibrateBall(frames[0].g, W, H, taps.ball);
    if (!ball) return { error: "Couldn't find the ball where you tapped. Tap right on the ball." };
    const r = Math.max(2, ball.r);
    if (Math.hypot(taps.aim.x - ball.x, taps.aim.y - ball.y) < 4 * r) return { error: "Tap an aim spot farther from the ball: a tee or coin a few feet down your line, or the hole." };
    const s = BALL_R / r; // cm per pixel at the ball, from the ball's real size
    // Parallax: the tripod sits above the putter and off to the far side, so anything above the ground (the ball's
    // center, the putter head) shows up shifted away from the point under the camera. Undo that using the tripod's
    // height and offset, so the ball's center maps to the spot where it touches the green.
    const camH = setup.camHcm || 114, camOut = setup.camOutCm == null ? 38 : setup.camOutCm, camF = -12;
    let xb = ball.x, yb = ball.y, ux = 0, uy = 0, nx = 0, ny = 0;
    for (let it = 0; it < 3; it++) {
      ux = taps.aim.x - xb; uy = taps.aim.y - yb; const ul = Math.hypot(ux, uy); ux /= ul; uy /= ul;
      const ox = -uy * hand, oy = ux * hand; // toward the far side of the line, away from the golfer
      nx = xb + (camF * ux + camOut * ox) / s; ny = yb + (camF * uy + camOut * oy) / s; // point under the camera
      const k = (camH - BALL_R) / camH; xb = nx + (ball.x - nx) * k; yb = ny + (ball.y - ny) * k;
    }
    const ground = (x, y, z) => { const k = (camH - z) / camH; return [nx + (x - nx) * k, ny + (y - ny) * k]; };
    // F: cm toward the target from the ball; X: cm to the right of the line (as you look down it from behind the ball)
    const world = (x, y, z) => { if (z) [x, y] = ground(x, y, z); return { F: ((x - xb) * ux + (y - yb) * uy) * s, X: ((x - xb) * -uy + (y - yb) * ux) * s }; };

    // 1) Ball: track it, find impact and the start line
    const trk = []; let px = ball.x, py = ball.y, vx = 0, vy = 0, moving = false, lost = 0;
    for (let i = 0; i < frames.length; i++) {
      // at rest, look up to ~10 cm around the spot (a putted ball can cover 6 cm in one frame); once rolling, follow its speed
      const pr = moving ? 2 * r + Math.hypot(vx, vy) * 1.5 + 2 : Math.max(2.5 * r, 10 / s);
      const b = findBlob(frames[i].g, W, H, px + vx, py + vy, pr, ball.thr, Math.max(2, ball.area * 0.45));
      if (b) { const wasMoving = moving; if (!moving && Math.hypot(b.x - ball.x, b.y - ball.y) > Math.max(1.2, 0.6 * r)) moving = true; if (moving) { vx = b.x - px; vy = b.y - py; if (!wasMoving) { vx *= 0.9; vy *= 0.9; } } px = b.x; py = b.y; lost = 0; trk.push({ i, x: b.x, y: b.y }); }
      else { trk.push(null); if (moving && ++lost > 3) break; }
    }
    let impact = -1;
    for (let j = 0; j < trk.length - 2; j++) {
      const a = trk[j], b = trk[j + 1], c = trk[j + 2]; if (!a || !b || !c) continue;
      const d0 = world(a.x, a.y, BALL_R).F, d1 = world(b.x, b.y, BALL_R).F, d2 = world(c.x, c.y, BALL_R).F;
      if (d0 > 0.4 && d1 > d0 && d2 > d1) { impact = Math.max(1, j); break; }
    }
    if (impact < 0) return { error: "The ball never rolled toward your aim spot in this clip. Keep recording until the ball is rolling, and check that the aim spot is down your line." };
    let tImpact = frames[impact].t;
    { const mv = []; for (let j = impact; j < trk.length && mv.length < 4; j++) if (trk[j]) mv.push({ t: frames[trk[j].i].t, D: world(trk[j].x, trk[j].y, BALL_R).F });
      if (mv.length >= 3) { const sl = fitSlope(mv.map(m => m.t), mv.map(m => m.D)); if (sl > 1) { const mt = mv.reduce((a, m) => a + m.t, 0) / mv.length, mD = mv.reduce((a, m) => a + m.D, 0) / mv.length, t0 = mt - mD / sl; if (t0 > frames[impact].t - 0.09 && t0 <= mv[0].t) tImpact = t0; } } }
    const ballPath = [];
    for (let j = impact; j < trk.length; j++) { const p = trk[j]; if (!p) continue; const w = world(p.x, p.y, BALL_R); ballPath.push({ x: p.x, y: p.y, F: w.F, X: w.X, t: frames[p.i].t }); }
    const use = ballPath.filter(p => p.F > 1 && p.F < 80);
    if (use.length < 2) return { error: "The ball left the shot right after impact. Give it a little more room ahead of the ball in the picture." };
    let sxy = 0, sxx = 0; for (const p of use) { sxy += p.X * p.F; sxx += p.F * p.F; }
    const startDeg = deg(Math.atan(sxy / sxx));
    const sp = ballPath.filter(p => p.t - tImpact < 0.25 && p.F > 0.5);
    const speed = sp.length >= 2 ? fitSlope(sp.map(p => p.t), sp.map(p => p.F)) : null;

    // 2) Putter: changes along the line, behind and around the ball
    const LAT = 13, DIFF = 28, notBall = (x, y) => Math.hypot(x - ball.x, y - ball.y) > 1.7 * r;
    const binOf = F => Math.round(F / s); // one bin per pixel along the line
    const zone = []; // pixel index, bin, lateral cm, outside the ball
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const w = world(x, y, 1.3); if (Math.abs(w.X) < LAT && w.F > -90 && w.F < 15) zone.push(y * W + x, binOf(w.F), w.X, notBall(x, y) ? 1 : 0); }
    const E = [0];
    for (let i = 1; i <= impact; i++) { const a = frames[i].g, b = frames[i - 1].g; let n = 0; for (let z = 0; z < zone.length; z += 4) if (zone[z + 3] && Math.abs(a[zone[z]] - b[zone[z]]) > DIFF) n++; E.push(n); }
    const dt = median(frames.slice(1, Math.min(frames.length, 40)).map((f, j) => f.t - frames[j].t)) || 1 / 30;
    const quietThr = Math.max(4, 3 * pct(E.slice(1), 0.2) + 2, r * r * 0.3);
    let q = 0; for (let i = impact - Math.round(0.15 / dt); i >= 4; i--) if (E[i] < quietThr && E[i - 1] < quietThr && E[i - 2] < quietThr && E[i - 3] < quietThr) { q = i; break; }
    const A = frames[q].g, minBin = Math.round(-90 / s), nb = Math.round(105 / s) + 2, binThr = Math.max(3, 3 / s); // a head-sized slice is 3+ cm across
    const back = [], edgeX = [], cnt = [];
    for (let i = q; i <= impact; i++) {
      const g = frames[i].g, bc = new Int32Array(nb), lo = new Float64Array(nb).fill(1e9), hi = new Float64Array(nb).fill(-1e9); let total = 0;
      for (let z = 0; z < zone.length; z += 4) { if (!zone[z + 3]) continue; if (Math.abs(g[zone[z]] - A[zone[z]]) > DIFF) { const k = zone[z + 1] - minBin, X = zone[z + 2]; bc[k]++; if (X < lo[k]) lo[k] = X; if (X > hi[k]) hi[k] = X; total++; } }
      cnt.push(total);
      let kb = -1; for (let k = 0; k < nb; k++) if (bc[k] >= binThr) { kb = k; break; } // rearmost head-sized slice
      if (kb < 0 || total < r * r * 0.4) { back.push(0); edgeX.push(null); continue; }
      back.push(-(kb + minBin) * s);
      // lateral center of the head = middle of its width over the rear slices (robust to which faces are in view)
      const mids = []; for (let k = kb; k < Math.min(nb, kb + Math.max(4, Math.round(2 / s))); k++) if (bc[k] >= binThr) mids.push((lo[k] + hi[k]) / 2);
      edgeX.push(mids.length ? median(mids) : null);
    }
    for (let j = 0; j < back.length; j++) if (back[j] < BALL_R + 1.5) back[j] = 0; // closer than that is a sliver, not the head
    const sm = back.map((v, j) => (back[Math.max(0, j - 1)] + v + back[Math.min(back.length - 1, j + 1)]) / 3);
    let t0 = -1; for (let j = 0; j < sm.length; j++) if (back[j] > 0 && sm[j] - sm[0] > 1.0 && cnt[j] > r * r * 0.4) { t0 = j; break; }
    if (t0 < 0) return { error: "Couldn't see the putter take back. Keep the putter head in the shot, and hold still for a second at address before you putt." };
    let top = t0; for (let j = t0; j < sm.length - 1; j++) if (sm[j] > sm[top]) top = j;
    let j0 = t0; while (j0 > 0 && back[j0 - 1] > 0 && back[j0 - 1] < back[j0] - 0.1) j0--;
    let tTop = frames[q + top].t;
    if (top > 0 && top < sm.length - 1) { const a = sm[top - 1], b = sm[top], c = sm[top + 1], den = a - 2 * b + c; if (den < 0) tTop += 0.5 * (a - c) / den * (frames[q + top + 1].t - frames[q + top].t); }
    let tT0 = frames[q + j0].t - 0.5 * dt;
    { // a backstroke eases away and eases into the top, close to symmetric: takeaway = top minus twice (top minus halfway)
      const base = back[j0], peak = sm[top], half = base + (peak - base) / 2;
      for (let j = j0 + 1; j <= top; j++) if (back[j] >= half && back[j - 1] < half) {
        const tm = frames[q + j - 1].t + (half - back[j - 1]) / (back[j] - back[j - 1]) * (frames[q + j].t - frames[q + j - 1].t);
        const est = tTop - 2 * (tTop - tm); if (est < tT0 && est > tT0 - 0.25) tT0 = est; break; } }
    const backS = tTop - tT0, fwdS = tImpact - tTop;
    const lengthCm = Math.max(0, Math.max(back[top], sm[top]) - back[j0] + 0.5);
    // path into impact: the putter's lateral position on the way down, from the top until it nears the ball
    const eF = [], eX = [], pathPts = [];
    for (let j = top; j <= impact - q; j++) { if (edgeX[j] == null || back[j] - back[j0] < 2) continue; eF.push(-back[j]); eX.push(edgeX[j]);
      const F = -back[j], X = edgeX[j]; pathPts.push({ x: xb + (F * ux - X * uy) / s, y: yb + (F * uy + X * ux) / s }); }
    const slope = eF.length >= 3 ? fitSlope(eF, eX) : null;
    // drawing aids for the replay, in image pixels, tied to frame indexes so lines can grow as the clip plays
    const toImg = (F, X) => ({ x: xb + (F * ux - X * uy) / s, y: yb + (F * uy + X * ux) / s });
    const putterTrack = []; for (let j = j0; j <= impact - q; j++) if (back[j] > 0 && edgeX[j] != null) { const p = toImg(-back[j] + 2, edgeX[j]); putterTrack.push({ i: q + j, x: p.x, y: p.y }); }
    let pathLine = null;
    if (slope != null) { const mF = eF.reduce((a, v) => a + v, 0) / eF.length, mX = eX.reduce((a, v) => a + v, 0) / eX.length, c0 = mX - slope * mF;
      const F0 = -Math.max(...back.slice(j0, top + 1)), F1 = 8; pathLine = { a: toImg(F0, c0 + slope * F0), b: toImg(F1, c0 + slope * F1) }; }
    const startRad = Math.atan(sxy / sxx), startLine = { a: toImg(0, 0), b: toImg(70, Math.tan(startRad) * 70) };
    const ballTrack = []; for (let j = impact; j < trk.length; j++) if (trk[j]) ballTrack.push({ i: trk[j].i, x: trk[j].x, y: trk[j].y });
    const pathDeg = slope == null ? null : hand * deg(Math.atan(slope));
    return {
      ok: true, tempo: { back: backS, through: fwdS, ratio: fwdS > 0 ? backS / fwdS : null },
      startDeg, missIn: Math.tan(startDeg * Math.PI / 180) * setup.puttFt * 12, pathDeg, lengthIn: lengthCm / 2.54, speedMph: speed ? speed * 0.0223694 : null,
      overlay: { ball: { x: ball.x, y: ball.y, r }, aim: { x: taps.aim.x, y: taps.aim.y }, ballPath: ballPath.map(p => ({ x: p.x, y: p.y })), pathPts, putterTrack, pathLine, startLine, ballTrack },
      frames: { address: q, takeaway: q + j0, top: q + top, impact }, times: { takeaway: tT0, top: tTop, impact: tImpact }
    };
  }

  function grade(res, setup) {
    const out = [], t = res.tempo;
    if (t.ratio != null) {
      const r = t.ratio, ok = r >= 1.7 && r <= 2.4;
      out.push({ key: "tempo", label: "Tempo", value: r.toFixed(1) + " : 1", sub: `Back ${t.back.toFixed(2)} s · through ${t.through.toFixed(2)} s`,
        status: ok ? "good" : (r >= 1.4 && r <= 2.8 ? "warn" : "bad"), score: ok ? 0 : Math.abs(r - 2) / 0.5,
        tip: ok ? "Smooth. Good putters take about twice as long going back as coming through." :
          r < 1.7 ? "Your backstroke is rushed or you slow down through the ball. Let the putter swing back slower and keep it accelerating through." :
            "Your backstroke drags and the hit is jabby. Take it back a touch quicker and let the putter swing through on the same rhythm." });
    }
    const s = res.startDeg, as = Math.abs(s), side = s > 0 ? "right" : "left";
    out.push({ key: "start", label: "Start line", value: as < 0.05 ? "On line" : `${as.toFixed(1)}° ${side}`,
      sub: as < 0.05 ? "Dead on your aim" : `Misses ${Math.abs(res.missIn).toFixed(1)} in ${side} at ${setup.puttFt} ft`,
      status: as <= 0.6 ? "good" : as <= 1.2 ? "warn" : "bad", score: as / 0.6,
      tip: as <= 0.6 ? "The ball started on your line. That's mostly your face angle at impact, and it's good." :
        `The ball started ${side}. Start line comes mostly from the putter face, so the face was ${s > 0 ? "open" : "closed"} at impact. Check your aim at address, then rehearse a square face through the ball.` });
    if (res.pathDeg != null) {
      const p = res.pathDeg, ap = Math.abs(p), dir = p > 0 ? "in-to-out" : "out-to-in";
      out.push({ key: "path", label: "Path", value: ap < 0.5 ? "Square" : `${ap.toFixed(1)}° ${dir}`, sub: "Putter path into impact",
        status: ap <= 2 ? "good" : ap <= 4 ? "warn" : "bad", score: ap / 2,
        tip: ap <= 2 ? "Your putter moves down the line into impact." :
          p > 0 ? "The putter swings out away from you through impact. Feel the putter head stay on the line, or slightly inside, after the ball." :
            "The putter cuts across the ball toward you. Feel the putter swing out toward the hole through impact instead of pulling in." });
    }
    out.push({ key: "length", label: "Backstroke", value: `${res.lengthIn.toFixed(0)} in`, sub: res.speedMph ? `Ball speed ${res.speedMph.toFixed(1)} mph` : "Putter head travel back",
      status: "info", score: 0, tip: "Distance control comes from backstroke length, not hitting harder. Match it to the putt and keep the tempo the same." });
    return out;
  }

  const api = { analyze, grade, calibrateBall, findBlob, BALL_R };
  if (typeof module !== "undefined") module.exports = api; else root.PuttEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
