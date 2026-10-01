# Cuestionarios

Aplicación web para crear cuestionarios de opción múltiple a partir de texto
pegado, organizados por **materia** y **subcarpeta** (Unidad 1, Unidad 2, …).

No necesita servidor, base de datos ni instalación: es HTML, CSS y JavaScript
sin dependencias. Se abre con doble clic en `index.html`.

## Estructura

```
index.html
css/estilos.css
js/parser.js   convierte el texto pegado en preguntas
js/store.js    guardado en el navegador e importación/exportación
js/app.js      materias, subcarpetas, edición y presentación
```

## Cómo pegar las preguntas

Se aceptan dos sintaxis, y el editor detecta cuál se está usando. Pueden
combinarse dentro del mismo bloque.

**Marcando la correcta con `*`:**

```
1) ¿Cuál es la capital de México?
a) Guadalajara
*b) Ciudad de México
c) Puebla
```

**Indicando la correcta al final:**

```
1) ¿Cuál es la capital de México?
a) Guadalajara
b) Ciudad de México
c) Puebla
[correcta: b]
```

Detalles que acepta el parser:

| Variante | Ejemplo |
| --- | --- |
| Numeración de pregunta | `1)` `1.` `1-` o ninguna |
| Letra de opción | `a)` `a.` `-` o ninguna |
| Numeral romano | `I)` `II)` `III)` con `[correcta: II]` |
| Marca de correcta | `*b)` `b*)` `* b)` o un `*` solo en su línea |
| Sin letras | `[correcta: 2]` significa la segunda opción |

Si una pregunta queda mal (sin opciones, sin correcta, o con dos correctas) se
descarta y se reporta con su número de línea, sin perder el resto del texto.

## Al responder

- Las preguntas y las opciones se barajan en cada intento.
- Al elegir opción, la correcta se resalta en verde y la elegida en rojo.
- Al terminar se muestra el porcentaje, los aciertos y los errores, más la
  revisión pregunta por pregunta.

## Dónde se guardan los datos

En el `localStorage` del navegador, en la clave `cuestionarios.v2`. Eso implica
que los cuestionarios son locales a ese navegador y a ese equipo.

Usa **Exportar JSON** para bajar un respaldo y **Importar JSON** para restaurarlo
o pasarlo a otro equipo. Los archivos exportados por versiones anteriores del
formato se migran solos a una subcarpeta llamada `General`.

## Estructura del JSON

```json
{
  "version": 2,
  "materias": [
    {
      "id": "abc123",
      "nombre": "Física",
      "subcarpetas": [
        {
          "id": "def456",
          "nombre": "Unidad 1",
          "cuestionarios": [
            {
              "id": "ghi789",
              "titulo": "Mecánica",
              "preguntas": [
                {
                  "id": "p1",
                  "texto": "¿Cuál es la fuerza?",
                  "opciones": [
                    { "texto": "m·a", "correcta": true },
                    { "texto": "m/a", "correcta": false }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Publicar

Doble clic en `publicar.bat` (o `.\publicar.ps1` en PowerShell) sube el proyecto
a GitHub y activa GitHub Pages. Necesitas `gh auth login` una sola vez.

Los cuestionarios de cada visitante se guardan en su propio navegador, así que la
página publicada sirve para que cualquiera arme y resuelva sus cuestionarios, pero
no comparte los datos entre dispositivos.