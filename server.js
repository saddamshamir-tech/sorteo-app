require('dotenv').config();
const express  = require('express');
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'rifon_secret_2024';
const ADMIN_EMAIL = 'saddam.shamir@gmail.com';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ── DB INIT ────────────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id         SERIAL PRIMARY KEY,
      nombre     VARCHAR(100) NOT NULL DEFAULT '',
      apellido   VARCHAR(100) NOT NULL DEFAULT '',
      correo     VARCHAR(255) UNIQUE NOT NULL,
      celular    VARCHAR(30)  NOT NULL,
      dni        VARCHAR(50)  UNIQUE NOT NULL,
      clave_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sorteos (
      id            SERIAL PRIMARY KEY,
      numero_sorteo INTEGER UNIQUE NOT NULL,
      fecha         DATE NOT NULL,
      hora_sorteo   TIME NOT NULL,
      estado        VARCHAR(20) DEFAULT 'activo',
      created_at    TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id                    SERIAL PRIMARY KEY,
      usuario_id            INTEGER REFERENCES usuarios(id),
      sorteo_id             INTEGER REFERENCES sorteos(id),
      numero_sorteo         INTEGER NOT NULL,
      numeros_seleccionados JSONB NOT NULL,
      total_apuesta         DECIMAL(10,2),
      estado                VARCHAR(20) DEFAULT 'pendiente',
      nombre_usuario        VARCHAR(200),
      correo_usuario        VARCHAR(255),
      celular_usuario       VARCHAR(30),
      es_gratis             BOOLEAN DEFAULT FALSE,
      created_at            TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS numeros_sorteo (
      id             SERIAL PRIMARY KEY,
      sorteo_id      INTEGER REFERENCES sorteos(id),
      numero         INTEGER NOT NULL,
      cantidad_total DECIMAL(10,2) DEFAULT 0,
      UNIQUE(sorteo_id, numero)
    );
    CREATE TABLE IF NOT EXISTS jugadas_gratis (
      id         SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      fecha      DATE NOT NULL,
      sorteo_id  INTEGER REFERENCES sorteos(id),
      UNIQUE(usuario_id, fecha)
    );
    CREATE TABLE IF NOT EXISTS configuracion (
      clave  VARCHAR(100) PRIMARY KEY,
      valor  VARCHAR(255) NOT NULL
    );
    INSERT INTO configuracion(clave,valor) VALUES('free_play_enabled','true')
      ON CONFLICT(clave) DO NOTHING;
  `);

  // Migrations
  const migrations = [
    `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre   VARCHAR(100) NOT NULL DEFAULT ''`,
    `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS apellido VARCHAR(100) NOT NULL DEFAULT ''`,
    `ALTER TABLE tickets  ADD COLUMN IF NOT EXISTS nombre_usuario  VARCHAR(200)`,
    `ALTER TABLE tickets  ADD COLUMN IF NOT EXISTS correo_usuario  VARCHAR(255)`,
    `ALTER TABLE tickets  ADD COLUMN IF NOT EXISTS celular_usuario VARCHAR(30)`,
    `ALTER TABLE tickets  ADD COLUMN IF NOT EXISTS es_gratis BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dni VARCHAR(50)`,
    `CREATE TABLE IF NOT EXISTS configuracion (clave VARCHAR(100) PRIMARY KEY, valor VARCHAR(255) NOT NULL)`,
  ];
  for (const m of migrations) { try { await pool.query(m); } catch(e){} }
  try {
    await pool.query(`INSERT INTO configuracion(clave,valor) VALUES('free_play_enabled','true') ON CONFLICT(clave) DO NOTHING`);
  } catch(e){}
  console.log('DB lista');
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
function getHNTime() {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset()*60000 - 6*3600000);
}
function toDateStr(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().split('T')[0];
  return String(v).split('T')[0];
}
function toTimeStr(v) { return v ? String(v).substring(0,8) : ''; }

function getDrawState(isAdmin = false) {
  if (isAdmin) {
    // Admin always sees the current/next sorteo as open
    const hn = getHNTime();
    const totalMin = hn.getHours()*60 + hn.getMinutes();
    const DRAWS = [
      { hora:'11:00:00', label:'11:00 AM', min:660  },
      { hora:'14:00:00', label:'2:00 PM',  min:840  },
      { hora:'21:00:00', label:'9:00 PM',  min:1260 }
    ];
    const pad = n => String(n).padStart(2,'0');
    const fechaHoy = `${hn.getFullYear()}-${pad(hn.getMonth()+1)}-${pad(hn.getDate())}`;
    for (const d of DRAWS) {
      if (totalMin < d.min + 5) return { isLocked:false, isClosedDay:false, draw:d, fecha:fechaHoy };
    }
    const tom = new Date(hn); tom.setDate(tom.getDate()+1);
    return { isLocked:false, isClosedDay:false, draw:DRAWS[0],
      fecha:`${tom.getFullYear()}-${pad(tom.getMonth()+1)}-${pad(tom.getDate())}` };
  }

  // Normal user logic
  const hn = getHNTime();
  const totalMin = hn.getHours()*60 + hn.getMinutes();
  const DRAWS = [
    { hora:'11:00:00', label:'11:00 AM', min:660  },
    { hora:'14:00:00', label:'2:00 PM',  min:840  },
    { hora:'21:00:00', label:'9:00 PM',  min:1260 }
  ];
  const pad = n => String(n).padStart(2,'0');
  const fechaHoy = `${hn.getFullYear()}-${pad(hn.getMonth()+1)}-${pad(hn.getDate())}`;
  for (const d of DRAWS) {
    const diff = totalMin - d.min;
    if (diff >= -15 && diff < 5) return { isLocked:true,  isClosedDay:false, draw:d, fecha:fechaHoy };
    if (diff < -15)              return { isLocked:false, isClosedDay:false, draw:d, fecha:fechaHoy };
  }
  const tom = new Date(hn); tom.setDate(tom.getDate()+1);
  return { isLocked:true, isClosedDay:true, draw:DRAWS[0],
    fecha:`${tom.getFullYear()}-${pad(tom.getMonth()+1)}-${pad(tom.getDate())}` };
}

async function getOrCreateSorteo(fecha, hora) {
  const ex = await pool.query('SELECT * FROM sorteos WHERE fecha=$1 AND hora_sorteo=$2',[fecha,hora]);
  if (ex.rows.length) return ex.rows[0];
  const mx = await pool.query('SELECT COALESCE(MAX(numero_sorteo),0) AS m FROM sorteos');
  const n  = Number(mx.rows[0].m)+1;
  const ins = await pool.query('INSERT INTO sorteos(numero_sorteo,fecha,hora_sorteo) VALUES($1,$2,$3) RETURNING *',[n,fecha,hora]);
  return ins.rows[0];
}

async function getFreePlayEnabled() {
  try {
    const r = await pool.query("SELECT valor FROM configuracion WHERE clave='free_play_enabled'");
    return r.rows.length ? r.rows[0].valor === 'true' : true;
  } catch(e) { return true; }
}

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
function auth(req, res, next) {
  const t = req.headers.authorization?.split(' ')[1];
  if (!t) return res.status(401).json({error:'No autorizado'});
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { res.status(401).json({error:'Sesión expirada'}); }
}
function adminAuth(req, res, next) {
  const t = req.headers.authorization?.split(' ')[1];
  if (!t) return res.status(401).json({error:'No autorizado'});
  try {
    const u = jwt.verify(t, JWT_SECRET);
    if (u.correo !== ADMIN_EMAIL) return res.status(403).json({error:'Acceso denegado'});
    req.user = u; next();
  } catch { res.status(401).json({error:'Sesión expirada'}); }
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { nombre, apellido, correo, celular, dni, clave } = req.body;
    if (!nombre||!apellido||!correo||!celular||!dni||!clave)
      return res.status(400).json({error:'Todos los campos son obligatorios'});
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
      return res.status(400).json({error:'Formato de correo inválido'});
    if (clave.length < 6)
      return res.status(400).json({error:'La clave debe tener al menos 6 caracteres'});

    // Duplicate check: correo AND dni
    const dupCorreo = await pool.query('SELECT id FROM usuarios WHERE correo=$1',[correo.toLowerCase()]);
    if (dupCorreo.rows.length) return res.status(400).json({error:'Este correo ya está registrado'});

    const dupDni = await pool.query('SELECT id FROM usuarios WHERE dni=$1',[dni.trim()]);
    if (dupDni.rows.length) return res.status(400).json({error:'Este número de identidad (DNI) ya está registrado'});

    const hash = await bcrypt.hash(clave, 10);
    const ins  = await pool.query(
      'INSERT INTO usuarios(nombre,apellido,correo,celular,dni,clave_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,correo,nombre,apellido,celular',
      [nombre.trim(), apellido.trim(), correo.toLowerCase(), celular.trim(), dni.trim(), hash]
    );
    const u     = ins.rows[0];
    const token = jwt.sign({id:u.id,correo:u.correo,nombre:u.nombre,apellido:u.apellido,celular:u.celular},JWT_SECRET,{expiresIn:'24h'});
    res.json({token, correo:u.correo, nombre:u.nombre, apellido:u.apellido, isAdmin: u.correo===ADMIN_EMAIL});
  } catch(e) { console.error(e); res.status(500).json({error:'Error del servidor'}); }
});

// ── LOGIN (correo OR celular) ─────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { login, clave } = req.body;   // "login" = correo or celular
    if (!login||!clave) return res.status(400).json({error:'Usuario y clave son requeridos'});

    // Determine if it's an email or phone
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login.trim());
    let r;
    if (isEmail) {
      r = await pool.query('SELECT * FROM usuarios WHERE correo=$1',[login.trim().toLowerCase()]);
    } else {
      r = await pool.query('SELECT * FROM usuarios WHERE celular=$1',[login.trim()]);
    }

    if (!r.rows.length) return res.status(400).json({error:'Usuario o clave incorrectos'});
    const u = r.rows[0];
    if (!await bcrypt.compare(clave, u.clave_hash))
      return res.status(400).json({error:'Usuario o clave incorrectos'});

    const token = jwt.sign(
      {id:u.id, correo:u.correo, nombre:u.nombre, apellido:u.apellido, celular:u.celular},
      JWT_SECRET, {expiresIn:'24h'}
    );
    res.json({token, correo:u.correo, nombre:u.nombre, apellido:u.apellido, isAdmin:u.correo===ADMIN_EMAIL});
  } catch(e) { console.error(e); res.status(500).json({error:'Error del servidor'}); }
});

// ── DRAW CURRENT ──────────────────────────────────────────────────────────────
app.get('/api/draw/current', auth, async (req, res) => {
  try {
    const isAdminUser = req.user.correo === ADMIN_EMAIL;
    const state  = getDrawState(isAdminUser);
    const sorteo = await getOrCreateSorteo(state.fecha, state.draw.hora);

    const numRes = await pool.query('SELECT numero,cantidad_total FROM numeros_sorteo WHERE sorteo_id=$1',[sorteo.id]);
    const numbersStatus = {};
    numRes.rows.forEach(r => { numbersStatus[Number(r.numero)] = parseFloat(r.cantidad_total); });

    const fechaHoy    = toDateStr(getHNTime());
    const fp          = await pool.query('SELECT id FROM jugadas_gratis WHERE usuario_id=$1 AND fecha=$2',[req.user.id, fechaHoy]);
    const freePlayUsed = fp.rows.length > 0;
    const freePlayEnabled = await getFreePlayEnabled();

    res.json({
      sorteo: { ...sorteo, fecha:toDateStr(sorteo.fecha), hora_sorteo:toTimeStr(sorteo.hora_sorteo) },
      isLocked: state.isLocked,
      isClosedDay: state.isClosedDay||false,
      drawLabel: state.draw.label,
      numbersStatus,
      freePlayUsed,
      freePlayEnabled,
      isAdminUser,
      serverTime: getHNTime().toISOString()
    });
  } catch(e) { console.error(e); res.status(500).json({error:'Error al obtener sorteo'}); }
});

// ── SUBMIT TICKET (no image) ──────────────────────────────────────────────────
app.post('/api/ticket', auth, async (req, res) => {
  try {
    const { sorteo_id, numeros, es_gratis } = req.body;
    const isGratis    = es_gratis === 'true' || es_gratis === true;
    const isAdminUser = req.user.correo === ADMIN_EMAIL;

    // numeros arrives as JS array (JSON body) or string (legacy)
    let numerosData;
    if (Array.isArray(numeros)) {
      numerosData = numeros;
    } else {
      try { numerosData = JSON.parse(numeros); } catch(e) { return res.status(400).json({error:'Datos invalidos'}); }
    }
    if (!numerosData || !numerosData.length) return res.status(400).json({error:'Selecciona al menos un numero'});

    const state = getDrawState(isAdminUser);
    if (state.isLocked) return res.status(400).json({error:'Sorteo bloqueado temporalmente'});

    if (isGratis) {
      const freePlayEnabled = await getFreePlayEnabled();
      if (!freePlayEnabled) return res.status(400).json({error:'La jugada gratis está deshabilitada por el administrador'});
      if (numerosData.length > 1) return res.status(400).json({error:'La jugada gratis solo permite 1 número'});
      if (Number(numerosData[0].cantidad) > 10) return res.status(400).json({error:'La jugada gratis tiene un máximo de L.10'});
      const fechaHoy = toDateStr(getHNTime());
      const fp = await pool.query('SELECT id FROM jugadas_gratis WHERE usuario_id=$1 AND fecha=$2',[req.user.id,fechaHoy]);
      if (fp.rows.length) return res.status(400).json({error:'Ya usaste tu jugada gratis de hoy'});
    }

    const sorteoRes = await pool.query('SELECT * FROM sorteos WHERE id=$1',[sorteo_id]);
    if (!sorteoRes.rows.length) return res.status(400).json({error:'Sorteo no encontrado'});
    const sorteo = sorteoRes.rows[0];

    for (const item of numerosData) {
      const num = Number(item.numero), cant = Number(item.cantidad);
      if (num<0||num>99) return res.status(400).json({error:`Número ${num} inválido (0-99)`});
      if (cant<5||cant>300||cant%5!==0) return res.status(400).json({error:`Cantidad ${cant} inválida (5-300, múltiplos de 5)`});
      const cap = await pool.query('SELECT cantidad_total FROM numeros_sorteo WHERE sorteo_id=$1 AND numero=$2',[sorteo_id,num]);
      const used = cap.rows.length ? parseFloat(cap.rows[0].cantidad_total) : 0;
      if (used+cant>300) return res.status(400).json({error:`Número ${num} sin cupo (disponible: ${300-used})`});
    }

    const totalApuesta    = numerosData.reduce((s,i)=>s+Number(i.cantidad),0);
    const nombreCompleto  = `${req.user.nombre||''} ${req.user.apellido||''}`.trim()||req.user.correo;

    const ins = await pool.query(
      `INSERT INTO tickets(usuario_id,sorteo_id,numero_sorteo,numeros_seleccionados,total_apuesta,nombre_usuario,correo_usuario,celular_usuario,es_gratis)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.user.id, sorteo_id, sorteo.numero_sorteo, JSON.stringify(numerosData),
       totalApuesta, nombreCompleto, req.user.correo, req.user.celular||'', isGratis]
    );
    const ticketId = ins.rows[0].id;

    if (isGratis) {
      const fechaHoy = toDateStr(getHNTime());
      await pool.query('INSERT INTO jugadas_gratis(usuario_id,fecha,sorteo_id) VALUES($1,$2,$3)',[req.user.id,fechaHoy,sorteo_id]);
    }

    for (const item of numerosData) {
      await pool.query(
        `INSERT INTO numeros_sorteo(sorteo_id,numero,cantidad_total) VALUES($1,$2,$3)
         ON CONFLICT(sorteo_id,numero) DO UPDATE SET cantidad_total=numeros_sorteo.cantidad_total+$3`,
        [sorteo_id, Number(item.numero), Number(item.cantidad)]
      );
    }

    res.json({
      success:true, ticketId,
      ticketInfo:{
        ticketId, sorteo:sorteo.numero_sorteo,
        fecha:toDateStr(sorteo.fecha), hora:toTimeStr(sorteo.hora_sorteo),
        usuario:req.user.correo, nombreCompleto,
        celular: req.user.celular||'',
        numeros: numerosData.map(i=>({numero:i.numero,cantidad:Number(i.cantidad),premio:Number(i.cantidad)*70})),
        totalApuesta, esGratis:isGratis
      }
    });
  } catch(e) { console.error(e); res.status(500).json({error:'Error al guardar ticket'}); }
});

// ── ADMIN: TICKETS ────────────────────────────────────────────────────────────
app.get('/api/admin/tickets', adminAuth, async (req, res) => {
  try {
    const { numero_sorteo, ticket_id, fecha, nombre, correo } = req.query;
    let where = [], params = [], i = 1;

    // Default: today if no filters
    const hasFilter = numero_sorteo||ticket_id||fecha||nombre||correo;
    if (!hasFilter) {
      const hn  = getHNTime();
      const hoy = `${hn.getFullYear()}-${String(hn.getMonth()+1).padStart(2,'0')}-${String(hn.getDate()).padStart(2,'0')}`;
      where.push(`s.fecha=$${i++}`); params.push(hoy);
    } else {
      if (numero_sorteo) { where.push(`t.numero_sorteo=$${i++}`);         params.push(Number(numero_sorteo)); }
      if (ticket_id)     { where.push(`t.id=$${i++}`);                    params.push(Number(ticket_id)); }
      if (fecha)         { where.push(`s.fecha=$${i++}`);                  params.push(fecha); }
      if (nombre)        { where.push(`LOWER(t.nombre_usuario) LIKE $${i++}`); params.push(`%${nombre.toLowerCase()}%`); }
      if (correo)        { where.push(`LOWER(t.correo_usuario) LIKE $${i++}`); params.push(`%${correo.toLowerCase()}%`); }
    }

    const ws = where.length ? 'WHERE '+where.join(' AND ') : '';
    const r  = await pool.query(
      `SELECT t.id, t.numero_sorteo, t.numeros_seleccionados, t.total_apuesta,
              t.estado, t.es_gratis, t.created_at, t.nombre_usuario,
              t.correo_usuario, t.celular_usuario, s.fecha, s.hora_sorteo
       FROM tickets t JOIN sorteos s ON t.sorteo_id=s.id
       ${ws} ORDER BY t.created_at DESC LIMIT 500`, params
    );
    res.json(r.rows.map(row=>({...row, fecha:toDateStr(row.fecha), hora_sorteo:toTimeStr(row.hora_sorteo)})));
  } catch(e) { console.error(e); res.status(500).json({error:'Error'}); }
});

// ── ADMIN: USERS ──────────────────────────────────────────────────────────────
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id,nombre,apellido,correo,celular,dni,created_at
       FROM usuarios ORDER BY created_at DESC LIMIT 500`
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({error:'Error'}); }
});

// ── ADMIN: STATS ──────────────────────────────────────────────────────────────
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const hn    = getHNTime();
    const today = `${hn.getFullYear()}-${String(hn.getMonth()+1).padStart(2,'0')}-${String(hn.getDate()).padStart(2,'0')}`;
    const [th,tu,tt,tr,fp] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM tickets t JOIN sorteos s ON t.sorteo_id=s.id WHERE s.fecha=$1`,[today]),
      pool.query(`SELECT COUNT(*) FROM usuarios`),
      pool.query(`SELECT COUNT(*) FROM tickets`),
      pool.query(`SELECT COALESCE(SUM(total_apuesta),0) FROM tickets WHERE es_gratis=FALSE`),
      pool.query(`SELECT valor FROM configuracion WHERE clave='free_play_enabled'`)
    ]);
    res.json({
      ticketsHoy:     +th.rows[0].count,
      totalUsuarios:  +tu.rows[0].count,
      totalTickets:   +tt.rows[0].count,
      totalRecaudado: parseFloat(tr.rows[0].coalesce),
      freePlayEnabled: fp.rows.length ? fp.rows[0].valor==='true' : true
    });
  } catch(e) { res.status(500).json({error:'Error'}); }
});

// ── ADMIN: TOGGLE FREE PLAY ───────────────────────────────────────────────────
app.post('/api/admin/free-play', adminAuth, async (req, res) => {
  try {
    const { enabled } = req.body;
    const val = enabled ? 'true' : 'false';
    await pool.query(`INSERT INTO configuracion(clave,valor) VALUES('free_play_enabled',$1)
      ON CONFLICT(clave) DO UPDATE SET valor=$1`,[val]);
    res.json({ freePlayEnabled: enabled });
  } catch(e) { res.status(500).json({error:'Error'}); }
});

// ── PAGES ─────────────────────────────────────────────────────────────────────
app.get('/api/health',(req,res)=>res.json({ok:true}));
app.get('/',     (req,res)=>res.sendFile(__dirname+'/public/index.html'));
app.get('/main', (req,res)=>res.sendFile(__dirname+'/public/main.html'));
app.get('/admin',(req,res)=>res.sendFile(__dirname+'/public/admin.html'));

initDB().then(()=>{ app.listen(PORT,'0.0.0.0',()=>console.log(`RIFON en puerto ${PORT}`)); })
  .catch(e=>{ console.error(e); process.exit(1); });
