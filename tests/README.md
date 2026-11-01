# Camera test provenance

Run browser-camera-smoke.js only in an isolated local preview with ZXing loaded. It substitutes generated QR pixels for video frames and mocks getUserMedia; it does not use the physical camera. It performs 10 genuine decodes through the unmodified V5 Canvas decode loop, each expecting automatic single-mode close and one stopped track.

Node tests: node --test tests/scanner-*.test.cjs

No iPhone hardware validation has been performed by this environment.
