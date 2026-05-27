// No auto-redirect: login page is always accessible regardless of session

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',(i===0)===(tab==='login')));
  document.getElementById('panel-login').classList.toggle('active',tab==='login');
  document.getElementById('panel-register').classList.toggle('active',tab==='register');
  clearAlert();
}
function showAlert(msg,type='error'){
  const el=document.getElementById('alert');
  el.textContent=msg; el.className='alert '+type;
  el.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function clearAlert(){const el=document.getElementById('alert');el.className='alert';el.textContent='';}
function togglePass(id,btn){
  const inp=document.getElementById(id);
  const p=inp.type==='password';
  inp.type=p?'text':'password';
  btn.querySelector('i').className=p?'fa fa-eye-slash':'fa fa-eye';
}
function setLoading(p,v){
  document.getElementById(`${p}-spinner`).style.display=v?'block':'none';
  document.getElementById(`${p}-btn`).disabled=v;
}

async function doLogin(){
  clearAlert();
  const login=document.getElementById('l-login').value.trim();
  const clave=document.getElementById('l-clave').value;
  if(!login||!clave) return showAlert('Completa todos los campos');
  setLoading('l',true);
  try{
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,clave})});
    const d=await r.json();
    if(!r.ok) return showAlert(d.error||'Error al iniciar sesión');
    localStorage.setItem('token',d.token);
    localStorage.setItem('correo',d.correo);
    localStorage.setItem('nombre',d.nombre||'');
    localStorage.setItem('apellido',d.apellido||'');
    localStorage.setItem('isAdmin',d.isAdmin?'1':'0');
    showAlert('Bienvenido! Ingresando...','success');
    setTimeout(()=>window.location.href='/main',700);
  }catch{showAlert('Error de conexión');}
  finally{setLoading('l',false);}
}

async function doRegister(){
  clearAlert();
  const nombre=document.getElementById('r-nombre').value.trim();
  const apellido=document.getElementById('r-apellido').value.trim();
  const correo=document.getElementById('r-correo').value.trim();
  const celular=document.getElementById('r-celular').value.trim();
  const dni=document.getElementById('r-dni').value.trim();
  const clave=document.getElementById('r-clave').value;
  const clave2=document.getElementById('r-clave2').value;
  if(!nombre||!apellido||!correo||!celular||!dni||!clave||!clave2) return showAlert('Completa todos los campos');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return showAlert('Formato de correo inválido');
  if(clave.length<6) return showAlert('La clave debe tener al menos 6 caracteres');
  if(clave!==clave2) return showAlert('Las claves no coinciden');
  setLoading('r',true);
  try{
    const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre,apellido,correo,celular,dni,clave})});
    const d=await r.json();
    if(!r.ok) return showAlert(d.error||'Error al crear cuenta');
    localStorage.setItem('token',d.token);
    localStorage.setItem('correo',d.correo);
    localStorage.setItem('nombre',d.nombre||'');
    localStorage.setItem('apellido',d.apellido||'');
    localStorage.setItem('isAdmin','0');
    showAlert('Cuenta creada! Ingresando...','success');
    setTimeout(()=>window.location.href='/main',800);
  }catch{showAlert('Error de conexión');}
  finally{setLoading('r',false);}
}

document.addEventListener('keydown',e=>{
  if(e.key!=='Enter') return;
  document.getElementById('panel-login').classList.contains('active')?doLogin():doRegister();
});
