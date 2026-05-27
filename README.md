# 🎰 Sorteos Diarios HN

Aplicación web completa para gestionar sorteos diarios con 3 rondas al día.

---

## 🚀 GUÍA DE DESPLIEGUE EN RENDER (GRATIS) — PASO A PASO

### PASO 1 – Crea una cuenta en GitHub

1. Ve a **https://github.com** y crea una cuenta gratuita si no tienes.
2. Inicia sesión.

---

### PASO 2 – Sube el proyecto a GitHub

1. Haz clic en el botón **"+"** (arriba a la derecha) → **"New repository"**
2. Nombre: `sorteos-diarios-hn`
3. Visibilidad: **Private** (recomendado)
4. Haz clic en **"Create repository"**
5. En tu computadora, abre la carpeta del proyecto y sigue estos comandos en terminal:

```bash
cd sorteo-app
git init
git add .
git commit -m "Primer commit - Sorteos Diarios HN"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/sorteos-diarios-hn.git
git push -u origin main
```

---

### PASO 3 – Crea una cuenta en Render

1. Ve a **https://render.com** y regístrate con tu cuenta de GitHub.
2. Confirma tu email.

---

### PASO 4 – Crea la base de datos PostgreSQL en Render

1. En el dashboard de Render, haz clic en **"New +"** → **"PostgreSQL"**
2. Llena los datos:
   - **Name:** `sorteos-db`
   - **Database:** `sorteoshn`
   - **User:** `sorteos_user`
   - **Region:** Ohio (US East) o la más cercana
   - **Plan:** `Free`
3. Haz clic en **"Create Database"**
4. Espera ~2 minutos hasta que el estado diga **"Available"**
5. Copia el valor de **"Internal Database URL"** (lo necesitarás en el paso 5)

---

### PASO 5 – Crea el Web Service en Render

1. En Render, haz clic en **"New +"** → **"Web Service"**
2. Conecta tu repositorio de GitHub (`sorteos-diarios-hn`)
3. Llena los datos:
   - **Name:** `sorteos-diarios-hn`
   - **Region:** la misma que la DB
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** `Free`

4. Baja hasta **"Environment Variables"** y agrega:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | (pega la Internal Database URL del paso 4) |
   | `JWT_SECRET` | `ponAquiUnaClaveLargaYSegura2024!` |
   | `NODE_ENV` | `production` |

5. Haz clic en **"Create Web Service"**

---

### PASO 6 – Esperar el despliegue

1. Render tardará ~3-5 minutos en construir la app.
2. Cuando el indicador cambie a **"Live"** ✅, tu app está lista.
3. Tu URL será algo como: `https://sorteos-diarios-hn.onrender.com`

---

### PASO 7 – ¡Probar la aplicación!

1. Abre la URL de tu app en cualquier navegador o celular.
2. Crea una cuenta nueva y prueba el flujo completo.

---

## ⚠️ NOTAS IMPORTANTES

- **El plan gratuito de Render se "duerme"** después de 15 minutos sin visitas. La primera visita tras ese tiempo puede tardar 30-50 segundos. Para evitar esto, considera el plan **Starter** ($7/mes).
- **La base de datos gratuita** tiene 1 GB de almacenamiento. Suficiente para empezar.
- **Las imágenes** se guardan en la base de datos (base64). Si esperas mucho tráfico, considera migrar a Cloudinary para almacenamiento de imágenes.

---

## 📁 Estructura del Proyecto

```
sorteo-app/
├── server.js          ← Servidor Express principal
├── package.json       ← Dependencias npm
├── .env.example       ← Ejemplo de variables de entorno
└── public/
    ├── index.html     ← Página de login/registro
    ├── main.html      ← Página principal de sorteos
    └── js/
        ├── auth.js    ← Lógica de autenticación
        └── lottery.js ← Lógica de sorteos y pagos
```

---

## 🕐 Horarios de Sorteo (Hora Honduras)

| Sorteo | Hora | Bloqueo inicia | Re-habilita |
|--------|------|---------------|-------------|
| 1er Sorteo | 11:00 AM | 10:45 AM | 11:05 AM |
| 2do Sorteo | 2:00 PM  | 1:45 PM  | 2:05 PM  |
| 3er Sorteo | 9:00 PM  | 8:45 PM  | 9:05 PM  |

---

## 📞 Soporte

WhatsApp: **+504 9441-1539**
