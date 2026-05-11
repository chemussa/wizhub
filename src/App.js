import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, writeBatch, query, where } from "firebase/firestore";

// ── Firebase Config ── Replace YOUR_* values from Firebase Console → Project Settings ──
const firebaseConfig = {
  apiKey: "AIzaSyDkNKFFsKQzuYFFfPb8t1flqpVgLGFhkHI",
  authDomain: "wizhub-75fb8.firebaseapp.com",
  projectId: "wizhub-75fb8",
  storageBucket: "wizhub-75fb8.firebasestorage.app",
  messagingSenderId: "342943060626",
  appId: "1:342943060626:web:d2236ade9880448ef3cc4b",
  measurementId: "G-37R2SRLK71"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const fdb = getFirestore(firebaseApp);

const WALLET_USDT = "0xb1847000dd44d73f5810e77abf58e43533bb0c61";
const WALLET_BTC = "0xb1847000dd44d73f5810e77abf58e43533bb0c61";
const TELEGRAM = "Wizhub";
const ADMIN_EMAIL = "admin@wizhub.com";
const ADMIN_PASS = "WizAdmin@2025";
const GRID = 15; const CELL = 18; const GAME_SPEED = 150; const TARGET = 5;

function todayStr(){return new Date().toISOString().slice(0,10);}
function generateCode(n){return "WIZ"+n.slice(0,3).toUpperCase()+Math.floor(1000+Math.random()*9000);}

// ── Firestore Helpers ─────────────────────────────────────────────────
function userRef(email){ return doc(fdb,"users",email.toLowerCase()); }
async function getUser(email){ try{ const s=await getDoc(userRef(email)); return s.exists()?s.data():null; }catch{ return null; } }
async function updateUser(user){ await setDoc(userRef(user.email),user,{merge:true}); }
async function getAllUsers(){ const s=await getDocs(collection(fdb,"users")); return s.docs.map(d=>d.data()); }

const VIP_PLANS=[
  {name:"VIP-1",price:"10 USDT",amount:10,daily:"2.90",rate:"29%",total:"145.00",days:50,tasks:1,l1:"16%",l2:"3%",l3:"1%"},
  {name:"VIP-2",price:"50 USDT",amount:50,daily:"15.50",rate:"31%",total:"775.00",days:50,tasks:1,l1:"16%",l2:"3%",l3:"1%"},
  {name:"VIP-3",price:"200 USDT",amount:200,daily:"66.00",rate:"33%",total:"3,300.00",days:50,tasks:1,l1:"16%",l2:"3%",l3:"1%"},
  {name:"VIP-4",price:"700 USDT",amount:700,daily:"245.00",rate:"35%",total:"12,250.00",days:50,tasks:1,l1:"16%",l2:"3%",l3:"1%"},
  {name:"VIP-5",price:"1,500 USDT",amount:1500,daily:"555.00",rate:"37%",total:"27,750.00",days:50,tasks:1,l1:"16%",l2:"3%",l3:"1%"},
  {name:"VIP-6",price:"5,000 USDT",amount:5000,daily:"2,250.00",rate:"45%",total:"112,500.00",days:50,tasks:1,l1:"16%",l2:"3%",l3:"1%"},
  {name:"VIP-7",price:"10,000 USDT",amount:10000,daily:"4,450.00",rate:"44.5%",total:"222,500.00",days:50,tasks:1,l1:"16%",l2:"3%",l3:"1%"},
  {name:"VIP-8",price:"20,000 USDT",amount:20000,daily:"13,600.00",rate:"68%",total:"408,000.00",days:30,tasks:1,l1:"16%",l2:"3%",l3:"1%"},
  {name:"VIP-9",price:"40,000 USDT",amount:40000,daily:"40,000.00",rate:"100%",total:"1,200,000.00",days:30,tasks:1,l1:"16%",l2:"3%",l3:"1%"},
];

async function registerUser(email,password,name,refCode){
  const existing=await getUser(email);
  if(existing) throw new Error("Email already registered.");
  await createUserWithEmailAndPassword(auth,email,password);
  let referredBy=null;
  if(refCode){
    const q=query(collection(fdb,"users"),where("code","==",refCode.toUpperCase()));
    const snap=await getDocs(q);
    if(!snap.empty){
      const ref=snap.docs[0].data(); referredBy=ref.email;
      await updateDoc(userRef(ref.email),{referrals:[...(ref.referrals||[]),{email,name,plan:null,reward:0,level:1}]});
    }
  }
  const code=generateCode(name);
  const ud={email,name,code,balance:0,totalEarned:0,refEarnings:0,activePlan:null,
    referredBy,refCodeSaved:refCode?.toUpperCase()||null,referrals:[],taskLog:{}};
  await setDoc(userRef(email),ud); return ud;
}

async function loginUser(email,password){
  await signInWithEmailAndPassword(auth,email,password);
  const u=await getUser(email); if(!u) throw new Error("Account data not found."); return u;
}

async function creditReferrers(userEmail,planAmount,planName){
  const u=await getUser(userEmail); if(!u||!u.referredBy)return;
  const batch=writeBatch(fdb);
  const r1=await getUser(u.referredBy);
  if(r1){
    const b1=parseFloat((planAmount*0.16).toFixed(2));
    const refs1=(r1.referrals||[]).map(x=>x.email===userEmail?{...x,plan:planName,reward:b1}:x);
    batch.update(userRef(r1.email),{refEarnings:parseFloat(((r1.refEarnings||0)+b1).toFixed(2)),balance:parseFloat(((r1.balance||0)+b1).toFixed(2)),referrals:refs1});
    if(r1.referredBy){
      const r2=await getUser(r1.referredBy);
      if(r2){
        const b2=parseFloat((planAmount*0.03).toFixed(2));
        batch.update(userRef(r2.email),{refEarnings:parseFloat(((r2.refEarnings||0)+b2).toFixed(2)),balance:parseFloat(((r2.balance||0)+b2).toFixed(2))});
        if(r2.referredBy){
          const r3=await getUser(r2.referredBy);
          if(r3){
            const b3=parseFloat((planAmount*0.01).toFixed(2));
            batch.update(userRef(r3.email),{refEarnings:parseFloat(((r3.refEarnings||0)+b3).toFixed(2)),balance:parseFloat(((r3.balance||0)+b3).toFixed(2))});
          }
        }
      }
    }
  }
  await batch.commit();
}

const BASE_PRICES={BTC:97420.50,ETH:3284.20,BNB:612.40,SOL:185.30};
function useCryptoPrices(){
  const [prices,setPrices]=useState(BASE_PRICES);
  const [changes,setChanges]=useState({BTC:2.34,ETH:-1.12,BNB:3.45,SOL:5.67});
  useEffect(()=>{
    const t=setInterval(()=>{
      setPrices(p=>({BTC:parseFloat((p.BTC+(Math.random()-0.48)*50).toFixed(2)),ETH:parseFloat((p.ETH+(Math.random()-0.48)*8).toFixed(2)),BNB:parseFloat((p.BNB+(Math.random()-0.48)*2).toFixed(2)),SOL:parseFloat((p.SOL+(Math.random()-0.48)*1).toFixed(2))}));
      setChanges(c=>({BTC:parseFloat((c.BTC+(Math.random()-0.5)*0.1).toFixed(2)),ETH:parseFloat((c.ETH+(Math.random()-0.5)*0.1).toFixed(2)),BNB:parseFloat((c.BNB+(Math.random()-0.5)*0.1).toFixed(2)),SOL:parseFloat((c.SOL+(Math.random()-0.5)*0.1).toFixed(2))}));
    },2000);return()=>clearInterval(t);
  },[]);
  return{prices,changes};
}

function useCountdown(){
  const [time,setTime]=useState("");
  useEffect(()=>{
    const tick=()=>{const now=new Date();const reset=new Date();reset.setHours(24,0,0,0);const diff=reset-now;setTime(`${Math.floor(diff/3600000).toString().padStart(2,"0")}:${Math.floor((diff%3600000)/60000).toString().padStart(2,"0")}:${Math.floor((diff%60000)/1000).toString().padStart(2,"0")}`);};
    tick();const t=setInterval(tick,1000);return()=>clearInterval(t);
  },[]);
  return time;
}

function Sparkline({up}){
  const [pts,setPts]=useState(Array.from({length:20},()=>50+Math.random()*30));
  useEffect(()=>{const t=setInterval(()=>{setPts(p=>[...p.slice(1),Math.max(10,Math.min(90,p[p.length-1]+(Math.random()-0.48)*8))]);},1000);return()=>clearInterval(t);},[]);
  const w=80,h=30;
  return(<svg width={w} height={h}><polyline points={pts.map((v,i)=>`${(i/19)*w},${h-v*h/100}`).join(" ")} fill="none" stroke={up?"#4ade80":"#f87171"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></svg>);
}

const FAKE_MEMBERS=[
  {plan:"VIP-3",user:"+25***6789",amount:"+$66.00"},{plan:"VIP-6",user:"ali***@gmail.com",amount:"+$2,250.00"},
  {plan:"VIP-7",user:"+1***4521",amount:"+$4,450.00"},{plan:"VIP-1",user:"muk***@gmail.com",amount:"+$2.90"},
  {plan:"VIP-5",user:"+25***1234",amount:"+$555.00"},{plan:"VIP-8",user:"sam***@yahoo.com",amount:"+$13,600.00"},
  {plan:"VIP-9",user:"john***@outlook.com",amount:"+$40,000.00"},{plan:"VIP-2",user:"+25***9988",amount:"+$15.50"},
  {plan:"VIP-4",user:"peter***@gmail.com",amount:"+$245.00"},{plan:"VIP-6",user:"+44***7823",amount:"+$2,250.00"},
];

function SnakeGame({plan,onComplete}){
  const [snake,setSnake]=useState([{x:7,y:7}]);
  const [food,setFood]=useState({x:3,y:3});
  const [dir,setDir]=useState({x:1,y:0});
  const [running,setRunning]=useState(false);
  const [done,setDone]=useState(false);
  const [won,setWon]=useState(false);
  const [score,setScore]=useState(0);
  const dR=useRef(dir);const sR=useRef(snake);const scR=useRef(score);
  dR.current=dir;sR.current=snake;scR.current=score;
  const rndF=s=>{let f;do{f={x:Math.floor(Math.random()*GRID),y:Math.floor(Math.random()*GRID)};}while(s.some(b=>b.x===f.x&&b.y===f.y));return f;};
  const reset=()=>{const s=[{x:7,y:7}];setSnake(s);setFood(rndF(s));setDir({x:1,y:0});setScore(0);setDone(false);setWon(false);setRunning(false);};
  useEffect(()=>{
    if(!running)return;
    const t=setInterval(()=>{
      const d=dR.current,s=sR.current,sc=scR.current;
      const head={x:(s[0].x+d.x+GRID)%GRID,y:(s[0].y+d.y+GRID)%GRID};
      if(s.some(b=>b.x===head.x&&b.y===head.y)){setDone(true);setRunning(false);return;}
      const ate=head.x===food.x&&head.y===food.y;
      const ns=ate?[head,...s]:[head,...s.slice(0,-1)];setSnake(ns);
      if(ate){const n=sc+1;setScore(n);if(n>=TARGET){setWon(true);setRunning(false);onComplete();return;}setFood(rndF(ns));}
    },GAME_SPEED);return()=>clearInterval(t);
  },[running,food]);
  useEffect(()=>{
    const h=e=>{const m={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};if(m[e.key]){e.preventDefault();const nd=m[e.key];if(nd.x!==-dR.current.x||nd.y!==-dR.current.y)setDir(nd);}};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);
  const sw=useRef({});
  const reward=plan?(plan.amount*0.16).toFixed(2):"0.00";
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:"100%"}}>
      <div style={{background:"#fff",borderRadius:16,padding:12,boxShadow:"0 4px 20px rgba(0,100,255,0.15)"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{color:"#1e56db",fontWeight:700,fontSize:13}}>🐍 Daily Task</span>
          <span style={{color:"#1e56db",fontWeight:700,fontSize:13}}>{score}/{TARGET} 🍎</span>
        </div>
        <div style={{position:"relative",background:"#0f172a",borderRadius:12,overflow:"hidden",width:GRID*CELL,height:GRID*CELL}}
          onTouchStart={e=>{sw.current={x:e.touches[0].clientX,y:e.touches[0].clientY};}}
          onTouchEnd={e=>{const dx=e.changedTouches[0].clientX-sw.current.x,dy=e.changedTouches[0].clientY-sw.current.y;if(Math.abs(dx)>Math.abs(dy)){const nd=dx>0?{x:1,y:0}:{x:-1,y:0};if(nd.x!==-dR.current.x)setDir(nd);}else{const nd=dy>0?{x:0,y:1}:{x:0,y:-1};if(nd.y!==-dR.current.y)setDir(nd);}}}>
          {food&&<div style={{position:"absolute",left:food.x*CELL+1,top:food.y*CELL+1,width:CELL-2,height:CELL-2,background:"#f97316",borderRadius:4,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>🍎</div>}
          {snake.map((b,i)=><div key={i} style={{position:"absolute",left:b.x*CELL+1,top:b.y*CELL+1,width:CELL-2,height:CELL-2,background:i===0?"#22c55e":"#4ade80",borderRadius:i===0?5:3,border:i===0?"2px solid #16a34a":"none"}}/>)}
          {!running&&!done&&!won&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
            <p style={{color:"#fff",fontWeight:700,fontSize:15,margin:0}}>🐍 Daily Task</p>
            <p style={{color:"#94a3b8",fontSize:11,margin:0}}>Eat {TARGET} apples to earn!</p>
            <button onClick={()=>setRunning(true)} style={{background:"#22c55e",color:"#fff",border:"none",borderRadius:10,padding:"8px 24px",fontWeight:700,fontSize:13,cursor:"pointer"}}>▶ Start</button>
          </div>}
          {done&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
            <p style={{color:"#f87171",fontWeight:700,fontSize:18,margin:0}}>💀 Game Over</p>
            <button onClick={reset} style={{background:"#3b82f6",color:"#fff",border:"none",borderRadius:10,padding:"8px 20px",fontWeight:700,cursor:"pointer"}}>🔄 Retry</button>
          </div>}
          {won&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}>
            <p style={{color:"#fbbf24",fontWeight:700,fontSize:18,margin:0}}>🎉 Complete!</p>
            <p style={{color:"#4ade80",fontWeight:900,fontSize:24,margin:0}}>+{reward} USDT</p>
          </div>}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginTop:10,gap:4}}>
          <button onPointerDown={()=>{if(dR.current.y!==1)setDir({x:0,y:-1});}} style={{background:"#e2e8f0",border:"none",borderRadius:10,width:44,height:36,fontSize:16,cursor:"pointer",fontWeight:700}}>↑</button>
          <div style={{display:"flex",gap:4}}>
            <button onPointerDown={()=>{if(dR.current.x!==1)setDir({x:-1,y:0});}} style={{background:"#e2e8f0",border:"none",borderRadius:10,width:44,height:36,fontSize:16,cursor:"pointer",fontWeight:700}}>←</button>
            <button onPointerDown={()=>{if(dR.current.x!==-1)setDir({x:1,y:0});}} style={{background:"#e2e8f0",border:"none",borderRadius:10,width:44,height:36,fontSize:16,cursor:"pointer",fontWeight:700}}>→</button>
          </div>
          <button onPointerDown={()=>{if(dR.current.y!==-1)setDir({x:0,y:1});}} style={{background:"#e2e8f0",border:"none",borderRadius:10,width:44,height:36,fontSize:16,cursor:"pointer",fontWeight:700}}>↓</button>
        </div>
      </div>
      {plan&&<div style={{marginTop:10,background:"rgba(255,255,255,0.1)",borderRadius:12,padding:"10px 20px",textAlign:"center",width:"100%",boxSizing:"border-box"}}>
        <p style={{color:"rgba(255,255,255,0.7)",fontSize:11,margin:0}}>Daily Commission ({plan.rate} of {plan.price})</p>
        <p style={{color:"#4ade80",fontWeight:900,fontSize:22,margin:0}}>+{plan.daily} USDT</p>
      </div>}
    </div>
  );
}

function AuthScreen({onAuth}){
  const [mode,setMode]=useState("login");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [refCode,setRefCode]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [showPass,setShowPass]=useState(false);
  const {prices,changes}=useCryptoPrices();

  const handle=async()=>{
    setError("");
    if(!email||!password)return setError("Please fill all fields.");
    if(mode==="register"){if(!name.trim())return setError("Enter your name.");if(password!==confirm)return setError("Passwords do not match.");if(password.length<6)return setError("Min 6 characters.");}
    setLoading(true);
    try{
      if(email.trim().toLowerCase()===ADMIN_EMAIL&&password===ADMIN_PASS){onAuth("admin");setLoading(false);return;}
      const user=mode==="register"?await registerUser(email.trim().toLowerCase(),password,name.trim(),refCode.trim()):await loginUser(email.trim().toLowerCase(),password);
      onAuth(user);
    }catch(e){
      if(e.code==="auth/user-not-found"||e.code==="auth/wrong-password"||e.code==="auth/invalid-credential")setError("Wrong email or password.");
      else if(e.code==="auth/email-already-in-use")setError("Email already registered.");
      else setError(e.message);
    }
    setLoading(false);
  };

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0a1628 0%,#0d2060 40%,#1a3a9f 100%)",display:"flex",flexDirection:"column",fontFamily:"'Segoe UI',sans-serif",overflowX:"hidden"}}>
      <div style={{background:"rgba(247,147,26,0.15)",borderBottom:"1px solid rgba(247,147,26,0.3)",padding:"6px 0",overflow:"hidden"}}>
        <div style={{display:"flex",gap:24,whiteSpace:"nowrap",animation:"scroll 20s linear infinite"}}>
          {["BTC","ETH","BNB","SOL","BTC","ETH","BNB","SOL"].map((c,i)=>(
            <span key={i} style={{color:changes[c]>=0?"#4ade80":"#f87171",fontSize:12,fontWeight:600}}>
              {c} ${prices[c]?.toLocaleString()} {changes[c]>=0?"▲":"▼"}{Math.abs(changes[c]||0).toFixed(2)}%
            </span>
          ))}
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 16px 12px"}}>
        <div style={{position:"relative",marginBottom:12}}>
          <div style={{width:75,height:75,borderRadius:"50%",background:"linear-gradient(135deg,#f7931a,#ff6b35)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 30px rgba(247,147,26,0.5)",fontSize:38}}>₿</div>
          <div style={{position:"absolute",bottom:-4,right:-4,width:26,height:26,borderRadius:"50%",background:"#1e56db",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:13,border:"2px solid #0a1628"}}>W</div>
        </div>
        <h1 style={{color:"#fff",fontSize:32,fontWeight:900,margin:0,letterSpacing:2}}>WIZhub</h1>
        <p style={{color:"rgba(255,255,255,0.6)",fontSize:12,margin:"4px 0 0"}}>Smart Crypto Investment Platform</p>
      </div>

      {/* Live BTC */}
      <div style={{margin:"0 16px 12px",background:"linear-gradient(135deg,rgba(247,147,26,0.2),rgba(255,107,53,0.1))",border:"1px solid rgba(247,147,26,0.3)",borderRadius:16,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#f7931a,#ff6b35)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>₿</div>
            <div><p style={{margin:0,color:"#fff",fontWeight:700,fontSize:14}}>Bitcoin</p><p style={{margin:0,color:"rgba(255,255,255,0.5)",fontSize:10}}>BTC / USDT</p></div>
          </div>
          <div style={{textAlign:"right"}}>
            <p style={{margin:0,color:"#f7931a",fontWeight:900,fontSize:18}}>${prices.BTC?.toLocaleString()}</p>
            <p style={{margin:0,color:changes.BTC>=0?"#4ade80":"#f87171",fontSize:11}}>{changes.BTC>=0?"▲":"▼"}{Math.abs(changes.BTC||0).toFixed(2)}% (24h)</p>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
          {[{l:"ETH",p:prices.ETH,c:changes.ETH},{l:"BNB",p:prices.BNB,c:changes.BNB},{l:"SOL",p:prices.SOL,c:changes.SOL}].map((t,i)=>(
            <div key={i} style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"7px 0",textAlign:"center"}}>
              <p style={{margin:0,color:"rgba(255,255,255,0.5)",fontSize:10}}>{t.l}</p>
              <p style={{margin:0,color:"#fff",fontWeight:700,fontSize:11}}>${t.p?.toLocaleString()}</p>
              <p style={{margin:0,color:t.c>=0?"#4ade80":"#f87171",fontSize:10}}>{t.c>=0?"▲":"▼"}{Math.abs(t.c||0).toFixed(2)}%</p>
            </div>
          ))}
        </div>
      </div>

      {/* Referral Info Banner */}
      <div style={{margin:"0 16px 12px",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.3)",borderRadius:14,padding:12}}>
        <p style={{margin:"0 0 6px",color:"#fbbf24",fontWeight:700,fontSize:13}}>💎 WIZhub Team Benefits</p>
        <p style={{margin:"2px 0",color:"rgba(255,255,255,0.8)",fontSize:11}}>💎 Level 1 referral recharge → <strong style={{color:"#4ade80"}}>16% USDT bonus</strong></p>
        <p style={{margin:"2px 0",color:"rgba(255,255,255,0.8)",fontSize:11}}>💎 Level 2 referral recharge → <strong style={{color:"#4ade80"}}>3% USDT bonus</strong></p>
        <p style={{margin:"2px 0",color:"rgba(255,255,255,0.8)",fontSize:11}}>💎 Level 3 referral recharge → <strong style={{color:"#4ade80"}}>1% USDT bonus</strong></p>
      </div>

      {/* Auth Form */}
      <div style={{margin:"0 16px",background:"rgba(255,255,255,0.06)",backdropFilter:"blur(20px)",borderRadius:20,padding:20,border:"1px solid rgba(255,255,255,0.1)"}}>
        <div style={{display:"flex",background:"rgba(0,0,0,0.3)",borderRadius:12,padding:3,marginBottom:16}}>
          {["login","register"].map(m=>(
            <button key={m} onClick={()=>{setMode(m);setError("");}} style={{flex:1,padding:"10px 0",borderRadius:10,border:"none",fontWeight:700,fontSize:13,cursor:"pointer",background:mode===m?"#1e56db":"transparent",color:"#fff",transition:"all 0.2s"}}>
              {m==="login"?"🔑 Login":"📝 Register"}
            </button>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {mode==="register"&&<input value={name} onChange={e=>setName(e.target.value)} placeholder="Full Name" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"12px 14px",color:"#fff",fontSize:14,outline:"none"}}/>}
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Email Address" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"12px 14px",color:"#fff",fontSize:14,outline:"none"}}/>
          <div style={{position:"relative"}}>
            <input value={password} onChange={e=>setPassword(e.target.value)} type={showPass?"text":"password"} placeholder="Password (min 6 chars)" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"12px 40px 12px 14px",color:"#fff",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box"}}/>
            <button onClick={()=>setShowPass(!showPass)} style={{position:"absolute",right:12,top:12,background:"none",border:"none",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:14}}>{showPass?"🙈":"👁"}</button>
          </div>
          {mode==="register"&&<>
            <input value={confirm} onChange={e=>setConfirm(e.target.value)} type="password" placeholder="Confirm Password" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"12px 14px",color:"#fff",fontSize:14,outline:"none"}}/>
            <input value={refCode} onChange={e=>setRefCode(e.target.value.toUpperCase())} placeholder="Referral Code (optional)" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"12px 14px",color:"#fff",fontSize:14,outline:"none"}}/>
          </>}
        </div>
        {error&&<div style={{marginTop:10,background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:10,padding:"8px 12px",color:"#fca5a5",fontSize:12}}>⚠️ {error}</div>}
        <button onClick={handle} disabled={loading} style={{width:"100%",marginTop:14,background:"linear-gradient(135deg,#1e56db,#2563eb)",color:"#fff",border:"none",borderRadius:12,padding:"14px 0",fontWeight:700,fontSize:15,cursor:"pointer",boxShadow:"0 4px 20px rgba(30,86,219,0.4)"}}>
          {loading?"Please wait...":mode==="login"?"🔑 Login to Account":"🚀 Create Account"}
        </button>
        <p style={{textAlign:"center",margin:"10px 0 0"}}><button onClick={()=>window.open(`https://t.me/${TELEGRAM}`,"_blank")} style={{background:"none",border:"none",color:"rgba(255,255,255,0.5)",fontSize:12,cursor:"pointer"}}>Need help? Contact Support ✈️</button></p>
      </div>
      <div style={{height:20}}/>
      <style>{`@keyframes scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
    </div>
  );
}

function AdminPanel({onLogout}){
  const [tab,setTab]=useState("dashboard");
  const [users,setUsers]=useState([]);
  const [search,setSearch]=useState("");
  const [sel,setSel]=useState(null);
  const [loading,setLoading]=useState(true);
  const refresh=async()=>{setLoading(true);const all=await getAllUsers();setUsers(all);setLoading(false);};
  useEffect(()=>{refresh();},[]);
  const all=users;
  const pending=all.filter(u=>!u.activePlan);
  const activatePlan=async(e,p)=>{const u=await getUser(e);if(!u)return;await updateUser({...u,activePlan:p,activatedAt:new Date().toISOString()});await creditReferrers(e,p.amount,p.name);await refresh();if(sel?.email===e)setSel(await getUser(e));};
  const deactivatePlan=async(e)=>{await updateDoc(userRef(e),{activePlan:null});await refresh();if(sel?.email===e)setSel(await getUser(e));};
  const adjustBalance=async(e,a)=>{const u=await getUser(e);if(!u)return;await updateDoc(userRef(e),{balance:parseFloat(((u.balance||0)+parseFloat(a)).toFixed(2))});await refresh();if(sel?.email===e)setSel(await getUser(e));};
  const deleteUser=async(e)=>{if(!window.confirm(`Delete ${e}?`))return;await deleteDoc(userRef(e));setSel(null);refresh();};
  const filtered=all.filter(u=>u.name?.toLowerCase().includes(search.toLowerCase())||u.email?.toLowerCase().includes(search.toLowerCase()));
  const C={background:"#1e3a8a",borderRadius:16,padding:16,color:"#fff",marginBottom:10};

  return(
    <div style={{minHeight:"100vh",background:"#0f172a",fontFamily:"'Segoe UI',sans-serif",color:"#fff"}}>
      <div style={{background:"linear-gradient(135deg,#1e3a8a,#1e56db)",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"#f7931a",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:"#000"}}>W</div>
          <div><p style={{margin:0,fontWeight:700,fontSize:14}}>WIZhub Admin</p><p style={{margin:0,color:"rgba(255,255,255,0.6)",fontSize:10}}>Control Panel</p></div>
        </div>
        <button onClick={onLogout} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontWeight:600,fontSize:12,cursor:"pointer"}}>🚪 Logout</button>
      </div>
      <div style={{padding:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[{l:"Total Users",v:all.length,i:"👥",c:"#1e40af"},{l:"Active Plans",v:all.filter(u=>u.activePlan).length,i:"✅",c:"#065f46"},{l:"Revenue",v:`$${all.reduce((s,u)=>s+(u.activePlan?.amount||0),0)}`,i:"💰",c:"#92400e"},{l:"Paid Out",v:`$${all.reduce((s,u)=>s+(u.totalEarned||0),0).toFixed(2)}`,i:"📤",c:"#581c87"}].map((s,i)=>(
          <div key={i} style={{background:s.c,borderRadius:16,padding:14}}>
            <p style={{fontSize:20,margin:0}}>{s.i}</p><p style={{fontSize:20,fontWeight:900,margin:"2px 0 0"}}>{s.v}</p><p style={{fontSize:10,opacity:0.7,margin:0}}>{s.l}</p>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,padding:"0 16px 12px",overflowX:"auto"}}>
        {[{id:"dashboard",l:"📊 Overview"},{id:"users",l:"👥 Users"},{id:"pending",l:`⏳ Pending (${pending.length})`},{id:"activate",l:"💳 Activate"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{whiteSpace:"nowrap",padding:"7px 14px",borderRadius:20,border:"none",fontWeight:700,fontSize:11,cursor:"pointer",background:tab===t.id?"#2563eb":"rgba(255,255,255,0.1)",color:"#fff"}}>{t.l}</button>
        ))}
      </div>
      <div style={{padding:"0 16px 80px"}}>
        {tab==="dashboard"&&<div style={C}>
          <h3 style={{margin:"0 0 10px",fontSize:14}}>📈 Plan Breakdown</h3>
          {VIP_PLANS.map((v,i)=>{const cnt=all.filter(u=>u.activePlan?.name===v.name).length;return(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
              <span style={{fontSize:12,fontWeight:600}}>{v.name}</span><span style={{fontSize:11,opacity:0.6}}>{v.price}</span>
              <span style={{background:"#3b82f6",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{cnt}</span>
            </div>
          );})}
        </div>}
        {(tab==="users"||tab==="activate")&&<>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{width:"100%",background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:10,padding:"10px 14px",color:"#fff",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:10}}/>
          {filtered.map((u,i)=>(
            <div key={i} style={C}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:"#2563eb",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{u.name?.charAt(0).toUpperCase()}</div>
                  <div><p style={{margin:0,fontWeight:700,fontSize:13}}>{u.name}</p><p style={{margin:0,opacity:0.6,fontSize:11}}>{u.email}</p><p style={{margin:0,color:"#fbbf24",fontSize:11,fontFamily:"monospace",fontWeight:700}}>🔑 Code: {u.code}</p>{u.refCodeSaved&&<p style={{margin:0,color:"#94a3b8",fontSize:10}}>Referred by: {u.refCodeSaved}</p>}</div>
                </div>
                <span style={{background:u.activePlan?"#065f46":"rgba(255,255,255,0.15)",padding:"3px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{u.activePlan?u.activePlan.name:"No Plan"}</span>
              </div>
              {tab==="activate"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {VIP_PLANS.map((v,j)=><button key={j} onClick={()=>activatePlan(u.email,v)} style={{background:u.activePlan?.name===v.name?"#065f46":"#2563eb",color:"#fff",border:"none",borderRadius:8,padding:"6px 0",fontSize:10,fontWeight:700,cursor:"pointer"}}>{u.activePlan?.name===v.name?"✅":""}{v.name}</button>)}
              </div>}
              {tab==="users"&&<button onClick={()=>setSel(u)} style={{width:"100%",background:"rgba(255,255,255,0.1)",color:"#fff",border:"none",borderRadius:8,padding:"8px 0",fontSize:12,fontWeight:600,cursor:"pointer"}}>⚙️ Manage</button>}
            </div>
          ))}
        </>}
        {tab==="pending"&&(pending.length===0?<div style={{...C,textAlign:"center",padding:40}}><p style={{fontSize:32}}>✅</p><p>No pending users</p></div>:
          pending.map((u,i)=>(
            <div key={i} style={{...C,borderLeft:"4px solid #fbbf24"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:"#f7931a",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"#000"}}>{u.name?.charAt(0).toUpperCase()}</div>
                <div><p style={{margin:0,fontWeight:700,fontSize:13}}>{u.name}</p><p style={{margin:0,opacity:0.6,fontSize:11}}>{u.email}</p><p style={{margin:0,color:"#60a5fa",fontSize:11,fontFamily:"monospace"}}>{u.code}</p></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {VIP_PLANS.map((v,j)=><button key={j} onClick={()=>activatePlan(u.email,v)} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:8,padding:"6px 0",fontSize:10,fontWeight:700,cursor:"pointer"}}>✅ {v.name}</button>)}
              </div>
            </div>
          ))
        )}
      </div>
      {sel&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div style={{background:"#1e3a8a",borderRadius:"20px 20px 0 0",padding:24,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0}}>👤 {sel.name}</h3><button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:"#fff",fontSize:22,cursor:"pointer"}}>✕</button></div>
            {[["Email",sel.email],["Code",sel.code],["Plan",sel.activePlan?.name||"None"],["Balance",`${(sel.balance||0).toFixed(2)} USDT`],["Earned",`${(sel.totalEarned||0).toFixed(2)} USDT`],["Ref Bonus",`${(sel.refEarnings||0).toFixed(2)} USDT`],["Ref Code Used",sel.refCodeSaved||"None"]].map(([k,v],i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",background:"rgba(255,255,255,0.1)",borderRadius:8,padding:"8px 12px",marginBottom:6}}>
                <span style={{fontSize:12,opacity:0.7}}>{k}</span><span style={{fontSize:12,fontWeight:700}}>{v}</span>
              </div>
            ))}
            <div style={{display:"flex",gap:6,margin:"12px 0"}}>
              {[5,10,20,50,-10].map(a=><button key={a} onClick={()=>adjustBalance(sel.email,a)} style={{flex:1,background:a>0?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)",color:a>0?"#4ade80":"#f87171",border:"none",borderRadius:8,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer"}}>{a>0?"+":""}{a}</button>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
              {VIP_PLANS.map((v,i)=><button key={i} onClick={()=>activatePlan(sel.email,v)} style={{background:sel.activePlan?.name===v.name?"#065f46":"#2563eb",color:"#fff",border:"none",borderRadius:8,padding:"6px 0",fontSize:10,fontWeight:700,cursor:"pointer"}}>{sel.activePlan?.name===v.name?"✅":""} {v.name}</button>)}
            </div>
            {sel.activePlan&&<button onClick={()=>deactivatePlan(sel.email)} style={{width:"100%",background:"rgba(239,68,68,0.2)",color:"#f87171",border:"1px solid rgba(239,68,68,0.3)",borderRadius:10,padding:"10px 0",fontWeight:700,fontSize:12,cursor:"pointer",marginBottom:6}}>❌ Deactivate</button>}
            <button onClick={()=>deleteUser(sel.email)} style={{width:"100%",background:"#dc2626",color:"#fff",border:"none",borderRadius:10,padding:"10px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>🗑 Delete User</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WIZhubApp(){
  const [user,setUser]=useState(null);
  const [isAdmin,setIsAdmin]=useState(false);
  const [tab,setTab]=useState("Home");
  const [selectedPlan,setSelectedPlan]=useState(null);
  const [payMethod,setPayMethod]=useState("USDT");
  const [copied,setCopied]=useState(false);
  const [showReward,setShowReward]=useState(false);
  const [rewardMsg,setRewardMsg]=useState("");
  const {prices,changes}=useCryptoPrices();
  const countdown=useCountdown();
  const [showAnnouncement,setShowAnnouncement]=useState(true);
  const [expanded,setExpanded]=useState(0);
  const [memberIdx,setMemberIdx]=useState(0);

  useEffect(()=>{
    if(sessionStorage.getItem("wiz_admin")==="true"){setIsAdmin(true);return;}
    const unsub=onAuthStateChanged(auth,async(fbUser)=>{
      if(fbUser&&fbUser.email!==ADMIN_EMAIL){
        const u=await getUser(fbUser.email);
        if(u)setUser(u);
      }
    });
    return()=>unsub();
  },[]);
  useEffect(()=>{const t=setInterval(()=>setMemberIdx(i=>(i+1)%FAKE_MEMBERS.length),2500);return()=>clearInterval(t);},[]);

  const today=todayStr();
  const taskLog=user?.taskLog||{};
  const todayTask=taskLog[today];
  const taskDone=!!todayTask?.done;
  const activePlan=user?.activePlan||null;

  const walletAddr=payMethod==="BTC"?WALLET_BTC:WALLET_USDT;
  const handleCopy=()=>{navigator.clipboard.writeText(walletAddr);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const handleTelegram=()=>{const msg=encodeURIComponent(`Hello WIZhub Support! 👋\nI sent ${selectedPlan?.price} via ${payMethod} for ${selectedPlan?.name}.\nEmail: ${user?.email}\nName: ${user?.name}\nTxID: [paste here]`);window.open(`https://t.me/${TELEGRAM}?text=${msg}`,"_blank");};
  const handleTaskComplete=async()=>{
    const amt=parseFloat(activePlan.daily);
    const updated={...user,balance:parseFloat((user.balance+amt).toFixed(2)),totalEarned:parseFloat((user.totalEarned+amt).toFixed(2)),taskLog:{...user.taskLog,[today]:{done:true,reward:activePlan.daily}}};
    await updateUser(updated);setUser(updated);setRewardMsg(`+${activePlan.daily} USDT`);setShowReward(true);setTimeout(()=>setShowReward(false),4000);
  };
  const handleAdminLogout=()=>{sessionStorage.removeItem("wiz_admin");setIsAdmin(false);};
  const handleLogout=async()=>{await signOut(auth);setUser(null);setTab("Home");};

  if(isAdmin)return<AdminPanel onLogout={handleAdminLogout}/>;
  if(!user)return<AuthScreen onAuth={u=>{if(u==="admin"){sessionStorage.setItem("wiz_admin","true");setIsAdmin(true);return;}setUser(u);}}/>;

  const BG="linear-gradient(160deg,#0a1628 0%,#0d2060 40%,#1a3a9f 100%)";
  const CARD={background:"rgba(255,255,255,0.07)",backdropFilter:"blur(10px)",borderRadius:16,padding:16,border:"1px solid rgba(255,255,255,0.12)",marginBottom:12};
  const WC={background:"#fff",borderRadius:16,padding:16,marginBottom:12,color:"#1e293b"};
  const NAV=active=>({display:"flex",flexDirection:"column",alignItems:"center",fontSize:10,fontWeight:600,color:active?"#2563eb":"#64748b",background:"none",border:"none",cursor:"pointer",gap:2,padding:"4px 8px"});
  const visibleMembers=[FAKE_MEMBERS[memberIdx],FAKE_MEMBERS[(memberIdx+1)%FAKE_MEMBERS.length],FAKE_MEMBERS[(memberIdx+2)%FAKE_MEMBERS.length]];

  return(
    <div style={{minHeight:"100vh",background:BG,fontFamily:"'Segoe UI',sans-serif",color:"#fff",paddingBottom:70}}>
      {showReward&&<div style={{position:"fixed",top:65,left:"50%",transform:"translateX(-50%)",zIndex:200,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",borderRadius:16,padding:"10px 24px",boxShadow:"0 8px 30px rgba(0,0,0,0.4)",textAlign:"center",whiteSpace:"nowrap"}}>
        <p style={{margin:0,fontWeight:700,fontSize:13}}>✅ Daily Commission Earned!</p>
        <p style={{margin:0,fontSize:12}}>{rewardMsg} credited</p>
      </div>}

      {/* Header */}
      <div style={{background:"rgba(0,0,0,0.4)",backdropFilter:"blur(10px)",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:50,borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#f7931a,#ff6b35)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>₿</div>
          <span style={{fontWeight:900,fontSize:18,letterSpacing:1}}>WIZhub</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:11,color:"#f7931a",fontWeight:700}}>₿${prices.BTC?.toLocaleString()}</span>
          <button onClick={handleLogout} style={{background:"rgba(220,38,38,0.3)",color:"#fff",border:"none",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>Logout</button>
        </div>
      </div>

      {/* Ticker */}
      <div style={{background:"rgba(247,147,26,0.1)",borderBottom:"1px solid rgba(247,147,26,0.2)",padding:"5px 0",overflow:"hidden"}}>
        <div style={{display:"flex",gap:20,animation:"scroll 15s linear infinite",whiteSpace:"nowrap"}}>
          {["BTC","ETH","BNB","SOL","BTC","ETH","BNB","SOL"].map((c,i)=>(
            <span key={i} style={{color:changes[c]>=0?"#4ade80":"#f87171",fontSize:11,fontWeight:600,padding:"0 4px"}}>
              {c} ${prices[c]?.toLocaleString()} {changes[c]>=0?"▲":"▼"}{Math.abs(changes[c]||0).toFixed(2)}%
            </span>
          ))}
        </div>
      </div>

      {/* HOME */}
      {tab==="Home"&&(
        <div style={{padding:14}}>
          <div style={WC}>
            <p style={{margin:"0 0 10px",color:"#64748b",fontSize:12}}>💎 Welcome, {user.name?.split(" ")[0]}!</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[{l:"Balance",v:`${(user.balance||0).toFixed(2)}`,c:"#1e56db",bg:"#eff6ff"},{l:"Today's Profit",v:taskDone?todayTask.reward:"0.00",c:"#16a34a",bg:"#f0fdf4"},{l:"Total Earned",v:`${(user.totalEarned||0).toFixed(2)}`,c:"#ea580c",bg:"#fff7ed"},{l:"Team Bonus",v:`${(user.refEarnings||0).toFixed(2)}`,c:"#9333ea",bg:"#fdf4ff"}].map((s,i)=>(
                <div key={i} style={{background:s.bg,borderRadius:12,padding:12,textAlign:"center"}}>
                  <p style={{margin:0,color:"#64748b",fontSize:10}}>{s.l}</p>
                  <p style={{margin:"2px 0",color:s.c,fontWeight:900,fontSize:18}}>{s.v}</p>
                  <p style={{margin:0,color:"#94a3b8",fontSize:10}}>USDT</p>
                </div>
              ))}
            </div>
          </div>

          {/* Team Benefits Banner */}
          <div style={{...CARD,background:"linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,165,0,0.08))"}}>
            <p style={{margin:"0 0 6px",fontWeight:700,fontSize:13,color:"#fbbf24"}}>💎 Your Team Benefits</p>
            <p style={{margin:"2px 0",fontSize:11,opacity:0.8}}>💎 Level 1 members recharge → <strong style={{color:"#4ade80"}}>16% USDT bonus</strong></p>
            <p style={{margin:"2px 0",fontSize:11,opacity:0.8}}>💎 Level 2 members recharge → <strong style={{color:"#4ade80"}}>3% USDT bonus</strong></p>
            <p style={{margin:"2px 0",fontSize:11,opacity:0.8}}>💎 Level 3 members recharge → <strong style={{color:"#4ade80"}}>1% USDT bonus</strong></p>
          </div>

          {/* Live BTC */}
          <div style={{...CARD,background:"linear-gradient(135deg,rgba(247,147,26,0.15),rgba(255,107,53,0.08))"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <p style={{margin:0,fontWeight:700,fontSize:13,color:"#fbbf24"}}>₿ Bitcoin Market</p>
              <span style={{background:"rgba(34,197,94,0.2)",color:"#4ade80",fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700}}>● LIVE</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div>
                <p style={{margin:0,color:"#f7931a",fontWeight:900,fontSize:22}}>${prices.BTC?.toLocaleString()}</p>
                <p style={{margin:0,color:changes.BTC>=0?"#4ade80":"#f87171",fontSize:11}}>{changes.BTC>=0?"▲":"▼"}{Math.abs(changes.BTC||0).toFixed(2)}% (24h)</p>
              </div>
              <Sparkline up={changes.BTC>=0}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
              {[{n:"ETH",p:prices.ETH,c:changes.ETH},{n:"BNB",p:prices.BNB,c:changes.BNB},{n:"SOL",p:prices.SOL,c:changes.SOL}].map((t,i)=>(
                <div key={i} style={{background:"rgba(0,0,0,0.3)",borderRadius:10,padding:"7px 0",textAlign:"center"}}>
                  <p style={{margin:0,color:"rgba(255,255,255,0.5)",fontSize:10}}>{t.n}</p>
                  <p style={{margin:0,color:"#fff",fontWeight:700,fontSize:11}}>${t.p?.toLocaleString()}</p>
                  <p style={{margin:0,color:t.c>=0?"#4ade80":"#f87171",fontSize:10}}>{t.c>=0?"▲":"▼"}{Math.abs(t.c||0).toFixed(2)}%</p>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            {[{i:"💰",l:"Recharge",a:()=>setSelectedPlan(VIP_PLANS[0])},{i:"📤",l:"Withdraw",a:()=>window.open(`https://t.me/${TELEGRAM}`,"_blank")},{i:"📋",l:"Tasks",a:()=>setTab("Task")},{i:"💎",l:"VIP Plans",a:()=>setTab("VIP")}].map((b,i)=>(
              <button key={i} onClick={b.a} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:14,padding:"14px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:5,cursor:"pointer",color:"#fff"}}>
                <span style={{fontSize:22}}>{b.i}</span><span style={{fontSize:12,fontWeight:600}}>{b.l}</span>
              </button>
            ))}
          </div>

          {/* Countdown */}
          <div style={{...CARD,textAlign:"center"}}>
            <p style={{margin:0,fontSize:11,opacity:0.6}}>⏱ Task Reset Countdown</p>
            <p style={{margin:"4px 0 0",fontSize:32,fontWeight:900,letterSpacing:6,color:"#fbbf24",fontFamily:"monospace"}}>{countdown}</p>
            {activePlan?<p style={{margin:"4px 0 0",fontSize:11,color:"#4ade80"}}>✅ {activePlan.name} · Daily: +{activePlan.daily} USDT ({activePlan.rate})</p>:<button onClick={()=>setTab("VIP")} style={{marginTop:8,background:"#f7931a",color:"#fff",border:"none",borderRadius:20,padding:"6px 20px",fontWeight:700,fontSize:12,cursor:"pointer"}}>⚡ Unlock VIP Plan</button>}
          </div>

          {/* Task Hall */}
          <p style={{margin:"0 0 10px",fontWeight:700,fontSize:15}}>Task Hall</p>
          <div style={{display:"flex",flexDirection:"column",gap:0,borderRadius:16,overflow:"hidden",marginBottom:12,boxShadow:"0 4px 20px rgba(0,0,0,0.15)"}}>
            {VIP_PLANS.map((vip,i)=>{
              const isActive=activePlan?.name===vip.name;
              return(
                <div key={i} style={{background:isActive?"#dbeafe":"#e8f0fe",borderBottom:i<VIP_PLANS.length-1?"1px solid rgba(30,86,219,0.1)":"none",padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <p style={{margin:0,fontSize:11,color:"#64748b"}}>Order commission</p>
                    <p style={{margin:"2px 0",fontSize:24,fontWeight:900,color:"#1e293b"}}>${vip.daily}</p>
                    <p style={{margin:"4px 0 0",fontSize:12,fontWeight:600,color:"#1e56db"}}>{vip.name}</p>
                    <button onClick={()=>isActive?setTab("Task"):setSelectedPlan(vip)} style={{marginTop:8,background:isActive?"#1e56db":"rgba(30,86,219,0.15)",color:isActive?"#fff":"#1e56db",border:"none",borderRadius:20,padding:"4px 16px",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                      <span>{isActive?"▶▶":"⇒"}</span>
                    </button>
                  </div>
                  <div style={{width:64,height:64,borderRadius:14,background:isActive?"#fff":"rgba(100,116,139,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,border:isActive?"2px solid #1e56db":"none",boxShadow:isActive?"0 4px 12px rgba(30,86,219,0.2)":"none"}}>
                    {isActive?"🔥":"🔒"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Member List */}
          <p style={{margin:"0 0 10px",fontWeight:700,fontSize:15}}>Member List</p>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
            {visibleMembers.map((m,i)=>(
              <div key={i} style={{...CARD,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",marginBottom:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{background:"#1e56db",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700}}>{m.plan}</span>
                  <span style={{fontSize:12,opacity:0.8}}>{m.user}</span>
                </div>
                <span style={{color:"#4ade80",fontWeight:700,fontSize:14}}>{m.amount}</span>
              </div>
            ))}
          </div>

          {/* Regulatory Authority */}
          <div style={{marginBottom:12}}>
            <p style={{margin:"0 0 10px",fontWeight:700,fontSize:15,color:"#fff"}}>Regulatory Authority</p>
            <div style={{background:"#fff",borderRadius:16,padding:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[
                {name:"ASIC + NFA + FCA + CySEC",img:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/ASIC_logo.svg/200px-ASIC_logo.svg.png",bg:"#f8fafc"},
                {name:"U.S. SEC",img:"https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/U.S._Securities_and_Exchange_Commission_logo.svg/200px-U.S._Securities_and_Exchange_Commission_logo.svg.png",bg:"#1e3a8a"},
                {name:"FinCEN",img:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/US-FinancialCrimesEnforcementNetwork-Seal.svg/200px-US-FinancialCrimesEnforcementNetwork-Seal.svg.png",bg:"#f8fafc"},
                {name:"SCA",img:"https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Flag_of_the_United_Arab_Emirates.svg/200px-Flag_of_the_United_Arab_Emirates.svg.png",bg:"#f8fafc"},
              ].map((a,i)=>(
                <div key={i} style={{background:a.bg,borderRadius:12,padding:10,display:"flex",alignItems:"center",justifyContent:"center",minHeight:80,overflow:"hidden"}}>
                  <img src={a.img} alt={a.name} style={{maxWidth:"100%",maxHeight:70,objectFit:"contain"}} onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}}/>
                  <div style={{display:"none",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4}}>
                    <span style={{fontSize:20}}>🏛</span>
                    <span style={{fontSize:9,fontWeight:700,color:"#1e293b",textAlign:"center"}}>{a.name}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:"#fff",borderRadius:16,padding:14,marginTop:10}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"}}>
                {[
                  {label:"ASIC",sub:"Australian Securities"},
                  {label:"NFA",sub:"National Futures Assoc."},
                  {label:"FCA",sub:"Financial Conduct Auth."},
                  {label:"CySEC",sub:"Cyprus Securities"},
                  {label:"SEC",sub:"U.S. Securities & Exchange"},
                  {label:"FinCEN",sub:"Financial Crimes Network"},
                ].map((r,i)=>(
                  <div key={i} style={{background:"#eff6ff",borderRadius:10,padding:"6px 12px",textAlign:"center",minWidth:80}}>
                    <p style={{margin:0,fontWeight:700,fontSize:12,color:"#1e56db"}}>{r.label}</p>
                    <p style={{margin:0,fontSize:9,color:"#64748b"}}>{r.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TASKS */}
      {tab==="Task"&&(()=>{
        const completedTasks=Object.keys(taskLog).length;
        const isFirstTask=completedTasks===0;
        const taskTaxAmount=completedTasks*10; // $10 for 2nd task, $20 for 3rd, etc.
        const taxPaid=taskLog[today]?.taxPaid||false;
        const needsTax=!isFirstTask&&!taxPaid&&!taskDone;
        return(
        <div style={{padding:14}}>
          <div style={{...CARD,textAlign:"center"}}>
            <p style={{margin:0,fontSize:11,opacity:0.6}}>⏱ Task Reset Countdown</p>
            <p style={{margin:"2px 0 0",fontSize:28,fontWeight:900,color:"#fbbf24",fontFamily:"monospace",letterSpacing:4}}>{countdown}</p>
            <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:10}}>
              {[{l:"Completed",v:completedTasks},{l:"All",v:completedTasks+(taskDone?0:1)},{l:"In progress",v:taskDone?0:1}].map((s,i)=>(
                <div key={i} style={{textAlign:"center"}}>
                  <p style={{margin:0,fontWeight:700,fontSize:18,color:"#fff"}}>{s.v}</p>
                  <p style={{margin:0,fontSize:10,opacity:0.6}}>{s.l}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={WC}>
            <h2 style={{color:"#1e56db",margin:"0 0 4px",fontSize:17}}>📋 Daily Task</h2>
            <p style={{color:"#64748b",fontSize:13,margin:"0 0 14px"}}>Complete the Snake game to earn your daily commission.</p>

            {!activePlan?(
              <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:12,padding:16,textAlign:"center"}}>
                <p style={{color:"#92400e",fontWeight:600,fontSize:13,margin:"0 0 8px"}}>⚠️ No Active Plan</p>
                <button onClick={()=>setTab("VIP")} style={{background:"#f59e0b",color:"#fff",border:"none",borderRadius:10,padding:"8px 20px",fontWeight:700,fontSize:13,cursor:"pointer"}}>Unlock VIP Plan →</button>
              </div>
            ):taskDone?(
              <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:12,padding:20,textAlign:"center"}}>
                <p style={{color:"#16a34a",fontWeight:700,fontSize:18,margin:"0 0 4px"}}>✅ Task Complete!</p>
                <p style={{color:"#4b5563",fontSize:14,margin:"0 0 2px"}}>Earned <strong>{todayTask.reward} USDT</strong> today.</p>
                <p style={{color:"#94a3b8",fontSize:12,margin:0}}>Come back tomorrow for the next task!</p>
                {completedTasks>1&&<div style={{marginTop:10,background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:10,padding:10}}>
                  <p style={{color:"#92400e",fontSize:11,margin:0}}>⚠️ Tomorrow's task will require a <strong>${taskTaxAmount+10} USDT</strong> fee to unlock.</p>
                </div>}
              </div>
            ):needsTax?(
              // Tax required popup style
              <div style={{background:"#f8fafc",borderRadius:16,padding:20,border:"1px solid #e2e8f0"}}>
                <h3 style={{color:"#1e293b",textAlign:"center",margin:"0 0 4px",fontSize:16}}>Hint</h3>
                <p style={{color:"#dc2626",textAlign:"center",fontSize:13,margin:"0 0 16px",fontWeight:600}}>The amount is insufficient, please recharge first</p>
                <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center"}}>
                  <div style={{width:80,height:80,borderRadius:10,background:"linear-gradient(135deg,#1e56db,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,flexShrink:0}}>₿</div>
                  <div style={{flex:1}}>
                    <p style={{margin:"0 0 4px",fontWeight:600,color:"#1e293b",fontSize:13}}>WIZhub Daily Task {completedTasks+1}</p>
                    <p style={{margin:"0 0 2px",color:"#64748b",fontSize:12}}>Task commission fee required</p>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
                  {[
                    {l:"Task Fee",v:`$${taskTaxAmount}.00`,c:"#1e293b"},
                    {l:"Daily Income",v:`+$${activePlan?.daily}`,c:"#16a34a"},
                    {l:"Total Balance",v:`$${(user.balance||0).toFixed(2)}`,c:"#1e293b"},
                    {l:"Make up the difference",v:`$${Math.max(0,taskTaxAmount-(user.balance||0)).toFixed(2)}`,c:"#1e293b"},
                  ].map(({l,v,c},i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
                      <span style={{fontSize:13,color:"#64748b"}}>{l}</span>
                      <span style={{fontSize:13,fontWeight:600,color:c}}>{v}</span>
                    </div>
                  ))}
                </div>
                <button onClick={()=>{
                  const msg=encodeURIComponent(`Hello WIZhub Support! 👋\nI want to pay the task fee of $${taskTaxAmount} USDT to unlock my next task.\nEmail: ${user?.email}\nName: ${user?.name}\nTask number: ${completedTasks+1}\nPlease help me activate.\nTxID: [paste here]`);
                  window.open(`https://t.me/${TELEGRAM}?text=${msg}`,"_blank");
                }} style={{width:"100%",background:"#1e56db",color:"#fff",border:"none",borderRadius:12,padding:"14px 0",fontWeight:700,fontSize:15,cursor:"pointer"}}>Recharge</button>
                <p style={{textAlign:"center",fontSize:11,color:"#94a3b8",marginTop:8}}>Pay ${taskTaxAmount} USDT task fee to unlock today's task</p>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                <div style={{background:"#eff6ff",borderRadius:10,padding:"8px 16px",marginBottom:10,width:"100%",textAlign:"center",boxSizing:"border-box"}}>
                  <p style={{color:"#1e56db",fontWeight:600,fontSize:13,margin:0}}>{activePlan.name} · Rate: {activePlan.rate} · Daily: +{activePlan.daily} USDT</p>
                  {isFirstTask&&<p style={{color:"#16a34a",fontSize:11,margin:"4px 0 0"}}>✅ First task is FREE! Complete to earn your reward.</p>}
                </div>
                <SnakeGame plan={activePlan} onComplete={handleTaskComplete}/>
              </div>
            )}
          </div>

          {Object.keys(taskLog).length>0&&<div style={WC}>
            <h3 style={{margin:"0 0 10px",fontSize:14}}>📅 Task History</h3>
            <div style={{maxHeight:160,overflowY:"auto"}}>
              {Object.entries(taskLog).reverse().map(([date,log])=>(
                <div key={date} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <span style={{fontSize:12,color:"#64748b"}}>{date}</span>
                  <span style={{fontSize:12,fontWeight:700,color:"#16a34a"}}>+{log.reward} USDT ✅</span>
                </div>
              ))}
            </div>
            <div style={{marginTop:10,background:"#eff6ff",borderRadius:10,padding:10}}>
              <p style={{margin:0,color:"#1e56db",fontSize:11,fontWeight:600}}>💡 Next task fee: <strong>${(completedTasks+(taskDone?1:0))*10} USDT</strong></p>
            </div>
          </div>}
        </div>
        );
      })()}

      {/* TEAM */}
      {tab==="Team"&&(()=>{
        const refLink=`https://wizhub.it.com/#/register?ref=${user.code}`;
        const l1=user.referrals?.filter(r=>r.level===1)||[];
        const l2=user.referrals?.filter(r=>r.level===2)||[];
        const l3=user.referrals?.filter(r=>r.level===3)||[];
        const l1valid=l1.filter(r=>r.plan).length;
        const l2valid=l2.filter(r=>r.plan).length;
        const l3valid=l3.filter(r=>r.plan).length;
        const l1income=l1.reduce((s,r)=>s+(r.reward||0),0).toFixed(4);
        const l2income=l2.reduce((s,r)=>s+(r.reward||0),0).toFixed(4);
        const l3income=l3.reduce((s,r)=>s+(r.reward||0),0).toFixed(4);
        const totalRecharge=user.referrals?.reduce((s,r)=>s+(r.plan?parseFloat(r.plan.replace(/[^0-9]/g,"")||0):0),0)||0;
        const shareMsg=encodeURIComponent(`💎Welcome to join the WIZhub TEAM\n💎Join WIZhub as a spot trader\n💎Link: ${refLink}\n💎💎💎💎💎💎💎💎💎💎💎💎\nInvite your friends and enjoy team benefits!\n💎Level 1 recharges → 16% USDT bonus\n💎Level 2 recharges → 3% USDT bonus\n💎Level 3 recharges → 1% USDT bonus\n\nMy invitation code: ${user.code}`);
        return(
        <div style={{padding:14}}>
          {/* Invitation Code Card */}
          <div style={{background:"#1e40af",borderRadius:16,padding:16,marginBottom:12}}>
            <p style={{margin:"0 0 6px",color:"rgba(255,255,255,0.7)",fontSize:12}}>Invitation code:</p>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{fontSize:28,fontWeight:900,letterSpacing:4,color:"#fff"}}>{user.code}</span>
              <button onClick={()=>navigator.clipboard.writeText(user.code)} style={{background:"#fff",color:"#1e40af",border:"none",borderRadius:20,padding:"5px 16px",fontWeight:700,fontSize:13,cursor:"pointer"}}>Copy</button>
            </div>
            <p style={{margin:"0 0 6px",color:"rgba(255,255,255,0.7)",fontSize:12}}>Share your referral link and start earning</p>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
              <span style={{fontSize:11,color:"rgba(255,255,255,0.8)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"monospace"}}>{refLink}</span>
              <button onClick={()=>navigator.clipboard.writeText(refLink)} style={{background:"#fff",color:"#1e40af",border:"none",borderRadius:20,padding:"5px 14px",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>Copy</button>
            </div>
            {/* Social Share Buttons */}
            <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
              {[
                {icon:"𝕏",bg:"#000",action:()=>window.open(`https://twitter.com/intent/tweet?text=${shareMsg}`,"_blank")},
                {icon:"f",bg:"#1877f2",action:()=>window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(refLink)}`,"_blank")},
                {icon:"✈",bg:"#2ca5e0",action:()=>window.open(`https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${shareMsg}`,"_blank")},
                {icon:"in",bg:"#0077b5",action:()=>window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(refLink)}`,"_blank")},
                {icon:"📞",bg:"#25d366",action:()=>window.open(`https://wa.me/?text=${shareMsg}`,"_blank")},
                {icon:"📸",bg:"linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",action:()=>{}},
                {icon:"🎵",bg:"#000",action:()=>{}},
              ].map((s,i)=>(
                <button key={i} onClick={s.action} style={{width:42,height:42,borderRadius:"50%",background:s.bg,color:"#fff",border:"none",cursor:"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{s.icon}</button>
              ))}
            </div>
          </div>

          {/* Team Stats */}
          <div style={{background:"rgba(255,255,255,0.08)",borderRadius:16,padding:16,marginBottom:12,border:"1px solid rgba(255,255,255,0.12)"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
              {[{l:"Team size",v:user.referrals?.length||0},{l:"Team recharge",v:`$${totalRecharge.toFixed(2)}`},{l:"Team Withdrawal",v:"$0.00"}].map((s,i)=>(
                <div key={i} style={{textAlign:"center"}}>
                  <p style={{margin:0,fontWeight:700,fontSize:16,color:"#fff"}}>{s.v}</p>
                  <p style={{margin:0,fontSize:10,color:"rgba(255,255,255,0.6)"}}>{s.l}</p>
                </div>
              ))}
            </div>
            <div style={{height:1,background:"rgba(255,255,255,0.1)",marginBottom:12}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[{l:"New team",v:user.referrals?.length||0},{l:"First time recharge",v:l1valid+l2valid+l3valid},{l:"First withdrawal",v:0}].map((s,i)=>(
                <div key={i} style={{textAlign:"center"}}>
                  <p style={{margin:0,fontWeight:700,fontSize:16,color:"#fff"}}>{s.v}</p>
                  <p style={{margin:0,fontSize:10,color:"rgba(255,255,255,0.6)"}}>{s.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Level Cards */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
            {[
              {level:"LEVEL 1",reg:l1.length,valid:l1valid,pct:"16%",income:l1income,bg:"linear-gradient(160deg,#4f46e5,#7c3aed,#db2777)"},
              {level:"LEVEL 2",reg:l2.length,valid:l2valid,pct:"3%",income:l2income,bg:"linear-gradient(160deg,#0891b2,#06b6d4,#8b5cf6)"},
              {level:"LEVEL 3",reg:l3.length,valid:l3valid,pct:"1%",income:l3income,bg:"linear-gradient(160deg,#059669,#10b981,#0891b2)"},
            ].map((lv,i)=>(
              <div key={i} style={{background:lv.bg,borderRadius:14,padding:12,textAlign:"center"}}>
                <p style={{margin:"0 0 2px",color:"rgba(255,255,255,0.7)",fontSize:9}}>Register/Valid</p>
                <p style={{margin:"0 0 8px",color:"#fff",fontWeight:900,fontSize:16}}>{lv.reg}/{lv.valid}</p>
                <p style={{margin:"0 0 2px",color:"rgba(255,255,255,0.7)",fontSize:9}}>Commission Percentage</p>
                <p style={{margin:"0 0 8px",color:"#fff",fontWeight:900,fontSize:18}}>{lv.pct}</p>
                <p style={{margin:"0 0 2px",color:"rgba(255,255,255,0.7)",fontSize:9}}>Total Income</p>
                <p style={{margin:"0 0 10px",color:"#fff",fontWeight:900,fontSize:14}}>{lv.income}</p>
                <p style={{margin:0,color:"#fff",fontWeight:700,fontSize:12,textAlign:"center"}}>{lv.level}</p>
                <button style={{marginTop:6,background:"rgba(0,0,0,0.3)",color:"#fff",border:"none",borderRadius:20,padding:"4px 0",width:"100%",fontSize:11,fontWeight:700,cursor:"pointer"}}>Details</button>
              </div>
            ))}
          </div>

          {/* Team Members List */}
          {user.referrals?.length>0&&(
            <div style={{background:"#fff",borderRadius:16,padding:14,color:"#1e293b"}}>
              <h3 style={{margin:"0 0 10px",fontSize:14}}>👥 Team Members ({user.referrals.length})</h3>
              {user.referrals.map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:30,height:30,borderRadius:"50%",background:"#1e56db",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:12}}>{r.name?.charAt(0).toUpperCase()}</div>
                    <div><p style={{margin:0,fontWeight:600,fontSize:13}}>{r.name}</p><p style={{margin:0,fontSize:11,color:"#94a3b8"}}>Lv{r.level||1} · {r.plan?`Unlocked ${r.plan}`:"No plan yet"}</p></div>
                  </div>
                  <span style={{color:r.reward>0?"#16a34a":"#94a3b8",fontWeight:700,fontSize:13}}>{r.reward>0?`+${r.reward} USDT`:"Pending"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        );
      })()}

      {/* VIP */}
      {tab==="VIP"&&(()=>{
        const activatedAt=user?.activatedAt||null;
        const activatedEnd=activatedAt?new Date(new Date(activatedAt).getTime()+365*24*60*60*1000).toLocaleString():null;
        const vipColors=["#f59e0b","#64748b","#b45309","#0ea5e9","#8b5cf6","#f7931a","#e11d48","#0d9488","#7c3aed"];
        return(
        <div style={{padding:14,paddingBottom:80}}>
          {/* Header */}
          <div style={{background:"linear-gradient(135deg,#1e3a6e,#2d5a9e)",borderRadius:16,padding:16,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <p style={{margin:0,color:"rgba(255,255,255,0.7)",fontSize:12}}>WIZhub</p>
              {activePlan?<p style={{margin:0,color:"#fbbf24",fontWeight:700,fontSize:14}}>✅ {activePlan.name} Active</p>:<p style={{margin:0,color:"#fff",fontWeight:700,fontSize:14}}>Open VIP</p>}
            </div>
            <div style={{width:50,height:50,borderRadius:"50%",background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>💎</div>
          </div>

          <p style={{margin:"0 0 10px",color:"#fff",fontWeight:700,fontSize:14}}>Open VIP</p>

          {VIP_PLANS.map((vip,i)=>{
            const isActive=activePlan?.name===vip.name;
            const isExpanded=expanded===i;
            return(
              <div key={i} style={{background:"#1e293b",borderRadius:16,marginBottom:10,overflow:"hidden",border:isActive?"2px solid #fbbf24":"2px solid transparent"}}>
                {/* Card Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",cursor:"pointer"}} onClick={()=>setExpanded(isExpanded?-1:i)}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:44,height:44,borderRadius:12,background:vipColors[i],display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:"#fff",boxShadow:`0 4px 12px ${vipColors[i]}66`}}>
                      {i+1}
                    </div>
                    <div>
                      <p style={{margin:0,color:"#fff",fontWeight:700,fontSize:15}}>{vip.name}</p>
                      <p style={{margin:0,color:"rgba(255,255,255,0.5)",fontSize:12}}>${vip.amount} / {vip.days}Day</p>
                    </div>
                  </div>
                  {isActive?(
                    <span style={{background:"#fbbf24",color:"#000",padding:"6px 16px",borderRadius:20,fontWeight:700,fontSize:13}}>Active ✅</span>
                  ):(
                    <button onClick={(e)=>{e.stopPropagation();setSelectedPlan(vip);}} style={{background:"#f59e0b",color:"#fff",border:"none",padding:"8px 18px",borderRadius:20,fontWeight:700,fontSize:13,cursor:"pointer"}}>Buy</button>
                  )}
                </div>

                {/* Expandable Benefits */}
                {isExpanded&&(
                  <div style={{background:"rgba(255,255,255,0.05)",margin:"0 12px 14px",borderRadius:12,padding:14}}>
                    <p style={{margin:"0 0 10px",color:"#fff",fontWeight:700,fontSize:13}}>{vip.name} Membership Benefits (1 Year):</p>

                    <p style={{margin:"0 0 6px",color:"#4ade80",fontWeight:600,fontSize:12}}>✅ Daily Earnings:</p>
                    <p style={{margin:"0 0 10px",color:"rgba(255,255,255,0.8)",fontSize:12}}>Complete {vip.tasks} VIP tasks/day → Earn {vip.daily} USDT daily (≈{vip.total} USDT/year)</p>

                    <p style={{margin:"0 0 6px",color:"#f87171",fontWeight:600,fontSize:12}}>🚀 Referral Rewards and Interest Rebates:</p>
                    <p style={{margin:"2px 0",color:"rgba(255,255,255,0.8)",fontSize:12}}>Level 1: {vip.l1} commission</p>
                    <p style={{margin:"2px 0",color:"rgba(255,255,255,0.8)",fontSize:12}}>Level 2: {vip.l2} commission</p>
                    <p style={{margin:"2px 0 10px",color:"rgba(255,255,255,0.8)",fontSize:12}}>Level 3: {vip.l3} commission</p>

                    <p style={{margin:"0 0 6px",color:"#fbbf24",fontWeight:600,fontSize:12}}>🎁 Exclusive Perks:</p>
                    <p style={{margin:"2px 0",color:"rgba(255,255,255,0.8)",fontSize:12}}>• {vip.tasks*10} free games</p>
                    <p style={{margin:"2px 0",color:"rgba(255,255,255,0.8)",fontSize:12}}>• Farming boost ×{i+2}</p>
                    <p style={{margin:"2px 0",color:"rgba(255,255,255,0.8)",fontSize:12}}>• 24/7 VIP customer support (1-on-1)</p>
                    <p style={{margin:"2px 0 10px",color:"rgba(255,255,255,0.8)",fontSize:12}}>• Upgrading to {vip.name} will refund the previous VIP purchase amount</p>

                    {isActive&&activatedAt&&(
                      <div style={{background:"rgba(34,197,94,0.15)",borderRadius:10,padding:"8px 12px",marginTop:8}}>
                        <p style={{margin:0,fontSize:11,color:"#4ade80"}}>Effective time: {new Date(activatedAt).toLocaleString()} - {activatedEnd}</p>
                      </div>
                    )}

                    {!isActive&&(
                      <button onClick={()=>setSelectedPlan(vip)} style={{width:"100%",marginTop:10,background:"linear-gradient(135deg,#f59e0b,#f7931a)",color:"#fff",border:"none",borderRadius:12,padding:"12px 0",fontWeight:700,fontSize:14,cursor:"pointer"}}>
                        Buy {vip.name} — {vip.price}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        );
      })()}

      {/* ME */}
      {tab==="Me"&&(
        <div style={{padding:14}}>
          {/* Profile Card */}
          <div style={{background:"linear-gradient(135deg,#1e3a6e,#2d5a9e)",borderRadius:16,padding:20,marginBottom:14,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",right:-20,top:-20,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
            <div style={{position:"absolute",right:10,bottom:-30,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <p style={{margin:0,color:"rgba(255,255,255,0.8)",fontSize:14,fontWeight:500}}>hello, {user.email}</p>
              </div>
              {activePlan&&<span style={{background:"#f7931a",color:"#fff",padding:"3px 12px",borderRadius:20,fontSize:12,fontWeight:700}}>{activePlan.name}</span>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div>
                <p style={{margin:0,color:"rgba(255,255,255,0.6)",fontSize:12}}>Total balance (USDT)</p>
                <p style={{margin:"4px 0 0",color:"#fff",fontWeight:900,fontSize:28}}>{(user.balance||0).toFixed(2)}</p>
              </div>
              <div>
                <p style={{margin:0,color:"rgba(255,255,255,0.6)",fontSize:12}}>Recharge amount (USDT)</p>
                <p style={{margin:"4px 0 0",color:"#fff",fontWeight:900,fontSize:28}}>{activePlan?.amount||"0.00"}</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            {[
              {icon:"💰",label:"Recharge",action:()=>setSelectedPlan(VIP_PLANS[0])},
              {icon:"📤",label:"Withdraw",action:()=>{
                const msg=encodeURIComponent(`Hello WIZhub Support! 👋\nI want to withdraw my earnings.\nName: ${user.name}\nEmail: ${user.email}\nBalance: ${(user.balance||0).toFixed(2)} USDT\nWallet address: [paste your wallet here]`);
                window.open(`https://t.me/${TELEGRAM}?text=${msg}`,"_blank");
              }},
              {icon:"👤",label:"Account",action:()=>{}},
              {icon:"📊",label:"Financial records",action:()=>{}},
            ].map((b,i)=>(
              <button key={i} onClick={b.action} style={{background:"#e8f4ff",borderRadius:14,padding:"16px 10px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",border:"none",color:"#1e293b"}}>
                <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#1e56db,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{b.icon}</div>
                <span style={{fontWeight:600,fontSize:13,textAlign:"left"}}>{b.label}</span>
              </button>
            ))}
          </div>

          {/* Menu Items */}
          <div style={{background:"#e8f4ff",borderRadius:16,overflow:"hidden",marginBottom:10}}>
            {[
              {icon:"🔒",label:"Change Password",action:async()=>{const np=prompt("Enter new password (min 6 chars):");if(!np||np.length<6){alert("Too short!");return;}try{await updatePassword(auth.currentUser,np);alert("Password changed!");}catch(e){alert("Log out and back in first.\n"+e.message);}}},
              {icon:"🚪",label:"Sign out",action:handleLogout,red:true},
            ].map((item,i)=>(
              <button key={i} onClick={item.action} style={{width:"100%",background:"none",border:"none",borderBottom:i===0?"1px solid rgba(30,86,219,0.1)":"none",padding:"16px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",color:item.red?"#dc2626":"#1e293b"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:38,height:38,borderRadius:10,background:item.red?"rgba(220,38,38,0.1)":"rgba(30,86,219,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{item.icon}</div>
                  <span style={{fontWeight:600,fontSize:14}}>{item.label}</span>
                </div>
                <span style={{fontSize:18,opacity:0.4}}>›</span>
              </button>
            ))}
          </div>

          {/* Stats */}
          <div style={{background:"#e8f4ff",borderRadius:16,padding:16,marginBottom:10}}>
            <h3 style={{margin:"0 0 12px",color:"#1e293b",fontSize:14}}>📊 Account Stats</h3>
            {[
              ["Active Plan",activePlan?`${activePlan.name} (${activePlan.rate})`:"None"],
              ["Today's Task",taskDone?"✅ Done":"⏳ Pending"],
              ["Total Earned",`${(user.totalEarned||0).toFixed(2)} USDT`],
              ["Team Bonus",`${(user.refEarnings||0).toFixed(2)} USDT`],
              ["Team Size",`${user.referrals?.length||0} members`],
              ["My Code",user.code],
              ["Tasks Done",`${Object.keys(taskLog).length} days`],
            ].map(([k,v],i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<6?"1px solid rgba(30,86,219,0.08)":"none"}}>
                <span style={{color:"#64748b",fontSize:13}}>{k}</span>
                <span style={{color:"#1e293b",fontWeight:600,fontSize:13}}>{v}</span>
              </div>
            ))}
          </div>

          <button onClick={()=>window.open(`https://t.me/${TELEGRAM}`,"_blank")} style={{width:"100%",background:"linear-gradient(135deg,#1e56db,#2563eb)",color:"#fff",border:"none",borderRadius:12,padding:"13px 0",fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:"0 4px 15px rgba(30,86,219,0.3)"}}>✈️ Contact Support on Telegram</button>
        </div>
      )}

      {/* Announcement Popup */}
      {showAnnouncement&&tab==="Home"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
          <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:420,maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            <div style={{padding:"16px 20px 0"}}>
              <h2 style={{margin:0,color:"#1e293b",fontSize:18,textAlign:"center",fontWeight:700}}>Announcement</h2>
              <div style={{height:3,background:"linear-gradient(90deg,#1e56db,#2563eb)",borderRadius:2,marginTop:10}}/>
            </div>
            <div style={{padding:"14px 20px",overflowY:"auto",flex:1,fontSize:13,color:"#1e293b",lineHeight:1.7}}>
              <p style={{margin:"0 0 10px"}}>📢 Welcome to <strong>WIZhub</strong> — Smart Crypto Investment Platform!</p>
              <p style={{margin:"0 0 10px"}}>💰 Complete your daily task to earn order commission on the same day.</p>
              <p style={{margin:"0 0 10px"}}>📢 If you need to upgrade your VIP level, just add the VIP level difference to unlock the next VIP level and reset the number of earnings for the day!</p>
              <div style={{background:"#f8fafc",borderRadius:12,padding:12,marginBottom:10}}>
                {[
                  {v:"VIP-1",d:"10 USDT",i:"2.90 USDT"},
                  {v:"VIP-2",d:"50 USDT",i:"15.50 USDT"},
                  {v:"VIP-3",d:"200 USDT",i:"66.00 USDT"},
                  {v:"VIP-4",d:"700 USDT",i:"245.00 USDT"},
                  {v:"VIP-5",d:"1,500 USDT",i:"555.00 USDT"},
                  {v:"VIP-6",d:"5,000 USDT",i:"2,250.00 USDT"},
                  {v:"VIP-7",d:"10,000 USDT",i:"4,450.00 USDT"},
                  {v:"VIP-8",d:"20,000 USDT",i:"13,600.00 USDT"},
                  {v:"VIP-9",d:"40,000 USDT",i:"40,000.00 USDT"},
                ].map((p,i)=>(
                  <p key={i} style={{margin:"3px 0",fontSize:12}}>💵 Unlock <strong>{p.v}</strong> [{p.d}] Daily income [<span style={{color:"#16a34a",fontWeight:700}}>{p.i}</span>]</p>
                ))}
              </div>
              <p style={{margin:"0 0 6px",fontSize:12,color:"#64748b"}}>💎 Referral Commission:</p>
              <p style={{margin:"2px 0",fontSize:12}}>• Level 1 team recharges → <strong style={{color:"#1e56db"}}>16% bonus</strong></p>
              <p style={{margin:"2px 0",fontSize:12}}>• Level 2 team recharges → <strong style={{color:"#1e56db"}}>3% bonus</strong></p>
              <p style={{margin:"2px 0 10px",fontSize:12}}>• Level 3 team recharges → <strong style={{color:"#1e56db"}}>1% bonus</strong></p>
              <p style={{margin:0,color:"#94a3b8",fontSize:11}}>─────────────────────────────</p>
            </div>
            <div style={{padding:"12px 20px 16px",borderTop:"1px solid #f1f5f9"}}>
              <button onClick={()=>setShowAnnouncement(false)} style={{width:"100%",background:"linear-gradient(135deg,#1e56db,#2563eb)",color:"#fff",border:"none",borderRadius:12,padding:"13px 0",fontWeight:700,fontSize:15,cursor:"pointer"}}>I know</button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,width:"100%",maxWidth:500,background:"rgba(255,255,255,0.97)",backdropFilter:"blur(10px)",display:"flex",justifyContent:"space-around",padding:"8px 0 10px",borderTop:"1px solid #e2e8f0",zIndex:50}}>
        {[{icon:"🏠",label:"Home"},{icon:"📋",label:"Task"},{icon:"👥",label:"Team"},{icon:"💎",label:"VIP"},{icon:"👤",label:"Me"}].map(t=>(
          <button key={t.label} onClick={()=>setTab(t.label)} style={NAV(tab===t.label)}>
            <span style={{fontSize:20}}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Payment Modal */}
      {selectedPlan&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",color:"#1e293b"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h3 style={{margin:0,color:"#1e56db",fontSize:17}}>💎 Unlock {selectedPlan.name}</h3>
              <button onClick={()=>setSelectedPlan(null)} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#94a3b8"}}>✕</button>
            </div>

            {/* Payment Method */}
            <p style={{margin:"0 0 8px",fontSize:12,color:"#64748b",fontWeight:600}}>Select Payment Method:</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {[{id:"USDT",label:"💵 USDT (BEP-20)"},{id:"BTC",label:"₿ Bitcoin (BTC)"}].map(m=>(
                <button key={m.id} onClick={()=>setPayMethod(m.id)} style={{padding:"10px 0",borderRadius:12,border:`2px solid ${payMethod===m.id?"#1e56db":"#e2e8f0"}`,background:payMethod===m.id?"#eff6ff":"#fff",color:payMethod===m.id?"#1e56db":"#64748b",fontWeight:700,fontSize:12,cursor:"pointer"}}>{m.label}</button>
              ))}
            </div>

            <div style={{background:"linear-gradient(135deg,#eff6ff,#dbeafe)",borderRadius:14,padding:16,textAlign:"center",marginBottom:12}}>
              <p style={{margin:0,color:"#64748b",fontSize:12}}>Amount to Send</p>
              <p style={{margin:"4px 0",fontSize:32,fontWeight:900,color:"#1e56db"}}>{selectedPlan.price}</p>
              <p style={{margin:0,color:"#94a3b8",fontSize:11}}>via {payMethod==="BTC"?"Bitcoin (BTC)":"USDT BEP-20 / ERC-20"}</p>
            </div>

            <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:12,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#92400e",fontWeight:600}}>
              ⚠️ {payMethod==="BTC"?"Send only BTC to the Bitcoin address below.":"Send only USDT on BEP-20 or ERC-20 network."}
            </div>

            <div style={{marginBottom:12}}>
              <p style={{margin:"0 0 6px",fontSize:12,color:"#64748b",fontWeight:600}}>{payMethod==="BTC"?"Bitcoin":"USDT"} Wallet Address</p>
              <div style={{background:"#f8fafc",borderRadius:12,padding:"10px 12px",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:"#475569",flex:1,fontFamily:"monospace",wordBreak:"break-all"}}>{walletAddr}</span>
                <button onClick={handleCopy} style={{background:"#1e56db",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{copied?"✅":"Copy"}</button>
              </div>
            </div>

            <div style={{background:"#f8fafc",borderRadius:12,padding:"12px 14px",marginBottom:14,fontSize:13,color:"#475569",lineHeight:2}}>
              <p style={{margin:"0 0 2px",fontWeight:700,color:"#1e293b"}}>📌 Steps:</p>
              <p style={{margin:0}}>1️⃣ Copy wallet address above</p>
              <p style={{margin:0}}>2️⃣ Send exactly {selectedPlan.price}</p>
              <p style={{margin:0}}>3️⃣ Copy your Transaction ID (TxID)</p>
              <p style={{margin:0}}>4️⃣ Send proof on Telegram below</p>
            </div>
            <button onClick={handleTelegram} style={{width:"100%",background:"linear-gradient(135deg,#1e56db,#2563eb)",color:"#fff",border:"none",borderRadius:14,padding:"14px 0",fontWeight:700,fontSize:15,cursor:"pointer",boxShadow:"0 4px 20px rgba(30,86,219,0.4)"}}>✈️ Send Payment Proof on Telegram</button>
            <p style={{textAlign:"center",fontSize:11,color:"#94a3b8",marginTop:10,marginBottom:0}}>✅ Activated within 5–30 minutes after confirmation.</p>
          </div>
        </div>
      )}
      <style>{`@keyframes scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
    </div>
  );
}
