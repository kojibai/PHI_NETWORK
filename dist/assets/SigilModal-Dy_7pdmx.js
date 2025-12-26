import{H as e,M as t,O as n,Tr as r,fn as i,ft as a,j as o,vr as s,yr as c}from"./index-CeHEZBNs.js";import{t as l}from"./html2canvas-CRo3n06v.js";import{t as u}from"./SealMomentModal-Dtd5LEuh.js";var d=r(c(),1),f=r(a(),1),p=e=>Math.max(0,Math.min(100,e));function m(e,t){let n=(e??``).toLowerCase().trim();return/(reflekt|reflect|reflektion|reflection)/i.test(n)?`#22c55e`:/(purify|purification|purifikation)/i.test(n)?`#3b82f6`:/dream/i.test(n)?`#7c3aed`:/(ignite|ignition)/i.test(n)?`#ff3b30`:/(integrate|integration)/i.test(n)?`#ff8a00`:/(solar\s*plexus)/i.test(n)?`#ffd600`:t}var h=({dateISO:e,onDateChange:t,secondsLeft:n,eternalPercent:r,eternalColor:i=`#8beaff`,eternalArkLabel:a=`Eternal Ark`})=>{let o=(0,d.useMemo)(()=>p(r),[r]),s=(0,d.useMemo)(()=>m(a,i),[a,i]),c={"--eternal-bar":s,"--pulse":`var(--kai-pulse, var(--pulse-dur, 5236ms))`},l=(0,d.useMemo)(()=>({"--fill":(o/100).toFixed(6)}),[o]),u=(0,d.useRef)(null),h=(0,d.useRef)(void 0),g=(0,d.useRef)(null),_=(0,d.useRef)(null);return(0,d.useEffect)(()=>()=>{g.current!==null&&window.clearTimeout(g.current),_.current!==null&&window.cancelAnimationFrame(_.current),u.current&&u.current.classList.remove(`is-boom`),g.current=null,_.current=null},[]),(0,d.useEffect)(()=>{let e=typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches;if(typeof n!=`number`||e){h.current=n;return}let t=u.current,r=h.current;t&&typeof r==`number`&&n-r>1.2&&(t.classList.remove(`is-boom`),_.current!==null&&window.cancelAnimationFrame(_.current),_.current=window.requestAnimationFrame(()=>{t.classList.add(`is-boom`)}),g.current!==null&&window.clearTimeout(g.current),g.current=window.setTimeout(()=>{t.classList.remove(`is-boom`),g.current=null},420)),h.current=n},[n]),(0,f.jsxs)(`div`,{className:`sigil-scope`,style:c,children:[(0,f.jsx)(`h3`,{className:`sigil-title`,children:`Kairos Sigil-Glyph Inhaler`}),(0,f.jsx)(`div`,{className:`sigil-ribbon`,"aria-hidden":`true`}),(0,f.jsx)(`div`,{className:`input-row sigil-row`,children:(0,f.jsxs)(`label`,{className:`sigil-label`,children:[(0,f.jsx)(`span`,{className:`sigil-label__text`,children:`Select moment:`}),`\xA0`,(0,f.jsx)(`input`,{className:`sigil-input`,type:`datetime-local`,value:e,onChange:t})]})}),(0,f.jsx)(`div`,{className:`sigil-bars`,role:`group`,"aria-label":`Day progress`,children:(0,f.jsxs)(`div`,{className:`sigil-bar`,children:[(0,f.jsxs)(`div`,{className:`sigil-bar__head`,children:[(0,f.jsxs)(`span`,{className:`sigil-bar__label`,children:[`Unfoldment`,a?` — ${a}`:``]}),(0,f.jsxs)(`span`,{className:`sigil-bar__pct`,"aria-hidden":`true`,children:[o.toFixed(2),`%`]})]}),(0,f.jsx)(`div`,{className:`sigil-bar__track`,"aria-valuemin":0,"aria-valuemax":100,"aria-valuenow":+o.toFixed(2),role:`progressbar`,"aria-label":`Eternal day ${a||``}`,children:(0,f.jsx)(`div`,{ref:u,className:`sigil-bar__fill sigil-bar__fill--eternal`,style:l})})]})}),(0,f.jsx)(`style`,{children:`
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
      `})]})},g=r(s(),1),_=r(l(),1),v=r(e(),1),y=Date.UTC(2024,4,10,6,45,41,888),b=3+Math.sqrt(5),x=b*1e3,ee=17491.270421,S=44,C=36,w=6,T=42,E=8,D=T*E,O=(1+Math.sqrt(5))/2,k=[`Solhara`,`Aquaris`,`Flamora`,`Verdari`,`Sonari`,`Kaelith`],A={Solhara:`Root`,Aquaris:`Sacral`,Flamora:`Solar Plexus`,Verdari:`Heart`,Sonari:`Throat`,Kaelith:`Crown`},j=[`Aethon`,`Virelai`,`Solari`,`Amarin`,`Kaelus`,`Umbriel`,`Noktura`,`Liora`],M=[`Ignite`,`Integrate`,`Harmonize`,`Reflekt`,`Purifikation`,`Dream`],te=e=>`${e} Ark`,N=[`Tor Lah Mek Ka`,`Shoh Vel Lah Tzur`,`Rah Veh Yah Dah`,`Nel Shaum Eh Lior`,`Ah Ki Tzah Reh`,`Or Vem Shai Tuun`,`Ehlum Torai Zhak`,`Zho Veh Lah Kurei`,`Tuul Ka Yesh Aum`,`Sha Vehl Dorrah`],ne=Array.from({length:11},(e,t)=>{let n=(t*b).toFixed(3);return`Breath ${t+1} — ${n}s`}),P=1000000n,F=17491270421n,I=11000000n,L=(F+18n)/36n,re=Number((L+P/2n)/P),ie=e=>String(e).padStart(2,`0`),ae=e=>e.trim().replace(/^(\d+):(\d+)/,(e,t,n)=>`${+t}:${String(n).padStart(2,`0`)}`).replace(/D\s*(\d+)/,(e,t)=>`D${+t}`),R=(e,t)=>(e%t+t)%t;function z(e,t){let n=e/t,r=e%t;return r!==0n&&r>0n!=t>0n?n-1n:n}function oe(e){if(!Number.isFinite(e))return 0n;let t=e<0?-1:1,n=Math.abs(e),r=Math.trunc(n),i=n-r;return i<.5?BigInt(t*r):i>.5?BigInt(t*(r+1)):BigInt(t*(r%2==0?r:r+1))}function se(e){return oe((e.getTime()-y)/1e3/b*1e6)}var B=`http://www.w3.org/2000/svg`;function V(e){e.getAttribute(`xmlns`)||e.setAttribute(`xmlns`,B),e.getAttribute(`xmlns:xlink`)||e.setAttribute(`xmlns:xlink`,`http://www.w3.org/1999/xlink`)}function H(e){let t=e.ownerDocument||document,n=e.querySelector(`metadata`);if(n)return n;let r=t.createElementNS(B,`metadata`);return e.insertBefore(r,e.firstChild),r}function ce(e){let t=e.ownerDocument||document,n=e.querySelector(`desc`);if(n)return n;let r=t.createElementNS(B,`desc`),i=e.querySelector(`metadata`);return i&&i.nextSibling?e.insertBefore(r,i.nextSibling):e.insertBefore(r,e.firstChild),r}function le(e,t){V(e);let n=H(e);n.textContent=JSON.stringify(t);let r=ce(e);r.textContent=typeof t==`object`&&t?(()=>{let e=t,n=typeof e.pulse==`number`?e.pulse:void 0,r=typeof e.beat==`number`?e.beat:void 0,i=typeof e.stepIndex==`number`?e.stepIndex:void 0,a=typeof e.chakraDay==`string`?e.chakraDay:void 0;return`KaiSigil — pulse:${n??`?`} beat:${r??`?`} step:${i??`?`} chakra:${a??`?`}`})():`KaiSigil — exported`;let i=new XMLSerializer().serializeToString(e);return i.startsWith(`<?xml`)?i:`<?xml version="1.0" encoding="UTF-8"?>\n${i}`}var ue=()=>(0,f.jsxs)(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":!0,className:`close-icon`,children:[(0,f.jsx)(`line`,{x1:`4`,y1:`4`,x2:`20`,y2:`20`,stroke:`currentColor`,strokeWidth:`2`}),(0,f.jsx)(`line`,{x1:`20`,y1:`4`,x2:`4`,y2:`20`,stroke:`currentColor`,strokeWidth:`2`}),(0,f.jsx)(`circle`,{cx:`12`,cy:`12`,r:`10`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.2`,opacity:`.25`})]}),de=()=>(0,f.jsxs)(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`,children:[(0,f.jsx)(`circle`,{cx:`12`,cy:`12`,r:`9.5`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.4`}),(0,f.jsx)(`path`,{d:`M12 6v6l3.5 3.5`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.8`,strokeLinecap:`round`,strokeLinejoin:`round`}),(0,f.jsx)(`path`,{d:`M8.2 15.8l2.1-2.1`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.6`,strokeLinecap:`round`})]});function U(e){let t=se(e),n=R(t,F),r=z(t,F),i=Number(z(n,L)),a=n-BigInt(i)*L,o=Number(a/I),s=Math.min(Math.max(o,0),S-1),c=a-BigInt(s)*I,l=Number(c)/Number(I),u=Number(z(t,P)),d=Number(a/P),f=Number(n/P),p=k[Number(R(r,BigInt(w)))],m=A[p],h=Number(r),g=(h%T+T)%T+1,_=(Math.floor(h/T)%E+E)%E,v=_+1,y=j[_],b=Math.floor(h/D),x=b<1?`Year of Harmonik Restoration`:b===1?`Year of Harmonik Embodiment`:`Year ${b}`,ee=Number(n*6n/F),C=te(M[Math.min(5,Math.max(0,ee))]),O=Math.floor((g-1)/w),N=[`Awakening Flame`,`Flowing Heart`,`Radiant Will`,`Harmonic Voh`,`Inner Mirror`,`Dreamfire Memory`,`Krowned Light`][O];return{pulse:u,beat:i,step:s,stepPct:l,pulsesIntoBeat:d,pulsesIntoDay:f,harmonicDay:p,chakraDay:m,chakraStepString:`${i}:${ie(s)}`,dayOfMonth:g,monthIndex0:_,monthIndex1:v,monthName:y,yearIndex:b,yearName:x,arcIndex:ee,arcName:C,weekIndex:O,weekName:N,_pμ_in_day:n,_pμ_in_beat:a}}function fe(e){let t=U(e),n=`${t.chakraStepString} — D${t.dayOfMonth}/M${t.monthIndex1}`,r={beatIndex:t.beat,pulsesIntoBeat:t.pulsesIntoBeat,beatPulseCount:re,totalBeats:C},i=Number(t._pμ_in_beat)/Number(L)*100,a=(1-Number(t._pμ_in_beat)/Number(L))*100,o=(t.dayOfMonth-1)%w,s=BigInt(o)*F+t._pμ_in_day,c={weekDay:t.harmonicDay,weekDayIndex:k.indexOf(t.harmonicDay),pulsesIntoWeek:Number(s/P),percent:Number(s)/Number(F*BigInt(w))*100},l=t.dayOfMonth-1,u={daysElapsed:l,daysRemaining:T-t.dayOfMonth,percent:l/T*100},d=t.monthIndex0*T+t.dayOfMonth,f={daysElapsed:d-1,daysRemaining:D-d,percent:(d-1)/D*100},p={stepIndex:t.step,percentIntoStep:t.stepPct*100,stepsPerBeat:S},m=`Beat ${t.beat+1}/${C} • Step ${t.step+1}/${S} • ${t.harmonicDay}, ${t.arcName} • D${t.dayOfMonth}/M${t.monthIndex1} (${t.monthName}) • ${t.yearName}`,h=`Kai:${t.chakraStepString} D${t.dayOfMonth}/M${t.monthIndex1} ${t.harmonicDay} ${t.monthName} y${t.yearIndex}`,g=Math.floor(Math.log(Math.max(t.pulse,1))/Math.log(O)),_=e=>e.replace(/\s*Ark$/i,``),v=`Eternal Seal: Kairos:${t.chakraStepString}, ${t.harmonicDay}, ${(e=>`${_(e)} Ark`)(t.arcName)} • D${t.dayOfMonth}/M${t.monthIndex1} • Beat:${t.beat}/${C}(${i.toFixed(6)}%) Step:${t.step}/${S} Kai(Today):${t.pulsesIntoDay} • Y${t.yearIndex} PS${g} • Eternal Pulse:${t.pulse}`;return{kaiPulseEternal:t.pulse,kaiPulseToday:t.pulsesIntoDay,eternalKaiPulseToday:t.pulsesIntoDay,eternalSeal:v,kairos_seal_day_month:n,eternalMonth:t.monthName,eternalMonthIndex:t.monthIndex1,eternalChakraArc:t.arcName,eternalYearName:t.yearName,kaiTurahPhrase:N[t.yearIndex%N.length],chakraStepString:t.chakraStepString,chakraStep:p,harmonicDay:t.harmonicDay,chakraBeat:r,eternalChakraBeat:{...r,percentToNext:a},harmonicWeekProgress:c,harmonicYearProgress:f,eternalMonthProgress:u,weekIndex:t.weekIndex,weekName:t.weekName,dayOfMonth:t.dayOfMonth,kaiMomentSummary:m,compressed_summary:h,phiSpiralLevel:g}}var W=()=>typeof performance<`u`&&typeof performance.now==`function`?performance.timeOrigin+performance.now():Date.now(),G=e=>{let t=e-y;return y+Math.ceil(t/x)*x};function pe(e){let t=e.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);if(!t)return null;let n=Number(t[1]),r=Number(t[2])-1,i=Number(t[3]),a=Number(t[4]),o=Number(t[5]),s=Number(t[6]??`0`),c=String(t[7]??`0`).padEnd(3,`0`),l=Number(c),u=new Date(n,r,i,a,o,s,l);return Number.isNaN(u.getTime())?null:u}function me(e,t){let n=Number.isFinite(t)?Math.max(1,Math.min(11,t)):1;return new Date(e.getTime()+(n-1)*x)}function he(e){let[t,n]=(0,d.useState)(b),r=(0,d.useRef)(0),i=(0,d.useRef)(null),a=(0,d.useRef)(null);return(0,d.useEffect)(()=>{if(i.current!==null&&(cancelAnimationFrame(i.current),i.current=null),a.current!==null&&(window.clearInterval(a.current),a.current=null),!e)return;typeof document<`u`&&document.documentElement&&document.documentElement.style.setProperty(`--kai-pulse`,`${x}ms`),r.current=G(W());let t=()=>{let e=W();if(e>=r.current){let t=Math.floor((e-r.current)/x)+1;r.current+=t*x}n(Math.max(0,r.current-e)/1e3),i.current=requestAnimationFrame(t)};i.current=requestAnimationFrame(t);let o=()=>{document.visibilityState===`hidden`?(i.current!==null&&(cancelAnimationFrame(i.current),i.current=null),a.current===null&&(a.current=window.setInterval(()=>{let e=W();if(e>=r.current){let t=Math.floor((e-r.current)/x)+1;r.current+=t*x}n(Math.max(0,(r.current-e)/1e3))},33))):(a.current!==null&&(window.clearInterval(a.current),a.current=null),i.current!==null&&(cancelAnimationFrame(i.current),i.current=null),r.current=G(W()),i.current=requestAnimationFrame(t))};return document.addEventListener(`visibilitychange`,o),()=>{document.removeEventListener(`visibilitychange`,o),i.current!==null&&cancelAnimationFrame(i.current),a.current!==null&&window.clearInterval(a.current),i.current=null,a.current=null}},[e]),e?t:null}var K=()=>{try{return globalThis.crypto?.subtle}catch{return}},ge=async e=>{let t=new TextEncoder().encode(e),n=K();if(n)try{let e=await n.digest(`SHA-256`,t);return Array.from(new Uint8Array(e)).map(e=>e.toString(16).padStart(2,`0`)).join(``)}catch{}let r=2166136261;for(let e=0;e<t.length;e++)r^=t[e],r=Math.imul(r,16777619);return(r>>>0).toString(16).padStart(8,`0`)},q={"Ignite Ark":`#ff0024`,"Ignition Ark":`#ff0024`,"Integrate Ark":`#ff6f00`,"Integration Ark":`#ff6f00`,"Harmonize Ark":`#ffd600`,"Harmonization Ark":`#ffd600`,"Reflekt Ark":`#00c853`,"Reflection Ark":`#00c853`,"Purifikation Ark":`#00b0ff`,"Purification Ark":`#00b0ff`,"Dream Ark":`#c186ff`},_e=e=>{if(!e)return`#ffd600`;let t=e.trim(),n=t.replace(/\s*ark$/i,` Ark`);return q[t]??q[n]??`#ffd600`},ve=()=>(0,f.jsx)(`style`,{children:`
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

  /* 🔒 NOT a bar */
  display: grid;          /* centers child without creating a row bar */
  place-items: center;
  width: fit-content;     /* shrink-wrap to the button */
  max-width: 100%;
  margin: 0 auto;         /* center the shrink-wrapped dock */
  padding: 0;             /* remove bar padding */
  background: transparent;/* no bar surface */
  border: 0;
  box-shadow: none;

  contain: layout paint style;
  -webkit-transform: translateZ(0);
          transform: translateZ(0);
}

/* hard stop: prevent child from stretching wide */
.mint-dock > *{
  width: auto;
  max-width: 100%;
  flex: 0 0 auto;
}

/* if your button is an <a> or <button> and inherits block styles elsewhere */
.mint-dock button,
.mint-dock a{
  display: inline-flex;
}


    .mint-btn {
      width: min(520px, calc(100% - 2px));
      display: grid;
      grid-template-columns: 54px 1fr;
      gap: 12px;
      align-items: center;

      border: 0;
      cursor: pointer;
      color: inherit;
      padding: 12px 14px;
      border-radius: 18px;

      background:
        radial-gradient(900px 220px at 30% 0%, rgba(255,230,150,.18), rgba(0,0,0,0) 60%),
        radial-gradient(900px 280px at 80% 10%, rgba(120,220,255,.16), rgba(0,0,0,0) 55%),
        linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.06));
      backdrop-filter: blur(10px) saturate(140%);
      -webkit-backdrop-filter: blur(10px) saturate(140%);

      box-shadow:
        0 10px 34px rgba(0,0,0,.45),
        inset 0 0 0 1px rgba(255,255,255,.22),
        0 0 44px rgba(255, 215, 120, .12);

      transition: transform .18s ease, box-shadow .18s ease, filter .18s ease, opacity .18s ease;
      will-change: transform;
      touch-action: manipulation;
    }

    .mint-btn::before {
      content: "";
      position: absolute;
      inset: -1px;
      border-radius: 19px;
      background:
        linear-gradient(90deg,
          rgba(255,215,140,.0),
          rgba(255,215,140,.55),
          rgba(120,220,255,.35),
          rgba(155, 91, 255, .35),
          rgba(255,215,140,.0)
        );
      filter: blur(10px);
      opacity: .55;
      pointer-events: none;
    }

    .mint-btn:hover { transform: translateY(-2px); box-shadow: 0 14px 44px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.28), 0 0 60px rgba(255, 215, 120, .16); }
    .mint-btn:active { transform: translateY(0px) scale(.99); }

    .mint-btn__icon {
      width: 54px;
      height: 54px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;

      background:
        radial-gradient(120% 120% at 50% 0%, rgba(255,255,255,.16), rgba(255,255,255,.06)),
        linear-gradient(180deg, rgba(12, 20, 48, .62), rgba(3, 6, 16, .72));
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.22),
        0 10px 26px rgba(0,0,0,.35);
    }

    .mint-btn__icon img,
    .mint-btn__icon svg {
      width: 56%;
      height: 56%;
      display: block;
      user-select: none;
      -webkit-user-drag: none;
    }

    .mint-btn__text { text-align: left; line-height: 1.1; }
    .mint-btn__title {
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;
      font-size: 13px;
      opacity: .98;
    }
    .mint-btn__sub {
      margin-top: 4px;
      font-size: 12px;
      opacity: .78;
    }

    @media (pointer: coarse) {
      .mint-btn { padding: 14px 14px; }
      .mint-btn__icon { width: 58px; height: 58px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .mint-btn { transition: none; }
      .mint-btn:hover { transform: none; }
    }
  `});function ye(e){let n=typeof e==`number`&&e>0?new Date(y+e*x):new Date(y),r=U(n),i=t(r.pulse),a=o(r.pulse);return{pulse:r.pulse,beat:r.beat,stepPct:a,stepIdx:i,chakraDay:r.chakraDay,kairos:fe(n)}}async function be(e){try{if(navigator.clipboard?.writeText)return await navigator.clipboard.writeText(e),!0}catch{}try{let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,`true`),t.style.position=`fixed`,t.style.left=`-9999px`,t.style.top=`0`,document.body.appendChild(t),t.select();let n=document.execCommand(`copy`);return document.body.removeChild(t),n}catch{return!1}}var xe=e=>{e.catch(()=>{})},J=({initialPulse:e=0,onClose:r})=>{let[a]=(0,d.useState)(()=>ye(e)),[s,c]=(0,d.useState)(a.pulse),[l,p]=(0,d.useState)(a.beat),[m,b]=(0,d.useState)(a.stepPct),[C,w]=(0,d.useState)(a.stepIdx),[T,E]=(0,d.useState)(a.chakraDay),[D,O]=(0,d.useState)(a.kairos),[k,A]=(0,d.useState)(``),[j,M]=(0,d.useState)(1),[te,N]=(0,d.useState)(!0),[P,F]=(0,d.useState)(!1),[I,L]=(0,d.useState)(``),[re,R]=(0,d.useState)(``),[z,oe]=(0,d.useState)(``),[se,B]=(0,d.useState)(!1),V=(0,d.useRef)(null),H=(0,d.useRef)(null),ce=(0,d.useRef)(null),K=(0,d.useRef)(null),q=(0,d.useRef)(0);(0,d.useEffect)(()=>{let e=e=>{let t=V.current;if(!t)return;let n=e.target;n instanceof Node&&t.contains(n)&&(H.current?.contains(n)||e.stopPropagation())},t=[`click`,`mousedown`,`touchstart`],n={passive:!0};t.forEach(t=>document.addEventListener(t,e,n));let r=e=>{e.key===`Escape`&&V.current&&e.stopPropagation()};return window.addEventListener(`keydown`,r,!0),()=>{t.forEach(t=>document.removeEventListener(t,e,n)),window.removeEventListener(`keydown`,r,!0)}},[]);let J=(0,d.useCallback)(e=>{let t=H.current;if(!t)return;let n=x-((e-y)%x+x)%x;t.style.setProperty(`--pulse-dur`,`${x}ms`),t.style.setProperty(`--pulse-offset`,`-${Math.round(n)}ms`)},[]),Se=(0,d.useCallback)(e=>{if(typeof document>`u`)return;let t=document.documentElement,n=x-((e-y)%x+x)%x;t.style.setProperty(`--pulse-dur`,`${x}ms`),t.style.setProperty(`--pulse-offset`,`-${Math.round(n)}ms`)},[]),Y=(0,d.useCallback)((e,n)=>{let r=U(e),i=t(r.pulse),a=o(r.pulse);c(r.pulse),p(r.beat),b(a),w(i),E(r.chakraDay),O(fe(e));let s=typeof n==`number`?n:e.getTime();Se(s),J(s)},[J,Se]),X=(0,d.useCallback)(()=>{K.current!==null&&(window.clearTimeout(K.current),K.current=null)},[]),Z=(0,d.useCallback)(()=>{X(),q.current=G(W());let e=()=>{let t=W(),n=q.current;if(t<n){K.current=window.setTimeout(e,Math.max(0,n-t));return}let r=Math.floor((t-n)/x)+1,i=n+(r-1)*x;Y(new Date(i),i),q.current=n+r*x;let a=Math.max(0,q.current-t);K.current=window.setTimeout(e,a)};K.current=window.setTimeout(()=>{let t=W();Y(new Date(t),t);let n=Math.max(0,q.current-t);K.current=window.setTimeout(e,n)},0)},[Y,X]);(0,d.useEffect)(()=>{if(k)return;Z();let e=()=>{document.visibilityState===`visible`&&!k&&Z()};return document.addEventListener(`visibilitychange`,e),window.addEventListener(`focus`,e),()=>{document.removeEventListener(`visibilitychange`,e),window.removeEventListener(`focus`,e),X()}},[k,Z,X]);let Ce=(0,d.useCallback)((e,t)=>{let n=pe(e);if(!n)return;let r=me(n,t);Y(r,r.getTime())},[Y]),we=e=>{let t=e.target.value;if(A(t),!t){M(1);return}X(),Ce(t,j)},Te=e=>{let t=Number(e.target.value);M(t),k&&Ce(k,t)},Ee=()=>{let e=V.current?.querySelector(`.sigil-modal`);e&&(e.classList.remove(`flash-now`),e.offsetWidth,e.classList.add(`flash-now`)),A(``),M(1);let t=W();Y(new Date(t),t)},De=he(!k),Q=e=>xe(be(e)),Oe=e=>Q(JSON.stringify(e,null,2)),ke=()=>document.querySelector(`#sigil-export svg`),Ae=e=>{let t=ke();return t?le(t,e):null},je=e=>{let t=Ae(e);return t?new Blob([t],{type:`image/svg+xml;charset=utf-8`}):null},Me=async()=>{let e=document.getElementById(`sigil-export`);if(!e)return null;let t=await(0,_.default)(e,{background:void 0,backgroundColor:null}),n=await new Promise(e=>t.toBlob(t=>e(t),`image/png`));if(n)return n;let r=t.toDataURL(`image/png`).split(`,`)[1]??``,i=atob(r),a=new ArrayBuffer(i.length),o=new Uint8Array(a);for(let e=0;e<i.length;e++)o[e]=i.charCodeAt(e);return new Blob([a],{type:`image/png`})},Ne=e=>{let t=S,n=D?.chakraStep.stepIndex??C;return{pulse:s,beat:l,stepIndex:Number.isFinite(n)?Math.max(0,Math.min(Number(n),t-1)):0,chakraDay:T,stepsPerBeat:t,canonicalHash:e,exportedAt:new Date().toISOString(),expiresAtPulse:s+11}},Pe=async()=>{let e=(z||``).toLowerCase();if(!e){let t=ke();e=(await ge(t?new XMLSerializer().serializeToString(t):JSON.stringify({pulse:s,beat:l,stepPct:m,chakraDay:T}))).toLowerCase()}let t=Ne(e),n=i(e,t);R(e),L(n),F(!0)},Fe=async()=>{let e=Ne((z||``).toLowerCase()||await ge(JSON.stringify({pulse:s,beat:l,stepPct:m,chakraDay:T}))),[t,n]=await Promise.all([je(e),Me()]);if(!t||!n)return;let r=new v.default;r.file(`sigil_${s}.svg`,t),r.file(`sigil_${s}.png`,n);let i={...e,overlays:{qr:!1,eternalPulseBar:!1}};r.file(`sigil_${s}.manifest.json`,JSON.stringify(i,null,2));let a=await r.generateAsync({type:`blob`}),o=URL.createObjectURL(a),c=document.createElement(`a`);c.href=o,c.download=`sigil_${s}.zip`,document.body.appendChild(c),c.click(),c.remove(),requestAnimationFrame(()=>URL.revokeObjectURL(o))},Ie=()=>{r()},Le=D?(e=>{let t=e.trim().match(/^(\d+):(\d{1,2})/);return t?`${+t[1]}:${t[2].padStart(2,`0`)}`:null})(D.kairos_seal_day_month):null,Re=`${l}:${ie(C)}`,$=Le??Re,ze=ae(D?D.kairos_seal_day_month:$),Be=_e(D?.eternalChakraArc),Ve=D?Math.max(0,Math.min(100,D.kaiPulseToday/ee*100)):0;return(0,g.createPortal)((0,f.jsxs)(f.Fragment,{children:[(0,f.jsx)(ve,{}),(0,f.jsx)(`div`,{ref:V,role:`dialog`,"aria-modal":`true`,className:`sigil-modal-overlay`,onMouseDown:e=>{e.target===e.currentTarget&&e.stopPropagation()},onClick:e=>{e.target===e.currentTarget&&e.stopPropagation()},onTouchStart:e=>{e.target===e.currentTarget&&e.stopPropagation()},onKeyDown:e=>e.key===`Escape`&&e.stopPropagation(),children:(0,f.jsxs)(`div`,{className:`sigil-modal`,onMouseDown:e=>e.stopPropagation(),onClick:e=>e.stopPropagation(),onTouchStart:e=>e.stopPropagation(),children:[(0,f.jsx)(`button`,{ref:H,"aria-label":`Close`,className:`close-btn`,onClick:Ie,children:(0,f.jsx)(ue,{})}),(0,f.jsx)(h,{dateISO:k,onDateChange:we,secondsLeft:De??void 0,solarPercent:Ve,eternalPercent:Ve,solarColor:`#ffd600`,eternalColor:Be,eternalArkLabel:D?.eternalChakraArc||`Ignite Ark`}),k&&(0,f.jsxs)(f.Fragment,{children:[(0,f.jsxs)(`label`,{style:{marginLeft:`12px`},children:[`Breath within minute:\xA0`,(0,f.jsx)(`select`,{value:j,onChange:Te,children:ne.map((e,t)=>(0,f.jsx)(`option`,{value:t+1,children:e},e))})]}),(0,f.jsx)(`button`,{className:`now-btn`,onClick:Ee,children:`Now`})]}),De!==null&&(0,f.jsxs)(`p`,{className:`countdown`,children:[`next pulse in `,(0,f.jsx)(`strong`,{children:De.toFixed(6)}),`s`]}),(0,f.jsxs)(`div`,{id:`sigil-export`,style:{position:`relative`,width:240,margin:`16px auto`},children:[(0,f.jsx)(n,{ref:ce,pulse:s,beat:l,stepPct:m,chakraDay:T,size:240,hashMode:`deterministic`,origin:``,onReady:e=>{let t=e.hash?String(e.hash).toLowerCase():``;t&&oe(t),typeof e.pulse==`number`&&e.pulse!==s&&c(e.pulse)}}),(0,f.jsx)(`span`,{className:`pulse-tag`,children:s.toLocaleString()})]}),(0,f.jsxs)(`div`,{className:`sigil-meta-block`,children:[(0,f.jsxs)(`p`,{children:[(0,f.jsx)(`strong`,{children:`Kairos:`}),`\xA0`,$,(0,f.jsx)(`button`,{className:`copy-btn`,onClick:()=>Q($),children:`💠`})]}),(0,f.jsxs)(`p`,{children:[(0,f.jsx)(`strong`,{children:`Kairos/Date:`}),`\xA0`,ze,(0,f.jsx)(`button`,{className:`copy-btn`,onClick:()=>Q(ze),children:`💠`})]}),D&&(0,f.jsxs)(f.Fragment,{children:[(0,f.jsxs)(`p`,{children:[(0,f.jsx)(`strong`,{children:`Seal:`}),`\xA0`,D.eternalSeal,(0,f.jsx)(`button`,{className:`copy-btn`,onClick:()=>Q(D.eternalSeal),children:`💠`})]}),(0,f.jsxs)(`p`,{children:[(0,f.jsx)(`strong`,{children:`Day:`}),` `,D.harmonicDay]}),(0,f.jsxs)(`p`,{children:[(0,f.jsx)(`strong`,{children:`Month:`}),` `,D.eternalMonth]}),(0,f.jsxs)(`p`,{children:[(0,f.jsx)(`strong`,{children:`Arc:`}),` `,D.eternalChakraArc]}),(0,f.jsxs)(`p`,{children:[(0,f.jsx)(`strong`,{children:`Year:`}),` `,D.eternalYearName]}),(0,f.jsxs)(`p`,{children:[(0,f.jsx)(`strong`,{children:`Kai-Turah:`}),`\xA0`,D.kaiTurahPhrase,(0,f.jsx)(`button`,{className:`copy-btn`,onClick:()=>Q(D.kaiTurahPhrase),children:`💠`})]})]})]}),D&&(0,f.jsxs)(`details`,{className:`rich-data`,open:se,onToggle:e=>B(e.currentTarget.open),children:[(0,f.jsx)(`summary`,{children:`Memory`}),(0,f.jsxs)(`div`,{className:`rich-grid`,children:[(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`kaiPulseEternal`}),(0,f.jsx)(`span`,{children:D.kaiPulseEternal.toLocaleString()})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`kaiPulseToday`}),(0,f.jsx)(`span`,{children:D.kaiPulseToday})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`kairos_seal_day_month`}),(0,f.jsx)(`span`,{children:D.kairos_seal_day_month})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`chakraStepString`}),(0,f.jsx)(`span`,{children:D.chakraStepString})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`chakraStep.stepIndex`}),(0,f.jsx)(`span`,{children:D.chakraStep.stepIndex})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`chakraStep.percentIntoStep`}),(0,f.jsxs)(`span`,{children:[D.chakraStep.percentIntoStep.toFixed(2),`%`]})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`chakraBeat.beatIndex`}),(0,f.jsx)(`span`,{children:D.chakraBeat.beatIndex})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`chakraBeat.pulsesIntoBeat`}),(0,f.jsx)(`span`,{children:D.chakraBeat.pulsesIntoBeat})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`weekIndex`}),(0,f.jsx)(`span`,{children:D.weekIndex})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`weekName`}),(0,f.jsx)(`span`,{children:D.weekName})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`dayOfMonth`}),(0,f.jsx)(`span`,{children:D.dayOfMonth})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`eternalMonthIndex`}),(0,f.jsx)(`span`,{children:D.eternalMonthIndex})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`harmonicWeekProgress.percent`}),(0,f.jsxs)(`span`,{children:[D.harmonicWeekProgress.percent.toFixed(2),`%`]})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`eternalMonthProgress.percent`}),(0,f.jsxs)(`span`,{children:[D.eternalMonthProgress.percent.toFixed(2),`%`]})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`harmonicYearProgress.percent`}),(0,f.jsxs)(`span`,{children:[D.harmonicYearProgress.percent.toFixed(2),`%`]})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`code`,{children:`phiSpiralLevel`}),(0,f.jsx)(`span`,{children:D.phiSpiralLevel})]}),(0,f.jsxs)(`div`,{className:`span-2`,children:[(0,f.jsx)(`code`,{children:`kaiMomentSummary`}),(0,f.jsx)(`span`,{children:D.kaiMomentSummary})]}),(0,f.jsxs)(`div`,{className:`span-2`,children:[(0,f.jsx)(`code`,{children:`compressed_summary`}),(0,f.jsx)(`span`,{children:D.compressed_summary})]}),(0,f.jsxs)(`div`,{className:`span-2`,children:[(0,f.jsx)(`code`,{children:`eternalSeal`}),(0,f.jsx)(`span`,{className:`truncate`,children:D.eternalSeal})]})]}),(0,f.jsx)(`div`,{className:`rich-actions`,children:(0,f.jsx)(`button`,{onClick:()=>Oe(D),children:`Remember JSON`})})]}),(0,f.jsx)(`div`,{className:`modal-bottom-spacer`,"aria-hidden":`true`}),(0,f.jsx)(`div`,{className:`mint-dock`,children:(0,f.jsxs)(`button`,{className:`mint-btn`,type:`button`,"aria-label":`Mint this moment`,title:`Mint this moment`,onClick:Pe,children:[(0,f.jsx)(`span`,{className:`mint-btn__icon`,"aria-hidden":`true`,children:te?(0,f.jsx)(`img`,{src:`/assets/seal.svg`,alt:``,loading:`eager`,decoding:`async`,onError:()=>N(!1)}):(0,f.jsx)(de,{})}),(0,f.jsxs)(`span`,{className:`mint-btn__text`,children:[(0,f.jsx)(`span`,{className:`mint-btn__title`,children:`MINT ΦKey `}),(0,f.jsxs)(`span`,{className:`mint-btn__sub`,children:[`☤KAI `,s.toLocaleString()]})]})]})})]})}),(0,f.jsx)(u,{open:P,url:I,hash:re,onClose:()=>F(!1),onDownloadZip:Fe})]}),document.body)};export{J as t};