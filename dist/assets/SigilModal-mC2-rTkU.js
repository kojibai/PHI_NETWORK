import{B as e,Er as t,Mr as n,O as r,Tr as i,Zn as a,_r as o,ar as s,b as c,er as l,fr as u,lr as d,m as f,mr as p,or as m,pr as ee,rr as h,sr as te,un as ne,ut as g,vr as _,y as re}from"./index-DFup8ZOD.js";import{t as ie}from"./html2canvas-mScELL70.js";import{t as ae}from"./SealMomentModal-DW_-k1lz.js";var v=n(t(),1),y=n(g(),1),b=e=>Math.max(0,Math.min(100,e));function x(e,t){let n=(e??``).toLowerCase().trim();return/(reflekt|reflect|reflektion|reflection)/i.test(n)?`#22c55e`:/(purify|purification|purifikation)/i.test(n)?`#3b82f6`:/dream/i.test(n)?`#7c3aed`:/(ignite|ignition)/i.test(n)?`#ff3b30`:/(integrate|integration)/i.test(n)?`#ff8a00`:/(solar\s*plexus)/i.test(n)?`#ffd600`:t}var oe=({dateISO:e,onDateChange:t,secondsLeft:n,eternalPercent:r,eternalColor:i=`#8beaff`,eternalArkLabel:a=`Eternal Ark`})=>{let o=(0,v.useMemo)(()=>b(r),[r]),s=(0,v.useMemo)(()=>x(a,i),[a,i]),c={"--eternal-bar":s,"--pulse":`var(--kai-pulse, var(--pulse-dur, 5236ms))`},l=(0,v.useMemo)(()=>({"--fill":(o/100).toFixed(6)}),[o]),u=(0,v.useRef)(null),d=(0,v.useRef)(void 0),f=(0,v.useRef)(null),p=(0,v.useRef)(null);return(0,v.useEffect)(()=>()=>{f.current!==null&&window.clearTimeout(f.current),p.current!==null&&window.cancelAnimationFrame(p.current),u.current&&u.current.classList.remove(`is-boom`),f.current=null,p.current=null},[]),(0,v.useEffect)(()=>{let e=typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches;if(typeof n!=`number`||e){d.current=n;return}let t=u.current,r=d.current;t&&typeof r==`number`&&n-r>1.2&&(t.classList.remove(`is-boom`),p.current!==null&&window.cancelAnimationFrame(p.current),p.current=window.requestAnimationFrame(()=>{t.classList.add(`is-boom`)}),f.current!==null&&window.clearTimeout(f.current),f.current=window.setTimeout(()=>{t.classList.remove(`is-boom`),f.current=null},420)),d.current=n},[n]),(0,y.jsxs)(`div`,{className:`sigil-scope`,style:c,children:[(0,y.jsx)(`h3`,{className:`sigil-title`,children:`Kairos Sigil-Glyph Inhaler`}),(0,y.jsx)(`div`,{className:`sigil-ribbon`,"aria-hidden":`true`}),(0,y.jsx)(`div`,{className:`input-row sigil-row`,children:(0,y.jsxs)(`label`,{className:`sigil-label`,children:[(0,y.jsx)(`span`,{className:`sigil-label__text`,children:`Select moment:`}),`\xA0`,(0,y.jsx)(`input`,{className:`sigil-input`,type:`datetime-local`,value:e,onChange:t})]})}),(0,y.jsx)(`div`,{className:`sigil-bars`,role:`group`,"aria-label":`Day progress`,children:(0,y.jsxs)(`div`,{className:`sigil-bar`,children:[(0,y.jsxs)(`div`,{className:`sigil-bar__head`,children:[(0,y.jsxs)(`span`,{className:`sigil-bar__label`,children:[`Unfoldment`,a?` — ${a}`:``]}),(0,y.jsxs)(`span`,{className:`sigil-bar__pct`,"aria-hidden":`true`,children:[o.toFixed(2),`%`]})]}),(0,y.jsx)(`div`,{className:`sigil-bar__track`,"aria-valuemin":0,"aria-valuemax":100,"aria-valuenow":+o.toFixed(2),role:`progressbar`,"aria-label":`Eternal day ${a||``}`,children:(0,y.jsx)(`div`,{ref:u,className:`sigil-bar__fill sigil-bar__fill--eternal`,style:l})})]})}),(0,y.jsx)(`style`,{children:`
        .sigil-ribbon {
          height: 1px;
          margin: .35rem 0 .85rem 0;
          background: linear-gradient(90deg, rgba(255,255,255,.00), rgba(255,255,255,.22), rgba(255,255,255,.00));
          background-size: 200% 100%;
          animation: sigilRibbonBreath var(--pulse) ease-in-out infinite;
          animation-delay: var(--pulse-offset, 0ms);
          filter: drop-shadow(0 0 8px rgba(139,234,255,.12));
        }

        .sigil-bars { display: grid; gap: .6rem; margin-top: .65rem; }

        .sigil-bar__head {
          display: flex; align-items: baseline; justify-content: space-between;
          margin-bottom: .28rem;
        }
        .sigil-bar__label { font-size: .86rem; letter-spacing: .01em; color: rgba(255,255,255,.88); }
        .sigil-bar__pct   { font-size: .82rem; color: rgba(255,255,255,.66); font-variant-numeric: tabular-nums; }

        .sigil-bar__track {
          position: relative; height: 12px; border-radius: 999px;
          background: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
          border: 1px solid rgba(139,234,255,.22);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.03), 0 6px 16px -8px rgba(0,0,0,.45);
          overflow: hidden;
        }

        .sigil-bar__fill {
          position: absolute; inset: 0 auto 0 0; width: 100%;
          transform-origin: left center;
          transform: scaleX(var(--fill, 0));
          transition: transform .45s cubic-bezier(.22,.61,.36,1);
          will-change: transform, filter;
        }

        .sigil-bar__fill--eternal {
          background:
            radial-gradient(120% 100% at 0% 50%, rgba(255,255,255,.18), transparent 60%) padding-box,
            linear-gradient(90deg,
              color-mix(in oklab, var(--eternal-bar, #8beaff) 92%, white 0%),
              var(--eternal-bar, #8beaff)) border-box;
          filter: drop-shadow(0 0 14px color-mix(in oklab, var(--eternal-bar, #8beaff) 55%, transparent 45%))
                  drop-shadow(0 0 22px color-mix(in oklab, var(--eternal-bar, #8beaff) 35%, transparent 65%));
          animation: barGlow var(--pulse) ease-in-out infinite;
          animation-delay: var(--pulse-offset, 0ms);
        }

        .sigil-bar__fill--eternal::after {
          content: "";
          position: absolute;
          right: -6px;
          top: 50%;
          translate: 0 -50%;
          width: 12px; height: 12px;
          border-radius: 50%;
          background:
            radial-gradient(closest-side, var(--eternal-bar, #8beaff), rgba(255,255,255,.85), transparent 75%);
          filter:
            drop-shadow(0 0 10px color-mix(in oklab, var(--eternal-bar, #8beaff) 85%, transparent 15%))
            drop-shadow(0 0 16px color-mix(in oklab, var(--eternal-bar, #8beaff) 60%, transparent 40%));
          opacity: .95;
          pointer-events: none;
        }

        .sigil-bar__fill--eternal.is-boom {
          animation: barGlow var(--pulse) ease-in-out infinite, explodeFlash 420ms cubic-bezier(.18,.6,.2,1) 1;
          animation-delay: var(--pulse-offset, 0ms), 0ms;
          filter:
            drop-shadow(0 0 22px color-mix(in oklab, var(--eternal-bar, #8beaff) 85%, transparent 15%))
            drop-shadow(0 0 36px color-mix(in oklab, var(--eternal-bar, #8beaff) 65%, transparent 35%));
        }

        .sigil-bar__fill--eternal.is-boom::before {
          content: "";
          position: absolute;
          right: -8px;
          top: 50%;
          translate: 0 -50%;
          width: 10px; height: 10px;
          border-radius: 999px;
          background: radial-gradient(closest-side, white, var(--eternal-bar, #8beaff) 60%, transparent 70%);
          opacity: .95;
          pointer-events: none;
          animation: sparkBurst 420ms cubic-bezier(.18,.6,.2,1) 1;
        }

        @keyframes barGlow {
          0%   { filter: drop-shadow(0 0 10px color-mix(in oklab, var(--eternal-bar, #8beaff) 45%, transparent))
                          drop-shadow(0 0 18px color-mix(in oklab, var(--eternal-bar, #8beaff) 25%, transparent)); }
          50%  { filter: drop-shadow(0 0 18px color-mix(in oklab, var(--eternal-bar, #8beaff) 70%, transparent))
                          drop-shadow(0 0 28px color-mix(in oklab, var(--eternal-bar, #8beaff) 40%, transparent)); }
          100% { filter: drop-shadow(0 0 10px color-mix(in oklab, var(--eternal-bar, #8beaff) 45%, transparent))
                          drop-shadow(0 0 18px color-mix(in oklab, var(--eternal-bar, #8beaff) 25%, transparent)); }
        }

        @keyframes explodeFlash {
          0%   { box-shadow: inset 0 0 0 0 rgba(255,255,255,0); transform: scaleX(var(--fill)) scaleY(1); }
          14%  { box-shadow: inset 0 0 0 2px rgba(255,255,255,.25); transform: scaleX(var(--fill)) scaleY(1.18); }
          28%  { box-shadow: inset 0 0 0 0 rgba(255,255,255,0); transform: scaleX(var(--fill)) scaleY(1.06); }
          100% { box-shadow: inset 0 0 0 0 rgba(255,255,255,0); transform: scaleX(var(--fill)) scaleY(1); }
        }

        @keyframes sparkBurst {
          0%   { opacity: .98; transform: scale(1);   filter: blur(0);   }
          40%  { opacity: .85; transform: scale(2.6); filter: blur(.5px);}
          100% { opacity: 0;   transform: scale(4.2); filter: blur(1px); }
        }

        @keyframes sigilRibbonBreath {
          0% { background-position: 0% 0%; opacity: .8; }
          50% { background-position: 100% 0%; opacity: 1; }
          100% { background-position: 0% 0%; opacity: .8; }
        }

        @media (prefers-reduced-motion: reduce) {
          .sigil-bar__fill--eternal,
          .sigil-ribbon { animation: none !important; }
          .sigil-bar__fill--eternal.is-boom,
          .sigil-bar__fill--eternal.is-boom::before { animation: none !important; }
          .sigil-bar__fill { transition: none !important; }
        }
      `})]})},se=n(i(),1),ce=n(ie(),1),le=n(e(),1),S=1000000n,C=BigInt(2**53-1),w=17491.270421,T=36,ue=11,E=1e6,D=Math.round(w/T*E),O=ue*E,de=e=>String(e).padStart(2,`0`),k=e=>e>C?2**53-1:e<-C?-(2**53-1):Number(e),fe=e=>e<0n?-e:e,A=(e,t)=>{if(t===0n)return 0n;let n=e%t;return n>=0n?n:n+t},j=(e,t)=>{let n=e/t;return e%t===0n||e>=0n?n:n-1n},M=e=>e<0n?0n:e,pe=(e,t)=>{let n=e<0n?-e:e,r=t<0n?-t:t;for(;r!==0n;){let e=n%r;n=r,r=e}return n},me=(()=>{let e=pe(h,S);return e===0n?0n:h/e})(),he=e=>e.trim().replace(/^(\d+):(\d+)/,(e,t,n)=>`${+t}:${String(n).padStart(2,`0`)}`).replace(/D\s*(\d+)/,(e,t)=>`D${+t}`),N=(e,t)=>`${e}:${de(t)}`,P=e=>e<=C?Number(e).toLocaleString():e.toString(),F=e=>{try{let t=d(e),n=c(new Date(k(t))),r=f[((n.solarAlignedWeekDayIndex??0)+6)%6];return{weekday:n.dayName??r,dayOfMonth:n.solarAlignedDayInMonth1??n.solarAlignedDayInMonth+1,monthIndex:n.solarAlignedMonth}}catch{return null}},ge=(e,t,n,r,i,a,o)=>{if(!e)return``;let s=e,c=F(t);return s=s.replace(/Kairos:\s*\d{1,2}:\d{1,2}/i,`Kairos:${N(n,r)}`),s=s.replace(/Eternal\s*Pulse:\s*[\d,]+/i,`Eternal Pulse:${P(t)}`),s=s.replace(/Step:\s*\d{1,2}\s*\/\s*44/i,`Step:${r}/44`),s=s.replace(/Beat:\s*\d{1,2}\s*\/\s*36(?:\([^)]+\))?/i,`Beat:${n}/36`),c&&(s=s.replace(/Solar Kairos \(UTC-aligned\):\s*\d{1,2}:\d{1,2}\s+\w+\s+D\d+\/M\d+/i,`Solar Kairos: ${N(i,a)} ${c.weekday} D${c.dayOfMonth}/M${c.monthIndex}`)),o&&(s=s.replace(/Y\d+/i,o)),s},_e=e=>{try{let t=d(e);return new Date(k(t)).toISOString()}catch{return``}},ve=e=>{let t=Number(A(e*S,h)),n=Math.min(T-1,Math.max(0,Math.floor(t/D))),r=t%D;return{beat:n,stepIndex:Math.min(43,Math.max(0,Math.floor(r/O))),stepPct:o(r%O/O)}};function ye(e){let t=e.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);if(!t)return null;let n=Number(t[1]),r=Number(t[2])-1,i=Number(t[3]),a=Number(t[4]),o=Number(t[5]),s=Number(t[6]??`0`),c=String(t[7]??`0`).padEnd(3,`0`),l=Number(c),u=new Date(n,r,i,a,o,s,l);return Number.isNaN(u.getTime())?null:u}function be(e,t){let n=Number.isFinite(t)?Math.max(1,Math.min(11,Math.floor(t))):1;try{let t=_(e.toISOString(),n),r=t?new Date(t):e;return Number.isNaN(r.getTime())?e:r}catch{return e}}var I=()=>typeof performance<`u`&&typeof performance.now==`function`?performance.timeOrigin+performance.now():Date.now(),xe=e=>typeof e==`object`&&!!e,L=(e,t)=>{let n=e[t];return typeof n==`string`?n:void 0},R=(e,t)=>{let n=e[t];return typeof n==`number`&&Number.isFinite(n)?n:void 0},z=(e,t)=>{let n=e[t];return xe(n)?n:void 0},Se=(e,t)=>{let n=e[t];if(typeof n==`string`)return Object.prototype.hasOwnProperty.call(l,n)?n:void 0},Ce=e=>typeof e==`number`&&Number.isFinite(e)?String(e):typeof e==`bigint`?e.toString():typeof e==`string`?e:``;function we(e,t){let n=(0,v.useCallback)(()=>{try{let e=d(j(t(),S)+1n)-BigInt(Math.floor(I())),n=k(e<0n?0n:e);return Math.max(0,Math.min(s,n))/1e3}catch{return s/1e3}},[t]),[r,i]=(0,v.useState)(()=>e?n():s/1e3),a=(0,v.useRef)(null),o=(0,v.useRef)(null);return(0,v.useEffect)(()=>{if(a.current!==null&&(cancelAnimationFrame(a.current),a.current=null),o.current!==null&&(window.clearInterval(o.current),o.current=null),!e)return;typeof document<`u`&&document.documentElement&&document.documentElement.style.setProperty(`--kai-pulse`,`${s}ms`);let t=()=>{i(n()),a.current=requestAnimationFrame(t)};i(n()),a.current=requestAnimationFrame(t);let r=()=>{document.visibilityState===`hidden`?(a.current!==null&&(cancelAnimationFrame(a.current),a.current=null),o.current===null&&(o.current=window.setInterval(()=>{i(n())},33))):(o.current!==null&&(window.clearInterval(o.current),o.current=null),a.current!==null&&(cancelAnimationFrame(a.current),a.current=null),i(n()),a.current=requestAnimationFrame(t))};return document.addEventListener(`visibilitychange`,r),()=>{document.removeEventListener(`visibilitychange`,r),a.current!==null&&cancelAnimationFrame(a.current),o.current!==null&&window.clearInterval(o.current),a.current=null,o.current=null}},[e,n]),e?r:null}var B=()=>{try{return globalThis.crypto?.subtle}catch{return}},Te=async e=>{let t=new TextEncoder().encode(e),n=B();if(n)try{let e=await n.digest(`SHA-256`,t);return Array.from(new Uint8Array(e)).map(e=>e.toString(16).padStart(2,`0`)).join(``)}catch{}let r=2166136261;for(let e=0;e<t.length;e++)r^=t[e]??0,r=Math.imul(r,16777619);return(r>>>0).toString(16).padStart(8,`0`)},V={"Ignition Ark":`#ff0024`,"Integration Ark":`#ff6f00`,"Harmonization Ark":`#ffd600`,"Reflection Ark":`#00c853`,"Purification Ark":`#00b0ff`,"Dream Ark":`#c186ff`,"Ignite Ark":`#ff0024`,"Integrate Ark":`#ff6f00`,"Harmonize Ark":`#ffd600`,"Reflekt Ark":`#00c853`,"Purifikation Ark":`#00b0ff`},Ee=e=>{if(!e)return`#ffd600`;let t=e.trim(),n=t.replace(/\s*ark$/i,` Ark`);return V[t]??V[n]??`#ffd600`},De=()=>(0,y.jsx)(`style`,{children:`
    .sigil-modal { position: relative; isolation: isolate; }

    .sigil-modal .close-btn {
      z-index: 99999 !important;
      pointer-events: auto;
      touch-action: manipulation;
    }
    .sigil-modal .close-btn svg { pointer-events: none; }

    .modal-bottom-spacer { height: clamp(96px, 14vh, 140px); }

    .mint-dock{
      position: sticky;
      bottom: max(10px, env(safe-area-inset-bottom));
      z-index: 6;

      display: grid;
      place-items: center;
      width: fit-content;
      max-width: 100%;
      margin: 0 auto;
      padding: 0;
      background: transparent;
      border: 0;
      box-shadow: none;

      contain: layout paint style;
      -webkit-transform: translateZ(0);
              transform: translateZ(0);
    }

    .mint-dock > *{
      width: auto;
      max-width: 100%;
      flex: 0 0 auto;
    }

    .mint-dock button,
    .mint-dock a{
      display: inline-flex;
    }
  `}),Oe=()=>(0,y.jsxs)(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":!0,className:`close-icon`,children:[(0,y.jsx)(`line`,{x1:`4`,y1:`4`,x2:`20`,y2:`20`,stroke:`currentColor`,strokeWidth:`2`}),(0,y.jsx)(`line`,{x1:`20`,y1:`4`,x2:`4`,y2:`20`,stroke:`currentColor`,strokeWidth:`2`}),(0,y.jsx)(`circle`,{cx:`12`,cy:`12`,r:`10`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.2`,opacity:`.25`})]}),ke=()=>(0,y.jsxs)(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`,children:[(0,y.jsx)(`circle`,{cx:`12`,cy:`12`,r:`9.5`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.4`}),(0,y.jsx)(`path`,{d:`M12 6v6l3.5 3.5`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.8`,strokeLinecap:`round`,strokeLinejoin:`round`}),(0,y.jsx)(`path`,{d:`M8.2 15.8l2.1-2.1`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.6`,strokeLinecap:`round`})]}),H=`http://www.w3.org/2000/svg`;function Ae(e){e.getAttribute(`xmlns`)||e.setAttribute(`xmlns`,H),e.getAttribute(`xmlns:xlink`)||e.setAttribute(`xmlns:xlink`,`http://www.w3.org/1999/xlink`)}function je(e){let t=e.ownerDocument||document,n=e.querySelector(`metadata`);if(n)return n;let r=t.createElementNS(H,`metadata`);return e.insertBefore(r,e.firstChild),r}function Me(e){let t=e.ownerDocument||document,n=e.querySelector(`desc`);if(n)return n;let r=t.createElementNS(H,`desc`),i=e.querySelector(`metadata`);return i&&i.nextSibling?e.insertBefore(r,i.nextSibling):e.insertBefore(r,e.firstChild),r}function Ne(e,t){Ae(e);let n=je(e);n.textContent=JSON.stringify(t);let r=Me(e);r.textContent=typeof t==`object`&&t?(()=>{let e=t,n=typeof e.pulse==`number`?e.pulse:void 0,r=typeof e.pulseExact==`string`?e.pulseExact:void 0,i=typeof e.beat==`number`?e.beat:void 0,a=typeof e.stepIndex==`number`?e.stepIndex:void 0,o=typeof e.chakraDay==`string`?e.chakraDay:void 0;return`KaiSigil — pulse:${r??n??`?`} beat:${i??`?`} step:${a??`?`} chakra:${o??`?`}`})():`KaiSigil — exported`;let i=new XMLSerializer().serializeToString(e);return i.startsWith(`<?xml`)?i:`<?xml version="1.0" encoding="UTF-8"?>\n${i}`}async function Pe(e){try{if(navigator.clipboard?.writeText)return await navigator.clipboard.writeText(e),!0}catch{}try{let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,`true`),t.style.position=`fixed`,t.style.left=`-9999px`,t.style.top=`0`,document.body.appendChild(t),t.select();let n=document.execCommand(`copy`);return document.body.removeChild(t),n}catch{return!1}}var Fe=e=>{e.catch(()=>{})},Ie=s/1e3,Le=Array.from({length:11},(e,t)=>{let n=(t*Ie).toFixed(3);return`Breath ${t+1} — ${n}s`}),Re=({onClose:e})=>{let t=(0,v.useMemo)(()=>u(),[]),n=(0,v.useRef)(0n),i=(0,v.useRef)(!1),a=(0,v.useRef)(0),c=(0,v.useCallback)(()=>{try{return p(new Date)}catch{return 0n}},[]),f=(0,v.useCallback)(()=>{let e=null;try{e=t.nowMicroPulses()}catch{e=null}if(typeof e==`bigint`)return e;if(typeof e==`number`&&Number.isFinite(e))return BigInt(Math.trunc(e));if(typeof e==`string`&&/^\d+$/.test(e))try{return BigInt(e)}catch{return null}return null},[t]),m=(0,v.useCallback)(()=>{let e=f();if(e===null)return c();let t=I();if(!i.current||t-a.current>2e3){let r=c()-e,o=2n*S;n.current=fe(r)<=o?0n:r,i.current=!0,a.current=t}return e+n.current},[c,f]),g=(0,v.useCallback)(()=>{try{return M(j(m(),S))}catch{return 0n}},[m]),_=(0,v.useRef)(null);_.current===null&&(_.current=g());let ie=_.current??0n,[b,x]=(0,v.useState)(`live`),[w,T]=(0,v.useState)(``),[ue,E]=(0,v.useState)(1),[D,O]=(0,v.useState)(()=>ie),[pe,N]=(0,v.useState)(()=>ie.toString()),P=(0,v.useRef)(!1),[F,B]=(0,v.useState)(null),[V,H]=(0,v.useState)(!0),[Ae,je]=(0,v.useState)(!1),[Me,Ie]=(0,v.useState)(``),[Re,ze]=(0,v.useState)(``),[Be,Ve]=(0,v.useState)(``),[He,Ue]=(0,v.useState)(!1),U=(0,v.useRef)(null),We=(0,v.useRef)(null),Ge=(0,v.useRef)(null),W=(0,v.useRef)(null),Ke=(0,v.useRef)(0),qe=(0,v.useMemo)(()=>{try{return D.toLocaleString()}catch{return D.toString()}},[D]),Je=(0,v.useCallback)(()=>{try{let e=A(m(),S),t=Number(e),n=Math.max(0,Math.min(s,Math.round(t*s/1e6))),r=document.documentElement;r.style.setProperty(`--pulse-dur`,`${s}ms`),r.style.setProperty(`--pulse-offset`,`-${n}ms`);let i=We.current;i&&(i.style.setProperty(`--pulse-dur`,`${s}ms`),i.style.setProperty(`--pulse-offset`,`-${n}ms`))}catch{}},[m]),G=(0,v.useCallback)((e,t=!0)=>{let n=M(e);O(n),t&&!P.current&&N(n.toString()),typeof document<`u`&&Je()},[Je]);(0,v.useEffect)(()=>{let e=e=>{let t=U.current;if(!t)return;let n=e.target;n instanceof Node&&t.contains(n)&&(We.current?.contains(n)||e.stopPropagation())},t=[`click`,`mousedown`,`touchstart`],n={passive:!0};t.forEach(t=>document.addEventListener(t,e,n));let r=e=>{e.key===`Escape`&&U.current&&e.stopPropagation()};return window.addEventListener(`keydown`,r,!0),()=>{t.forEach(t=>document.removeEventListener(t,e,n)),window.removeEventListener(`keydown`,r,!0)}},[]),(0,v.useEffect)(()=>{b===`live`&&G(g(),!0)},[b,G,g]);let K=(0,v.useCallback)(()=>{W.current!==null&&(window.clearTimeout(W.current),W.current=null)},[]),q=(0,v.useCallback)(()=>{K();let e=()=>{let e=k(d(j(m(),S)+1n));Ke.current=e;let n=Math.max(0,e-I());W.current=window.setTimeout(t,n)},t=()=>{let n=I(),r=Ke.current;if(n<r){W.current=window.setTimeout(t,Math.max(0,r-n));return}G(g(),!0),e()};G(g(),!0),e()},[G,K,g,m]);(0,v.useEffect)(()=>{if(b!==`live`)return;q();let e=()=>{document.visibilityState===`visible`&&b===`live`&&q()};return document.addEventListener(`visibilitychange`,e),window.addEventListener(`focus`,e),()=>{document.removeEventListener(`visibilitychange`,e),window.removeEventListener(`focus`,e),K()}},[b,q,K]);let Ye=we(b===`live`,m),Xe=(0,v.useCallback)(()=>{x(`live`),T(``),E(1),G(g(),!0),q()},[G,g,q]),Ze=e=>{let t=(e.target.value??``).replace(/[^\d]/g,``);if(N(t),t)try{let e=M(BigInt(t));x(`static-pulse`),T(``),E(1),G(e,!1),K()}catch{}},Qe=(0,v.useCallback)((e,t)=>{let n=ye(e);if(!n)return;let r=M(j(p(be(n,t)),S));x(`static-date`),K(),G(r,!0)},[G,K]),$e=e=>{let t=e.target.value;if(T(t),!t){E(1),Xe();return}Qe(t,ue)},et=e=>{let t=Number(e.target.value);E(t),w&&Qe(w,t)},tt=()=>{let e=U.current?.querySelector(`.sigil-modal`);e&&(e.classList.remove(`flash-now`),e.offsetWidth,e.classList.add(`flash-now`)),Xe()},J=(0,v.useMemo)(()=>ve(D),[D]),nt=(0,v.useMemo)(()=>{let{beat:e,stepIndex:t,percentIntoStep:n}=ee(D*S);return{beat:e,stepIndex:t,stepPct:o(n)}},[D]),Y=(0,v.useMemo)(()=>{if(!F)return`Root`;let e=Se(F,`harmonicDay`);return e?l[e]:`Root`},[F]),rt=(0,v.useMemo)(()=>{try{let e=A(D*S,h)*100000000n/h;return Number(e)/1e6}catch{return 0}},[D]),it=(0,v.useMemo)(()=>{try{let e=d(D),{dayPercent:t}=re(new Date(k(e)));return Math.max(0,Math.min(100,t))}catch{return rt}},[D,rt]),at=(0,v.useMemo)(()=>{try{let e=d(D),{beatIndex:t,stepIndex:n}=re(new Date(k(e)));return{beat:t,stepIndex:n}}catch{return{beat:J.beat,stepIndex:J.stepIndex}}},[D,J.beat,J.stepIndex]);(0,v.useEffect)(()=>{let e=!1;return(async()=>{try{let t=await te(d(D)),n=xe(t)?t:null;e||B(n)}catch{e||B(null)}})(),()=>{e=!0}},[D]);let ot=`${J.beat}:${de(J.stepIndex)}`,st=F?L(F,`chakraStepString`):void 0,ct=ot,lt=F?R(F,`dayOfMonth`):void 0,X=F?R(F,`eternalMonthIndex`):void 0,ut=he(typeof lt==`number`&&typeof X==`number`?`${ot} — D${lt}/M${X+1}`:ct),dt=F?L(F,`eternalChakraArc`)??`Harmonization Ark`:`Harmonization Ark`,ft=Ee(dt),Z=e=>Fe(Pe(e)),pt=e=>Z(JSON.stringify(e,null,2)),mt=(0,v.useMemo)(()=>{try{if(D<=C)return Number(D);if(me<=0n)return 0;let e=A(D,me);return Number(e)}catch{return 0}},[D]),ht=()=>document.querySelector(`#sigil-export svg`),gt=e=>{let t=ht();return t?Ne(t,e):null},_t=e=>{let t=gt(e);return t?new Blob([t],{type:`image/svg+xml;charset=utf-8`}):null},vt=async()=>{let e=document.getElementById(`sigil-export`);if(!e)return null;let t=await(0,ce.default)(e,{background:void 0,backgroundColor:null}),n=await new Promise(e=>t.toBlob(t=>e(t),`image/png`));if(n)return n;let r=t.toDataURL(`image/png`).split(`,`)[1]??``,i=atob(r),a=new ArrayBuffer(i.length),o=new Uint8Array(a);for(let e=0;e<i.length;e++)o[e]=i.charCodeAt(e);return new Blob([a],{type:`image/png`})},yt=e=>{let t=Number.isFinite(J.stepIndex)?Math.max(0,Math.min(Math.trunc(J.stepIndex),43)):0,n=Number.isFinite(J.beat)?Math.max(0,Math.min(Math.trunc(J.beat),35)):0;return{pulse:k(D),beat:n,stepIndex:t,chakraDay:Y,stepsPerBeat:44,canonicalHash:e,exportedAt:_e(D),expiresAtPulse:(D+11n).toString(),pulseExact:D.toString()}},bt=async()=>{let e=(D<=C?Be:``).toLowerCase();if(!e){let t=ht();e=(await Te(((t?new XMLSerializer().serializeToString(t):``)||`no-svg`)+`|pulseExact=${D.toString()}|beat=${J.beat}|step=${J.stepIndex}|chakra=${Y}`)).toLowerCase()}let t=yt(e),n=ne(e,t);ze(e),Ie(n),je(!0)},xt=async()=>{let e=yt((D<=C&&Be?String(Be).toLowerCase():``)||(await Te(`pulseExact=${D.toString()}|beat=${J.beat}|step=${J.stepIndex}|chakra=${Y}`)).toLowerCase()),[t,n]=await Promise.all([_t(e),vt()]);if(!t||!n)return;let r=D.toString(),i=r.length>80?`${r.slice(0,40)}_${r.slice(-20)}`:r,a=new le.default;a.file(`sigil_${i}.svg`,t),a.file(`sigil_${i}.png`,n);let o={...e,overlays:{qr:!1,eternalPulseBar:!1}};a.file(`sigil_${i}.manifest.json`,JSON.stringify(o,null,2));let s=await a.generateAsync({type:`blob`}),c=URL.createObjectURL(s),l=document.createElement(`a`);l.href=c,l.download=`sigil_${i}.zip`,document.body.appendChild(l),l.click(),l.remove(),requestAnimationFrame(()=>URL.revokeObjectURL(c))},St=()=>e(),Ct=(0,v.useMemo)(()=>F?Se(F,`harmonicDay`)||Ce(F.harmonicDay):``,[F]),wt=(0,v.useMemo)(()=>F?L(F,`eternalMonth`)??``:``,[F]),Tt=(0,v.useMemo)(()=>{if(!F)return``;let e=L(F,`eternalYearName`)??``,t=e.match(/Y(\d+)/i);if(!t)return e;let n=Number(t[1]);return Number.isFinite(n)?`Y${Math.max(0,n-1)}`:e},[F]),Et=(0,v.useMemo)(()=>F?L(F,`kaiTurahPhrase`)??``:``,[F]),Dt=(0,v.useMemo)(()=>F?ge(L(F,`eternalSeal`)??L(F,`seal`)??``,D,J.beat,J.stepIndex,at.beat,at.stepIndex,Tt||void 0):``,[F,J.beat,J.stepIndex,D,at,Tt]),Ot=F?R(F,`kaiPulseEternal`):void 0,kt=F?R(F,`kaiPulseToday`):void 0,Q=F?z(F,`chakraStep`):void 0,$=F?z(F,`chakraBeat`):void 0,At=Q?R(Q,`stepIndex`):void 0,jt=Q?R(Q,`percentIntoStep`):void 0,Mt=$?R($,`beatIndex`):void 0,Nt=$?R($,`pulsesIntoBeat`):void 0,Pt=F?R(F,`weekIndex`):void 0,Ft=F?L(F,`weekName`)??``:``,It=(()=>{let e=F?z(F,`harmonicWeekProgress`):void 0;return e?R(e,`percent`):void 0})(),Lt=(()=>{let e=F?z(F,`eternalMonthProgress`):void 0;return e?R(e,`percent`):void 0})(),Rt=(()=>{let e=F?z(F,`harmonicYearProgress`):void 0;return e?R(e,`percent`):void 0})(),zt=F?R(F,`phiSpiralLevel`):void 0,Bt=F?L(F,`kaiMomentSummary`)??``:``,Vt=F?L(F,`compressed_summary`)??``:``;return(0,se.createPortal)((0,y.jsxs)(y.Fragment,{children:[(0,y.jsx)(De,{}),(0,y.jsx)(`div`,{ref:U,role:`dialog`,"aria-modal":`true`,className:`sigil-modal-overlay`,onMouseDown:e=>{e.target===e.currentTarget&&e.stopPropagation()},onClick:e=>{e.target===e.currentTarget&&e.stopPropagation()},onTouchStart:e=>{e.target===e.currentTarget&&e.stopPropagation()},onKeyDown:e=>e.key===`Escape`&&e.stopPropagation(),children:(0,y.jsxs)(`div`,{className:`sigil-modal`,onMouseDown:e=>e.stopPropagation(),onClick:e=>e.stopPropagation(),onTouchStart:e=>e.stopPropagation(),children:[(0,y.jsx)(`button`,{ref:We,"aria-label":`Close`,className:`close-btn`,onClick:St,children:(0,y.jsx)(Oe,{})}),(0,y.jsx)(oe,{dateISO:w,onDateChange:$e,secondsLeft:b===`live`?Ye??void 0:void 0,solarPercent:it,eternalPercent:rt,solarColor:`#ffd600`,eternalColor:ft,eternalArkLabel:dt}),b!==`live`&&(0,y.jsxs)(y.Fragment,{children:[w&&(0,y.jsxs)(`label`,{style:{marginLeft:`12px`},className:`sigil-label`,children:[(0,y.jsx)(`span`,{className:`sigil-label__text`,children:`Breath within minute`}),`\xA0`,(0,y.jsx)(`select`,{value:ue,onChange:et,children:Le.map((e,t)=>(0,y.jsx)(`option`,{value:t+1,children:e},e))})]}),(0,y.jsx)(`button`,{className:`now-btn`,onClick:tt,children:`Now`})]}),b===`live`&&Ye!==null&&(0,y.jsxs)(`p`,{className:`countdown`,children:[`next pulse in `,(0,y.jsx)(`strong`,{children:Ye.toFixed(3)}),`s`]}),(0,y.jsxs)(`div`,{className:`sigil-pulse-row`,children:[(0,y.jsxs)(`label`,{className:`sigil-label sigil-pulse-label`,children:[(0,y.jsx)(`span`,{className:`sigil-label__text`,children:`Pulse`}),(0,y.jsx)(`input`,{className:`sigil-input sigil-pulse-input`,type:`text`,inputMode:`numeric`,value:pe,onFocus:()=>{P.current=!0},onBlur:()=>{P.current=!1,N(D.toString())},onChange:Ze,"aria-label":`Pulse`,placeholder:`Enter pulse`})]}),(0,y.jsx)(`span`,{className:`sigil-live-chip ${b===`live`?`is-live`:`is-static`}`,"aria-live":`polite`,children:b===`live`?`LIVE`:`STATIC`})]}),(0,y.jsxs)(`div`,{id:`sigil-export`,style:{position:`relative`,width:240,margin:`16px auto`},children:[(0,y.jsx)(r,{ref:Ge,pulse:mt,beat:nt.beat,stepIndex:nt.stepIndex,stepPct:nt.stepPct,chakraDay:Y,size:240,hashMode:`deterministic`,origin:``,onReady:e=>{let t=e.hash?String(e.hash).toLowerCase():``;t&&Ve(t)}}),(0,y.jsx)(`span`,{className:`pulse-tag`,children:qe})]}),(0,y.jsxs)(`div`,{className:`sigil-meta-block`,children:[(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Kairos:`}),`\xA0`,ct,(0,y.jsx)(`button`,{className:`copy-btn`,onClick:()=>Z(ct),children:`💠`})]}),(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Kairos/Date:`}),`\xA0`,ut,(0,y.jsx)(`button`,{className:`copy-btn`,onClick:()=>Z(ut),children:`💠`})]}),F&&(0,y.jsxs)(y.Fragment,{children:[(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Seal:`}),`\xA0`,Dt,(0,y.jsx)(`button`,{className:`copy-btn`,onClick:()=>Z(Dt),children:`💠`})]}),(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Day:`}),` `,Ct]}),(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Month:`}),` `,wt]}),(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Arc:`}),` `,dt]}),(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Year:`}),` `,Tt]}),(0,y.jsxs)(`p`,{children:[(0,y.jsx)(`strong`,{children:`Kai-Turah:`}),`\xA0`,Et,(0,y.jsx)(`button`,{className:`copy-btn`,onClick:()=>Z(Et),children:`💠`})]})]})]}),F&&(0,y.jsxs)(`details`,{className:`rich-data`,open:He,onToggle:e=>Ue(e.currentTarget.open),children:[(0,y.jsx)(`summary`,{children:`Memory`}),(0,y.jsxs)(`div`,{className:`rich-grid`,children:[(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`pulseExact`}),(0,y.jsx)(`span`,{children:D.toString()})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`kaiPulseEternal`}),(0,y.jsx)(`span`,{children:(Ot??0).toLocaleString()})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`kaiPulseToday`}),(0,y.jsx)(`span`,{children:kt??0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`chakraStepString`}),(0,y.jsx)(`span`,{children:st??``})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`chakraStep.stepIndex`}),(0,y.jsx)(`span`,{children:At??0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`chakraStep.percentIntoStep`}),(0,y.jsxs)(`span`,{children:[((jt??0)*100).toFixed(2),`%`]})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`chakraBeat.beatIndex`}),(0,y.jsx)(`span`,{children:Mt??0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`chakraBeat.pulsesIntoBeat`}),(0,y.jsx)(`span`,{children:Nt??0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`weekIndex`}),(0,y.jsx)(`span`,{children:Pt??0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`weekName`}),(0,y.jsx)(`span`,{children:Ft})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`dayOfMonth`}),(0,y.jsx)(`span`,{children:lt??0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`eternalMonthIndex`}),(0,y.jsx)(`span`,{children:typeof X==`number`?X+1:0})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`harmonicWeekProgress.percent`}),(0,y.jsxs)(`span`,{children:[((It??0)*100).toFixed(2),`%`]})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`eternalMonthProgress.percent`}),(0,y.jsxs)(`span`,{children:[((Lt??0)*100).toFixed(2),`%`]})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`harmonicYearProgress.percent`}),(0,y.jsxs)(`span`,{children:[((Rt??0)*100).toFixed(2),`%`]})]}),(0,y.jsxs)(`div`,{children:[(0,y.jsx)(`code`,{children:`phiSpiralLevel`}),(0,y.jsx)(`span`,{children:zt??0})]}),(0,y.jsxs)(`div`,{className:`span-2`,children:[(0,y.jsx)(`code`,{children:`kaiMomentSummary`}),(0,y.jsx)(`span`,{children:Bt})]}),(0,y.jsxs)(`div`,{className:`span-2`,children:[(0,y.jsx)(`code`,{children:`compressed_summary`}),(0,y.jsx)(`span`,{children:Vt})]}),(0,y.jsxs)(`div`,{className:`span-2`,children:[(0,y.jsx)(`code`,{children:`eternalSeal`}),(0,y.jsx)(`span`,{className:`truncate`,children:Dt})]})]}),(0,y.jsx)(`div`,{className:`rich-actions`,children:(0,y.jsx)(`button`,{onClick:()=>pt(F),children:`Remember JSON`})})]}),(0,y.jsx)(`div`,{className:`modal-bottom-spacer`,"aria-hidden":`true`}),(0,y.jsx)(`div`,{className:`mint-dock`,children:(0,y.jsxs)(`button`,{className:`mint-btn`,type:`button`,"aria-label":`Mint this moment`,title:`Mint this moment`,onClick:bt,children:[(0,y.jsx)(`span`,{className:`mint-btn__icon`,"aria-hidden":`true`,children:V?(0,y.jsx)(`img`,{src:`/assets/seal.svg`,alt:``,loading:`eager`,decoding:`async`,onError:()=>H(!1)}):(0,y.jsx)(ke,{})}),(0,y.jsxs)(`span`,{className:`mint-btn__text`,children:[(0,y.jsx)(`span`,{className:`mint-btn__title`,children:`MINT ΦKey`}),(0,y.jsxs)(`span`,{className:`mint-btn__sub`,children:[`☤KAI `,qe]})]})]})})]})}),(0,y.jsx)(ae,{open:Ae,url:Me,hash:Re,onClose:()=>je(!1),onDownloadZip:xt})]}),document.body)};export{Re as t};