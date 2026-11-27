# Rubikku

A website that teaches a young beginner to solve a 3x3 cube, built around one interactive 3D cube.

- **Learn**: a primer plus the eight stages of the layer-by-layer method, each with demos, guided practice, "Which is it?" recognition rounds, drills and a step on your real cube.
- **Solve my cube**: enter your real cube's colours and get a guided, stage-by-stage solution, or find out where you are.
- **Play, Notation, Algorithms, Patterns, Timer, Progress**: free play, a notation trainer, algorithm cards, a pattern gallery with 21 country flags to make on the cube and a "make your own" face designer, a speed timer, badges and streaks.
- Light and dark themes, progress saved in the browser, and it works offline once installed.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

## Test it

```sh
npm test           # unit tests (vitest)
npm run build && npx vite preview --port 4173
node e2e/learn.e2e.mjs http://localhost:4173   # end-to-end suites in e2e/ (Playwright)
```

## Deploy

Every push to `main` runs the tests, builds the site and publishes it to GitHub Pages (`.github/workflows/deploy.yml`). The build uses a relative base path and hash routing, so it works from any static host or sub-path.

## Docs

- `PLAN.md`: the product plan and architecture.
- `DESIGN.md`: the design direction.
- `reviews/`: independent code, design, teaching and QA reviews from development.
