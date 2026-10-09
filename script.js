// BITEWINK validation capture. Paste your deployed Google Apps Script URL below.
const BITEWINK_SHEETS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzVt9GHZfYUb9AJGADL13VboWLVL6op1wKheTDRIZ9-EuUaiMsje4XSO0MwaVV4-z4s/exec';
const state = {need:'',frequency:'',budget:'',products:[]};
const sessionId = getOrCreateSessionId();
let surveySendTimer = null;
let lastSurveySignature = '';

function getOrCreateSessionId(){
  const key='bitewink-validation-session-id';
  try {
    let id=localStorage.getItem(key);
    if(!id){ id=(crypto.randomUUID ? crypto.randomUUID() : `bw-${Date.now()}-${Math.random().toString(36).slice(2)}`); localStorage.setItem(key,id); }
    return id;
  } catch { return `bw-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function sendToSheets(payload){
  if(!BITEWINK_SHEETS_ENDPOINT || BITEWINK_SHEETS_ENDPOINT.includes('PASTE_GOOGLE_APPS_SCRIPT')){
    console.warn('BITEWINK Google Sheets endpoint is not configured. No centralized response was sent.');
    return Promise.reject(new Error('Response capture is not configured yet.'));
  }
  // Apps Script web apps commonly require a simple request to avoid browser CORS preflight.
  return fetch(BITEWINK_SHEETS_ENDPOINT, {
    method:'POST', mode:'no-cors', redirect:'follow', keepalive:true,
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(payload)
  });
}

function currentSurvey(){
  return {
    action:'survey', sessionId,
    preferredNeed:state.need,
    frequency:state.frequency,
    budget:state.budget,
    selectedProducts:[...state.products],
    pageUrl:location.href,
    userAgent:navigator.userAgent,
    updatedAt:new Date().toISOString()
  };
}

function queueSurveyCapture(){
  const payload=currentSurvey();
  if(!payload.preferredNeed && !payload.frequency && !payload.budget && payload.selectedProducts.length===0) return;
  const signature=JSON.stringify(payload);
  if(signature===lastSurveySignature) return;
  clearTimeout(surveySendTimer);
  surveySendTimer=setTimeout(()=>{
    lastSurveySignature=signature;
    sendToSheets(payload).catch(err=>{
      lastSurveySignature='';
      console.error('BITEWINK survey capture failed to send.',err);
    });
  },350);
}

function bindChoiceGroup(group){
  const buttons=[...document.querySelectorAll(`[data-group="${group}"] .choice-card, [data-group="${group}"] .option`)];
  buttons.forEach(btn=>btn.addEventListener('click',()=>{
    buttons.forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    state[group]=btn.dataset.value;
    const note=document.querySelector(`[data-note="${group}"]`);
    if(note) note.textContent=`Selected: ${state[group]}`;
    queueSurveyCapture();
  }));
}
['need','frequency','budget'].forEach(bindChoiceGroup);

document.querySelectorAll('.try-btn').forEach(btn=>btn.addEventListener('click',()=>{
  const product=btn.dataset.product;
  if(!state.products.includes(product)) state.products.push(product);
  const feedback=document.getElementById('menu-feedback');
  feedback.textContent=`✓ ${product} added to your “I'd try this” list.`;
  btn.textContent='✓ I’d try this';
  btn.classList.add('selected');
  queueSurveyCapture();
}));

// Check the phone number against existing Founding 100 registrations before POSTing.
// The browser sends only a SHA-256 hash in the JSONP URL, not the phone number itself.
function normalizePhoneForCheck(value){
  let digits=String(value||'').replace(/\D/g,'');
  if(digits.length===12 && digits.startsWith('91')) digits=digits.slice(2);
  if(digits.length===11 && digits.startsWith('0')) digits=digits.slice(1);
  return digits;
}

async function sha256Hex(value){
  if(!globalThis.crypto?.subtle) throw new Error('Secure phone check is unavailable in this browser.');
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function checkExistingPhone(phoneHash){
  return new Promise((resolve,reject)=>{
    const callbackName=`bwPhoneCheck_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script=document.createElement('script');
    const timeout=setTimeout(()=>finish(new Error('Phone check timed out. Please try again.')),10000);
    function cleanup(){
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
    function finish(error,result){cleanup(); error?reject(error):resolve(result);}
    window[callbackName]=(result)=>finish(null,!!(result && result.ok && result.exists));
    script.onerror=()=>finish(new Error('Could not check this phone number. Please try again.'));
    script.src=`${BITEWINK_SHEETS_ENDPOINT}?action=checkPhone&phoneHash=${encodeURIComponent(phoneHash)}&callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`;
    document.head.appendChild(script);
  });
}

const form=document.getElementById('founding-form');
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const submitButton=form.querySelector('[type="submit"]');
  const status=document.getElementById('form-status');
  const data=Object.fromEntries(new FormData(form).entries());
  // Read the live checkbox property directly. Mobile browsers can expose stale or
  // missing checkbox values through serialized form data in some interaction flows.
  const consentControl = form.elements.namedItem('whatsappUpdatesConsent');
  const whatsappConsentChecked = Boolean(
    consentControl && consentControl.type === 'checkbox' && consentControl.checked === true
  );
  const record={
    action:'founding', registrationId:(crypto.randomUUID ? crypto.randomUUID() : `reg-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    sessionId, name:String(data.name||'').trim(), phone:String(data.phone||'').trim(),
    area:String(data.area||'').trim(), meal:String(data.meal||''),
    frequency:String(data.frequency||''), budget:String(data.budget||''),
    preferredNeed:state.need, selectedProducts:[...state.products],
    whatsappUpdatesConsent:whatsappConsentChecked,
    consentRecordedAt:whatsappConsentChecked ? new Date().toISOString() : '',
    pageUrl:location.href, submittedAt:new Date().toISOString()
  };
  submitButton.disabled=true;
  status.textContent='Sending your response…';
  try{
    const normalizedPhone=normalizePhoneForCheck(record.phone);
    const phoneHash=await sha256Hex(normalizedPhone);
    const alreadyRegistered=await checkExistingPhone(phoneHash);
    if(alreadyRegistered){
      status.textContent='This phone number is already registered for BITEWINK Founding 100.';
      return;
    }
    await sendToSheets(record);
    form.reset();
    status.textContent='Thank you — your response has been sent. We’ll keep you posted as we shape the launch.';
  }catch(error){
    status.textContent='We couldn’t verify or send your response just now. Please try again in a moment.';
    console.error('BITEWINK registration capture failed.',error);
  }finally{
    submitButton.disabled=false;
  }
});

const menuToggle=document.querySelector('.menu-toggle');
const nav=document.querySelector('.desktop-nav');
const mobileMenu=document.querySelector('#mobile-menu');
function setMobileMenu(open){
  if(!mobileMenu || !menuToggle) return;
  menuToggle.setAttribute('aria-expanded',String(open));
  mobileMenu.classList.toggle('mobile-open',open);
  mobileMenu.setAttribute('aria-hidden',String(!open));
  menuToggle.textContent=open?'×':'☰';
}
menuToggle?.addEventListener('click',()=>{
  const open=menuToggle.getAttribute('aria-expanded')==='true';
  setMobileMenu(!open);
});
mobileMenu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setMobileMenu(false)));
document.addEventListener('click',event=>{
  if(!mobileMenu || !menuToggle) return;
  if(!mobileMenu.contains(event.target) && !menuToggle.contains(event.target)) setMobileMenu(false);
});
document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{
  if(nav?.classList.contains('mobile-open')){nav.classList.remove('mobile-open');menuToggle.setAttribute('aria-expanded','false');}
}));
