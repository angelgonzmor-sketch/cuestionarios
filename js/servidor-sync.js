// Servidor de sincronización para Cuestionarios (Node.js sin dependencias).
// Guarda los cuestionarios y el progreso de cada cuenta en la carpeta datos/
// para que cualquier dispositivo con sesión iniciada los vea actualizados.
//
// Uso:   node js/servidor-sync.js [puerto]     (por defecto 8787)
// Luego, en cada dispositivo: botón de usuario → "Ajustes de sincronización"
// y escribe http://IP-de-esta-maquina:8787  (o usa el enlace ?sync=http://...:8787)
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PUERTO = parseInt(process.argv[2], 10) || 8787;
const DIR_DATOS = path.join(__dirname, '..', 'datos');
if (!fs.existsSync(DIR_DATOS)) fs.mkdirSync(DIR_DATOS, { recursive: true });

function claveSegura(correo) {
  return String(correo || '').toLowerCase().replace(/[^a-z0-9._@-]/g, '_').slice(0, 120);
}

function leerArchivo(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function escribirArchivo(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, p);
}

function json(res, codigo, obj) {
  const cuerpo = JSON.stringify(obj);
  res.writeHead(codigo, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS'
  });
  res.end(cuerpo);
}

const servidor = http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname === '/apiping') return json(res, 200, { ok: true, servicio: 'cuestionarios-sync' });

  if (u.pathname === '/api/datos' && req.method === 'POST') {
    let cuerpo = '';
    req.on('data', function (trozo) {
      cuerpo += trozo;
      if (cuerpo.length > 20 * 1024 * 1024) { req.destroy(); }
    });
    req.on('end', function () {
      let datos;
      try { datos = JSON.parse(cuerpo); } catch (e) { return json(res, 400, { ok: false, error: 'JSON inválido' }); }
      const correo = claveSegura(datos.correo);
      if (!correo || typeof datos.contenido !== 'string') return json(res, 400, { ok: false, error: 'Faltan datos' });
      const registro = leerArchivo(path.join(DIR_DATOS, correo + '.json')) || {};
      // La contraseña es la del usuario en este navegador; se verifica contra la primera vez que se registró aquí.
      if (registro.claveHash && registro.claveHash !== String(datos.password || '')) {
        return json(res, 403, { ok: false, error: 'La cuenta no coincide con este servidor.' });
      }
      escribirArchivo(path.join(DIR_DATOS, correo + '.json'), {
        contenido: datos.contenido,
        ts: Date.now(),
        claveHash: registro.claveHash || String(datos.password || '')
      });
      json(res, 200, { ok: true });
    });
    return;
  }

  if (u.pathname === '/api/datos' && req.method === 'GET') {
    const correo = claveSegura(u.searchParams.get('correo') || '');
    if (!correo) return json(res, 400, { ok: false, error: 'Falta el correo' });
    const guardado = leerArchivo(path.join(DIR_DATOS, correo + '.json'));
    if (!guardado) return json(res, 404, { ok: false, error: 'Sin datos guardados' });
    return json(res, 200, { ok: true, datos: { contenido: guardado.contenido, ts: guardado.ts } });
  }

  json(res, 404, { ok: false, error: 'Ruta desconocida' });
});

servidor.listen(PUERTO, '0.0.0.0', function () {
  console.log('Servidor de sincronización de Cuestionarios escuchando en el puerto ' + PUERTO);
  console.log('Los dispositivos se conectan a: http://<IP-de-esta-maquina>:' + PUERTO);
});
