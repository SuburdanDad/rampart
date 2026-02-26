import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const COLS = 32, ROWS = 20;
const PHASE = { MENU:"MENU", BUILD:"BUILD", PLACE:"PLACE", BATTLE:"BATTLE", REPAIR:"REPAIR", GAMEOVER:"GAMEOVER" };
const CT = { EMPTY:0, WALL:1, CASTLE:2, CANNON:3, WATER:4, LAND:5 };

const DIFFICULTIES = {
  SQUIRE:  { label:"Squire",  ships:2, shipHp:1, buildTime:45, battleTime:60, repairTime:30, fireRate:150, color:"#4ade80" },
  KNIGHT:  { label:"Knight",  ships:4, shipHp:2, buildTime:35, battleTime:50, repairTime:25, fireRate:100, color:"#facc15" },
  WARLORD: { label:"Warlord", ships:6, shipHp:3, buildTime:25, battleTime:40, repairTime:20, fireRate:65,  color:"#f87171" },
};

// ─── Sound Engine ─────────────────────────────────────────────────────────────
function makeSFX() {
  let ctx = null;
  const g = () => { if (!ctx) ctx = new (window.AudioContext||window.webkitAudioContext)(); return ctx; };
  const tone = (f,t,d,v=0.3) => { try { const c=g(),o=c.createOscillator(),gain=c.createGain(); o.connect(gain); gain.connect(c.destination); o.type=t; o.frequency.value=f; gain.gain.setValueAtTime(v,c.currentTime); gain.gain.exponentialRampToValueAtTime(0.001,c.currentTime+d); o.start(); o.stop(c.currentTime+d); } catch{} };
  const noise = (d,v=0.15) => { try { const c=g(),buf=c.createBuffer(1,c.sampleRate*d,c.sampleRate),data=buf.getChannelData(0); for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1; const s=c.createBufferSource(),gain=c.createGain(); s.buffer=buf; s.connect(gain); gain.connect(c.destination); gain.gain.setValueAtTime(v,c.currentTime); gain.gain.exponentialRampToValueAtTime(0.001,c.currentTime+d); s.start(); } catch{} };
  return {
    fire:    () => { tone(120,"sawtooth",0.3,0.4); noise(0.2,0.2); },
    boom:    () => { noise(0.4,0.3); tone(80,"square",0.3,0.3); },
    place:   () => { tone(440,"square",0.07,0.15); tone(660,"square",0.07,0.1); },
    enclose: () => [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,"square",0.15,0.2),i*80)),
    sink:    () => [400,300,200,100].forEach((f,i)=>setTimeout(()=>tone(f,"sawtooth",0.2,0.3),i*100)),
    cannon:  () => tone(330,"triangle",0.2,0.25),
    life:    () => [400,350,300,250,200].forEach((f,i)=>setTimeout(()=>tone(f,"sawtooth",0.25,0.35),i*120)),
    over:    () => [300,250,200,150,100].forEach((f,i)=>setTimeout(()=>tone(f,"square",0.4,0.4),i*150)),
    round:   () => [262,330,392,523].forEach((f,i)=>setTimeout(()=>tone(f,"triangle",0.3,0.3),i*100)),
    select:  () => tone(660,"triangle",0.1,0.2),
    tick:    () => tone(880,"square",0.05,0.08),
  };
}
const SFX = makeSFX();

// ─── Pieces ───────────────────────────────────────────────────────────────────
const PIECES = [
  [[0,0],[0,1],[0,2],[0,3]],[[0,0],[1,0],[2,0],[3,0]],
  [[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[0,2],[1,0]],
  [[0,0],[0,1],[0,2],[1,2]],[[0,0],[1,0],[1,1],[1,2]],
  [[0,1],[0,2],[1,0],[1,1]],[[0,0],[0,1],[0,2],[1,1]],
  [[0,0],[1,0],[1,1],[2,1]],[[0,0],[0,1],[0,2]],
  [[0,0],[1,0],[1,1]],[[0,0],[0,1],[1,0]],[[0,0],[1,0],[2,0]],
];
const randPiece = () => PIECES[Math.floor(Math.random()*PIECES.length)].map(p=>[...p]);
const rotatePiece = p => { const mr=Math.max(...p.map(([r])=>r)); return p.map(([r,c])=>[c,mr-r]); };

// ─── Grid helpers ─────────────────────────────────────────────────────────────
const CASTLE_POS = [{r:9,c:5},{r:3,c:10},{r:15,c:10}];

function makeGrid() {
  const g = Array.from({length:ROWS},()=>new Array(COLS).fill(CT.LAND));
  for(let r=0;r<ROWS;r++) for(let c=COLS-9;c<COLS;c++) g[r][c]=CT.WATER;
  return g;
}

function enclosed(grid,cr,cc) {
  const vis=Array.from({length:ROWS},()=>new Uint8Array(COLS));
  const q=[[cr,cc]]; vis[cr][cc]=1; let n=0;
  const D=[[0,1],[0,-1],[1,0],[-1,0]];
  while(q.length){ const[r,c]=q.shift(); n++; if(n>500) return false;
    for(const[dr,dc]of D){ const nr=r+dr,nc=c+dc;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) return false;
      if(vis[nr][nc]) continue;
      if(grid[nr][nc]===CT.WALL||grid[nr][nc]===CT.CASTLE) continue;
      vis[nr][nc]=1; q.push([nr,nc]); } }
  return true;
}

function flood(grid,cr,cc) {
  const vis=new Set(),q=[[cr,cc]]; vis.add(`${cr},${cc}`);
  const D=[[0,1],[0,-1],[1,0],[-1,0]];
  while(q.length){ const[r,c]=q.shift();
    for(const[dr,dc]of D){ const nr=r+dr,nc=c+dc,k=`${nr},${nc}`;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS||vis.has(k)) continue;
      if(grid[nr][nc]===CT.WALL||grid[nr][nc]===CT.CASTLE) continue;
      vis.add(k); q.push([nr,nc]); } }
  return vis;
}

function initState(difficulty) {
  const diff=DIFFICULTIES[difficulty], g=makeGrid();
  const castles=CASTLE_POS.map((p,i)=>{ g[p.r][p.c]=CT.CASTLE; return{...p,id:i,owned:i===0}; });
  return {
    grid:g, castles, cannons:[], ships:[], projectiles:[], enemyProjectiles:[],
    explosions:[], particles:[],
    phase:PHASE.BUILD, difficulty, diff, round:1, score:0, lives:3,
    timeLeft:diff.buildTime,
    curPiece:randPiece(), nxtPiece:randPiece(),
    piecePos:{r:7,c:3},
    cursorR:9, cursorC:COLS-12,
    cannonCur:{r:9,c:5},
    placedCannons:0, maxCannons:3,
    enclosed:false, encCells:new Set(),
    message:"BUILD your walls! Enclose the castle.",
  };
}

function spawnShips(round,diff) {
  const n=Math.min(diff.ships+Math.floor(round*0.6),10);
  return Array.from({length:n},(_,i)=>({
    id:Date.now()+i+Math.random(),
    r:1+Math.floor(Math.random()*(ROWS-2)),
    c:COLS-8+Math.floor(Math.random()*5),
    hp:diff.shipHp+Math.floor(round/3), maxHp:diff.shipHp+Math.floor(round/3),
    fireTimer:diff.fireRate*(0.5+Math.random()),
    dy:Math.random()>.5?1:-1, moveTimer:Math.floor(Math.random()*60),
    type:Math.random()>.7?"heavy":"sloop",
  }));
}

const lerp=(a,b,t)=>a+(b-a)*t;

// ─── High scores ──────────────────────────────────────────────────────────────
const loadScores=()=>{ try{ return JSON.parse(localStorage.getItem("rampart_hs")||"[]"); }catch{ return []; } };
const saveScore=(score,diff,round)=>{ try{ const s=loadScores(); s.push({score,diff,round,date:new Date().toLocaleDateString()}); s.sort((a,b)=>b.score-a.score); localStorage.setItem("rampart_hs",JSON.stringify(s.slice(0,10))); }catch{} };

// ─── Responsive cell size hook ────────────────────────────────────────────────
function useCellSize() {
  const [cell, setCell] = useState(24);
  useEffect(() => {
    function calc() {
      // Landscape: fit cols across width, rows down height (minus HUD ~100px)
      const isLandscape = window.innerWidth > window.innerHeight;
      const availW = window.innerWidth - (isLandscape ? 180 : 0); // sidebar
      const availH = window.innerHeight - 100; // HUD
      const byW = Math.floor(availW / COLS);
      const byH = Math.floor(availH / ROWS);
      setCell(Math.max(14, Math.min(byW, byH, 32)));
    }
    calc();
    window.addEventListener("resize", calc);
    window.addEventListener("orientationchange", () => setTimeout(calc, 300));
    return () => { window.removeEventListener("resize", calc); window.removeEventListener("orientationchange", calc); };
  }, []);
  return cell;
}

// ─── Start Screen ─────────────────────────────────────────────────────────────
function StartScreen({ onStart, scores }) {
  const [sel, setSel] = useState("KNIGHT");
  const [tab, setTab] = useState("play");
  return (
    <div style={{
      width:"100vw", height:"100vh", background:"#080c10",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      fontFamily:"'Cinzel',serif", padding:"20px", overflowY:"auto",
      backgroundImage:"radial-gradient(ellipse at 50% 0%,#1a2a1a,#080c10 65%)",
    }}>
      <style>{`
        @keyframes glow{0%,100%{text-shadow:0 0 20px #c0a060,0 0 60px #c0a06044}50%{text-shadow:0 0 50px #c0a060,0 0 120px #c0a06066}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes shine{0%,100%{opacity:.6}50%{opacity:1}}
        .dc{border:2px solid #333;padding:16px 18px;cursor:pointer;transition:all .2s;background:#111;min-width:110px;text-align:center;border-radius:4px}
        .dc:hover{transform:translateY(-3px)}
        .dc.sel{background:#1a1a1a}
        .sb{background:#c0a060;color:#080c10;border:none;padding:15px 50px;font-family:'Cinzel',serif;font-weight:700;font-size:17px;letter-spacing:.15em;cursor:pointer;transition:all .2s;border-radius:3px;box-shadow:0 0 30px #c0a06044;touch-action:manipulation}
        .sb:hover,.sb:active{background:#d4b870;transform:translateY(-2px)}
        .tb{background:transparent;border:none;border-bottom:2px solid transparent;color:#555;font-family:'Cinzel',serif;font-size:12px;letter-spacing:.1em;cursor:pointer;padding:8px 18px;transition:all .2s;text-transform:uppercase;touch-action:manipulation}
        .tb.a{color:#c0a060;border-bottom-color:#c0a060}
        .tb:hover{color:#aaa}
      `}</style>
      <div style={{fontSize:"36px",animation:"float 3s ease-in-out infinite",marginBottom:"4px",opacity:.5}}>⛵ &nbsp; ⛵</div>
      <h1 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:"clamp(36px,8vw,72px)",color:"#c0a060",letterSpacing:".15em",animation:"glow 2.5s ease-in-out infinite",marginBottom:"4px",lineHeight:1}}>RAMPART</h1>
      <div style={{fontSize:"11px",color:"#555",letterSpacing:".3em",marginBottom:"32px",animation:"shine 3s ease-in-out infinite"}}>MEDIEVAL SIEGE WARFARE · REMASTERED</div>
      <div style={{display:"flex",marginBottom:"24px",borderBottom:"1px solid #1e1e1e"}}>
        {["play","scores","how"].map(t=>(
          <button key={t} className={`tb${tab===t?" a":""}`} onClick={()=>setTab(t)}>{t==="play"?"Play":t==="scores"?"High Scores":"How to Play"}</button>
        ))}
      </div>

      {tab==="play"&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"20px"}}>
          <div style={{fontSize:"11px",color:"#555",letterSpacing:".2em"}}>SELECT DIFFICULTY</div>
          <div style={{display:"flex",gap:"10px",flexWrap:"wrap",justifyContent:"center"}}>
            {Object.entries(DIFFICULTIES).map(([k,d])=>(
              <div key={k} className={`dc${sel===k?" sel":""}`} style={{color:d.color}}
                onClick={()=>{setSel(k);SFX.select();}}>
                <div style={{fontSize:"24px",marginBottom:"8px"}}>{k==="SQUIRE"?"🛡️":k==="KNIGHT"?"⚔️":"💀"}</div>
                <div style={{fontWeight:"700",fontSize:"13px",letterSpacing:".08em"}}>{d.label}</div>
                <div style={{fontSize:"10px",color:"#555",marginTop:"6px",lineHeight:1.7}}>
                  {d.ships} ships · HP {d.shipHp}<br/>{d.buildTime}s build time
                </div>
              </div>
            ))}
          </div>
          <button className="sb" onClick={()=>{SFX.round();onStart(sel);}}>⚔ Begin Siege</button>
          <div style={{fontSize:"10px",color:"#333",letterSpacing:".1em",textAlign:"center"}}>
            Tap D-pad or use Arrow Keys/WASD · R to Rotate · Space/Enter to Act
          </div>
        </div>
      )}

      {tab==="scores"&&(
        <div style={{minWidth:"320px"}}>
          {scores.length===0
            ? <div style={{color:"#333",textAlign:"center",padding:"20px",fontSize:"13px"}}>No battles recorded yet.<br/>Forge your legend!</div>
            : <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{borderBottom:"1px solid #222"}}>
                  {["#","Score","Difficulty","Round","Date"].map(h=>(
                    <th key={h} style={{padding:"6px 10px",color:"#444",fontSize:"10px",letterSpacing:".1em",textAlign:"left"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{scores.map((s,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #111"}}>
                    <td style={{padding:"6px 10px",color:i===0?"#c0a060":"#444",fontSize:"12px"}}>{i===0?"👑":i+1}</td>
                    <td style={{padding:"6px 10px",color:"#e5e5e5",fontWeight:i===0?"700":"400",fontSize:"14px"}}>{s.score.toLocaleString()}</td>
                    <td style={{padding:"6px 10px",color:DIFFICULTIES[s.diff]?.color||"#aaa",fontSize:"11px"}}>{s.diff}</td>
                    <td style={{padding:"6px 10px",color:"#666",fontSize:"11px"}}>{s.round}</td>
                    <td style={{padding:"6px 10px",color:"#444",fontSize:"10px"}}>{s.date}</td>
                  </tr>
                ))}</tbody>
              </table>
          }
        </div>
      )}

      {tab==="how"&&(
        <div style={{maxWidth:"420px",color:"#666",fontSize:"13px",lineHeight:"1.8",overflowY:"auto",maxHeight:"50vh"}} className="scrollable">
          {[
            ["🏗 BUILD","Place Tetris wall pieces to fully enclose your castle. Arrows/WASD to move, R to rotate, Space/Enter to place."],
            ["💣 PLACE","Place cannons inside your enclosed territory. Arrows to move cursor, Enter to place."],
            ["⚔ BATTLE","Fire at enemy ships! Move targeting cursor with arrows, Space to fire. Ships fire back and damage walls."],
            ["🔧 REPAIR","Patch holes in your walls. When walls are re-enclosed, press ESC/Q (or the DONE button) to advance."],
            ["🏰 Multi-Castle","Enclose additional castles to capture them — each gives 500 bonus points and expands your territory."],
            ["💀 Lives","You have 3 lives. Fail to enclose your walls in time and you lose one. Good luck, commander."],
          ].map(([t,d])=>(
            <div key={t} style={{marginBottom:"14px"}}>
              <div style={{color:"#c0a060",fontWeight:"700",marginBottom:"3px"}}>{t}</div>
              <div>{d}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Game Over Screen ─────────────────────────────────────────────────────────
function GameOverScreen({score,round,difficulty,scores,onRestart,onMenu}) {
  const isTop = scores.length>0 && scores[0].score===score && scores[0].round===round;
  return (
    <div style={{width:"100vw",height:"100vh",background:"#080c10",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Cinzel',serif",gap:"16px"}}>
      <style>{`@keyframes rp{0%,100%{text-shadow:0 0 20px #ff4444}50%{text-shadow:0 0 60px #ff4444,0 0 100px #ff444444}}`}</style>
      <div style={{fontSize:"52px"}}>{isTop?"👑":"💀"}</div>
      <h2 style={{fontSize:"clamp(36px,8vw,56px)",color:"#ff4444",letterSpacing:".15em",animation:"rp 2s ease-in-out infinite"}}>GAME OVER</h2>
      {isTop&&<div style={{color:"#c0a060",fontSize:"13px",letterSpacing:".2em"}}>✦ NEW HIGH SCORE ✦</div>}
      <div style={{display:"flex",gap:"32px"}}>
        {[["SCORE",score.toLocaleString()],["ROUND",round],[DIFFICULTIES[difficulty]?.label||difficulty,"RANK"]].map(([l,v])=>(
          <div key={l} style={{textAlign:"center"}}>
            <div style={{fontSize:"10px",color:"#444",letterSpacing:".2em",marginBottom:"4px"}}>{l}</div>
            <div style={{fontSize:"28px",color:"#c0a060",fontWeight:"700"}}>{v}</div>
          </div>
        ))}
      </div>
      {scores.slice(0,3).map((s,i)=>(
        <div key={i} style={{fontSize:"12px",color:i===0?"#c0a060":"#555"}}>
          {i+1}. {s.score.toLocaleString()} — {s.diff} · Round {s.round}
        </div>
      ))}
      <div style={{display:"flex",gap:"12px",marginTop:"8px"}}>
        <button onClick={onRestart} style={{background:"#c0a060",color:"#080c10",border:"none",padding:"13px 36px",fontFamily:"'Cinzel',serif",fontWeight:"700",fontSize:"14px",letterSpacing:".1em",cursor:"pointer",borderRadius:"3px",touchAction:"manipulation"}}>⚔ Play Again</button>
        <button onClick={onMenu} style={{background:"transparent",color:"#888",border:"1px solid #333",padding:"13px 36px",fontFamily:"'Cinzel',serif",fontSize:"14px",letterSpacing:".1em",cursor:"pointer",borderRadius:"3px",touchAction:"manipulation"}}>↩ Menu</button>
      </div>
    </div>
  );
}

// ─── Touch D-Pad ──────────────────────────────────────────────────────────────
function DPad({onDir,onAction,onRotate,onEscape,phase,cell}) {
  const sz = Math.max(44, cell * 1.8);
  const bs = (active=false) => ({
    width:sz, height:sz, background:active?"#2a2a2a":"#141414",
    border:"1px solid #2a2a2a", borderRadius:6, color:"#c0a060",
    fontSize:Math.max(18,sz*0.45), display:"flex", alignItems:"center", justifyContent:"center",
    cursor:"pointer", touchAction:"manipulation", userSelect:"none", transition:"background .1s",
    WebkitTapHighlightColor:"transparent",
  });
  const pr = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn(); };
  const isBuild = phase===PHASE.BUILD||phase===PHASE.REPAIR;

  return (
    <div style={{
      position:"fixed", bottom:0, left:0, right:0,
      background:"#080c10cc", backdropFilter:"blur(10px)",
      borderTop:"1px solid #1e1e1e",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:`8px ${Math.max(8,sz*.3)}px`,
      gap:16, zIndex:500,
      paddingBottom:`max(8px, env(safe-area-inset-bottom))`,
    }}>
      {/* D-Pad */}
      <div style={{display:"grid",gridTemplateColumns:`${sz}px ${sz}px ${sz}px`,gridTemplateRows:`${sz}px ${sz}px ${sz}px`,gap:4}}>
        <div/>
        <div style={bs()} onTouchStart={pr(()=>onDir(-1,0))} onMouseDown={pr(()=>onDir(-1,0))}>↑</div>
        <div/>
        <div style={bs()} onTouchStart={pr(()=>onDir(0,-1))} onMouseDown={pr(()=>onDir(0,-1))}>←</div>
        <div style={{...bs(),background:"#1a1a1a",fontSize:sz*.3,color:"#444",letterSpacing:"-1px"}}>✛</div>
        <div style={bs()} onTouchStart={pr(()=>onDir(0,1))} onMouseDown={pr(()=>onDir(0,1))}>→</div>
        <div/>
        <div style={bs()} onTouchStart={pr(()=>onDir(1,0))} onMouseDown={pr(()=>onDir(1,0))}>↓</div>
        <div/>
      </div>

      {/* Action buttons */}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {isBuild&&(
          <div style={{...bs(),background:"#1a2a3a",color:"#88aaff",fontSize:Math.max(14,sz*.35),width:sz*1.6,letterSpacing:0}}
            onTouchStart={pr(onRotate)} onMouseDown={pr(onRotate)}>↻ ROT</div>
        )}
        <div style={{...bs(),
          background: phase===PHASE.BATTLE?"#3a1a0a":"#1a0a0a",
          color: phase===PHASE.BATTLE?"#ff6b35":"#c0a060",
          width:sz*1.6, height:isBuild?sz:sz*1.5,
          fontSize: phase===PHASE.BATTLE?Math.max(22,sz*.6):Math.max(16,sz*.4),
          border:`1px solid ${phase===PHASE.BATTLE?"#ff6b3544":"#c0a06044"}`,
        }}
          onTouchStart={pr(onAction)} onMouseDown={pr(onAction)}>
          {phase===PHASE.BATTLE?"🎯":phase===PHASE.PLACE?"💣":"▣"}
        </div>
        {phase===PHASE.REPAIR&&(
          <div style={{...bs(),background:"#1a2a1a",color:"#4ade80",fontSize:Math.max(12,sz*.32),width:sz*1.6}}
            onTouchStart={pr(onEscape)} onMouseDown={pr(onEscape)}>DONE</div>
        )}
      </div>
    </div>
  );
}

// ─── Main Rampart Component ───────────────────────────────────────────────────
export default function Rampart() {
  const [screen, setScreen] = useState("menu");
  const [gs, setGs] = useState(null);
  const [scores, setScores] = useState(loadScores);
  const cell = useCellSize();
  const tickRef = useRef(null);

  const startGame = useCallback(diff => {
    setGs(initState(diff));
    setScreen("game");
    SFX.round();
  }, []);

  const endGame = useCallback(finalGs => {
    saveScore(finalGs.score, finalGs.difficulty, finalGs.round);
    setScores(loadScores());
    setGs(finalGs);
    setScreen("gameover");
    SFX.over();
  }, []);

  // ─── Action dispatcher ───────────────────────────────────────────────────
  const dispatch = useCallback(action => {
    setGs(prev => {
      if (!prev || prev.phase===PHASE.GAMEOVER) return prev;
      const s = {
        ...prev,
        grid: prev.grid.map(r=>[...r]),
        cannons: [...prev.cannons],
        ships: prev.ships.map(sh=>({...sh})),
        projectiles: [...prev.projectiles],
        enemyProjectiles: [...prev.enemyProjectiles],
        explosions: [...prev.explosions],
        particles: [...prev.particles],
        encCells: new Set(prev.encCells),
        castles: prev.castles.map(c=>({...c})),
      };
      const {type,dr,dc} = action;

      if (s.phase===PHASE.BUILD||s.phase===PHASE.REPAIR) {
        if (type==="dir") s.piecePos={r:s.piecePos.r+dr,c:s.piecePos.c+dc};
        if (type==="rotate") { s.curPiece=rotatePiece(s.curPiece); SFX.select(); }
        if (type==="action") {
          const cells=s.curPiece.map(([pr,pc])=>[s.piecePos.r+pr,s.piecePos.c+pc]);
          const ok=cells.every(([r,c])=>r>=0&&r<ROWS&&c>=0&&c<COLS-8
            &&s.grid[r][c]!==CT.WATER&&s.grid[r][c]!==CT.CASTLE
            &&!(s.phase===PHASE.REPAIR&&s.grid[r][c]===CT.CANNON));
          if (ok) {
            cells.forEach(([r,c])=>{s.grid[r][c]=CT.WALL;});
            SFX.place();
            s.curPiece=s.nxtPiece; s.nxtPiece=randPiece();
            let enc=false, encC=new Set();
            for (const cas of s.castles) {
              if (enclosed(s.grid,cas.r,cas.c)) {
                enc=true;
                const f=flood(s.grid,cas.r,cas.c);
                f.forEach(k=>encC.add(k));
                if (!cas.owned) { cas.owned=true; s.score+=500; s.message="Castle captured! +500"; }
              }
            }
            s.enclosed=enc; s.encCells=encC;
            if (enc&&s.phase===PHASE.BUILD) { SFX.enclose(); s.message="Enclosed! Press ▣ to place cannons."; }
          }
        }
        if (type==="confirm"&&s.enclosed&&s.phase===PHASE.BUILD) {
          s.phase=PHASE.PLACE; s.cannonCur={...s.castles[0]}; s.placedCannons=0;
          s.message=`Place ${s.maxCannons} cannons. Arrows + ▣`;
        }
        if (type==="escape"&&s.phase===PHASE.REPAIR) {
          let ok=false; const encC=new Set();
          for (const cas of s.castles) {
            if (cas.owned&&enclosed(s.grid,cas.r,cas.c)) {
              ok=true; flood(s.grid,cas.r,cas.c).forEach(k=>encC.add(k));
            }
          }
          if (ok) {
            s.enclosed=true; s.encCells=encC;
            s.phase=PHASE.PLACE; s.round++; s.maxCannons=Math.min(s.maxCannons+1,7);
            s.placedCannons=0; s.cannonCur={...s.castles.find(c=>c.owned)};
            s.cannons=s.cannons.filter(cn=>encC.has(`${cn.r},${cn.c}`)||s.grid[cn.r][cn.c]===CT.CASTLE);
            s.timeLeft=s.diff.buildTime; s.score+=100*s.round; SFX.round();
            s.message=`Round ${s.round}! Place ${s.maxCannons} cannons.`;
          } else s.message="Walls not enclosed! Keep repairing...";
        }
      }

      else if (s.phase===PHASE.PLACE) {
        if (type==="dir") {
          const nr=s.cannonCur.r+dr, nc=s.cannonCur.c+dc;
          if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS-8) s.cannonCur={r:nr,c:nc};
        }
        if (type==="action"||type==="confirm") {
          const{r,c}=s.cannonCur, k=`${r},${c}`;
          if ((s.encCells.has(k)||s.grid[r][c]===CT.CASTLE)&&!s.cannons.find(cn=>cn.r===r&&cn.c===c)) {
            s.cannons.push({r,c,id:Date.now()+Math.random()});
            s.grid[r][c]=CT.CANNON; s.placedCannons++; SFX.cannon();
            s.message=`Cannon placed! (${s.placedCannons}/${s.maxCannons})`;
            if (s.placedCannons>=s.maxCannons) {
              s.phase=PHASE.BATTLE; s.ships=spawnShips(s.round,s.diff);
              s.cursorR=Math.floor(ROWS/2); s.cursorC=COLS-12;
              s.timeLeft=s.diff.battleTime+s.round*3; SFX.round();
              s.message="⚔ BATTLE! Move cursor + 🎯 to fire!";
            }
          } else s.message="Place cannon inside your walls!";
        }
      }

      else if (s.phase===PHASE.BATTLE) {
        if (type==="dir") {
          s.cursorR=Math.max(0,Math.min(ROWS-1,s.cursorR+dr));
          s.cursorC=Math.max(0,Math.min(COLS-1,s.cursorC+dc));
        }
        if (type==="action"||type==="confirm") {
          if (s.cannons.length>0) {
            const cn=s.cannons.reduce((b,c)=>
              Math.abs(c.r-s.cursorR)+Math.abs(c.c-s.cursorC)<Math.abs(b.r-s.cursorR)+Math.abs(b.c-s.cursorC)?c:b
            );
            s.projectiles.push({id:Date.now()+Math.random(),r:cn.r,c:cn.c,tr:s.cursorR,tc:s.cursorC,progress:0});
            SFX.fire(); s.score+=2;
          }
        }
      }
      return s;
    });
  }, []);

  // ─── Keyboard ────────────────────────────────────────────────────────────
  useEffect(()=>{
    if (screen!=="game") return;
    const map = {
      ArrowUp:()=>dispatch({type:"dir",dr:-1,dc:0}), w:()=>dispatch({type:"dir",dr:-1,dc:0}),
      ArrowDown:()=>dispatch({type:"dir",dr:1,dc:0}), s:()=>dispatch({type:"dir",dr:1,dc:0}),
      ArrowLeft:()=>dispatch({type:"dir",dr:0,dc:-1}), a:()=>dispatch({type:"dir",dr:0,dc:-1}),
      ArrowRight:()=>dispatch({type:"dir",dr:0,dc:1}), d:()=>dispatch({type:"dir",dr:0,dc:1}),
      r:()=>dispatch({type:"rotate"}), R:()=>dispatch({type:"rotate"}),
      " ":()=>dispatch({type:"action"}), Enter:()=>dispatch({type:"confirm"}),
      Escape:()=>dispatch({type:"escape"}), q:()=>dispatch({type:"escape"}), Q:()=>dispatch({type:"escape"}),
    };
    const h=(e)=>{ if(map[e.key]){ e.preventDefault(); map[e.key](); } };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[screen,dispatch]);

  // ─── Touch helpers ────────────────────────────────────────────────────────
  const tDir=useCallback((dr,dc)=>dispatch({type:"dir",dr,dc}),[dispatch]);
  const tAct=useCallback(()=>dispatch({type:"action"}),[dispatch]);
  const tRot=useCallback(()=>dispatch({type:"rotate"}),[dispatch]);
  const tEsc=useCallback(()=>dispatch({type:"escape"}),[dispatch]);
  const tCon=useCallback(()=>dispatch({type:"confirm"}),[dispatch]);

  // ─── Game tick ────────────────────────────────────────────────────────────
  useEffect(()=>{
    if (screen!=="game") return;
    tickRef.current=setInterval(()=>{
      setGs(prev=>{
        if (!prev||prev.phase===PHASE.GAMEOVER) return prev;
        const s={
          ...prev, grid:prev.grid.map(r=>[...r]),
          ships:prev.ships.map(sh=>({...sh})),
          projectiles:prev.projectiles.map(p=>({...p})),
          enemyProjectiles:prev.enemyProjectiles.map(p=>({...p})),
          explosions:prev.explosions.map(e=>({...e})),
          particles:prev.particles.map(p=>({...p})),
          cannons:[...prev.cannons],
          castles:prev.castles.map(c=>({...c})),
          encCells:new Set(prev.encCells),
        };

        // Timer
        if (s.phase===PHASE.BUILD||s.phase===PHASE.BATTLE||s.phase===PHASE.REPAIR) {
          s.timeLeft=Math.max(0,s.timeLeft-1/60);
          if (s.timeLeft<10&&s.timeLeft>0&&Math.floor(s.timeLeft*60)%60===0) SFX.tick();
          if (s.timeLeft<=0) {
            if (s.phase===PHASE.BUILD) {
              if (!s.enclosed) { s.lives--; SFX.life(); if (s.lives<=0) return{...s,phase:PHASE.GAMEOVER}; s.timeLeft=s.diff.buildTime; s.message="Life lost! Keep building!"; }
              else { s.phase=PHASE.PLACE; s.cannonCur={...s.castles[0]}; s.placedCannons=0; s.message=`Place ${s.maxCannons} cannons!`; }
            } else if (s.phase===PHASE.BATTLE) {
              s.phase=PHASE.REPAIR; s.timeLeft=s.diff.repairTime;
              s.curPiece=randPiece(); s.nxtPiece=randPiece(); s.piecePos={r:5,c:3};
              s.projectiles=[]; s.enemyProjectiles=[]; s.enclosed=false; s.encCells=new Set();
              s.message="🔧 REPAIR walls! Tap DONE when enclosed.";
            } else if (s.phase===PHASE.REPAIR) {
              s.lives--; SFX.life(); if(s.lives<=0) return{...s,phase:PHASE.GAMEOVER};
              s.phase=PHASE.PLACE; s.round++; s.placedCannons=0; s.maxCannons=Math.min(s.maxCannons+1,7);
              s.timeLeft=s.diff.repairTime; s.message=`Time! Round ${s.round} — place cannons.`;
            }
          }
        }
        if (s.phase===PHASE.GAMEOVER) return s;

        // Projectiles
        s.projectiles=s.projectiles.filter(p=>{
          p.progress=Math.min(1,p.progress+0.05);
          if(p.progress>=1){
            const hr=Math.round(p.tr),hc=Math.round(p.tc);
            s.explosions.push({r:hr,c:hc,t:0,id:Date.now()+Math.random()});
            SFX.boom();
            for(let i=0;i<6;i++) s.particles.push({id:Date.now()+Math.random(),r:p.tr,c:p.tc,vr:(Math.random()-.5)*.3,vc:(Math.random()-.5)*.3,life:1,decay:.06+Math.random()*.04,color:"#ff8800"});
            s.ships=s.ships.map(sh=>{
              if(Math.abs(sh.r-hr)<=1.2&&Math.abs(sh.c-hc)<=1.2){
                s.score+=sh.type==="heavy"?100:50;
                if(sh.hp<=1){SFX.sink();s.score+=150;}
                return{...sh,hp:sh.hp-1};
              } return sh;
            }).filter(sh=>sh.hp>0);
            return false;
          } return true;
        });

        s.enemyProjectiles=s.enemyProjectiles.filter(p=>{
          p.progress=Math.min(1,p.progress+0.038);
          if(p.progress>=1){
            const hr=Math.round(p.tr),hc=Math.round(p.tc);
            s.explosions.push({r:hr,c:hc,t:0,id:Date.now()+Math.random(),enemy:true});
            if(hr>=0&&hr<ROWS&&hc>=0&&hc<COLS){
              if(s.grid[hr][hc]===CT.WALL){ s.grid[hr][hc]=CT.LAND; for(let i=0;i<4;i++) s.particles.push({id:Date.now()+Math.random(),r:p.tr,c:p.tc,vr:(Math.random()-.5)*.2,vc:(Math.random()-.5)*.2,life:1,decay:.05,color:"#8b7355"}); }
              if(s.grid[hr][hc]===CT.CANNON){ s.grid[hr][hc]=CT.LAND; s.cannons=s.cannons.filter(cn=>!(cn.r===hr&&cn.c===hc)); }
            }
            return false;
          } return true;
        });

        s.particles=s.particles.map(p=>({...p,r:p.r+p.vr,c:p.c+p.vc,life:p.life-p.decay})).filter(p=>p.life>0);
        s.explosions=s.explosions.map(e=>({...e,t:e.t+1})).filter(e=>e.t<20);

        // Ships
        if (s.phase===PHASE.BATTLE) {
          s.ships=s.ships.map(sh=>{
            const n={...sh};
            n.moveTimer++; n.fireTimer--;
            if(n.moveTimer>=(sh.type==="heavy"?120:85)){ n.moveTimer=0; n.r=Math.max(0,Math.min(ROWS-1,n.r+n.dy)); if(n.r<=0||n.r>=ROWS-1) n.dy*=-1; }
            if(n.fireTimer<=0){
              n.fireTimer=s.diff.fireRate*(0.7+Math.random()*.6);
              const tgts=[...s.cannons,...s.castles.filter(c=>c.owned)];
              if(tgts.length>0){ const t=tgts[Math.floor(Math.random()*tgts.length)];
                s.enemyProjectiles.push({id:Date.now()+Math.random(),r:n.r,c:n.c,tr:t.r+(Math.random()-.5)*2.5,tc:t.c+(Math.random()-.5)*2.5,progress:0}); }
            }
            return n;
          });
          if(s.ships.length===0){
            s.phase=PHASE.REPAIR; s.timeLeft=s.diff.repairTime;
            s.curPiece=randPiece(); s.nxtPiece=randPiece(); s.piecePos={r:5,c:3};
            s.projectiles=[]; s.enemyProjectiles=[]; s.enclosed=false; s.encCells=new Set();
            s.score+=300+50*s.round; s.message="🔧 All ships sunk! REPAIR walls. Tap DONE when done.";
          }
        }
        return s;
      });
    },1000/60);
    return ()=>clearInterval(tickRef.current);
  },[screen]);

  // Check game over
  useEffect(()=>{
    if (gs?.phase===PHASE.GAMEOVER&&screen==="game") endGame(gs);
  },[gs?.phase,screen,endGame]);

  // ─── Screens ──────────────────────────────────────────────────────────────
  if (screen==="menu") return <StartScreen onStart={startGame} scores={scores}/>;
  if (screen==="gameover"&&gs) return <GameOverScreen score={gs.score} round={gs.round} difficulty={gs.difficulty} scores={scores} onRestart={()=>startGame(gs.difficulty)} onMenu={()=>setScreen("menu")}/>;
  if (!gs) return null;

  // ─── Game Render ──────────────────────────────────────────────────────────
  const {grid,phase,round,score,lives,timeLeft,curPiece,piecePos,cursorR,cursorC,
    cannonCur,ships,projectiles,enemyProjectiles,explosions,particles,
    message,enclosed:enc,encCells,cannons,nxtPiece,maxCannons,placedCannons,diff} = gs;

  const pCells = new Set(curPiece.map(([dr,dc])=>`${piecePos.r+dr},${piecePos.c+dc}`));
  const totalTime = phase===PHASE.BATTLE?diff.battleTime+round*3:phase===PHASE.REPAIR?diff.repairTime:diff.buildTime;
  const timerPct = timeLeft/totalTime;
  const timerCol = timerPct>.5?"#4ade80":timerPct>.25?"#facc15":"#f87171";

  // Sidebar width
  const sideW = Math.max(120, cell * 5.5);
  const boardW = COLS * cell;
  const boardH = ROWS * cell;
  const isLandscape = typeof window!=="undefined"&&window.innerWidth>window.innerHeight;

  function bg(r,c) {
    const t=grid[r][c], k=`${r},${c}`;
    if (explosions.some(e=>e.r===r&&e.c===c)) return "#ff3300";
    if ((phase===PHASE.BUILD||phase===PHASE.REPAIR)&&pCells.has(k)) return "#3a6a9a";
    if (phase===PHASE.PLACE&&r===cannonCur.r&&c===cannonCur.c) return "#ccaa00";
    if (phase===PHASE.BATTLE&&r===cursorR&&c===cursorC) return "#cc4400";
    if (encCells.has(k)&&t===CT.LAND) return "#1e3a12";
    switch(t){
      case CT.WALL:   return "#7a6545";
      case CT.CASTLE: return "#b09050";
      case CT.CANNON: return "#4a4a28";
      case CT.WATER:  return "#0d2540";
      default:        return "#253d18";
    }
  }

  return (
    <div style={{
      width:"100vw", height:"100vh", background:"#080c10",
      display:"flex", flexDirection:"column", alignItems:"center",
      fontFamily:"'Cinzel',serif", overflow:"hidden",
      paddingBottom:`calc(${Math.max(44,cell*1.8)*3+40}px + env(safe-area-inset-bottom))`,
    }}>
      <style>{`
        @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        @keyframes cpulse{0%,100%{filter:drop-shadow(0 0 3px #ff6600)}50%{filter:drop-shadow(0 0 9px #ff6600)}}
        @keyframes flicker{0%,100%{opacity:1}50%{opacity:.7}}
      `}</style>

      {/* Top HUD */}
      <div style={{
        width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:`4px 12px`, background:"#0d1117", borderBottom:"1px solid #1e1e1e",
        fontSize:Math.max(11,cell*.5)+"px", color:"#888", flexShrink:0,
        paddingTop:`max(4px, env(safe-area-inset-top))`,
      }}>
        <span style={{color:"#c0a060",fontWeight:"700",letterSpacing:".05em",animation:"flicker 4s infinite"}}>⚔ RAMPART</span>
        <span>Round <b style={{color:"#c0a060"}}>{round}</b></span>
        <span><b style={{color:"#f87171"}}>{"♥".repeat(lives)}</b><span style={{color:"#1e1e1e"}}>{"♥".repeat(Math.max(0,3-lives))}</span></span>
        <span>Score <b style={{color:"#c0a060"}}>{score.toLocaleString()}</b></span>
        <span style={{color:timerCol,fontWeight:"700"}}>{Math.ceil(timeLeft)}s</span>
        <span style={{color:DIFFICULTIES[gs.difficulty].color,fontSize:Math.max(9,cell*.4)+"px"}}>{DIFFICULTIES[gs.difficulty].label}</span>
        <button onClick={()=>setScreen("menu")} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:Math.max(9,cell*.4)+"px",touchAction:"manipulation"}}>MENU</button>
      </div>

      {/* Timer bar */}
      <div style={{width:"100%",height:3,background:"#111",flexShrink:0}}>
        <div style={{height:"100%",width:`${Math.max(0,timerPct*100)}%`,background:timerCol,transition:"width .5s linear, background .5s",boxShadow:`0 0 6px ${timerCol}`}}/>
      </div>

      {/* Message */}
      <div style={{
        width:"100%", padding:"4px 12px", background:"#0a0e14", borderBottom:"1px solid #1a1a1a",
        fontSize:Math.max(10,cell*.45)+"px", color:"#ffcc44", textAlign:"center",
        letterSpacing:".03em", flexShrink:0,
      }}>{message}</div>

      {/* Board + Sidebar */}
      <div style={{
        display:"flex", flex:1, alignItems:"flex-start", justifyContent:"center",
        overflow:"hidden", padding:"6px",
        gap: isLandscape?8:4,
        flexDirection: isLandscape?"row":"column",
      }}>
        {/* Board */}
        <div style={{position:"relative",flexShrink:0}}>
          <div style={{
            display:"grid",
            gridTemplateColumns:`repeat(${COLS},${cell}px)`,
            border:"2px solid #1e1e1e",
            boxShadow:"0 0 40px #00000099",
          }}>
            {Array.from({length:ROWS},(_,r)=>
              Array.from({length:COLS},(_,c)=>{
                const t=grid[r][c];
                const isCur=(phase===PHASE.BATTLE&&r===cursorR&&c===cursorC);
                return (
                  <div key={`${r},${c}`} style={{
                    width:cell,height:cell,background:bg(r,c),
                    borderRight:t===CT.WATER?"1px solid #091c30":"1px solid #1a2a12",
                    borderBottom:t===CT.WATER?"1px solid #091c30":"1px solid #1a2a12",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:Math.max(8,cell-10)+"px",position:"relative",overflow:"hidden",
                  }}>
                    {t===CT.WALL&&<div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,#8b7355,#5a4530 50%,#7a6545)",opacity:.9}}/>}
                    {t===CT.CASTLE&&<span style={{zIndex:1}}>🏰</span>}
                    {t===CT.CANNON&&<span style={{zIndex:1,animation:"cpulse 1.5s infinite"}}>💣</span>}
                    {isCur&&<div style={{position:"absolute",inset:0,border:`2px solid #ff5500`,background:"#ff550022",display:"flex",alignItems:"center",justifyContent:"center",fontSize:Math.max(10,cell-8)+"px",animation:"cpulse .6s infinite",zIndex:2}}>🎯</div>}
                    {phase===PHASE.PLACE&&r===cannonCur.r&&c===cannonCur.c&&<div style={{position:"absolute",inset:0,border:"2px solid #ffdd00",background:"#ffdd0022",display:"flex",alignItems:"center",justifyContent:"center",fontSize:Math.max(10,cell-8)+"px",zIndex:2}}>+</div>}
                  </div>
                );
              })
            )}
          </div>

          {/* Ships */}
          {ships.map(sh=>(
            <div key={sh.id} style={{
              position:"absolute",top:sh.r*cell,left:sh.c*cell,
              width:cell*2,height:cell,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:sh.type==="heavy"?Math.max(16,cell*.7)+"px":Math.max(12,cell*.55)+"px",
              animation:"bob 2s ease-in-out infinite",zIndex:10,pointerEvents:"none",
              filter:sh.hp<=1?"drop-shadow(0 0 6px #ff4400)":"drop-shadow(0 0 4px #4488ff)",
            }}>
              {sh.type==="heavy"?"🛳️":"⛵"}
              <div style={{position:"absolute",bottom:1,left:3,right:3,height:2,background:"#ff4444"}}>
                <div style={{width:`${(sh.hp/sh.maxHp)*100}%`,height:"100%",background:"#44ff44"}}/>
              </div>
            </div>
          ))}

          {/* Player projectiles */}
          {projectiles.map(p=>{
            const pr=lerp(p.r,p.tr,p.progress), pc=lerp(p.c,p.tc,p.progress);
            const sc=0.5+Math.sin(p.progress*Math.PI)*0.5;
            return <div key={p.id} style={{position:"absolute",top:pr*cell+cell/2-5,left:pc*cell+cell/2-5,width:10,height:10,borderRadius:"50%",background:"#ff8800",boxShadow:"0 0 12px #ff8800,0 0 4px #fff",transform:`scale(${sc})`,zIndex:20,pointerEvents:"none"}}/>;
          })}

          {/* Enemy projectiles */}
          {enemyProjectiles.map(p=>{
            const pr=lerp(p.r,p.tr,p.progress), pc=lerp(p.c,p.tc,p.progress);
            return <div key={p.id} style={{position:"absolute",top:pr*cell+cell/2-4,left:pc*cell+cell/2-4,width:8,height:8,borderRadius:"50%",background:"#3388ff",boxShadow:"0 0 10px #3388ff",zIndex:20,pointerEvents:"none"}}/>;
          })}

          {/* Explosions */}
          {explosions.map(ex=>(
            <div key={ex.id} style={{position:"absolute",top:ex.r*cell-cell/2,left:ex.c*cell-cell/2,width:cell*2,height:cell*2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:Math.max(18,cell)+"px",opacity:Math.max(0,1-ex.t/20),transform:`scale(${.5+ex.t/20})`,zIndex:30,pointerEvents:"none"}}>💥</div>
          ))}

          {/* Particles */}
          {particles.map(p=>(
            <div key={p.id} style={{position:"absolute",top:p.r*cell,left:p.c*cell,width:4,height:4,borderRadius:"50%",background:p.color||"#ff8800",opacity:p.life,zIndex:25,pointerEvents:"none"}}/>
          ))}
        </div>

        {/* Sidebar */}
        <div style={{
          display:"flex",
          flexDirection: isLandscape?"column":"row",
          gap:6, flexShrink:0,
          width: isLandscape?sideW+"px":"100%",
          flexWrap: isLandscape?"nowrap":"wrap",
          alignItems: isLandscape?"stretch":"flex-start",
        }}>
          {/* Next piece */}
          {(phase===PHASE.BUILD||phase===PHASE.REPAIR)&&(
            <div style={{background:"#0d1117",border:"1px solid #1e1e1e",padding:"8px",minWidth:80}}>
              <div style={{fontSize:"9px",color:"#444",letterSpacing:".15em",marginBottom:"6px"}}>NEXT</div>
              {(()=>{
                const mr=Math.max(...nxtPiece.map(([r])=>r)), mc=Math.max(...nxtPiece.map(([,c])=>c));
                const cs=new Set(nxtPiece.map(([r,c])=>`${r},${c}`));
                return <div style={{display:"inline-grid",gridTemplateColumns:`repeat(${mc+1},${Math.max(10,cell*.6)}px)`,gap:1}}>
                  {Array.from({length:mr+1},(_,r)=>Array.from({length:mc+1},(_,c)=>(
                    <div key={`${r},${c}`} style={{width:Math.max(10,cell*.6),height:Math.max(10,cell*.6),background:cs.has(`${r},${c}`)?"#7a6545":"transparent",border:cs.has(`${r},${c}`)?"1px solid #5a4535":"1px solid transparent"}}/>
                  )))};
                </div>;
              })()}
            </div>
          )}

          {/* Phase */}
          <div style={{background:"#0d1117",border:"1px solid #1e1e1e",padding:"8px"}}>
            <div style={{fontSize:"9px",color:"#444",letterSpacing:".15em",marginBottom:"6px"}}>PHASE</div>
            {[PHASE.BUILD,PHASE.PLACE,PHASE.BATTLE,PHASE.REPAIR].map(p=>(
              <div key={p} style={{fontSize:Math.max(9,cell*.42)+"px",color:phase===p?"#c0a060":"#2a2a2a",fontWeight:phase===p?"700":"400",marginBottom:3}}>
                {phase===p?"▶ ":"  "}{p}
              </div>
            ))}
          </div>

          {/* Ships remaining */}
          {phase===PHASE.BATTLE&&(
            <div style={{background:"#0d1117",border:"1px solid #1e1e1e",padding:"8px"}}>
              <div style={{fontSize:"9px",color:"#444",letterSpacing:".15em",marginBottom:"6px"}}>SHIPS</div>
              <div style={{fontSize:Math.max(14,cell*.7)+"px",lineHeight:1.4,letterSpacing:2}}>
                {ships.map(sh=>sh.type==="heavy"?"🛳️":"⛵").join("")||"✓ ALL SUNK"}
              </div>
            </div>
          )}

          {/* Cannons */}
          {phase===PHASE.PLACE&&(
            <div style={{background:"#0d1117",border:"1px solid #1e1e1e",padding:"8px"}}>
              <div style={{fontSize:"9px",color:"#444",letterSpacing:".15em",marginBottom:"6px"}}>CANNONS</div>
              <div style={{fontSize:Math.max(14,cell*.7)+"px"}}>{"💣".repeat(placedCannons)}{"⬜".repeat(Math.max(0,maxCannons-placedCannons))}</div>
            </div>
          )}

          {/* Timer large */}
          <div style={{background:"#0d1117",border:"1px solid #1e1e1e",padding:"8px"}}>
            <div style={{fontSize:"9px",color:"#444",letterSpacing:".15em",marginBottom:"4px"}}>TIME</div>
            <div style={{fontSize:Math.max(22,cell*1.1)+"px",color:timerCol,fontWeight:"700",letterSpacing:"-1px"}}>{Math.ceil(timeLeft)}</div>
          </div>
        </div>
      </div>

      {/* Touch D-pad */}
      <DPad onDir={tDir} onAction={tAct} onRotate={tRot} onEscape={tEsc} phase={phase} cell={cell}/>
    </div>
  );
}
