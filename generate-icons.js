#!/usr/bin/env node
// Run: node scripts/generate-icons.js
// Generates all required PWA and Apple touch icons as PNGs
// Requires: npm install canvas (or use the browser canvas approach below)

// Since we can't run canvas server-side without native modules,
// this script outputs an HTML file you open in a browser to download icons.

const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html>
<html>
<head><title>Icon Generator</title></head>
<body>
<script>
const sizes = [72,96,128,144,152,180,192,384,512];
const splashSizes = [
  [2048,1536,'splash-2048x1536'],
  [1668,1024,'splash-1668x1024'],
  [1024,768,'splash-1024x768'],
];

function drawIcon(canvas, size) {
  const ctx = canvas.getContext('2d');
  // Background
  ctx.fillStyle = '#080c10';
  ctx.fillRect(0, 0, size, size);
  // Rounded border
  ctx.strokeStyle = '#c0a060';
  ctx.lineWidth = size * 0.04;
  const r = size * 0.12;
  ctx.beginPath();
  ctx.roundRect(size*0.06, size*0.06, size*0.88, size*0.88, r);
  ctx.stroke();
  // Castle emoji
  ctx.font = (size * 0.5) + 'px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏰', size/2, size/2 - size*0.04);
  // Text
  ctx.fillStyle = '#c0a060';
  ctx.font = 'bold ' + (size * 0.12) + 'px serif';
  ctx.fillText('RAMPART', size/2, size * 0.82);
}

function drawSplash(canvas, w, h) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#080c10';
  ctx.fillRect(0, 0, w, h);
  const size = Math.min(w, h) * 0.4;
  ctx.font = size + 'px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏰', w/2, h/2 - size*0.1);
  ctx.fillStyle = '#c0a060';
  ctx.font = 'bold ' + (size * 0.25) + 'px serif';
  ctx.fillText('RAMPART', w/2, h/2 + size*0.35);
  ctx.fillStyle = '#555';
  ctx.font = (size * 0.1) + 'px serif';
  ctx.fillText('Medieval Siege Warfare', w/2, h/2 + size*0.55);
}

async function download(canvas, filename) {
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  await new Promise(r => setTimeout(r, 200));
}

async function generate() {
  document.body.innerHTML = '<h2 style="font-family:sans-serif;color:#c0a060;background:#080c10;padding:20px">Generating icons... Check your downloads folder.</h2>';
  
  // App icons
  for (const size of sizes) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    drawIcon(canvas, size);
    await download(canvas, \`icon-\${size}.png\`);
  }
  
  // Apple touch icon (180px)
  const atCanvas = document.createElement('canvas');
  atCanvas.width = atCanvas.height = 180;
  drawIcon(atCanvas, 180);
  await download(atCanvas, 'apple-touch-icon.png');
  
  // Splash screens
  for (const [w, h, name] of splashSizes) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    drawSplash(canvas, w, h);
    await download(canvas, name + '.png');
  }
  
  document.body.innerHTML += '<p style="font-family:sans-serif;color:#4ade80;padding:20px">✓ All icons downloaded! Move them to:<br>• icon-*.png → public/icons/<br>• apple-touch-icon.png → public/<br>• splash-*.png → public/splash/</p>';
}

generate();
</script>
</body>
</html>`;

// Write the generator HTML
const outDir = path.join(__dirname, '..');
fs.mkdirSync(path.join(outDir, 'public', 'icons'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'public', 'splash'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'public', 'screenshots'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'generate-icons.html'), html);

console.log('✓ Created generate-icons.html');
console.log('→ Open generate-icons.html in a browser to download all icons');
console.log('→ Move downloaded files to public/icons/ and public/splash/');
