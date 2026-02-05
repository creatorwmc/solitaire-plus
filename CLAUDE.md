# Solitaire Plus - Claude Code Instructions

## Deployment Policy

**DEFAULT: Local development only.**

When running or testing the application:
- Use `npm run dev` for local development server (localhost:5173)
- Do NOT deploy to Netlify production unless explicitly requested

**Production deployment requires explicit instruction:**
- User must say "deploy to live", "deploy to production", "deploy to Netlify", or similar
- Manual production deploys should be rare exceptions

## Development Commands

```bash
# Local development (DEFAULT)
npm run dev              # Vite dev server on localhost:5173

# Build (for testing build locally)
npm run build            # Production build to /dist
npm run preview          # Preview production build locally

# Linting
npm run lint             # ESLint check
```

## Project Context

- **Purpose**: Premium Solitaire (Klondike) game for casual players
- **Target User**: Father-in-law who enjoys solitaire
- **Backend**: None (fully client-side)
- **Storage**: localStorage for stats and preferences
- **Hosting**: Netlify
- **PWA**: Yes - offline capable

## Key Features

- Klondike solitaire with draw 1 or draw 3 options
- 15+ customizable card back designs
- Timer, move counter, and statistics tracking
- Undo functionality
- Win detection with fireworks celebration
- Responsive design for all screen sizes

## Key Directories

- `src/components/` - Solitaire game component and styles
- `src/data/` - Card back designs and themes
- `public/` - Static assets and PWA manifest
