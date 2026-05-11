# LittleJS + Vite

This template provides a minimal setup to get LittleJS working in Vite.

## Use as a template

Spin up a fresh project from this template with [degit](https://github.com/Rich-Harris/degit):

```
npx degit KilledByAPixel/LittleJS/examples/vite-starter my-game
cd my-game
npm install
npm run dev
```

Requires Node 20.19+ or 22.12+ (Vite 7 requirement).

## Getting started

```
npm install
npm run dev
```

## Vite commands

```
npm run dev       # dev server with hot reload
npm run build     # build to dist/
npm run preview   # preview the production build
```

See the [Vite docs](https://vite.dev) for more.

## Assets

Files in `public/` are served from the site root in dev and copied as-is to `dist/` on build. The tilesheet lives there, which is why `engineInit(..., ['tiles.png'])` works in both dev and the built output.

For assets you want Vite to hash and bundle (the usual case for large projects), import them from `src/` instead:

```js
import tilesURL from './tiles.png';
```

## Deploying

The included `vite.config.js` sets `base: './'`, which makes the built site work from any subdirectory — including GitHub Pages project sites and itch.io uploads. The `public/.nojekyll` file ships in the build so GitHub Pages won't ignore Vite's underscore-prefixed chunk files.

To deploy:

```
npm run build
```

then upload the contents of `dist/` (or zip them for itch.io).

## LittleJS

[Read the LittleJS docs to learn more](https://github.com/KilledByAPixel/LittleJS).
