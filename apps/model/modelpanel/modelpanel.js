/**
 * Construtor para o painel flutuante que aparece sobre o visualizador OpenSeadragon.
 * Este painel mostra resultados de predição e oferece controlos relacionados.
 * @param {OpenSeadragon.Viewer} viewer - A instância do visualizador OpenSeadragon à qual este painel será associado.
 */
function ModelPanel(viewer) {
  // Template HTML para a estrutura interna do painel
  const temp = `
        <div id='close' class='material-icons settings'>close</div> <!-- Botão para fechar o painel -->
        <div id='save' class='material-icons settings' title='Save ROI Image'>save</div> <!-- Botão para guardar a imagem da ROI (funcionalidade futura?) -->
        <div id='savecsv' class='material-icons settings' title='Save class probabilities - CSV File'>list</div> <!-- Botão para guardar as probabilidades em CSV -->
        <div id='result' class='settings' title='Select the model'>--Result--</div> <!-- Área para mostrar o resultado da predição -->

        <div id='processing' class='segment-processing'></div> <!-- Indicador de processamento (ex: "Predicting...") -->

        <!-- Canvas utilizados para processamento de imagem e visualização (alguns podem não estar em uso ativo) -->
        <canvas class='out'></canvas>
        <canvas class='src'></canvas>
        <canvas id ='fullsrc' class='hiddenCanvas'></canvas> <!-- Canvas para guardar a imagem completa da ROI -->
        <canvas id ='dummy' class='hiddenCanvas'></canvas> <!-- Canvas temporário para processamento -->
        <canvas id='c2s' class='hiddenCanvas'></canvas>
        <canvas id='fullSegImg' class='hiddenCanvas'></canvas>
        <img id='imageEle' class='hiddenCanvas'></img> <!-- Elemento img para carregar imagens temporariamente -->
        <a id='csvDLB'></a> <!-- Link âncora escondido para iniciar o download do CSV -->
        <input id='inProgress' type='hidden' /> <!-- Input escondido (uso incerto) -->
    `;

  // Guarda a referência ao visualizador OSD
  this.viewer = viewer;

  // Cria o elemento principal do painel (um div)
  this.elt = document.createElement('div');
  this.elt.classList.add('segment-panel'); // Adiciona a classe CSS para estilização
  this.elt.innerHTML = temp; // Define o conteúdo HTML interno

  // Propriedades para guardar informações sobre a ROI (Região de Interesse)
  this.__contours = null; // Contornos (não usado neste ficheiro)
  this.__top_left = null; // Coordenadas do canto superior esquerdo (formato OSD?)
  this.__x = null; // Coordenada X no ecrã
  this.__y = null; // Coordenada Y no ecrã
  this.__width = null; // Largura no ecrã
  this.__height = null; // Altura no ecrã
  this.__spImgX = null; // Coordenada X da imagem (nível 0)
  this.__spImgY = null; // Coordenada Y da imagem (nível 0)
  this.__spImgWidth = null; // Largura da imagem (nível 0)
  this.__spImgHeight = null; // Altura da imagem (nível 0)

  // Referências para elementos internos do painel
  // canvases
  this.__fullsrc = this.elt.querySelector('#fullsrc'); // Canvas para a imagem completa da ROI
  this.__img = this.elt.querySelector('#imageEle'); // Elemento <img> escondido
  this.__c2s = this.elt.querySelector('#c2s'); // Canvas escondido

  // botões e indicadores
  this.__btn_save = this.elt.querySelector('#save'); // Botão 'save'
  this.__btn_savecsv = this.elt.querySelector('#savecsv'); // Botão 'savecsv'
  this.__btn_csvDL = this.elt.querySelector('#csvDLB'); // Link escondido para download CSV
  this.__indicator = this.elt.querySelector('#processing'); // Indicador de processamento
  this.__result = this.elt.querySelector('#result'); // Área de resultado

  // Seletor de modelo (elemento não presente no HTML template atual, pode ser resquício)
  this.__modelselector = this.elt.querySelector('#modelselect');

  // Adiciona o elemento do painel como uma sobreposição (overlay) ao visualizador OSD
  this.viewer.addOverlay({
    element: this.elt, // O elemento a ser adicionado
    location: new OpenSeadragon.Rect(0, 0, 0, 0), // Posição e tamanho iniciais (serão atualizados)
    checkResize: false, // Não redimensionar automaticamente com o viewport
  });
  // Guarda uma referência ao objeto overlay criado pelo OSD
  this.overlay = this.viewer.currentOverlays[this.viewer.currentOverlays.length-1];

  // Adiciona um event listener ao botão 'close' para fechar o painel
  this.elt.querySelector('#close').addEventListener('click', function(e) {
    console.log('close'); // Mensagem de depuração
    this.close(); // Chama o método close do painel
  }.bind(this)); // Usa .bind(this) para garantir que 'this' dentro da função se refere ao ModelPanel

  // Fecha o painel inicialmente
  this.close();
}

/**
 * Torna o painel visível.
 * (Nota: A lógica de preenchimento do seletor de modelo está comentada no código original)
 */
ModelPanel.prototype.open = async function() {
  // Lógica comentada para preencher um seletor de modelos (this.__modelselector)
  // const modsel = this.__modelselector;
  // empty(modsel);
  // // let models =
  // let opt = document.createElement('option');
  // opt.disabled = true;
  // opt.value = "";
  // opt.index = 0;
  // opt.innerHTML = "-- select a model --";
  // modsel.appendChild(opt);
  // Object.keys(await tf.io.listModels()).forEach(function (element) {
  //    let opt = document.createElement('option');
  //    let key = element.split("/").pop();
  //    console.log(key.slice(0, 4));
  //    if (key.slice(0, 4) == "pred") {
  //        opt.value = element.split("/").pop();
  //        opt.innerHTML = element.split("/").pop().slice(5, -3);
  //        modsel.appendChild(opt);
  //    }
  // });
  // modsel.selectedIndex = 0;
  // this.__result.innerHTML = '-- result --'; // Reset do texto do resultado (comentado)
  this.elt.style.display = ''; // Torna o elemento do painel visível (remove display: none)
};

/**
 * Esconde o painel.
 */
ModelPanel.prototype.close = function() {
  this.elt.style.display = 'none'; // Esconde o elemento do painel
};

/**
 * Função de exemplo para guardar (atualmente apenas mostra um alerta).
 */
ModelPanel.prototype.save = function() {
  alert('Saving Image and Mask!'); // Ação placeholder
};

// Função comentada para popular o seletor de modelos
// ModelPanel.prototype.populate = function(models){
//  // models has keys of object, i.e the url
//  // var modsel = this.__modelselector;
//  var opt = document.createElement('option');
//  models.forEach(function (element) {
//      opt.value = element;
//      opt.innerHTML = 'pred_' + element.split("/").pop();
//      modsel.appendChild(opt);
//  });
// }

/**
 * Mostra o indicador de progresso no painel.
 * @param {string} [text] - O texto a ser exibido no indicador (opcional).
 */
ModelPanel.prototype.showProgress = function(text) {
  this.__indicator.style.display = 'flex'; // Torna o indicador visível
  if (text) this.__indicator.innerHTML = '<em class="blink_me">' + text + '</em>'; // Define o texto (com classe para piscar)
};

/**
 * Esconde o indicador de progresso.
 */
ModelPanel.prototype.hideProgress = function() {
  this.__indicator.style.display = 'none'; // Esconde o indicador
};

/**
 * Mostra texto na área de resultados do painel.
 * @param {string} text - O texto a ser exibido.
 */
ModelPanel.prototype.showResults = function(text) {
  this.__result.innerHTML = text; // Define o conteúdo da área de resultado
};

/**
 * Define a posição e o tamanho do painel (overlay) no visualizador OSD.
 * As coordenadas são relativas ao viewport do OSD.
 * @param {number} x - Coordenada X do canto superior esquerdo.
 * @param {number} y - Coordenada Y do canto superior esquerdo.
 * @param {number} w - Largura.
 * @param {number} h - Altura.
 */
ModelPanel.prototype.setPosition = function(x, y, w, h) {
  // Atualiza as propriedades de localização do objeto overlay do OSD
  this.overlay.location.x = x;
  this.overlay.location.y = y;
  this.overlay.width = w;
  this.overlay.height = h;
  this.overlay.drawHTML(this.viewer.overlaysContainer, this.viewer.viewport);
};
