# Judges kit

Two pieces for the HackPSU judging table, both in the General Intelligence Company design system (Inter, warm off-white `surface`, `ink` text, glass over imagery, the arrow pill), with Kestrel's own mark.

- `kestrel-judges.pptx`: 11 slides covering the hook, the problem, Pip and Nova, the three objectives, voice and Claude, the two-robot experiment, Tiger Data progress, what is real today and next, and a close. Speaker notes are on every slide.
- `loop.html`: a 56-second loop of 7 scenes for a laptop left open at the table. Open it in a browser and click once, or press F, for full screen. There are no other controls. It keeps the screen awake where the browser allows, reloads itself every 6 hours, and under reduced motion it holds each scene for 12 s with no movement. It loads Inter and Grandstander from Google Fonts. Without a network connection it falls back to the system sans-serif.

Images in `assets/` are the landing art (concept art, labelled as such) and real console screenshots. The deck uses Inter: install it on the presenting machine (`brew install --cask font-inter`), or PowerPoint will substitute another font.

## Rebuild the deck

```sh
cd docs/judges && python3 -m http.server 5199 --bind 127.0.0.1   # in its own terminal
node docs/judges/build/render-art.mjs <art-dir>                    # glass plates and the mark (Playwright)
ART_DIR=<art-dir> NODE_PATH=<dir with pptxgenjs and sharp> node docs/judges/build/build-deck.cjs
```

PowerPoint has no backdrop blur, so `render-art.mjs` bakes each glass panel into its background image. The text on top stays editable.
