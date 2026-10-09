const fs=require('fs');
const p='C:/Users/Angel G/cuestionarios-mod/js/app.js';
let c=fs.readFileSync(p,'utf8');
const old=  function nuevoCuestionario() {\n    if (!unidadPorId(materiaActual, unidadActual)) return aviso('Primero abre una subcarpeta.', true);\n    cuestionarioActual = null;\n    editando = null;\n    #tituloEditor.textContent = 'Nuevo cuestionario';\n    #inputTitulo.value = '';\n    #inputPreguntas.value = '';\n    pintarPrevia();\n    ver('editor');\n    #inputTitulo.focus();\n  };
const neu=  function nuevoCuestionario() {\n    if (!unidadPorId(materiaActual, unidadActual)) return aviso('Primero abre una subcarpeta.', true);\n    cuestionarioActual = null;\n    editando = null;\n    #tituloEditor.textContent = 'Nuevo cuestionario';\n    #inputTitulo.value = '';\n    #inputPreguntas.value = '';\n    if (datos.borrador && datos.borrador.materiaId === materiaActual && datos.borrador.unidadId === unidadActual && !datos.borrador.editando) {\n      if (datos.borrador.titulo) #inputTitulo.value = datos.borrador.titulo;\n      if (datos.borrador.preguntas) #inputPreguntas.value = datos.borrador.preguntas;\n    }\n    pintarPrevia();\n    ver('editor');\n    #inputTitulo.focus();\n  };
if(c.indexOf(old)>=0){c=c.replace(old,neu);} else { console.log('not found'); }
fs.writeFileSync(p,c,'utf8');
console.log('ok');
