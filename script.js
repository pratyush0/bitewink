const state = {need:'',frequency:'',budget:'',products:[]};

function bindChoiceGroup(group){
  const buttons=[...document.querySelectorAll(`[data-group="${group}"] .choice-card, [data-group="${group}"] .option`)];
  buttons.forEach(btn=>btn.addEventListener('click',()=>{
    buttons.forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    state[group]=btn.dataset.value;
    const note=document.querySelector(`[data-note="${group}"]`);
    if(note) note.textContent=`Selected: ${state[group]}`;
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
}));

const form=document.getElementById('founding-form');
form.addEventListener('submit',event=>{
  event.preventDefault();
  const data=Object.fromEntries(new FormData(form).entries());
  const record={...data,preferredNeed:state.need,selectedProducts:state.products,timestamp:new Date().toISOString()};
  const existing=JSON.parse(localStorage.getItem('bitewink-validation-leads')||'[]');
  existing.push(record);
  localStorage.setItem('bitewink-validation-leads',JSON.stringify(existing));
  form.reset();
  document.getElementById('form-status').textContent='Thank you — you’re part of the early BITEWINK group. We’ll keep you posted as we shape the launch.';
});

const menuToggle=document.querySelector('.menu-toggle');
const nav=document.querySelector('.desktop-nav');
menuToggle?.addEventListener('click',()=>{
  const open=menuToggle.getAttribute('aria-expanded')==='true';
  menuToggle.setAttribute('aria-expanded',String(!open));
  nav.classList.toggle('mobile-open',!open);
});

document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{
  if(nav?.classList.contains('mobile-open')){nav.classList.remove('mobile-open');menuToggle.setAttribute('aria-expanded','false');}
}));
