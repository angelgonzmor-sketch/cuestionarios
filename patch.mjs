import fs from 'fs';
const p='C:/Users/Angel G/cuestionarios-mod/js/app.js';
let c=fs.readFileSync(p,'utf8');
// update nuevoCuestionario
let old=  function nuevoCuestionario() {
    if (!unidadPorId(materiaActual, unidadActual)) return aviso('Primero abre una subcarpeta.', true);
    cuestionarioActual = null;
    editando = null;
    #tituloEditor.textContent = 'Nuevo cuestionario';
    #inputTitulo.value = '';
    #inputPreguntas.value = '';
    pintarPrevia();
    ver('editor');
    #inputTitulo.focus();
  };
let neu=  function nuevoCuestionario() {
    if (!unidadPorId(materiaActual, unidadActual)) return aviso('Primero abre una subcarpeta.', true);
    cuestionarioActual = null;
    editando = null;
    #tituloEditor.textContent = 'Nuevo cuestionario';
    #inputTitulo.value = '';
    #inputPreguntas.value = '';
    if (datos.borrador && datos.borrador.materiaId === materiaActual && datos.borrador.unidadId === unidadActual && !datos.borrador.editando) {
      if (datos.borrador.titulo) #inputTitulo.value = datos.borrador.titulo;
      if (datos.borrador.preguntas) #inputPreguntas.value = datos.borrador.preguntas;
    }
    pintarPrevia();
    ver('editor');
    #inputTitulo.focus();
  };
if(c.indexOf(old)>=0){c=c.replace(old,neu);} else { console.log('not found nuevo'); }
fs.writeFileSync(p,c,'utf8');
console.log('done');
