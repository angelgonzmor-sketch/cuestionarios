(function() {
  try {
    var k = 'cuestionarios.v2';
    var d = localStorage.getItem(k);
    if (d) {
      var j = JSON.parse(d);
      if (j && j.tema) {
        document.documentElement.setAttribute('data-tema', j.tema);
      }
    }
  } catch (e) {}
})();
