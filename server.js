"use strict";
/* =========================================================================
   SUMO CRUMBLE — multiplayer server (authoritative)
   Runs one shared v4 simulation: streak/size growth, crown bounty, slam,
   combos, power-ups, crumbling+regrowing floor, modifier events, bots.
   Clients send inputs only. Run:  npm install && npm start  -> :3000
   ========================================================================= */
const http=require("http"), fs=require("fs"), path=require("path");
const { WebSocketServer }=require("ws");
const PORT=process.env.PORT||3000;

const clamp=(v,a,b)=>v<a?a:v>b?b:v, rnd=(a,b)=>a+Math.random()*(b-a), rint=n=>Math.floor(Math.random()*n);
const lerpA=(a,b,t)=>{let d=((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;return a+d*t;};
const hyp=Math.hypot;

const CFG={
  TILE:74,RT:8,BASE_R:26,
  MOVE_MAX:300,STEER:3.6,DRAG:2.4,
  DASH_IMPULSE:560,DASH_T:0.22,DASH_CD:1.05,
  SLAM_CD:5,SLAM_RANGE:2.9,SLAM_FORCE:560,
  SHOVE_BASE:210,SHOVE_K:1.05,SUPER:2.3,RECOIL:0.32,
  FALL_SUPPORT:0.30,FALL_GONE:0.85,REGROW:4.5,
  RESPAWN:1.8,INVULN:1.6,
  STREAK_CAP:9,GROW:0.055,BOUNTY_MIN:200,COMBO_T:4,
  WEAR:2.6,
  TARGET:6,TICK:30,SNAP_EVERY:2,
};
const ARENA=(CFG.RT+0.5)*CFG.TILE, DT=1/CFG.TICK;
const SKINS=["#ff5a5a","#ffce3a","#5ad1ff","#7ad14a","#c77aff","#ff8a3a","#ff7ab0","#e8e2d0"];
const HATS=["none","band","cap","tophat","horns","party","halo","antenna"];
const BOT_NAMES=["Tank","Bruno","Koa","Diesel","Bubba","Mochi","Tito","Hoss","Bao","Rocco","Tonk","Goro"];
const SHAPES=["disc","donut","cross","small","dumbbell"];
const MODS=["LOW GRAVITY","GIANTS","ICE RINK","SUDDEN DEATH"];
const TOK=["charge","shield","speed"];

let sumos=[], tilesArr=[], tileMap=new Map(), tokens=[];
let arenaShape="disc", mod={type:null,t:0}, modCool=20, barAngle=0, leader=null;
let nextId=1, tick=0, ev=[], lastRingoutAt=-9;

const key=(gx,gy)=>gx+","+gy;
function inShape(x,y){const R=ARENA,h=hyp(x,y);switch(arenaShape){
  case "donut":return h<=R&&h>=CFG.TILE*2.3;
  case "cross":return h<=R&&(Math.abs(x)<CFG.TILE*2.6||Math.abs(y)<CFG.TILE*2.6);
  case "small":return h<=R*0.62;
  case "dumbbell":{const o=CFG.TILE*3.2,r1=CFG.TILE*3.6;return hyp(x-o,y)<=r1||hyp(x+o,y)<=r1||(Math.abs(y)<CFG.TILE*1.1&&Math.abs(x)<o);}
  default:return h<=R;}}
function buildArena(shape){
  arenaShape=shape||SHAPES[rint(SHAPES.length)];
  tilesArr=[];tileMap=new Map();
  for(let gy=-CFG.RT;gy<=CFG.RT;gy++)for(let gx=-CFG.RT;gx<=CFG.RT;gx++){const x=gx*CFG.TILE,y=gy*CFG.TILE;
    if(inShape(x,y)){const ice=hyp(x,y)>CFG.TILE*1.2&&Math.random()<0.06;
      const t={gx,gy,x,y,wear:0,falling:false,fallT:0,gone:false,ice};tilesArr.push(t);tileMap.set(key(gx,gy),t);}}
  broadcastArena();
}
function tileAt(x,y){return tileMap.get(key(Math.round(x/CFG.TILE),Math.round(y/CFG.TILE)));}
function supported(x,y){const t=tileAt(x,y);return t&&!t.gone&&(!t.falling||t.fallT<CFG.FALL_SUPPORT);}
function giants(){return mod.type==="GIANTS"?1.5:1;}
function radius(s){return CFG.BASE_R*(1+Math.min(s.streak,CFG.STREAK_CAP)*CFG.GROW)*giants();}
function mult(s){return 1+s.streak*0.25;}

function makeSumo(o){return {id:nextId++,name:(o.name||"Sumo").slice(0,14),skin:o.skin||SKINS[rint(SKINS.length)],hat:o.hat||"none",bot:!!o.bot,ws:o.ws||null,
  x:0,y:0,vx:0,vy:0,facing:0,input:{dx:0,dy:0,sf:0,shove:false,slam:false},
  dashCd:0,dashT:0,slamCd:0,charged:false,shieldT:0,speedT:0,
  alive:true,falling:false,fallT:0,respawnT:0,invuln:CFG.INVULN,
  streak:0,score:0,combo:0,comboT:0,lastHitById:0,hitT:0,hazardT:0,barCd:0,ai:{react:0}};}
function spawn(s){let a,r,x,y,tr=0;do{a=rnd(0,6.28);r=rnd(CFG.TILE*2,(CFG.RT-1.5)*CFG.TILE);x=Math.cos(a)*r;y=Math.sin(a)*r;tr++;}while(!supported(x,y)&&tr<50);
  s.x=x;s.y=y;s.vx=s.vy=0;s.facing=Math.atan2(-y,-x);s.alive=true;s.falling=false;s.fallT=0;s.streak=0;s.score=0;s.combo=0;s.charged=false;s.shieldT=0;s.speedT=0;s.dashCd=0;s.dashT=0;s.invuln=CFG.INVULN;s.lastHitById=0;}
function ensureBots(){const humans=sumos.filter(s=>!s.bot).length;let bots=sumos.filter(s=>s.bot);const want=Math.max(0,CFG.TARGET-humans);
  while(bots.length>want){const b=bots.pop();sumos=sumos.filter(s=>s!==b);}
  let i=0;while(bots.length<want){const used=new Set(sumos.map(s=>s.skin));const c=SKINS.find(c=>!used.has(c))||SKINS[rint(SKINS.length)];
    const s=makeSumo({bot:true,name:BOT_NAMES[(tick+i)%BOT_NAMES.length],skin:c,hat:HATS[1+rint(HATS.length-1)]});spawn(s);bots.push(s);sumos.push(s);i++;}}

/* ---- abilities ---- */
function doDash(s){if(s.dashCd>0||!s.alive||s.falling)return;let ang=s.bot?s.facing:Math.atan2(s.input.dy,s.input.dx);
  if(!s.bot&&s.input.dx===0&&s.input.dy===0)ang=s.facing;s.facing=ang;s.dashT=CFG.DASH_T;s.dashCd=CFG.DASH_CD;
  s.vx+=Math.cos(ang)*CFG.DASH_IMPULSE;s.vy+=Math.sin(ang)*CFG.DASH_IMPULSE;}
function doSlam(s){if(s.slamCd>0||!s.alive||s.falling)return;s.slamCd=CFG.SLAM_CD;pushFx(s.x,s.y,"slam");
  const R=radius(s)*CFG.SLAM_RANGE;for(const o of sumos){if(o===s||!o.alive||o.falling||o.shieldT>0||o.invuln>0)continue;
    const d=hyp(o.x-s.x,o.y-s.y);if(d>R)continue;const a=Math.atan2(o.y-s.y,o.x-s.x),f=CFG.SLAM_FORCE*(1-d/R*0.4);
    o.vx+=Math.cos(a)*f;o.vy+=Math.sin(a)*f;o.lastHitById=s.id;o.hitT=2.2;}}

/* ---- step ---- */
function step(){
  if(mod.type){mod.t-=DT;if(mod.t<=0)mod={type:null,t:0};}
  else {modCool-=DT;if(modCool<=0)startMod();}
  barAngle+=0.8*DT;
  const sudden=mod.type==="SUDDEN DEATH", wearRate=CFG.WEAR*(sudden?0.5:1);
  for(const s of sumos){
    if(!s.alive){s.respawnT-=DT;if(s.respawnT<=0){spawn(s);pushFx(s.x,s.y,"spawn",s.skin);}continue;}
    if(s.falling){s.fallT+=DT;s.vx*=0.96;s.vy*=0.96;s.x+=s.vx*DT;s.y+=s.vy*DT;if(s.fallT>CFG.FALL_GONE){s.alive=false;s.respawnT=CFG.RESPAWN;}continue;}
    let dirx=0,diry=0,sf=0,wantDash=false,wantSlam=false;
    if(s.bot){const r=botThink(s);dirx=r.dx;diry=r.dy;sf=r.sf;wantDash=r.dash;wantSlam=r.slam;}
    else {dirx=s.input.dx;diry=s.input.dy;sf=s.input.sf;if(s.input.shove){wantDash=true;s.input.shove=false;}if(s.input.slam){wantSlam=true;s.input.slam=false;}}
    const foot=tileAt(s.x,s.y),slip=(foot&&foot.ice&&!foot.gone)||mod.type==="ICE RINK";
    const mf=radius(s)/CFG.BASE_R, steerK=(slip?CFG.STEER*0.32:CFG.STEER)/Math.sqrt(mf);
    let maxS=CFG.MOVE_MAX*(1-(mf-1)*0.16)*(s.speedT>0?1.4:1);
    const desVx=dirx*maxS*sf,desVy=diry*maxS*sf;
    s.vx+=(desVx-s.vx)*Math.min(1,steerK*DT);s.vy+=(desVy-s.vy)*Math.min(1,steerK*DT);
    let dragMul=slip?0.06:0.15;if(mod.type==="LOW GRAVITY")dragMul*=0.4;
    s.vx*=(1-Math.min(1,CFG.DRAG*DT*dragMul));s.vy*=(1-Math.min(1,CFG.DRAG*DT*dragMul));
    s.x+=s.vx*DT;s.y+=s.vy*DT;
    const sp=hyp(s.vx,s.vy);if(sp>6)s.facing=lerpA(s.facing,Math.atan2(s.vy,s.vx),Math.min(1,10*DT));
    for(const k of ["dashCd","dashT","slamCd","hitT","barCd","invuln","shieldT","speedT","comboT","hazardT"])if(s[k]>0)s[k]-=DT;
    if(s.comboT<=0)s.combo=0;
    if(wantDash)doDash(s);if(wantSlam)doSlam(s);
    s.score+=4*DT;
    if(foot&&!foot.falling&&!foot.gone){foot.wear+=DT;if(foot.wear>=wearRate){foot.falling=true;foot.fallT=0;}}
    if(s.barCd<=0){const d=Math.cos(barAngle),e=Math.sin(barAngle),along=s.x*d+s.y*e,perp=-s.x*e+s.y*d;
      if(Math.abs(perp)<radius(s)+10&&Math.abs(along)<ARENA&&s.shieldT<=0){const push=520,R=hyp(s.x,s.y)||1;
        s.vx+=-e*push+(s.x/R)*180;s.vy+=d*push+(s.y/R)*180;s.barCd=0.5;s.hazardT=1.5;pushFx(s.x,s.y,"bar");}}
    if(!supported(s.x,s.y)&&!s.falling)startFall(s);
    if(hyp(s.x,s.y)>ARENA+CFG.TILE*1.5&&!s.falling)startFall(s,true);
    for(let i=tokens.length-1;i>=0;i--){const tk=tokens[i];if((s.x-tk.x)**2+(s.y-tk.y)**2<(radius(s)+16)**2){applyToken(s,tk.type);tokens.splice(i,1);}}
  }
  const live=sumos.filter(s=>s.alive&&!s.falling);
  for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++)collide(live[i],live[j]);
  for(const t of tilesArr){if(t.falling&&!t.gone){t.fallT+=DT;if(t.fallT>CFG.FALL_GONE+0.2){t.gone=true;t.regrow=CFG.REGROW;}}
    else if(t.gone){t.regrow-=DT;if(t.regrow<=0){t.gone=false;t.falling=false;t.wear=0;t.fallT=0;}}}
  if(tokens.length<3&&Math.random()<DT*0.5){const arr=tilesArr.filter(t=>!t.falling&&!t.gone&&hyp(t.x,t.y)<ARENA*0.75);
    if(arr.length){const t=arr[rint(arr.length)];tokens.push({x:t.x,y:t.y,type:TOK[rint(TOK.length)]});}}
  let best=null;for(const s of live){if(s.score>=CFG.BOUNTY_MIN&&(!best||s.score>best.score))best=s;}
  if(best!==leader){if(best)pushBanner((best.name).toUpperCase()+" TAKES THE CROWN","Worth double now!","gold",best.id);leader=best;}
}
function startMod(){mod={type:MODS[rint(MODS.length)],t:16};modCool=rnd(20,28);pushBanner(mod.type,"Modifier!","purp",0);
  if(Math.random()<0.4){buildArena(SHAPES[rint(SHAPES.length)]);for(const s of sumos){if(s.alive&&!s.falling&&!supported(s.x,s.y)){let x=s.x,y=s.y,tr=0;while(!supported(x,y)&&tr<60){x*=0.9;y*=0.9;tr++;}s.x=x;s.y=y;}}pushFeed(`<span class="g">Arena shifts → ${arenaShape}</span>`);}}
function applyToken(s,type){if(type==="charge")s.charged=true;else if(type==="shield")s.shieldT=6;else if(type==="speed")s.speedT=6;pushFx(s.x,s.y,type);}
function startFall(s,offEdge){if(s.falling)return;s.falling=true;s.fallT=offEdge?CFG.FALL_SUPPORT:0;pushFx(s.x,s.y,"fall",s.skin);
  const att=s.hitT>0?byId(s.lastHitById):null,hazard=s.hazardT>0;
  if(att&&att!==s&&att.alive)ringOut(att,s,hazard);
  else pushFeed(`<span class="v">${esc(s.name)}</span> ${hazard?'was launched out':'fell into the void'}`);}
function ringOut(att,vic,hazard){const wasLeader=vic===leader;
  if(att.comboT>0)att.combo++;else att.combo=1;att.comboT=CFG.COMBO_T;
  let pts=Math.round(100*mult(att))*(wasLeader?2:1)+(att.combo>1?att.combo*25:0)+(hazard?40:0);
  att.score+=pts;att.streak++;pushFx(vic.x,vic.y,"bam");
  const now=tick/CFG.TICK,multi=(now-lastRingoutAt<1.1);lastRingoutAt=now;
  const ms={3:"TRIPLE!",5:"RAMPAGE!",8:"UNSTOPPABLE!",12:"GODLIKE!"};
  if(multi)pushBanner("DOUBLE KNOCKOUT!","","purp",att.id);
  else if(att.combo>=2)pushBanner("COMBO ×"+att.combo,"+"+pts,"gold",att.id);
  else if(ms[att.streak])pushBanner(ms[att.streak],"×"+mult(att).toFixed(2),"gold",att.id);
  if(!ms[att.streak]&&!(multi||att.combo>=2))pushFeed(`<b>${esc(att.name)}</b> ${hazard?'launched':'bucked'} <span class="v">${esc(vic.name)}</span>${wasLeader?' 👑':''}`);
  if(wasLeader)pushFeed(`<span class="g">👑 ${esc(att.name)} dethroned ${esc(vic.name)}!</span>`);}
function collide(a,b){const rr=radius(a)+radius(b),dx=b.x-a.x,dy=b.y-a.y,d=hyp(dx,dy);if(d>=rr||d===0)return;
  const ang=Math.atan2(dy,dx),ov=rr-d;a.x-=Math.cos(ang)*ov*0.5;a.y-=Math.sin(ang)*ov*0.5;b.x+=Math.cos(ang)*ov*0.5;b.y+=Math.sin(ang)*ov*0.5;
  const aD=a.dashT>0,bD=b.dashT>0;if(aD)shove(a,b,ang);if(bD)shove(b,a,ang+Math.PI);
  if(!aD&&!bD){const p=70;a.vx-=Math.cos(ang)*p;a.vy-=Math.sin(ang)*p;b.vx+=Math.cos(ang)*p;b.vy+=Math.sin(ang)*p;}}
function shove(att,vic,ang){if(vic.invuln>0||vic.shieldT>0){if(vic.shieldT>0)pushFx(vic.x,vic.y,"block");return;}
  const spd=hyp(att.vx,att.vy),amf=radius(att)/CFG.BASE_R,vmf=radius(vic)/CFG.BASE_R;
  let f=(CFG.SHOVE_BASE+spd*CFG.SHOVE_K)*(att.charged?CFG.SUPER:1)*(0.7+0.45*amf)/Math.sqrt(vmf);
  vic.vx+=Math.cos(ang)*f;vic.vy+=Math.sin(ang)*f;att.vx-=Math.cos(ang)*f*CFG.RECOIL;att.vy-=Math.sin(ang)*f*CFG.RECOIL;
  vic.lastHitById=att.id;vic.hitT=2.2;pushFx((att.x+vic.x)/2,(att.y+vic.y)/2,att.charged?"bam":"bonk");att.charged=false;}

/* ---- bots ---- */
function byId(id){return sumos.find(s=>s.id===id);}
function botThink(s){s.ai.react-=DT;const sm=0.8;let tgt=null,best=-1e12;
  for(const o of sumos){if(o===s||!o.alive||o.falling)continue;const dd=hyp(o.x-s.x,o.y-s.y),edge=hyp(o.x,o.y)/ARENA,b=(o===leader?1:0);
    const sc=edge*220-dd+b*sm*300;if(sc>best){best=sc;tgt=o;}}
  let tok=null,kd=1e12;for(const t of tokens){const d=(s.x-t.x)**2+(s.y-t.y)**2;if(d<kd){kd=d;tok=t;}}
  const myR=hyp(s.x,s.y);let dx=0,dy=0,sf=1,dash=false,slam=false;
  const ahead=supported(s.x+s.vx*0.28,s.y+s.vy*0.28),edgeDanger=myR>ARENA-CFG.TILE*1.2||!ahead;
  let inc=null;for(const o of sumos){if(o===s||!o.alive||o.falling||o.dashT<=0)continue;const toMe=Math.atan2(s.y-o.y,s.x-o.x),od=hyp(s.x-o.x,s.y-o.y);if(od<radius(s)*4&&Math.abs(((o.facing-toMe+9.4248)%6.2832)-Math.PI)<0.7){inc=o;break;}}
  if(edgeDanger){dx=-s.x;dy=-s.y;const l=hyp(dx,dy)||1;dx/=l;dy/=l;sf=1;if(inc&&s.slamCd<=0&&Math.random()<0.4)slam=true;}
  else if(inc&&s.dashCd<=0&&Math.random()<sm){const a=Math.atan2(s.y-inc.y,s.x-inc.x)+Math.PI/2;dx=Math.cos(a);dy=Math.sin(a);sf=1;if(s.ai.react<=0){dash=true;s.ai.react=rnd(0.2,0.6);}}
  else if(tok&&kd<(CFG.TILE*4)**2){dx=tok.x-s.x;dy=tok.y-s.y;const l=hyp(dx,dy)||1;dx/=l;dy/=l;sf=clamp(l/100,.4,1);}
  else if(tgt){let ax=tgt.x-(tgt.x/(hyp(tgt.x,tgt.y)||1))*radius(s)*1.6,ay=tgt.y-(tgt.y/(hyp(tgt.x,tgt.y)||1))*radius(s)*1.6;
    ax+=tgt.vx*0.18*sm;ay+=tgt.vy*0.18*sm;dx=ax-s.x;dy=ay-s.y;const l=hyp(dx,dy)||1;dx/=l;dy/=l;sf=clamp(l/100,.5,1);
    const td=hyp(tgt.x-s.x,tgt.y-s.y);if(td<radius(s)*3.4&&s.dashCd<=0&&s.ai.react<=0){dash=true;s.ai.react=rnd(0.2,0.6);}
    if(td<radius(s)*2.4&&s.slamCd<=0&&Math.random()<0.3)slam=true;}
  else {dx=-s.x;dy=-s.y;const l=hyp(dx,dy)||1;dx/=l;dy/=l;sf=.5;}
  return {dx,dy,sf,dash,slam};}

/* ---- events ---- */
function esc(s){return String(s).replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));}
function pushFeed(html){ev.push({t:"feed",html});}
function pushBanner(big,sub,cls,who){ev.push({t:"banner",big,sub,cls,who:who||0});}
function pushFx(x,y,kind,skin){ev.push({t:"fx",x:Math.round(x),y:Math.round(y),kind,skin:skin||""});}

/* ---- net ---- */
function tileStates(){const a=new Array(tilesArr.length);for(let i=0;i<tilesArr.length;i++){const t=tilesArr[i];
  a[i]=t.gone?255:t.falling?200+Math.min(50,Math.round(t.fallT/CFG.FALL_GONE*50)):Math.round(clamp(t.wear/CFG.WEAR,0,1)*100);}return a;}
function broadcastArena(){const msg=JSON.stringify({t:"arena",arena:ARENA,tile:CFG.TILE,baseR:CFG.BASE_R,shape:arenaShape,
  tiles:tilesArr.map(t=>[Math.round(t.x),Math.round(t.y),t.ice?1:0])});send(msg);}
function snapshot(){return {t:"snap",time:Date.now(),
  mod:mod.type, bar:+barAngle.toFixed(3), leader:leader?leader.id:0,
  ts:tileStates(),
  tk:tokens.map(k=>[Math.round(k.x),Math.round(k.y),TOK.indexOf(k.type)]),
  s:sumos.map(s=>[s.id,Math.round(s.x),Math.round(s.y),+s.facing.toFixed(2),s.alive?1:0,s.falling?1:0,
    s.falling?+clamp(s.fallT/CFG.FALL_GONE,0,1).toFixed(2):0,s.charged?1:0,s.shieldT>0?1:0,s.speedT>0?1:0,s.dashT>0?1:0,s.streak,Math.floor(s.score),s===leader?1:0]),
  meta:sumos.map(s=>[s.id,s.name,s.skin,s.hat,s.bot?1:0]),
  ev };}
function send(msg){for(const s of sumos)if(s.ws&&s.ws.readyState===1)s.ws.send(msg);}
function broadcast(){send(JSON.stringify(snapshot()));ev=[];}

const indexHtml=fs.readFileSync(path.join(__dirname,"public","index.html"));
const server=http.createServer((req,res)=>{if(req.url==="/"||req.url.startsWith("/index")){res.writeHead(200,{"Content-Type":"text/html"});res.end(indexHtml);}else{res.writeHead(404);res.end("not found");}});
const wss=new WebSocketServer({server});
wss.on("connection",ws=>{let me=null;
  ws.on("message",raw=>{let m;try{m=JSON.parse(raw);}catch{return;}
    if(m.t==="join"){me=makeSumo({name:m.name,skin:m.skin,hat:m.hat,ws});spawn(me);sumos.push(me);ensureBots();
      ws.send(JSON.stringify({t:"init",id:me.id,arena:ARENA,tile:CFG.TILE,baseR:CFG.BASE_R,dashCd:CFG.DASH_CD,slamCd:CFG.SLAM_CD}));
      broadcastArena();pushFeed(`<b>${esc(me.name)}</b> entered the ring`);}
    else if(m.t==="input"&&me){me.input.dx=clamp(+m.dx||0,-1,1);me.input.dy=clamp(+m.dy||0,-1,1);me.input.sf=clamp(+m.sf||0,0,1);if(m.shove)me.input.shove=true;if(m.slam)me.input.slam=true;}});
  ws.on("close",()=>{if(me){sumos=sumos.filter(s=>s!==me);ensureBots();pushFeed(`<span class="v">${esc(me.name)}</span> left`);}});});

buildArena("disc");ensureBots();
setInterval(()=>{step();tick++;if(tick%CFG.SNAP_EVERY===0)broadcast();},1000/CFG.TICK);
server.listen(PORT,()=>console.log(`Sumo Crumble MP -> http://localhost:${PORT}`));
