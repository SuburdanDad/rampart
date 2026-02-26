# ⚔️ Rampart — Medieval Siege Warfare

A faithful remaster of the 1990 Atari arcade classic. Build walls, place cannons, sink ships.

## Features

- ✅ All 4 game phases: Build → Place → Battle → Repair
- ✅ 3 difficulty levels (Squire / Knight / Warlord)
- ✅ Multiple capturable castles
- ✅ Web Audio sound engine (no files needed)
- ✅ High score persistence (localStorage)
- ✅ Full keyboard + touch controls
- ✅ **PWA** — installable on iPad, iPhone, Android, desktop
- ✅ **Offline play** — works without internet after first load
- ✅ Responsive layout — adapts to any screen size
- ✅ Landscape-optimised for iPad

---

## Deploy in 5 minutes

### 1. Generate Icons (required for PWA install prompt)

```bash
node scripts/generate-icons.js
```
Then open `generate-icons.html` in a browser — it downloads all icon sizes.
Move them to:
- `icon-*.png` → `public/icons/`
- `apple-touch-icon.png` → `public/`
- `splash-*.png` → `public/splash/`

### 2. Push to GitHub + Deploy to Vercel

```bash
# Create GitHub repo, then:
git init
git add .
git commit -m "Rampart PWA"
git remote add origin https://github.com/YOUR_USERNAME/rampart.git
git push -u origin main
```

Then at [vercel.com](https://vercel.com):
- Import the repo → auto-detects Vite → Deploy
- No environment variables needed

### 3. Local development

```bash
npm install
npm run dev        # → http://localhost:5173
npm run build      # production build
npm run preview    # preview production build
```

---

## Installing as a PWA

### On iPad / iPhone
1. Open your Vercel URL in **Safari**
2. Tap the **Share** button (box with arrow)
3. Tap **"Add to Home Screen"**
4. Tap **Add** — Rampart appears on your home screen like a native app
5. Open it — runs fullscreen, landscape, no browser UI

### On Android
1. Open your URL in **Chrome**
2. Tap the **⋮ menu** → **"Add to Home Screen"** or **"Install App"**
3. Confirm — appears in your app drawer

### On Desktop (Chrome/Edge)
1. Look for the install icon (⊕) in the address bar
2. Click **Install**
3. Rampart opens as a standalone window

---

## iPad-Specific Optimisations

- `display: fullscreen` — hides all browser chrome
- `orientation: landscape` — locks to landscape on install
- `viewport-fit: cover` — fills notched/Face ID iPads edge-to-edge
- `safe-area-inset-*` padding — content never hidden behind notch/home indicator
- `overscroll-behavior: none` — prevents rubber-band scroll
- `-webkit-tap-highlight-color: transparent` — no blue flash on tap
- `maximum-scale=1, user-scalable=no` — prevents accidental pinch-zoom
- Touch D-pad scales to screen size — comfortable on any iPad model
- Dynamic `cell` size — board fills available space perfectly

---

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Move cursor / piece | Arrow keys or WASD | D-pad |
| Rotate piece | R | ROT button |
| Place / Fire | Space or Enter | Action button (▣/🎯) |
| Confirm enclosed | Enter | Action button (after enclosed) |
| End repair phase | ESC or Q | DONE button |

---

## Project Structure

```
rampart/
├── src/
│   ├── Rampart.jsx      ← entire game (single component)
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css        ← iOS/PWA global fixes
├── public/
│   ├── icons/           ← PWA icons (generate with script)
│   ├── splash/          ← iOS splash screens
│   ├── favicon.svg
│   └── apple-touch-icon.png
├── scripts/
│   └── generate-icons.js
├── index.html           ← PWA meta tags + safe area
├── vite.config.js       ← PWA plugin config
└── vercel.json
```

---

## Next Steps

- **Capacitor** — wrap for native App Store / Google Play submission
- **Multiplayer** — WebSocket-based 2-player siege (classic Rampart feature)
- **More maps** — different coastline shapes and castle layouts  
- **Power-ups** — larger cannons, repair kits, fortress walls
- **Haptic feedback** — via Capacitor's Haptics plugin on real devices
