import { useState, useEffect, useRef, useCallback } from "react";

const N=4,CELL=28,TH=14,CH=22,CW=400,CVH=260,OX=200,OY=90;

const PALETTE={
  blue:  {top:'#7EC8E3',left:'#3A8FB5',right:'#1D6F94'},
  red:   {top:'#FF8A80',left:'#E53935',right:'#B71C1C'},
  lime:  {top:'#C5E1A5',left:'#7CB342',right:'#558B2F'},
  orange:{top:'#FFCC80',left:'#FB8C00',right:'#E65100'},
  purple:{top:'#CE93D8',left:'#8E24AA',right:'#6A1B9A'},
  pink:  {top:'#F48FB1',left:'#E91E63',right:'#AD1457'},
};
const SWATCHES={blue:'#5BB8D4',red:'#EF5350',lime:'#7CB342',orange:'#FB8C00',purple:'#AB47BC',pink:'#EC407A'};
const GOLD={top:'#FFD700',left:'#FFA500',right:'#CC7700'};
const GADD={top:'#A5D6A7',left:'#4CAF50',right:'#2E7D32'};
const GHST={top:'rgba(126,200,227,0.3)',left:'rgba(58,143,181,0.2)',right:'rgba(29,111,148,0.15)'};

/* ── shared iso helpers ──────────────────────────────────────────────────── */
function rotXZ(x,z,t,gN){let rx=x,rz=z;for(let i=0;i<((t%4+4)%4);i++)[rx,rz]=[gN-1-rz,rx];return[rx,rz];}
function toPx1(x,z,y,rot){const[rx,rz]=rotXZ(x,z,rot,N);return{sx:OX+(rx-rz)*CELL,sy:OY+(rx+rz)*TH-y*CH};}
function hexV(sx,sy,vc,vt,vch){return[[sx,sy],[sx+vc,sy+vt],[sx+vc,sy+vt+vch],[sx,sy+2*vt+vch],[sx-vc,sy+vt+vch],[sx-vc,sy+vt]];}
function inPoly(px,py,poly){let ins=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const[xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>py)!==(yj>py)&&px<(xj-xi)*(py-yi)/(yj-yi)+xi)ins=!ins;}return ins;}
function sortedCubes(set,rot,gN){return[...set].map(k=>{const[x,y,z]=k.split(',').map(Number);const[rx,rz]=rotXZ(x,z,rot,gN);return{k,x,y,z,d:rx+rz+y*0.01};}).sort((a,b)=>a.d-b.d);}

function drawFace(ctx,pts,fill,str){
  ctx.beginPath();pts.forEach(function(p,i){i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});
  ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=str||'#1a2030';ctx.stroke();
}
function drawCube(ctx,sx,sy,vc,vt,vch,c,str){
  ctx.lineWidth=Math.max(0.6,vc/30);
  drawFace(ctx,[[sx,sy],[sx+vc,sy+vt],[sx,sy+2*vt],[sx-vc,sy+vt]],c.top,str);
  drawFace(ctx,[[sx-vc,sy+vt],[sx,sy+2*vt],[sx,sy+2*vt+vch],[sx-vc,sy+vt+vch]],c.left,str);
  drawFace(ctx,[[sx+vc,sy+vt],[sx,sy+2*vt],[sx,sy+2*vt+vch],[sx+vc,sy+vt+vch]],c.right,str);
}

/* ── Tab-1 view grids ────────────────────────────────────────────────────── */
function getViews(cubes){
  const f=Array.from({length:N},()=>Array(N).fill(0));
  const t=Array.from({length:N},()=>Array(N).fill(0));
  const s=Array.from({length:N},()=>Array(N).fill(0));
  cubes.forEach(k=>{const p=k.split(',').map(Number);f[p[1]][p[0]]=1;t[p[2]][p[0]]=1;s[p[1]][p[2]]=1;});
  return{f,t,s};
}
const CS=20;
function ViewGrid({grid,selCell,label}){
  const items=[];
  for(let ri=0;ri<N;ri++)for(let ci=0;ci<N;ci++){
    const f=grid[ri]&&grid[ri][ci],isSel=selCell&&selCell.r===ri&&selCell.c===ci;
    items.push(<rect key={ri+'-'+ci} x={ci*CS} y={ri*CS} width={CS} height={CS} rx={1}
      fill={isSel?'#FFD700':f?'#3A8FB5':'#dde8f5'} stroke={isSel?'#CC8800':f?'#1D6F94':'#b0bcc8'} strokeWidth={isSel?2:0.5}/>);
  }
  for(let i=0;i<=N;i++){
    items.push(<line key={'h'+i} x1={0} y1={i*CS} x2={N*CS} y2={i*CS} stroke='#c8d0da' strokeWidth={0.5}/>);
    items.push(<line key={'v'+i} x1={i*CS} y1={0} x2={i*CS} y2={N*CS} stroke='#c8d0da' strokeWidth={0.5}/>);
  }
  return(<div style={{textAlign:'center'}}><div style={{fontSize:11,fontWeight:700,color:'#334',marginBottom:3}}>{label}</div>
    <svg width={N*CS+1} height={N*CS+1} style={{display:'block',borderRadius:3,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.12)'}}>{items}</svg></div>);
}

const SAMPLES=[
  ['0,0,0','1,0,0','2,0,0','1,0,1','2,0,1','2,0,2','2,1,0','2,1,1','2,2,0'],
  ['0,0,0','1,0,0','2,0,0','0,0,1','0,0,2','0,1,0','0,2,0'],
  ['1,0,1','1,1,1','1,2,1','0,0,1','2,0,1','1,0,0','1,0,2'],
  ['0,0,0','1,0,0','0,0,1','1,0,1','0,1,0','1,1,0','0,1,1','1,1,1'],
];

/* ── Volume: gravity-aware random placement ──────────────────────────────── */
function genGravityCubes(W,H,D,n){
  const placed=new Set();
  // build pool of placeable spots respecting gravity (y=0 or cube below exists)
  function placeable(){
    const pool=[];
    for(let x=0;x<W;x++)for(let z=0;z<D;z++)for(let y=0;y<H;y++){
      if(placed.has(x+','+y+','+z))continue;
      if(y===0||placed.has(x+','+(y-1)+','+z))pool.push(x+','+y+','+z);
    }
    return pool;
  }
  for(let i=0;i<n;i++){
    const pool=placeable();if(!pool.length)break;
    placed.add(pool[Math.floor(Math.random()*pool.length)]);
  }
  return placed;
}

/* ── Volume canvas metrics ───────────────────────────────────────────────── */
function volMetrics(W,H,D,rot,zoom){
  const gN=Math.max(W,D);
  let bx0=1e9,bx1=-1e9,by0=1e9,by1=-1e9;
  for(let x=0;x<W;x++)for(let z=0;z<D;z++)for(let y=0;y<H;y++){
    const[rx,rz]=rotXZ(x,z,rot,gN);
    const sx=rx-rz,sy=(rx+rz)-y*2;
    if(sx-1<bx0)bx0=sx-1;if(sx+1>bx1)bx1=sx+1;
    if(sy<by0)by0=sy;if(sy+2+1.6>by1)by1=sy+2+1.6;
  }
  const spanX=bx1-bx0,spanY=by1-by0;
  const base=Math.max(6,Math.min(26,Math.floor(Math.min(170/spanX,160/spanY))));
  const vc=Math.round(base*zoom),vt=Math.max(2,Math.round(vc/2)),vch=Math.max(4,Math.round(vc*0.8));
  const ox=CW/2-((bx0+bx1)/2)*vc;
  const oy=CVH/2-((by0+by1)/2)*vt+10;
  return{gN,vc,vt,vch,ox,oy};
}

/* ── App ─────────────────────────────────────────────────────────────────── */
export default function App(){
  // Tab 1
  const[tab,setTab]=useState(0);
  const[cubes,setCubes]=useState(()=>new Set(SAMPLES[0]));
  const[cColors,setCColors]=useState({});
  const[rot,setRot]=useState(0);
  const[sel,setSel]=useState(null);
  const[mode,setMode]=useState('build');
  const[xyz,setXyz]=useState({x:0,y:0,z:0});
  const[ghost,setGhost]=useState(null);
  const[activCol,setActivCol]=useState('blue');
  // Tab 2
  const[vW,setVW]=useState(3);
  const[vH,setVH]=useState(2);
  const[vD,setVD]=useState(3);
  const[vN,setVN]=useState(8);
  const[vNInput,setVNInput]=useState('8');
  const[volCubes,setVolCubes]=useState(()=>new Set());
  const[volData,setVolData]=useState(null);
  const[vSel,setVSel]=useState(null);
  const[vOk,setVOk]=useState(false);
  const[animC,setAnimC]=useState(()=>new Set());
  const[animOn,setAnimOn]=useState(false);
  const[spd,setSpd]=useState(500);
  const[zoom,setZoom]=useState(1);
  const[volRot,setVolRot]=useState(0);

  const mainR=useRef(null),volR=useRef(null),tmr=useRef(null);
  const selRef=useRef(sel),activColRef=useRef(activCol);
  useEffect(()=>{selRef.current=sel;},[sel]);
  useEffect(()=>{activColRef.current=activCol;},[activCol]);

  const vTotal=vW*vH*vD;

  // ── Tab-1 draw ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    const cv=mainR.current;if(!cv)return;
    const ctx=cv.getContext('2d');
    ctx.clearRect(0,0,CW,CVH);ctx.fillStyle='#f4f8fe';ctx.fillRect(0,0,CW,CVH);
    if(ghost&&!cubes.has(ghost)&&mode==='build'){
      const p=ghost.split(',').map(Number);const{sx,sy}=toPx1(p[0],p[2],p[1],rot);
      drawCube(ctx,sx,sy,CELL,TH,CH,GHST,'rgba(58,143,181,0.35)');
    }
    sortedCubes(cubes,rot,N).forEach(item=>{
      const{sx,sy}=toPx1(item.x,item.z,item.y,rot);
      const c=item.k===sel?GOLD:(PALETTE[cColors[item.k]||'blue']||PALETTE.blue);
      drawCube(ctx,sx,sy,CELL,TH,CH,c,item.k===sel?'#886600':undefined);
    });
  },[cubes,cColors,rot,sel,ghost,mode]);

  // ── Tab-2 draw ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(tab!==1)return;
    const cv=volR.current;if(!cv)return;
    const ctx=cv.getContext('2d');
    ctx.clearRect(0,0,CW,CVH);ctx.fillStyle='#f4f8fe';ctx.fillRect(0,0,CW,CVH);
    if(!volCubes.size){
      ctx.fillStyle='#99aabb';ctx.font='13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('Configure above, then click Generate!',CW/2,CVH/2);return;
    }
    const W=volData?volData.W:vW,H=volData?volData.H:vH,D=volData?volData.D:vD;
    const{gN,vc,vt,vch,ox,oy}=volMetrics(W,H,D,volRot,zoom);
    const all=new Set([...volCubes,...animC]);
    sortedCubes(all,volRot,gN).forEach(item=>{
      const[rx,rz]=rotXZ(item.x,item.z,volRot,gN);
      const sx=ox+(rx-rz)*vc,sy=oy+(rx+rz)*vt-item.y*vch;
      const c=animC.has(item.k)?GADD:PALETTE.blue;
      drawCube(ctx,sx,sy,vc,vt,vch,c,animC.has(item.k)?'#1a5c1a':undefined);
    });
  },[tab,volCubes,volData,vW,vH,vD,volRot,zoom,animC]);

  // ── Tab-1 mouse ────────────────────────────────────────────────────────────
  const handleClick=useCallback(e=>{
    const cv=mainR.current;if(!cv)return;
    const rect=cv.getBoundingClientRect();
    const mx=(e.clientX-rect.left)*(CW/rect.width),my=(e.clientY-rect.top)*(CVH/rect.height);
    const rev=[...sortedCubes(cubes,rot,N)].reverse();
    for(let i=0;i<rev.length;i++){
      const item=rev[i];const{sx,sy}=toPx1(item.x,item.z,item.y,rot);
      if(inPoly(mx,my,hexV(sx,sy,CELL,TH,CH))){setSel(p=>p===item.k?null:item.k);return;}
    }
    if(mode==='build'&&ghost&&!cubes.has(ghost)){
      const col=activColRef.current;
      setCubes(p=>new Set([...p,ghost]));
      setCColors(p=>({...p,[ghost]:col}));
      setGhost(null);
    }else setSel(null);
  },[cubes,rot,mode,ghost]);

  const handleMove=useCallback(e=>{
    if(mode!=='build'){setGhost(null);return;}
    const cv=mainR.current;if(!cv)return;
    const rect=cv.getBoundingClientRect();
    const mx=(e.clientX-rect.left)*(CW/rect.width),my=(e.clientY-rect.top)*(CVH/rect.height);
    const rev=[...sortedCubes(cubes,rot,N)].reverse();
    for(let i=0;i<rev.length;i++){
      const item=rev[i];const{sx,sy}=toPx1(item.x,item.z,item.y,rot);
      if(inPoly(mx,my,hexV(sx,sy,CELL,TH,CH))){setGhost(null);return;}
    }
    const empties=[];
    for(let x=0;x<N;x++)for(let y=0;y<N;y++)for(let z=0;z<N;z++){
      const k=`${x},${y},${z}`;
      if(!cubes.has(k)){const[rx,rz]=rotXZ(x,z,rot,N);empties.push({k,d:rx+rz+y*0.01});}
    }
    empties.sort((a,b)=>b.d-a.d);
    for(let i=0;i<empties.length;i++){
      const{k}=empties[i];const[x,y,z]=k.split(',').map(Number);
      const{sx,sy}=toPx1(x,z,y,rot);
      if(inPoly(mx,my,hexV(sx,sy,CELL,TH,CH))){setGhost(k);return;}
    }
    setGhost(null);
  },[cubes,rot,mode]);

  function handleRemove(){
    const key=selRef.current;if(!key)return;
    setCubes(prev=>{const n=new Set(prev);n.delete(key);return n;});
    setCColors(prev=>{const n={...prev};delete n[key];return n;});
    setSel(null);
  }
  function handleColorSwatch(name){
    setActivCol(name);
    const key=selRef.current;
    if(key)setCColors(p=>({...p,[key]:name}));
  }

  const views=getViews(cubes);
  const fD=[...views.f].reverse(),sD=[...views.s].reverse();
  let fSel=null,tSel=null,sSel=null;
  if(sel){const p=sel.split(',').map(Number);fSel={r:N-1-p[1],c:p[0]};tSel={r:p[2],c:p[0]};sSel={r:N-1-p[1],c:p[2]};}

  // ── Volume generate ────────────────────────────────────────────────────────
  function handleVNInput(val){
    setVNInput(val);
    const num=parseInt(val,10);
    if(!isNaN(num)&&num>=1&&num<=vTotal-1)setVN(num);
  }

  function genVol(){
    const n=vN;
    if(isNaN(n)||n<1||n>=vTotal)return;
    const placed=genGravityCubes(vW,vH,vD,n);
    const miss=[];
    for(let x=0;x<vW;x++)for(let y=0;y<vH;y++)for(let z=0;z<vD;z++)
      if(!placed.has(x+','+y+','+z))miss.push(x+','+y+','+z);
    const correct=vTotal-n;
    const c=new Set([correct]);
    const deltas=[1,-1,2,3,-2,4,-3,5,6,-4];
    for(let i=0;i<deltas.length&&c.size<4;i++){const v=correct+deltas[i];if(v>0)c.add(v);}
    for(let i=1;c.size<4;i++)c.add(correct+i*13);
    const opts=[...c].sort((a,b)=>a-b).slice(0,4);
    setVolCubes(placed);
    setVolData({W:vW,H:vH,D:vD,n,total:vTotal,miss,correct,opts});
    setAnimC(new Set());setAnimOn(false);setVSel(null);setVOk(false);
    clearTimeout(tmr.current);
  }

  function startAnim(){
    if(!volData||animOn)return;
    clearTimeout(tmr.current);setAnimC(new Set());setAnimOn(true);
    const sorted=[...volData.miss].sort((a,b)=>+a.split(',')[1]-+b.split(',')[1]);
    let i=0;
    function step(){if(i>=sorted.length){setAnimOn(false);return;}setAnimC(p=>new Set([...p,sorted[i++]]));tmr.current=setTimeout(step,spd);}
    tmr.current=setTimeout(step,spd);
  }
  useEffect(()=>()=>clearTimeout(tmr.current),[]);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const tb=a=>({flex:1,padding:'8px 0',border:'none',cursor:'pointer',fontWeight:700,fontSize:13,borderRadius:8,background:a?'#1D6F94':'transparent',color:a?'white':'#557'});
  const mb=(a,c)=>({padding:'5px 12px',border:'none',cursor:'pointer',fontWeight:700,fontSize:12,borderRadius:6,background:a?c:'#dde',color:a?'white':'#445'});
  const smb=bg=>({padding:'4px 10px',border:'none',cursor:'pointer',fontWeight:600,fontSize:12,borderRadius:5,background:bg,color:'white'});
  const iconBtn=bg=>({padding:'5px 11px',border:'none',cursor:'pointer',fontWeight:700,fontSize:14,borderRadius:6,background:bg,color:'white'});
  const sel2={padding:'5px 7px',borderRadius:6,border:'1.5px solid #b0c4de',fontSize:14,fontWeight:700,color:'#0d3b6e',background:'#f0f6ff',cursor:'pointer'};

  return(
    <div style={{fontFamily:'system-ui,sans-serif',maxWidth:460,margin:'0 auto',padding:12,background:'linear-gradient(160deg,#e8f0fe,#e0f7fa)',minHeight:'100vh'}}>
      <div style={{textAlign:'center',marginBottom:10}}>
        <div style={{fontSize:20,fontWeight:900,color:'#0d3b6e'}}>🧊 3D Cube Explorer</div>
        <div style={{fontSize:11,color:'#5577aa'}}>PSLE Maths · 3D Shapes &amp; Views</div>
      </div>
      <div style={{display:'flex',background:'white',borderRadius:10,padding:4,marginBottom:10,boxShadow:'0 1px 4px rgba(0,0,0,0.08)'}}>
        <button style={tb(tab===0)} onClick={()=>setTab(0)}>🎯 3D Views</button>
        <button style={tb(tab===1)} onClick={()=>setTab(1)}>📦 Volume</button>
      </div>

      {/* ── TAB 1 ─────────────────────────────────────────────────────────── */}
      {tab===0&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div style={{display:'flex',gap:4}}>
              <button style={mb(mode==='build','#E05C00')} onClick={()=>setMode('build')}>🔨 Build</button>
              <button style={mb(mode==='quiz','#7C3AED')} onClick={()=>{setMode('quiz');setSel(null);setGhost(null);}}>🔍 Explore</button>
            </div>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <button style={iconBtn('#5B7FA6')} onClick={()=>setRot(r=>(r+3)%4)}>◀</button>
              <button style={iconBtn('#5B7FA6')} onClick={()=>setRot(r=>(r+1)%4)}>▶</button>
            </div>
          </div>
          <canvas ref={mainR} width={CW} height={CVH} onClick={handleClick} onMouseMove={handleMove} onMouseLeave={()=>setGhost(null)}
            style={{width:'100%',display:'block',borderRadius:10,cursor:mode==='build'?'crosshair':'pointer',boxShadow:'0 3px 12px rgba(0,0,0,0.12)'}}/>
          {mode==='build'&&(
            <div style={{background:'white',borderRadius:8,padding:10,marginTop:8,boxShadow:'0 1px 4px rgba(0,0,0,0.08)'}}>
              <div style={{fontSize:11,color:'#889',marginBottom:7}}>💡 Hover to preview · Click to place · Select cube to remove/repaint</div>
              <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:9}}>
                <span style={{fontSize:11,fontWeight:700,color:'#557'}}>Colour:</span>
                {Object.keys(SWATCHES).map(name=>{const active=activCol===name;return(
                  <button key={name} onClick={()=>handleColorSwatch(name)}
                    style={{width:24,height:24,borderRadius:'50%',background:SWATCHES[name],border:active?'3px solid #222':'2px solid rgba(0,0,0,0.18)',
                      cursor:'pointer',transform:active?'scale(1.25)':'scale(1)',transition:'transform 0.12s',outline:'none'}}/>);})}
                {sel&&<span style={{fontSize:10,color:'#7C3AED',marginLeft:3}}>← tap to repaint</span>}
              </div>
              <div style={{display:'flex',gap:7,alignItems:'center',flexWrap:'wrap'}}>
                {['x','y','z'].map(ax=>(
                  <label key={ax} style={{fontSize:12,color:'#334'}}>{ax.toUpperCase()}:
                    <select value={xyz[ax]} onChange={e=>setXyz(p=>({...p,[ax]:+e.target.value}))}
                      style={{marginLeft:3,padding:'2px 4px',borderRadius:4,border:'1px solid #ccc',fontSize:12}}>
                      {Array.from({length:N},(_,i)=><option key={i} value={i}>{i}</option>)}
                    </select>
                  </label>))}
                <button style={smb('#1D6F94')} onClick={()=>{const key=`${xyz.x},${xyz.y},${xyz.z}`,col=activColRef.current;setCubes(p=>new Set([...p,key]));setCColors(p=>({...p,[key]:col}));}}>➕ Add</button>
                <button style={smb(sel?'#E05C00':'#bbb')} onClick={handleRemove}>✕ Remove</button>
                <button style={smb('#888')} onClick={()=>{setCubes(new Set());setCColors({});setSel(null);}}>🗑 Clear</button>
              </div>
              <div style={{display:'flex',gap:4,marginTop:7,flexWrap:'wrap'}}>
                {SAMPLES.map((_,i)=><button key={i} style={smb('#5B7FA6')} onClick={()=>{setCubes(new Set(SAMPLES[i]));setCColors({});setSel(null);}}>Sample {i+1}</button>)}
              </div>
            </div>
          )}
          <div style={{background:'white',borderRadius:8,padding:10,marginTop:8,boxShadow:'0 1px 4px rgba(0,0,0,0.08)'}}>
            {sel?<div style={{fontSize:11,background:'#f3f0ff',borderRadius:5,padding:'4px 8px',marginBottom:8,color:'#6b21a8',fontWeight:600}}>✨ Cube ({sel.replace(/,/g,', ')}) highlighted 🟡 in all views!</div>
               :<div style={{fontSize:11,color:'#889',marginBottom:6}}>{mode==='quiz'?'🎯 Click a cube — predict its 2D projections!':'Click any cube to see its projection in all three views'}</div>}
            <div style={{display:'flex',justifyContent:'space-around'}}>
              <ViewGrid grid={fD} selCell={fSel} label="Front View"/>
              <ViewGrid grid={views.t} selCell={tSel} label="Top View"/>
              <ViewGrid grid={sD} selCell={sSel} label="Side View"/>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2 ─────────────────────────────────────────────────────────── */}
      {tab===1&&(
        <div>
          {/* Setup card */}
          <div style={{background:'white',borderRadius:10,padding:14,marginBottom:8,boxShadow:'0 1px 4px rgba(0,0,0,0.08)'}}>
            <div style={{fontSize:13,fontWeight:800,color:'#0d3b6e',marginBottom:12}}>⚙️ Set Up Your Question</div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:'#557',marginBottom:6}}>STEP 1 — Choose cuboid size (1–10)</div>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                {[['w',vW,setVW],['h',vH,setVH],['d',vD,setVD]].map(([lbl,val,set],i)=>(
                  <span key={lbl} style={{display:'flex',alignItems:'center',gap:4}}>
                    <span style={{fontSize:11,color:'#778',fontWeight:600}}>{['Width','Height','Depth'][i]}</span>
                    <select value={val} style={sel2} onChange={e=>{set(+e.target.value);setVolData(null);setVolCubes(new Set());setAnimC(new Set());setAnimOn(false);}}>
                      {Array.from({length:10},(_,j)=><option key={j+1} value={j+1}>{j+1}</option>)}
                    </select>
                    {i<2&&<span style={{fontSize:16,fontWeight:900,color:'#5B7FA6'}}>×</span>}
                  </span>))}
                <span style={{fontSize:12,color:'#889'}}>= <strong style={{color:'#1D6F94'}}>{vTotal}</strong> total</span>
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:'#557',marginBottom:6}}>STEP 2 — How many cubes to place? (1–{vTotal-1})</div>
              <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <input type="number" min={1} max={vTotal-1} value={vNInput}
                  onChange={e=>handleVNInput(e.target.value)}
                  onBlur={()=>{const v=Math.max(1,Math.min(vTotal-1,parseInt(vNInput,10)||1));setVN(v);setVNInput(String(v));}}
                  style={{padding:'5px 7px',borderRadius:6,border:'1.5px solid #b0c4de',fontSize:14,fontWeight:700,color:'#0d3b6e',background:'#f0f6ff',width:70,textAlign:'center'}}/>
                <span style={{fontSize:12,color:'#557'}}>cubes placed</span>
                <span style={{fontSize:12,background:'#fff3e0',borderRadius:5,padding:'3px 8px',color:'#E65100',fontWeight:700}}>{vTotal-vN} missing</span>
              </div>
            </div>
            <button onClick={genVol} style={{width:'100%',padding:'10px 0',background:'linear-gradient(90deg,#1D6F94,#2E9EC1)',color:'white',border:'none',borderRadius:8,cursor:'pointer',fontWeight:800,fontSize:14,boxShadow:'0 2px 6px rgba(29,111,148,0.3)'}}>
              🎲 Generate Question
            </button>
          </div>

          {/* 3D canvas + controls */}
          <div style={{position:'relative',marginBottom:8}}>
            <canvas ref={volR} width={CW} height={CVH} style={{width:'100%',display:'block',borderRadius:10,boxShadow:'0 3px 12px rgba(0,0,0,0.12)'}}/>
            <div style={{position:'absolute',top:6,right:8,display:'flex',gap:4,alignItems:'center'}}>
              <button style={iconBtn('#5B7FA6')} onClick={()=>setVolRot(r=>(r+3)%4)} title="Rotate left">◀</button>
              <button style={iconBtn('#5B7FA6')} onClick={()=>setVolRot(r=>(r+1)%4)} title="Rotate right">▶</button>
              <button style={iconBtn('#2E7D32')} onClick={()=>setZoom(z=>Math.min(2,+(z+0.2).toFixed(1)))} title="Zoom in">＋</button>
              <button style={iconBtn('#B71C1C')} onClick={()=>setZoom(z=>Math.max(0.4,+(z-0.2).toFixed(1)))} title="Zoom out">－</button>
            </div>
          </div>

          {/* Question card */}
          {volData&&(
            <div style={{background:'white',borderRadius:10,padding:12,boxShadow:'0 1px 4px rgba(0,0,0,0.08)'}}>
              <div style={{fontSize:13,color:'#334',marginBottom:10,lineHeight:1.6}}>
                <strong style={{color:'#0d3b6e'}}>{volData.n}</strong> unit cubes are placed inside a{' '}
                <strong style={{color:'#1D6F94'}}>{volData.W}×{volData.H}×{volData.D}</strong> cuboid frame ({volData.total} cubes total).<br/>
                ❓ <strong>How many more cubes are needed to complete it?</strong>
              </div>
              <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
                {volData.opts.map((opt,i)=>{
                  const ok=opt===volData.correct,picked=vSel===opt;
                  return(<button key={i} onClick={()=>{if(!vOk)setVSel(opt);}}
                    style={{flex:'1 1 70px',padding:'10px 4px',borderRadius:8,fontWeight:700,fontSize:18,cursor:vOk?'default':'pointer',border:'2px solid',
                      borderColor:vOk?(ok?'#4CAF50':picked?'#C62828':'#ddd'):(picked?'#1D6F94':'#ddd'),
                      background:vOk?(ok?'#e8f5e9':picked?'#fdecea':'white'):(picked?'#e3f0fa':'white'),
                      color:'#0d3b6e',transition:'all 0.15s'}}>
                    {['A','B','C','D'][i]}) {opt}
                  </button>);})}
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                {!vOk
                  ?<button onClick={()=>setVOk(true)} disabled={vSel===null} style={{padding:'7px 14px',background:vSel!==null?'#7C3AED':'#ccc',color:'white',border:'none',borderRadius:6,cursor:vSel!==null?'pointer':'default',fontWeight:700,fontSize:13}}>✓ Check</button>
                  :<div style={{fontWeight:700,fontSize:14,color:vSel===volData.correct?'#2E7D32':'#C62828'}}>{vSel===volData.correct?'🎉 Correct!':'❌ Answer: '+volData.correct}</div>
                }
                <button onClick={startAnim} disabled={animOn} style={{padding:'7px 14px',background:animOn?'#aaa':'#4CAF50',color:'white',border:'none',borderRadius:6,cursor:animOn?'default':'pointer',fontWeight:700,fontSize:13}}>
                  {animOn?'⏳ Filling...':'▶ Animate Fill'}
                </button>
                <label style={{fontSize:12,color:'#557',display:'flex',alignItems:'center',gap:4}}>Speed:
                  <select value={spd} onChange={e=>setSpd(+e.target.value)} style={{padding:'2px 5px',borderRadius:4,border:'1px solid #ccc',fontSize:12}}>
                    <option value={1200}>Slow</option><option value={500}>Medium</option><option value={200}>Fast</option>
                  </select>
                </label>
              </div>
              {vOk&&(
                <div style={{marginTop:8,padding:'8px 10px',background:'#f0f8ff',borderRadius:6,fontSize:12,color:'#334',lineHeight:1.7}}>
                  💡 <strong>Why?</strong> {volData.W}×{volData.H}×{volData.D} = <strong>{volData.total}</strong> cubes needed.
                  Only <strong>{volData.n}</strong> placed → <strong>{volData.total}</strong>−<strong>{volData.n}</strong> = <strong style={{color:'#1D6F94'}}>{volData.correct}</strong> more.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
