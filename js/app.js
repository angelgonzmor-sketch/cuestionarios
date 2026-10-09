(function () {
  'use strict';

  const $ = function (sel) { return document.querySelector(sel); };
  const $$ = function (sel) { return Array.from(document.querySelectorAll(sel)); };

  let datos = Store.cargar();
  let materiaActual = null;
  let unidadActual = null;
  let cuestionarioActual = null;
  let editando = null;
  let sesion = null;
  function aplicarTema(t) {
    const tema = (t === 'claro') ? 'claro' : 'oscuro';
    document.documentElement.setAttribute('data-tema', tema);
    datos.tema = tema;
    persistir();
  }

  function toggleTema() {
    const actual = document.documentElement.getAttribute('data-tema') || datos.tema || 'oscuro';
    aplicarTema(actual === 'oscuro' ? 'claro' : 'oscuro');
  }

  // ---------- borrador (autoguardado del editor) ----------
  function marcarIndicador(texto) {
    const ind = document.getElementById('indicadorGuardado');
    if (!ind) return;
    ind.textContent = texto || '';
    clearTimeout(window.__tInd);
    if (texto) window.__tInd = setTimeout(function () { ind.textContent = ''; }, 1600);
  }

  function editorVisible() {
    const v = document.getElementById('vista-editor');
    return Boolean(v && !v.classList.contains('oculto'));
  }

  function hayContenidoBorrador() {
    const t = document.getElementById('inputTitulo');
    const p = document.getElementById('inputPreguntas');
    if (!t || !p) return false;
    return Boolean(t.value.trim() || p.value.trim() || editando);
  }

  function guardarBorrador() {
    try {
      if (!editorVisible() || !hayContenidoBorrador()) return;
      const t = document.getElementById('inputTitulo');
      const p = document.getElementById('inputPreguntas');
      datos.borrador = {
        titulo: t ? t.value : '',
        preguntas: p ? p.value : '',
        materiaId: materiaActual,
        unidadId: unidadActual,
        editando: editando,
        ts: Date.now()
      };
      persistir();
      marcarIndicador('Borrador guardado');
    } catch (e) {}
  }

  function programarGuardadoBorrador() {
    clearTimeout(window.__tDraft);
    window.__tDraft = setTimeout(guardarBorrador, 500);
  }

  function limpiarBorrador() {
    clearTimeout(window.__tDraft);
    if (datos.borrador) { datos.borrador = null; persistir(); }
    marcarIndicador('');
  }

  function borradorVigente() {
    const b = datos.borrador;
    if (!b) return null;
    const tieneTexto = Boolean((b.titulo && b.titulo.trim()) || (b.preguntas && b.preguntas.trim()));
    if (!tieneTexto) return null;
    if (!materiaPorId(b.materiaId) || !unidadPorId(b.materiaId, b.unidadId)) return null;
    if (b.editando && !cuestionarioPorId(b.materiaId, b.unidadId, b.editando)) return null;
    return b;
  }

  function recuperarBorrador() {
    const b = borradorVigente();
    if (!b) return false;
    materiaActual = b.materiaId;
    unidadActual = b.unidadId;
    editando = b.editando || null;
    cuestionarioActual = b.editando || null;
    document.getElementById('tituloEditor').textContent = b.editando ? 'Editar cuestionario' : 'Nuevo cuestionario';
    document.getElementById('inputTitulo').value = b.titulo || '';
    document.getElementById('inputPreguntas').value = b.preguntas || '';
    pintarPrevia();
    ver('editor');
    marcarIndicador('Borrador recuperado');
    return true;
  }


  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Los textos que van a textContent o a confirm() se escriben con acentos
  // reales: las entidades HTML solo funcionan dentro de innerHTML.
  let timerAviso = null;
  function aviso(msg, esError) {
    const el = $('#aviso');
    el.textContent = msg;
    el.classList.remove('oculto');
    el.classList.toggle('error', Boolean(esError));
    clearTimeout(timerAviso);
    timerAviso = setTimeout(function () { el.classList.add('oculto'); }, esError ? 6000 : 2500);
  }

  function persistir() {
    if (!Store.guardar(datos)) aviso('No se pudo guardar en este navegador.', true);
  }

  function ver(nombre) {
    $$('.vista').forEach(function (v) { v.classList.add('oculto'); });
    $('#vista-' + nombre).classList.remove('oculto');
    window.scrollTo(0, 0);
  }

  // ----------	localizadores ----------
  function materiaPorId(mid) {
    return datos.materias.find(function (m) { return m.id === mid; }) || null;
  }

  function unidadPorId(mid, uid) {
    const m = materiaPorId(mid);
    return m ? (m.subcarpetas.find(function (u) { return u.id === uid; }) || null) : null;
  }

  function cuestionarioPorId(mid, uid, qid) {
    const u = unidadPorId(mid, uid);
    return u ? (u.cuestionarios.find(function (q) { return q.id === qid; }) || null) : null;
  }

  function plural(n, singular, pluralForma) {
    return n + ' ' + (n === 1 ? singular : (pluralForma || singular + 's'));
  }

  // ---------- migas de pan ----------
  function pintarMigas(nivel, etiquetaMateria, etiquetaUnidad) {
    const m = $('#migas');
    m.innerHTML = '';
    const partes = [{ txt: 'Materias', accion: 'materias' }];
    if (nivel !== 'materias' && etiquetaMateria) partes.push({ txt: etiquetaMateria, accion: 'unidades' });
    if (nivel === 'cuestionarios' && etiquetaUnidad) partes.push({ txt: etiquetaUnidad, accion: null });

    partes.forEach(function (p, i) {
      const s = document.createElement('span');
      s.className = 'miga' + (i === partes.length - 1 ? ' actual' : '');
      if (p.accion) {
        const b = document.createElement('button');
        b.className = 'miga-btn';
        b.textContent = p.txt;
        b.addEventListener('click', function () {
          if (p.accion === 'materias') { materiaActual = null; unidadActual = null; pintarMaterias(); ver('materias'); }
          else { unidadActual = null; pintarUnidades(); }
        });
        s.appendChild(b);
      } else {
        s.textContent = p.txt;
      }
      if (i < partes.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'miga-sep';
        sep.textContent = '›';
        m.appendChild(sep);
      }
      m.appendChild(s);
    });
  }

  // ---------- MATERIAS ----------
  function pintarMaterias() {
    const cont = $('#listaMaterias');
    cont.innerHTML = '';
    pintarMigas('materias');
    if (datos.materias.length === 0) {
      cont.innerHTML = '<p class="meta">Aún no hay materias. Crea la primera arriba.</p>';
      return;
    }

    datos.materias.forEach(function (m) {
      const unidades = m.subcarpetas.length;
      const totalQ = m.subcarpetas.reduce(function (a, u) { return a + u.cuestionarios.length; }, 0);
      const totalP = m.subcarpetas.reduce(function (a, u) {
        return a + u.cuestionarios.reduce(function (b, q) { return b + q.preguntas.length; }, 0);
      }, 0);

      const div = document.createElement('div');
      div.className = 'tarjeta-materia';
      div.innerHTML =
        '<div class="cab"><h3>' + esc(m.nombre) + '</h3>' +
        '<div class="acciones">' +
        '<button class="pri" data-acc="abrir">Abrir</button>' +
        '<button class="sec" data-acc="renombrar">Renombrar</button>' +
        '<button class="sec" data-acc="eliminar">Eliminar</button>' +
        '</div></div>' +
        '<p class="meta">' + (unidades
          ? plural(unidades, 'subcarpeta') +
            (totalQ ? ' &middot; ' + plural(totalQ, 'cuestionario') : '') +
            (totalP ? ' &middot; ' + plural(totalP, 'pregunta') : '')
          : 'Sin subcarpetas') +
        '</p>';
      div.addEventListener('click', function (e) {
        const b = e.target.closest('button[data-acc]');
        if (!b) return;
        if (b.dataset.acc === 'abrir') {
          materiaActual = m.id;
          unidadActual = null;
          cuestionarioActual = null;
          pintarUnidades();
        } else if (b.dataset.acc === 'renombrar') {
          const nombre = prompt('Nuevo nombre de la materia:', m.nombre);
          if (nombre === null) return;
          const limpio = nombre.trim();
          if (!limpio) return aviso('El nombre no puede quedar vacío.', true);
          if (nombreDuplicado(datos.materias.map(function (x) { return x.nombre; }), limpio, m.id))
            return aviso('Ya existe una materia con ese nombre.', true);
          m.nombre = limpio;
          persistir();
          pintarMaterias();
        } else {
          const extra = unidades ? ' con sus ' + plural(unidades, 'subcarpeta') + ' y ' + plural(totalQ, 'cuestionario') : '';
          if (!confirm('¿Eliminar la materia "' + m.nombre + '"' + extra + '? No se puede deshacer.')) return;
          datos.materias = datos.materias.filter(function (x) { return x.id !== m.id; });
          persistir();
          pintarMaterias();
        }
      });
      cont.appendChild(div);
    });
  }

  function nombreDuplicado(lista, nombre, ignorarId) {
    const n = nombre.toLowerCase();
    return lista.some(function (x) { return x.id !== ignorarId && x.toLowerCase() === n; });
  }

  function crearMateria() {
    const input = $('#inputMateria');
    const nombre = input.value.trim();
    if (!nombre) return aviso('Escribe el nombre de la materia.', true);
    if (nombreDuplicado(datos.materias.map(function (x) { return x.nombre; }), nombre, null))
      return aviso('Ya existe una materia con ese nombre.', true);
    datos.materias.push({ id: Store.id(), nombre: nombre, subcarpetas: [] });
    input.value = '';
    persistir();
    pintarMaterias();
  }

  // ---------- SUBCARPETAS / UNIDADES ----------
  function siguienteNumeroUnidad(m) {
    let max = 0;
    m.subcarpetas.forEach(function (u) {
      const n = u.nombre.match(/^unidad\s+(\d+)$/i);
      if (n) max = Math.max(max, parseInt(n[1], 10));
    });
    return max + 1;
  }

  function pintarUnidades() {
    const m = materiaPorId(materiaActual);
    if (!m) { materiaActual = null; return pintarMaterias(); }

    $('#tituloMateria').textContent = m.nombre;
    $('#inputUnidad').value = '';
    pintarMigas('unidades', m.nombre);

    // Cambia de vista antes de la salida temprana del caso sin subcarpetas.
    ver('unidades');

    const cont = $('#listaUnidades');
    cont.innerHTML = '';
    if (m.subcarpetas.length === 0) {
      cont.innerHTML = '<p class="meta">Esta materia no tiene subcarpetas. Crea la Unidad 1, o la que necesites.</p>';
      return;
    }

    m.subcarpetas.forEach(function (u) {
      const totalP = u.cuestionarios.reduce(function (a, q) { return a + q.preguntas.length; }, 0);
      const div = document.createElement('div');
      div.className = 'tarjeta-materia';
      div.innerHTML =
        '<div class="cab"><h3>' + esc(u.nombre) + '</h3>' +
        '<div class="acciones">' +
        '<button class="pri" data-acc="abrir">Abrir</button>' +
        '<button class="sec" data-acc="renombrar">Renombrar</button>' +
        '<button class="sec" data-acc="eliminar">Eliminar</button>' +
        '</div></div>' +
        '<p class="meta">' + (u.cuestionarios.length
          ? plural(u.cuestionarios.length, 'cuestionario') + ' &middot; ' + plural(totalP, 'pregunta')
          : 'Sin cuestionarios') +
        '</p>';
      div.addEventListener('click', function (e) {
        const b = e.target.closest('button[data-acc]');
        if (!b) return;
        if (b.dataset.acc === 'abrir') {
          unidadActual = u.id;
          cuestionarioActual = null;
          pintarCuestionarios();
        } else if (b.dataset.acc === 'renombrar') {
          const nombre = prompt('Nuevo nombre de la subcarpeta:', u.nombre);
          if (nombre === null) return;
          const limpio = nombre.trim();
          if (!limpio) return aviso('El nombre no puede quedar vacío.', true);
          if (nombreDuplicado(m.subcarpetas.map(function (x) { return x.nombre; }), limpio, u.id))
            return aviso('Ya existe una subcarpeta con ese nombre en esta materia.', true);
          u.nombre = limpio;
          persistir();
          pintarUnidades();
        } else {
          const extra = u.cuestionarios.length ? ' con sus ' + plural(u.cuestionarios.length, 'cuestionario') : '';
          if (!confirm('¿Eliminar la subcarpeta "' + u.nombre + '"' + extra + '? No se puede deshacer.')) return;
          m.subcarpetas = m.subcarpetas.filter(function (x) { return x.id !== u.id; });
          persistir();
          pintarUnidades();
        }
      });
      cont.appendChild(div);
    });
  }

  function crearUnidad(nombreSugerido) {
    const m = materiaPorId(materiaActual);
    if (!m) return aviso('No hay materia seleccionada.', true);

    const input = $('#inputUnidad');
    const nombre = (nombreSugerido !== undefined ? nombreSugerido : input.value).trim();
    if (!nombre) return aviso('Escribe el nombre de la subcarpeta.', true);
    if (nombreDuplicado(m.subcarpetas.map(function (x) { return x.nombre; }), nombre, null))
      return aviso('Ya existe una subcarpeta con ese nombre en esta materia.', true);

    m.subcarpetas.push({ id: Store.id(), nombre: nombre, cuestionarios: [] });
    input.value = '';
    persistir();
    pintarUnidades();
    aviso('Subcarpeta "' + nombre + '" creada.');
  }

  // ---------- CUESTIONARIOS ----------
  function pintarCuestionarios() {
    const u = unidadPorId(materiaActual, unidadActual);
    if (!u) { unidadActual = null; return pintarUnidades(); }
    const m = materiaPorId(materiaActual);

    $('#tituloUnidad').textContent = m.nombre + ' › ' + u.nombre;
    pintarMigas('cuestionarios', m.nombre, u.nombre);

    const cont = $('#listaCuestionarios');
    cont.innerHTML = '';
    if (u.cuestionarios.length === 0) {
      cont.innerHTML = '<p class="meta">Esta subcarpeta no tiene cuestionarios. Crea el primero.</p>';
    }

    u.cuestionarios.forEach(function (q) {
      const div = document.createElement('div');
      div.className = 'tarjeta-cuestionario';
      const enProgreso = Store.cargarProgreso(materiaActual, unidadActual, q.id);
      div.innerHTML =
        '<div class="izq"><strong>' + esc(q.titulo) + '</strong>' +
        '<span class="meta">' + plural(q.preguntas.length, 'pregunta') +
        (enProgreso && enProgreso.sesion ? ' · <span class="progreso-tag">En progreso</span>' : '') +
        '</span></div>' +
        '<div class="acciones">' +
        '<button class="pri" data-acc="resolver">' + (enProgreso ? 'Continuar' : 'Resolver') + '</button>' +
        '<button class="sec" data-acc="editar">Editar</button>' +
        '<button class="sec" data-acc="eliminar">Eliminar</button>' +
        '</div>';
      div.addEventListener('click', function (e) {
        const b = e.target.closest('button[data-acc]');
        if (!b) return;
        if (b.dataset.acc === 'resolver') { cuestionarioActual = q.id; presentar(enProgreso ? 'continuar' : undefined); }
        else if (b.dataset.acc === 'editar') { cuestionarioActual = q.id; abrirEditor(); }
        else {
          if (!confirm('¿Eliminar el cuestionario "' + q.titulo + '"?')) return;
          u.cuestionarios = u.cuestionarios.filter(function (x) { return x.id !== q.id; });
          Store.limpiarProgreso(materiaActual, unidadActual, q.id);
          persistir();
          pintarCuestionarios();
        }
      });
      cont.appendChild(div);
    });
    ver('cuestionarios');
  }

  function nuevoCuestionario() {
    if (!unidadPorId(materiaActual, unidadActual)) return aviso('Primero abre una subcarpeta.', true);
    cuestionarioActual = null;
    editando = null;
    $('#tituloEditor').textContent = 'Nuevo cuestionario';
    $('#inputTitulo').value = '';
    $('#inputPreguntas').value = '';
    const b = datos.borrador;
    if (b && b.materiaId === materiaActual && b.unidadId === unidadActual && !b.editando &&
        ((b.titulo && b.titulo.trim()) || (b.preguntas && b.preguntas.trim()))) {
      $('#inputTitulo').value = b.titulo || '';
      $('#inputPreguntas').value = b.preguntas || '';
      aviso('Se recuperó un borrador sin guardar.');
    }
    pintarPrevia();
    ver('editor');
    $('#inputTitulo').focus();
  }

  // ---------- EDITOR ----------
  function abrirEditor() {
    const q = cuestionarioPorId(materiaActual, unidadActual, cuestionarioActual);
    if (!q) return;
    editando = q.id;
    $('#tituloEditor').textContent = 'Editar cuestionario';
    $('#inputTitulo').value = q.titulo;
    $('#inputPreguntas').value = aTexto(q.preguntas);
    pintarPrevia();
    ver('editor');
  }

  function aTexto(preguntas) {
    return preguntas.map(function (p, i) {
      const ops = p.opciones.map(function (o, j) {
        return (o.correcta ? '*' : '') + String.fromCharCode(97 + j) + ') ' + o.texto;
      });
      return (i + 1) + ') ' + p.texto + '\n' + ops.join('\n');
    }).join('\n\n');
  }

  function pintarPrevia() {
    const r = Parser.parse($('#inputPreguntas').value);
    const cont = $('#vistaPrevia');
    cont.innerHTML = '';
    if (r.preguntas.length === 0 && r.errores.length === 0) {
      cont.innerHTML = '<p class="meta">Aquí aparecerá la vista previa de las preguntas.</p>';
    }
    r.preguntas.forEach(function (p) {
      const d = document.createElement('div');
      d.className = 'preg-prev';
      const ops = p.opciones.map(function (o) {
        return '<div class="op-prev ' + (o.correcta ? 'correcta' : 'incorrecta') + '">' +
          (o.correcta ? '&#10003; ' : '&times; ') + esc(o.texto) + '</div>';
      }).join('');
      d.innerHTML = '<div class="tit">' + esc(p.texto) + '</div><div class="ops">' + ops + '</div>';
      cont.appendChild(d);
    });
    if (r.errores.length) {
      const d = document.createElement('div');
      d.className = 'op-prev incorrecta';
      d.innerHTML = '<strong>Problemas encontrados (' + r.errores.length + '):</strong>' +
        r.errores.map(function (e) { return '<div>Línea ' + e.linea + ': ' + esc(e.msg) + '</div>'; }).join('');
      cont.appendChild(d);
    }
    return r;
  }

  function guardarCuestionario() {
    const titulo = $('#inputTitulo').value.trim();
    if (!titulo) return aviso('Ponle un título al cuestionario.', true);
    const r = pintarPrevia();
    if (r.preguntas.length === 0) return aviso('No se detectó ninguna pregunta válida.', true);
    if (r.errores.length && !confirm('Hay ' + r.errores.length + ' problema(s) en el texto. Se guardarán solo las ' +
      plural(r.preguntas.length, 'pregunta') + ' válida(s). ¿Continuar?')) return;

    const u = unidadPorId(materiaActual, unidadActual);
    if (!u) return aviso('No hay subcarpeta seleccionada.', true);

    const obj = {
      titulo: titulo,
      preguntas: r.preguntas.map(function (p) {
        return {
          texto: p.texto,
          opciones: p.opciones.map(function (o) { return { texto: o.texto, correcta: o.correcta }; })
        };
      })
    };

    if (editando) {
      const q = cuestionarioPorId(materiaActual, unidadActual, editando);
      if (q) Object.assign(q, obj);
      Store.limpiarProgreso(materiaActual, unidadActual, editando);
    } else {
      const nuevo = Object.assign({ id: Store.id() }, obj);
      u.cuestionarios.push(nuevo);
      cuestionarioActual = nuevo.id;
    }
    persistir();
    pintarCuestionarios();
    aviso('Cuestionario guardado.');
  }

  // ---------- PRESENTAR ----------
      function barajar(a){var arr=(Array.isArray(a)?a.slice():[]);for(var i=arr.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=arr[i];arr[i]=arr[j];arr[j]=t;}return arr;}

function indiceFuente(s, fuente) {
    const idx = [];
    for (let i = 0; i < s.preguntas.length; i++) {
      const real = s.respuestas[i] === s.preguntas[i].correcta;
      const forzada = Boolean(s.forzadas[i]);
      if (fuente === 'forzadas') { if (forzada) idx.push(i); }
      else if (fuente === 'falladas') { if (!real || forzada) idx.push(i); }
    }
    return idx;
  }

  function guardarProgSesion() {
    if (!sesion) return;
    if (cuestionarioActual === null || cuestionarioActual === undefined) return;
    try {
      Store.guardarProgreso(materiaActual, unidadActual, cuestionarioActual, {
        sesion: sesion,
        ts: Date.now()
      });
    } catch (e) {}
  }

  function presentar(fuente) {
    const q = cuestionarioPorId(materiaActual, unidadActual, cuestionarioActual);
    if (!q) return;
    if (!q.preguntas.length) return aviso('Este cuestionario no tiene preguntas.', true);

    if (!fuente || fuente === 'continuar') {
      const prog = Store.cargarProgreso(materiaActual, unidadActual, cuestionarioActual);
      if (prog && prog.sesion && Array.isArray(prog.sesion.preguntas) && prog.sesion.preguntas.length) {
        const quiereContinuar = (fuente === 'continuar')
          ? true
          : confirm('Hay un progreso guardado de este cuestionario. ¿Deseas continuar donde lo dejaste?');
        if (quiereContinuar) {
          sesion = prog.sesion;
          if (!Array.isArray(sesion.forzadas)) sesion.forzadas = new Array(sesion.preguntas.length).fill(false);
          if (typeof sesion.indice !== 'number' || sesion.indice >= sesion.preguntas.length) sesion.indice = 0;
          $('#tituloPresentar').textContent = q.titulo;
          $('#panelResultado').classList.add('oculto');
          $('#areaPresentar').classList.remove('oculto');
          pintarPregunta();
          ver('presentar');
          return;
        }
        Store.limpiarProgreso(materiaActual, unidadActual, cuestionarioActual);
      }
      if (fuente === 'continuar') fuente = undefined;
    }

    let base;
    if (!fuente || fuente === 'todo') {
      base = q.preguntas;
    } else {
      if (!sesion) return;
      const idx = indiceFuente(sesion, fuente);
      if (!idx.length) return aviso('No hay preguntas para repetir con ese criterio.', true);
      base = idx.map(function (i) { return sesion.preguntas[i]; });
    }

    const preguntas = barajar(base).map(function (p) {
      const ops = barajar(p.opciones);
      return {
        texto: p.texto,
        opciones: ops,
        correcta: ops.findIndex(function (o) { return o.correcta; })
      };
    });

    sesion = {
      preguntas: preguntas,
      indice: 0,
      respuestas: new Array(preguntas.length).fill(null),
      forzadas: new Array(preguntas.length).fill(false)
    };
    $('#tituloPresentar').textContent = q.titulo + (fuente && fuente !== 'todo' ? ' · repaso' : '');
    $('#panelResultado').classList.add('oculto');
    $('#areaPresentar').classList.remove('oculto');
    pintarPregunta();
    ver('presentar');
    if (!fuente || fuente === 'todo') guardarProgSesion();
  }

  function pintarPregunta() {
    const s = sesion;
    const p = s.preguntas[s.indice];
    const elegida = s.respuestas[s.indice];
    const forzada = Boolean(s.forzadas[s.indice]);
    $('#contadorPregunta').textContent = 'Pregunta ' + (s.indice + 1) + ' de ' + s.preguntas.length;
    $('#barraRelleno').style.width = ((s.indice + 1) / s.preguntas.length * 100) + '%';

    const ops = p.opciones.map(function (o, i) {
      let cls = 'opcion';
      if (elegida !== null) {
        cls += ' desactivada';
        if (i === p.correcta) cls += ' correcta';
        else if (i === elegida) cls += ' incorrecta';
      }
      if (forzada && i === p.correcta) cls += ' forzada';
      const marca = elegida !== null ? (i === p.correcta ? '&#10003; ' : (i === elegida ? '&times; ' : '')) : '';
      return '<button class="' + cls + '" data-i="' + i + '">' + marca + esc(o.texto) + '</button>';
    }).join('');

    $('#panelPregunta').innerHTML =
      '<div class="pregunta-texto">' + esc(p.texto) + '</div>' +
      '<div class="opciones">' + ops + '</div>';

    $$('#panelPregunta .opcion').forEach(function (b) {
      b.addEventListener('click', function () { responder(Number(b.dataset.i)); });
    });

    const btnForzar = $('#btnForzar');
    if (btnForzar) {
      btnForzar.classList.toggle('oculto', elegida === null);
      btnForzar.classList.toggle('activo', forzada);
      btnForzar.textContent = forzada ? 'Quitar forzada' : 'Forzar incorrecta';
    }

    $('#btnAnterior').disabled = s.indice === 0;
    const ultima = s.indice === s.preguntas.length - 1;
    $('#btnSiguiente').classList.toggle('oculto', ultima);
    $('#btnTerminar').classList.toggle('oculto', !ultima);
    $('#btnTerminar').disabled = elegida === null;
  }

  function responder(i) {
    sesion.respuestas[sesion.indice] = i;
    pintarPregunta();
    guardarProgSesion();
  }

  function forzarIncorrecta() {
    if (!sesion) return;
    if (sesion.respuestas[sesion.indice] === null) return aviso('Primero responde la pregunta.', true);
    sesion.forzadas[sesion.indice] = !sesion.forzadas[sesion.indice];
    pintarPregunta();
    guardarProgSesion();
  }

  function siguiente() {
    if (sesion.indice === sesion.preguntas.length - 1) return;
    sesion.indice++;
    pintarPregunta();
    guardarProgSesion();
  }

  function anterior() {
    if (sesion.indice === 0) return;
    sesion.indice--;
    pintarPregunta();
    guardarProgSesion();
  }

  function salirPresentar() {
    sesion = null;
    $('#panelResultado').classList.add('oculto');
    $('#areaPresentar').classList.remove('oculto');
    pintarCuestionarios();
  }

  function terminar() {
    const s = sesion;
    const sinResponder = s.respuestas.filter(function (r) { return r === null; }).length;
    if (sinResponder && !confirm('Quedan ' + plural(sinResponder, 'pregunta') + ' sin responder. ¿Ver el resultado?')) return;

    Store.limpiarProgreso(materiaActual, unidadActual, cuestionarioActual);

    let acertadas = 0;
    let repasables = 0;
    let forzadas = 0;
    const items = s.preguntas.map(function (p, i) {
      const r = s.respuestas[i];
      const forzada = Boolean(s.forzadas[i]);
      const real = r === p.correcta;
      const ok = real && !forzada;
      if (ok) acertadas++;
      if (!real || forzada) repasables++;
      if (forzada) forzadas++;
      return { p: p, elegida: r, ok: ok, forzada: forzada };
    });
    const total = s.preguntas.length;
    const pct = Math.round(acertadas / total * 100);

    $('#areaPresentar').classList.add('oculto');
    const res = $('#panelResultado');
    res.classList.remove('oculto');
    res.innerHTML =
      '<div class="resultado-cab">' +
      '<h2>Resultado</h2>' +
      '<div class="puntaje">' + pct + '%</div>' +
      '<div class="resumen">' + acertadas + ' acertadas &middot; ' + (total - acertadas) +
      ' erradas &middot; ' + total + ' en total' +
      (forzadas ? ' &middot; ' + forzadas + ' marcadas para repaso' : '') + '</div>' +
      '<div class="fila centro">' +
      '<button class="pri" id="btnRepetirTodo">Repetir todo</button>' +
      (repasables ? '<button class="sec" id="btnRepetirFalladas">Repetir falladas (' + repasables + ')</button>' : '') +
      (forzadas ? '<button class="sec" id="btnRepetirForzadas">Repetir forzadas (' + forzadas + ')</button>' : '') +
      '<button class="sec" id="btnVolverLista">Volver a cuestionarios</button>' +
      '</div></div>' +
      '<div class="lista-resultado">' + items.map(function (it, i) {
        const ops = it.p.opciones.map(function (o, j) {
          let cls = 'op-res';
          if (j === it.p.correcta) cls += ' ok correcta';
          else if (j === it.elegida) cls += ' err';
          return '<div class="' + cls + '">' + (j === it.p.correcta ? '&#10003; ' : (j === it.elegida ? '&times; ' : '')) + esc(o.texto) + '</div>';
        }).join('');
        return '<div class="item-res' + (it.forzada ? ' forzada' : '') + '">' +
          '<div class="preg">' + (i + 1) + '. ' + esc(it.p.texto) + ' ' +
          (it.ok ? '<span class="marca ok">&#10003;</span>' : '<span class="marca err">&times;</span>') +
          (it.forzada ? ' <span class="marca forzada">forzada</span>' : '') + '</div>' +
          '<div class="ops-res">' + ops + '</div></div>';
      }).join('') + '</div>';

    $('#btnRepetirTodo').addEventListener('click', function () { presentar('todo'); });
    if ($('#btnRepetirFalladas')) $('#btnRepetirFalladas').addEventListener('click', function () { presentar('falladas'); });
    if ($('#btnRepetirForzadas')) $('#btnRepetirForzadas').addEventListener('click', function () { presentar('forzadas'); });
    $('#btnVolverLista').addEventListener('click', salirPresentar);
  }

  // ---------- IMPORTAR / EXPORTAR ----------
  function exportar() {
    const c = Store.contar(datos);
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cuestionarios-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    aviso('Exportado: ' + plural(c.materias, 'materia') + ', ' +
      plural(c.subcarpetas, 'subcarpeta') + ', ' + plural(c.cuestionarios, 'cuestionario') + '.');
  }

  function importar(archivo) {
    const lector = new FileReader();
    lector.onload = function () {
      let json;
      try {
        json = JSON.parse(lector.result);
      } catch (e) {
        return aviso('El archivo no es un JSON válido.', true);
      }
      const limpio = Store.normalizar(json);
      if (!limpio) return aviso('El archivo no tiene la estructura de cuestionarios.', true);

      const c = Store.contar(limpio);
      if (!confirm('Se importarán ' + plural(c.materias, 'materia') + ', ' +
        plural(c.subcarpetas, 'subcarpeta') + ' y ' + plural(c.cuestionarios, 'cuestionario') +
        ', y se reemplazarán los datos actuales. ¿Continuar?')) return;

      datos = limpio;
      materiaActual = null;
      unidadActual = null;
      cuestionarioActual = null;
      Store.limpiarTodosProgresos();
      persistir();
      pintarMaterias();
      limpiarBorrador();
      ver('materias');
      aviso('Importado: ' + plural(c.materias, 'materia') + ', ' +
        plural(c.subcarpetas, 'subcarpeta') + ', ' + plural(c.cuestionarios, 'cuestionario') + '.');
    };
    lector.readAsText(archivo);
  }

  // ---------- ARRANQUE ----------
  $('#btnTema').addEventListener('click', toggleTema);
  $('#btnCrearMateria').addEventListener('click', crearMateria);
  $('#inputMateria').addEventListener('keydown', function (e) { if (e.key === 'Enter') crearMateria(); });
  $('#btnVolverMaterias').addEventListener('click', function () {
    materiaActual = null; unidadActual = null; pintarMaterias(); ver('materias');
  });

  $('#btnCrearUnidad').addEventListener('click', function () { crearUnidad(); });
  $('#inputUnidad').addEventListener('keydown', function (e) { if (e.key === 'Enter') crearUnidad(); });
  $('#btnNuevaUnidadRapida').addEventListener('click', function () {
    const m = materiaPorId(materiaActual);
    if (!m) return;
    crearUnidad('Unidad ' + siguienteNumeroUnidad(m));
  });
  $('#btnVolverUnidades').addEventListener('click', function () {
    unidadActual = null; cuestionarioActual = null; pintarUnidades();
  });

  $('#btnNuevoCuestionario').addEventListener('click', nuevoCuestionario);
  $('#btnVolverCuestionarios').addEventListener('click', function () { pintarCuestionarios(); });
  $('#btnParsear').addEventListener('click', pintarPrevia);
  $('#btnGuardar').addEventListener('click', guardarCuestionario);
  $('#btnCancelarEditor').addEventListener('click', function () { limpiarBorrador(); pintarCuestionarios(); });
  $('#inputTitulo').addEventListener('input', programarGuardadoBorrador);
  $('#inputPreguntas').addEventListener('input', function () {
    clearTimeout(window.__tPrev);
    window.__tPrev = setTimeout(pintarPrevia, 350);
    programarGuardadoBorrador();
  });
  $('#btnSalirPresentar').addEventListener('click', salirPresentar);
  $('#btnAnterior').addEventListener('click', anterior);
  $('#btnSiguiente').addEventListener('click', siguiente);
  $('#btnForzar').addEventListener('click', forzarIncorrecta);
  $('#btnTerminar').addEventListener('click', terminar);
  $('#btnExportar').addEventListener('click', exportar);
  $('#btnImportar').addEventListener('click', function () { $('#inputImportar').click(); });
  $('#inputImportar').addEventListener('change', function (e) {
    if (e.target.files[0]) importar(e.target.files[0]);
    e.target.value = '';
  });

  window.addEventListener('beforeunload', function () {
    clearTimeout(window.__tDraft);
    if (editorVisible()) guardarBorrador();
  });

  aplicarTema(datos.tema || 'oscuro');
  if (!recuperarBorrador()) {
    pintarMaterias();
    ver('materias');
  }
})();