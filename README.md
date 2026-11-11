# Putt Lab

A camera putting sim for the iPhone. Mount the phone on a tripod above your putter, offset past the far side of your line, and leave it on. It arms itself when a ball sits still on your spot, detects the stroke, and calls out tempo, start line, putter path and backstroke. Then it replays the stroke in slow motion with the lines drawn over the real video.

- `index.html`: the app (camera, standby/ready/stroke loop, replay overlay, session log)
- `engine.js`: stroke analysis (ball and putter tracking, tempo, path, start line, backstroke)
- `sample.js`: the simulated bay used by "Try the demo"

Open in Safari on the phone and tap Start camera. Everything runs on the phone; no video leaves it.
