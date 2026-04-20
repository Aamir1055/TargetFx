# Responsive React Web Application

A modern, responsive React web application built with Vite, Tailwind CSS, and PWA capabilities. This application works seamlessly on both mobile phones and desktop/Windows computers.

## Features

- 📱 **Mobile-First Design**: Optimized for mobile devices with responsive breakpoints
- 💻 **Desktop Compatible**: Full-featured experience on Windows/desktop computers
- 🎨 **Dark/Light Mode**: Automatic theme switching based on system preferences
- ⚡ **PWA Ready**: Progressive Web App capabilities for mobile installation
- 🚀 **Fast Development**: Built with Vite for lightning-fast development
- 🎯 **Modern Stack**: React 18, Tailwind CSS, and modern tooling

## Responsive Breakpoints

- **Mobile**: 0px - 768px (Primary focus)
- **Tablet**: 768px - 1024px
- **Desktop**: 1024px+

## Getting Started

### Prerequisites

- Node.js 18+ installed on your system
- npm or yarn package manager

### Installation

1. Navigate to the project directory
2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3001`

### Building for Production

Create a production build:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Mobile Testing

### On Physical Device
1. Start the dev server with network access:
   ```bash
   npm run dev -- --host
   ```
2. Access the app using your computer's IP address on mobile

### Browser DevTools
1. Open Chrome DevTools (F12)
2. Click the mobile device icon (Toggle device toolbar)
3. Test different device sizes and orientations

## PWA Installation

### On Mobile
1. Open the app in Chrome/Safari
2. Look for "Add to Home Screen" prompt
3. Install as a native-like app

### On Desktop
1. Open the app in Chrome
2. Click the install icon in the address bar
3. Install as a desktop app

## Project Structure

```
src/
├── components/
│   ├── Header.jsx          # Responsive navigation header
│   ├── Sidebar.jsx         # Collapsible sidebar for mobile/desktop
│   ├── MainContent.jsx     # Main responsive content area
│   └── Footer.jsx          # Responsive footer
├── App.jsx                 # Main app component with layout
├── services/
│   ├── api.js              # Axios API client (auth + broker endpoints)
│   └── websocket.js        # WebSocket singleton (connect/reconnect + listeners)
├── main.jsx                # App entry point
└── index.css              # Global styles with Tailwind

public/
├── icons/                  # PWA icons (add your own)
└── ...

Configuration:
├── vite.config.js          # Vite + PWA configuration
├── tailwind.config.js      # Tailwind CSS configuration
└── postcss.config.js       # PostCSS configuration
```

## Responsive Design Features

### Mobile (Phone) Optimizations
- Touch-friendly button sizes (min 44px)
- Collapsible sidebar with overlay
- Stacked layouts for better readability
- Optimized typography for small screens
- Swipe-friendly interactions

### Desktop (Windows) Enhancements
- Persistent sidebar navigation
- Multi-column layouts
- Hover states and interactions
- Keyboard navigation support
- Larger typography and spacing

## Customization

### Colors & Theme
Edit `tailwind.config.js` to customize colors, fonts, and breakpoints.

### Components
All components in `src/components/` are modular and can be customized independently.

### PWA Settings
Modify `vite.config.js` to update PWA manifest settings, icons, and service worker behavior.

## Browser Support

- **Mobile**: iOS Safari 12+, Chrome 80+, Firefox 75+
- **Desktop**: Chrome 80+, Firefox 75+, Edge 80+, Safari 13+

## Performance

## Positions module (live updates)

The Positions page (`/positions`) shows open positions with a live WebSocket stream.

- Initial load comes from `GET /api/broker/positions`.
- Live updates are handled via WebSocket at `ws(s)://<host>/api/broker/ws?token=<access_token>`.
- Supported events (any of these will be merged appropriately):
   - `type: 'positions'` with `data.positions` and optional `op` of `full|update|add|delete|pnl`
   - `POSITION_ADDED|POSITION_CREATED|NEW_POSITION` → add
   - `POSITION_UPDATED|POSITION_CHANGED|POSITION_MODIFIED` → update
   - `POSITION_DELETED|POSITION_REMOVED` → delete
   - `POSITION_PNL_UPDATED|POSITION_NPL_UPDATED` → pnl-only fields (profit/priceCurrent/timeUpdate)
- If the WebSocket disconnects, the page falls back to HTTP polling every 5 seconds until reconnected.

Dev tips:
- The Vite dev server runs on port 3001 (see `vite.config.js`).
- WebSocket proxying is enabled in dev and production (`vite.config.js`, `dist/.htaccess`).

- Fast loading with Vite's optimized bundling
- Code splitting for optimal performance
- Service worker for offline functionality (PWA)
- Optimized images and assets
