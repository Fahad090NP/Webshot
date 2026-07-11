# Webshot

A browser extension for capturing full page, selected sections, or viewport
in PNG, JPG, WEBP, SVG, or PDF with custom resolution scaling (1x–10x).

Built with [WXT](https://wxt.dev) + React.

## Features

- **Full Page Capture** — scrolls through the entire page and composites a
  seamless image
- **Viewport Capture** — captures exactly what's visible in the viewport,
  including device emulation modes
- **Selection Capture** — click an element or drag to select an area
- **Output Formats** — PNG, JPEG, WEBP, SVG, PDF
- **Resolution Scaling** — 1x through 10x (browser zoom or canvas upscale)
- **Zoom-Based Capture** — when enabled, browser zoom is used for true
  high-resolution capture (configurable in settings)
- **Interaction Blocking** — prevents user interactions during capture

## Development

```bash
bun install        # install dependencies
bun dev            # start dev server with HMR
bun build          # build for production
bun zip            # create extension zip
bun lint           # run ESLint + markdownlint
bun format         # format code with Prettier
bun typecheck      # run TypeScript type checking
```

## Commands

| Command         | Description              |
| --------------- | ------------------------ |
| `bun dev`       | Start WXT dev server     |
| `bun build`     | Build for production     |
| `bun zip`       | Create distributable zip |
| `bun lint`      | ESLint + markdownlint    |
| `bun format`    | Prettier format          |
| `bun typecheck` | TypeScript check         |

## License

MIT
