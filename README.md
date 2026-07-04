# Steam Trap Management

Preventive maintenance tracking for industrial steam traps — built with the **same
stack and patterns as the PSV Tracking Dashboard** in this repository.

## Stack

- [Vite](https://vitejs.dev/) + [React 18](https://react.dev/) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) — Texas A&M maroon theme
- [React Router](https://reactrouter.com/) for navigation
- [lucide-react](https://lucide.dev/) icons

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run preview  # preview the production build
```

No login or environment variables are required. The app opens directly to the dashboard
with a shared demo dataset. Visitors can interact with the full UI — add equipment, log
PM records, export reports — but changes are not persisted between page loads.

## Data model

```
Equipment (name, area, is_running)
   └── Traps (tag, type, location)
          └── PM Records (append-only inspection history)
```

## Features

- Dashboard with KPIs, equipment cards, and priority action queue
- Equipment list + detail with trap inventory
- All-traps page with priority filters and search
- Trap detail with PM entry modal and inspection timeline
- Settings (PM intervals per trap type, reset demo data)
- CSV reporting exports

## Repository

This project lives in [PSV-Compliance-Tracking-Dashboard](https://github.com/stavan12-a11y/PSV-Compliance-Tracking-Dashboard).
