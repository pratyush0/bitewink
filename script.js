// BITEWINK validation capture. Keep this endpoint aligned with the deployed Apps Script web app.
const BITEWINK_SHEETS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzVt9GHZfYUb9AJGADL13VboWLVL6op1wKheTDRIZ9-EuUaiMsje4XSO0MwaVV4-z4s/exec';
const state = {need:'',frequency:'',budget:'',products:[]};
const sessionId = getOrCreateSessionId();
let surveySendTimer = null;
let lastSurveySignature = '';

const BITEWINK_OPTIONS = {
  need: ['Breakfast','Lunch','Dinner','Snacks'],
  frequency: ['Every day','3–5 times a week','1–2 times a week','Occasionally'],
  budget: ['₹149–199','₹200–249','₹250–299','₹300–349','₹350+'],
  meal: ['Breakfast','Lunch','Dinner','Snacks'],
  products: ['Protein Oat Bowl','Power Lunch Bowl','Balanced Dinner','Smart Snack']
};

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
  const body = JSON.stringify(payload);
  if (body.length > 10000) return Promise.reject(new Error('Submission is too large.'));
  // Apps Script web apps commonly require a simple request to avoid browser CORS preflight.
  // This response is opaque; founding registrations are confirmed separately by registrationId.
  return fetch(BITEWINK_SHEETS_ENDPOINT, {
    method:'POST', mode:'no-cors', redirect:'follow', keepalive:true,
    headers:{'Content-Type':'text/plain;charset=utf-8'}, body
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
    if (!BITEWINK_OPTIONS[group]?.includes(btn.dataset.value)) return;
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
  if(!BITEWINK_OPTIONS.products.includes(product)) return;
  if(!state.products.includes(product)) state.products.push(product);
  const feedback=document.getElementById('menu-feedback');
  if(feedback) feedback.textContent=`✓ ${product} added to your “I'd try this” list.`;
  btn.textContent='✓ I’d try this';
  btn.classList.add('selected');
  queueSurveyCapture();
}));

function normalizeIndianPhone(value){
  const raw=String(value ?? '').trim();
  if (!raw || raw.length > 25 || !/^[+()\d\s-]+$/.test(raw)) return '';
  if ((raw.match(/\+/g) || []).length > 1 || (raw.includes('+') && !raw.startsWith('+'))) return '';
  const opens=(raw.match(/\(/g) || []).length;
  const closes=(raw.match(/\)/g) || []).length;
  if (opens !== closes || opens > 2 || /\(\s*\)/.test(raw)) return '';
  let digits=raw.replace(/\D/g,'');
  if (digits.length===12 && digits.startsWith('91')) digits=digits.slice(2);
  else if (digits.length===11 && digits.startsWith('0')) digits=digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return '';
  return digits;
}

function validateName(value){
  const v=String(value ?? '').trim();
  return v.length >= 2 && v.length <= 80 && /[\p{L}\p{M}]/u.test(v) && /^[\p{L}\p{M} .'-]+$/u.test(v) ? v : '';
}
function validateArea(value){
  const v=String(value ?? '').trim();
  return v.length >= 2 && v.length <= 100 && /[\p{L}\p{M}\d]/u.test(v) && /^[\p{L}\p{M}\d .,#/()-]+$/u.test(v) ? v : '';
}
function validatePageUrl(value){
  const v=String(value ?? '');
  return v.length <= 1000 && /^https?:\/\//i.test(v) ? v : '';
}

async function sha256Hex(value){
  if(!globalThis.crypto?.subtle) throw new Error('Secure phone check is unavailable in this browser.');
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function jsonpRequest(params, label){
  return new Promise((resolve,reject)=>{
    const callbackName=`bw${label}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script=document.createElement('script');
    const timeout=setTimeout(()=>finish(new Error(`${label} request timed out.`)),10000);
    function cleanup(){ clearTimeout(timeout); delete window[callbackName]; script.remove(); }
    function finish(error,result){ cleanup(); error?reject(error):resolve(result); }
    window[callbackName]=(result)=>finish(null,result);
    script.onerror=()=>finish(new Error(`${label} request failed.`));
    const query=new URLSearchParams({...params,callback:callbackName,t:String(Date.now())});
    script.src=`${BITEWINK_SHEETS_ENDPOINT}?${query.toString()}`;
    document.head.appendChild(script);
  });
}

async function checkExistingPhone(phoneHash){
  const result=await jsonpRequest({action:'checkPhone',phoneHash},'PhoneCheck');
  if(!result || result.ok !== true) throw new Error('Phone check could not be completed.');
  return result.exists === true;
}

async function confirmRegistrationSaved(registrationId){
  // no-cors POST responses are unreadable; verify the exact registration ID through JSONP.
  const delays=[500,1000,1800,2500];
  for(let i=0;i<delays.length;i++){
    await new Promise(resolve=>setTimeout(resolve,delays[i]));
    const result=await jsonpRequest({action:'checkRegistration',registrationId},'RegistrationCheck');
    if(result && result.ok === true && result.exists === true) return true;
  }
  return false;
}

const form=document.getElementById('founding-form');
// Honeypot field: positioned off-screen so real visitors don't see or tab into it.
let honeypot=form.querySelector('[name="website"]');
if(form && !honeypot){
  honeypot=document.createElement('input');
  honeypot.type='text';
  honeypot.name='website';
  honeypot.autocomplete='off';
  honeypot.tabIndex=-1;
  honeypot.setAttribute('aria-hidden','true');
  honeypot.setAttribute('aria-label','Leave this field empty');
  Object.assign(honeypot.style,{position:'absolute',left:'-10000px',top:'auto',width:'1px',height:'1px',overflow:'hidden'});
  form.appendChild(honeypot);
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const submitButton=form.querySelector('[type="submit"]');
  const status=document.getElementById('form-status');
  const data=Object.fromEntries(new FormData(form).entries());
  // Don't send honeypot-filled submissions from the browser. The server also checks it.
  if(String(data.website || '').trim() !== ''){ status.textContent='Please try submitting the form again.'; return; }
  const consentControl=form.elements.namedItem('whatsappUpdatesConsent');
  const whatsappConsentChecked=Boolean(consentControl && consentControl.type==='checkbox' && consentControl.checked===true);
  const name=validateName(data.name);
  const phone=normalizeIndianPhone(data.phone);
  const area=validateArea(data.area);
  const meal=String(data.meal||'').trim();
  const frequency=String(data.frequency||'').trim();
  const budget=String(data.budget||'').trim();

  if(!name){ status.textContent='Please enter a valid name (2–80 characters; letters, spaces, apostrophes, periods and hyphens).'; form.elements.namedItem('name')?.focus(); return; }
  if(!phone){ status.textContent='Please enter a valid 10-digit Indian mobile number, optionally with +91.'; form.elements.namedItem('phone')?.focus(); return; }
  if(!area){ status.textContent='Please enter a valid area or PIN code (2–100 characters).'; form.elements.namedItem('area')?.focus(); return; }
  if(!BITEWINK_OPTIONS.meal.includes(meal)){ status.textContent='Please select a valid meal preference.'; return; }
  if(!BITEWINK_OPTIONS.frequency.includes(frequency)){ status.textContent='Please select a valid ordering frequency.'; return; }
  if(!BITEWINK_OPTIONS.budget.includes(budget)){ status.textContent='Please select a valid budget.'; return; }
  if(state.need && !BITEWINK_OPTIONS.need.includes(state.need)){ status.textContent='Please refresh the page and try again.'; return; }
  if(state.products.length > 4 || state.products.some(p=>!BITEWINK_OPTIONS.products.includes(p))){ status.textContent='Please refresh the page and try again.'; return; }

  const registrationId=(crypto.randomUUID ? crypto.randomUUID() : `reg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const submittedAt=new Date().toISOString();
  const record={
    action:'founding', registrationId, sessionId, name, phone, area, meal, frequency, budget,
    preferredNeed:state.need, selectedProducts:[...state.products],
    whatsappUpdatesConsent:whatsappConsentChecked,
    consentRecordedAt:whatsappConsentChecked ? submittedAt : '',
    pageUrl:validatePageUrl(location.href), submittedAt, website:String(data.website || '')
  };
  submitButton.disabled=true;
  status.textContent='Checking your details…';
  try{
    const phoneHash=await sha256Hex(phone);
    const alreadyRegistered=await checkExistingPhone(phoneHash);
    if(alreadyRegistered){ status.textContent='This phone number is already registered for BITEWINK Founding 100.'; return; }
    status.textContent='Sending your response…';
    await sendToSheets(record);
    const saved=await confirmRegistrationSaved(registrationId);
    if(!saved){
      status.textContent='We couldn’t confirm that your registration was saved. Please wait a moment and check before trying again.';
      return;
    }
    form.reset();
    status.textContent='Thank you — your registration has been saved. We’ll keep you posted as we shape the launch.';
  }catch(error){
    status.textContent='We couldn’t verify or save your response just now. Please try again in a moment.';
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
