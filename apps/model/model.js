// Constantes e Variáveis Globais
const PDR = OpenSeadragon.pixelDensityRatio; // Rácio de densidade de pixel para ecrãs de alta resolução
const IDB_URL = 'indexeddb://'; // Prefixo de URL para identificar modelos guardados no IndexedDB pelo TensorFlow.js
var csvContent; // String para armazenar o conteúdo do ficheiro CSV a ser descarregado
var mem; // Variável para guardar o tamanho de memória (usado em extractRoi)
var flag = -1; // Flag para controlar o modo de operação (predição vs. extração de ROI selecionada)
var choices1; // Variável para guardar as escolhas do utilizador para extração de ROI selecionada
var jsondata; // Variável para guardar dados JSON a serem enviados para o backend
var fileName = ''; // Nome do ficheiro (uso atual incerto, parece relacionado com extração backend)

// --- Inicialização do IndexedDB ---
// Garante a compatibilidade entre navegadores para a API IndexedDB
window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
// Variáveis para a conexão com o IndexedDB
var request; // Objeto de requisição para abrir o DB
var db; // Objeto da base de dados após a conexão ser estabelecida
var modelName; // Array para guardar os nomes dos modelos já existentes (para evitar duplicados)

// IIFE (Immediately Invoked Function Expression) assíncrona para inicializar o IndexedDB do TensorFlow.js
// O TensorFlow.js cria a sua própria base de dados ('tensorflowjs') ao guardar um modelo.
// Esta função força a criação da DB antes de tentarmos abri-la explicitamente.
(async function(callback) {
  // 1. Cria um modelo TF.js sequencial vazio
  const model = tf.sequential();
  // 2. Tenta guardar o modelo no IndexedDB. Se a DB 'tensorflowjs' não existir, TF.js irá criá-la.
  await model.save('indexeddb://dummy');
  // 3. Remove imediatamente o modelo 'dummy' que acabou de ser guardado.
  await tf.io.removeModel('indexeddb://dummy');
  // 4. Regista que a inicialização (forçada) da DB foi concluída.
  console.log('DB initialised');
  // 5. Chama a função de callback passada (dbInit).
  callback();
})(dbInit); // 6. Invoca a função imediatamente, passando dbInit como callback.

/**
 * Abre a conexão com a base de dados IndexedDB 'tensorflowjs'.
 * Esta função é chamada como callback após a IIFE garantir que a DB existe.
 */
function dbInit() {
  // Tenta abrir a base de dados 'tensorflowjs', versão 1.
  request = window.indexedDB.open('tensorflowjs', 1);

  // Chamado se a versão da DB precisar ser atualizada (não esperado aqui, pois TF.js gere a estrutura).
  request.onupgradeneeded = function(e) {
    console.log('onupgradeneeded: Algo inesperado aconteceu!');
  };
  // Chamado se ocorrer um erro ao abrir a DB.
  request.onerror = function(e) {
    console.error('Erro ao abrir IndexedDB:', e);
  };
  // Chamado quando a DB é aberta com sucesso.
  request.onsuccess = function(e) {
    // Guarda a referência ao objeto da base de dados.
    db = request.result;
    console.log('Base de dados IndexedDB do TensorFlow.js aberta com sucesso.');
  };
}

// --- Variáveis Globais da Aplicação ---
let $CAMIC = null; // Placeholder para a instância principal do CaMic (visualizador + ferramentas)
const $UI = {}; // Objeto para guardar referências aos componentes da interface do utilizador (modais, toolbar, etc.)
const $D = { // Objeto para guardar dados e parâmetros da aplicação
  pages: { // URLs para navegação
    home: '../table.html',
    table: '../table.html',
  },
  params: null, // Parâmetros obtidos do URL da página
};
// Constantes comentadas (possivelmente de versões anteriores ou outras funcionalidades)
// const objAreaMin = 400;
// const objAreaMax = 4500;
// const lineWidth = 2;
// const timeOutMs = 10;

/**
 * Limpa uma string para prevenir XSS básico, substituindo caracteres especiais por entidades HTML.
 * @param {string} string - A string de entrada a ser limpa.
 * @returns {string} A string limpa.
 */
function sanitize(string) {
  // Garante que a entrada é uma string, mesmo que seja null ou undefined.
  string = string || '';
  // Mapa de caracteres a serem substituídos.
  const map = {
    '&': '&amp;', // &
    '<': '&lt;',  // <
    '>': '&gt;',  // >
    '"': '&quot;', // "
    '\'': '&#x27;', // '
    '/': '&#x2F;', // /
  };
  // Expressão regular para encontrar os caracteres a serem substituídos (global, case-insensitive).
  const reg = /[&<>"'/]/ig;
  // Converte para string (caso não seja) e substitui os caracteres encontrados usando o mapa.
  return string.toString().replace(reg, (match)=>(map[match]));
}

/**
 * Função de inicialização principal da página.
 * Espera que um pacote (presumivelmente CaMic ou dependências) termine de carregar
 * antes de inicializar os componentes da UI e o núcleo da aplicação.
 */
function initialize() {
  // Verifica a cada 100ms se a variável global 'IsPackageLoading' (definida noutro local) é falsa.
  var checkPackageIsReady = setInterval(function() {
    // Assume que 'IsPackageLoading' se torna falso quando o pacote está pronto.
    // NOTA: A lógica original `if (IsPackageLoading)` parece invertida. Deveria ser `if (!IsPackageLoading)`?
    //       Ou talvez `IsPackageLoading` seja um objeto/função que indica prontidão quando verdadeiro?
    //       Assumindo que a lógica original está correta conforme escrita:
    if (IsPackageLoading) { // Se o pacote está pronto (assumindo que IsPackageLoading=true indica pronto)
      clearInterval(checkPackageIsReady); // Para de verificar
      initUIcomponents(); // Inicializa os componentes da interface do utilizador
      initCore(); // Inicializa o núcleo do CaMic (visualizador)
    }
  }, 100);
}

/**
 * Inicializa os componentes da interface do utilizador (modais, barra de ferramentas, etc.).
 * Função assíncrona porque precisa de listar modelos do IndexedDB.
 */
async function initUIcomponents() {
  /* Cria os componentes da UI */
  console.log("Inicializando componentes da UI...");

  // Cria o Modal para upload de modelos.
  $UI.uploadModal = new ModalBox({ // Usa a classe ModalBox (definida noutro local)
    id: 'upload_panel', // ID do elemento HTML que conterá o modal
    hasHeader: true, // O modal terá um cabeçalho
    headerText: 'Upload Model', // Texto do cabeçalho
    hasFooter: false, // Não terá rodapé padrão
    provideContent: true, // O conteúdo será fornecido aqui
    content: ` <!-- Conteúdo HTML do modal -->
      <form action="#" class='form-style'> <!-- Formulário para upload -->
      <ul>
          <!-- Campos do formulário -->
          <li>
            <label align="left"> Name:  </label>
            <input name="name" id="name" type="text" required />
            <span> Name of the model </span>
          </li>
          <li>
            <label align="left"> Classes: </label>
            <input name="classes" id="classes" type="text" required />
            <span> Enter the classes model classifies into separated by comma. </span>
          </li>
          <li>
            <label align="left"> Input patch size: </label>
            <input name="imageSize" id="imageSize" type="number" required />
            <span> The image size on which the model is trained </span>
          </li>
            <label>Input image format:</label> <br>
            <input type="radio" id="gray" name="channels" value=1 checked>
            <label for="gray">Gray</label> <br>
            <input type="radio" id="rgb" name="channels" value=3>
            <label for="rgb" padding="10px">RGB</label>
          <li id="mg">
            <label for="magnification">Magnification:</label>
            <select id="magnification">
              <option value=10>10x</option>
              <option value=20>20x</option>
              <option value=40>40x</option>
            </select>
            <span> Magnification of input images </span>
          </li>
        <hr>
        <label class="switch"><input type="checkbox" id="togBtn"><div class="slider"></div></label> <br> <br>
        <div class="checkfalse"><div>Select model.json first followed by the weight binaries.</div> <br>
        <input name="filesupload" id="modelupload" type="file" required/>
        <input name="filesupload" id="weightsupload" type="file" multiple="" required/> <br> <br> </div>
        <div class="checktrue" > URL to the ModelAndWeightsConfig JSON describing the model. <br> <br>
        <label align-"left"> Enter the URL: </label> <input type="url" name="url" id="url" required> <br><br></div>
        <button id="submit">Upload</button> <span id="status"></span> <br>
      </form>
      <button id="refresh" class='material-icons'>cached</button> <!-- Botão para recarregar/resetar? -->
    `,
  });

  // Cria o Modal para mostrar informações sobre os modelos guardados.
  $UI.infoModal = new ModalBox({
    id: 'model_info', // ID do elemento HTML
    hasHeader: true,
    headerText: 'Available Models', // Texto do cabeçalho
    hasFooter: false,
    provideContent: true,
    content: ` <!-- Conteúdo HTML: uma tabela para listar os modelos -->
      <table id='mtable'>
        <thead> <!-- Cabeçalho da tabela -->
          <tr>
            <th>Name</th>
            <th>Classes</th>
            <th>Input Size</th>
            <th>Size (MB)</th>
            <th>Date Saved</th>
            <th>Remove Model</th>
            <th id = editclass>Edit Class List</th>
          </tr>
          <tbody id="mdata">
          </tbody>
        </thead>
      </table>
    `,
  });

  // Create infoModal to show information about models uploaded.
  $UI.helpModal = new ModalBox({
    id: 'help',
    hasHeader: true,
    headerText: 'Help',
    hasFooter: false,
  });
  // Create Modal to take input from user of new class list
  $UI.chngClassLst = new ModalBox({
    id: 'chngClass',
    hasHeader: true,
    headerText: 'Help',
    hasFooter: false,
  });

  // Create roiExtract for taking details of ROI extraction
  $UI.roiModal = new ModalBox({
    id: 'roi_panel',
    hasHeader: true,
    headerText: 'ROI Extraction', // Texto do cabeçalho
    hasFooter: false,
    provideContent: true,
    content: ` <!-- Conteúdo HTML: Tabela para listar modelos disponíveis para extração -->
      <div class = "message" >
        <h3> Please select a model</h3> <!-- Instrução para o utilizador -->
      </div><br>
      <table id = 'roitable'>
        <thead> <!-- Cabeçalho da tabela -->
          <tr>
            <th>Name</th>
            <th>Classes</th>
            <th>Input Size</th>
            <th>Size (MB)</th>
            <th>Date Saved</th>
            <th>Select Model</th>
          </tr>
          <tbody id = "roidata">
          </tbody>
        </thead>
      </table>
    `,
  });

  // Cria o Modal para o utilizador selecionar os parâmetros de extração de ROI.
  $UI.choiceModal = new ModalBox({
    id: 'choice_panel', // ID do elemento HTML
    hasHeader: true,
    headerText: 'Select Parameters', // Texto do cabeçalho
    hasFooter: false,
    provideContent: true,
    content: ` <!-- Conteúdo HTML: Formulário/Tabela para escolhas de extração -->
    <div class = "message" >
      <h3> Select the parameters for the patches that you want to download</h3> <!-- Instrução -->
    </div><br>
      <table id = 'choicetable'>
        <thead>
          <!-- O corpo (tbody#choicedata) será preenchido dinamicamente -->
          <tbody id = "choicedata">
          </tbody>
        </thead>
      </table>
    `,
  });

  // Cria o Modal para mostrar os detalhes após a extração de ROI.
  $UI.detailsModal = new ModalBox({
    id: 'details_panel', // ID do elemento HTML
    hasHeader: true,
    headerText: 'Details', // Texto do cabeçalho
    hasFooter: false,
    provideContent: true,
    content: ` <!-- Conteúdo HTML: Lista/Tabela para mostrar resultados da extração -->
    <div class= "message" >
      <h3> The details of the extracted patches are : </h3> <!-- Título -->
    </div><br>
      <table id='detailstable'>
        <thead>
          <!-- O corpo (tbody#detailsdata) será preenchido dinamicamente -->
          <tbody id="detailsdata">
          </tbody>
        </thead>
      </table>
    `,
  });

  // Cria a fila de mensagens para notificações
  $UI.message = new MessageQueue(); // Usa a classe MessageQueue (definida noutro local)

  // --- Preparação dos Menus Dropdown da Barra de Ferramentas ---
  // Lista para o dropdown de seleção de modelo
  const dropDownList = [];
  modelName = []; // Reinicia a lista de nomes de modelos conhecidos
  // Lista os modelos guardados no IndexedDB pelo TensorFlow.js
  Object.keys(await tf.io.listModels()).forEach(function(element) { // `element` é a chave completa, ex: 'indexeddb://pred_...'
    const dict = {}; // Objeto para representar um item do dropdown
    const value = element.split('/').pop(); // Extrai o nome do modelo (ex: 'pred_...')
    // Verifica se o modelo é do tipo 'pred' (convenção de nome)
    if (value.slice(0, 4) == 'pred') {
      // Extrai um título mais legível do nome do modelo
      const title = element.split('/').pop().split('_').splice(2).join('_').slice(0, -3);
      dict.icon = 'flip_to_back'; // Ícone para o item
      dict.title = title; // Texto do item
      dict.value = value; // Valor associado (nome completo do modelo no IndexedDB)
      dict.checked = false; // Estado inicial (não selecionado)
      // Guarda o nome legível para verificação de duplicados no upload
      modelName.push(dict['title']);
      // Adiciona o objeto à lista do dropdown
      dropDownList.push(dict);
    }
  });

  // Lista para o dropdown de seleção de método de escalonamento de píxeis
  const filterList = [
    {
      icon: 'filter_1', // Ícone
      title: 'Normalization', // Texto
      value: 'norm', // Valor associado
      checked: true, // Opção padrão
    }, {
      icon: 'filter_2',
      title: 'Centering',
      value: 'center',
      checked: false,
    }, {
      icon: 'filter_3',
      title: 'Standardization',
      value: 'std',
      checked: false,
    },
  ];

  // Cria a barra de ferramentas principal
  $UI.toolbar = new CaToolbar({ // Usa a classe CaToolbar (definida noutro local)
    id: 'ca_tools', // ID do elemento HTML que conterá a barra
    zIndex: 601, // Ordem de empilhamento CSS
    hasMainTools: false, // Não inclui as ferramentas principais padrão do CaMic
    subTools: [ // Array de definições para as ferramentas/botões da barra
      // Botão para ativar/desativar o desenho de retângulo (predição/seleção ROI)
      {
        icon: 'aspect_ratio', // Ícone do Material Icons
        type: 'check', // Tipo de botão (toggle)
        value: 'rect', // Valor associado (não parece ser usado diretamente)
        title: 'Predict', // Texto de tooltip
        callback: drawRectangle, // Função a ser chamada quando o estado muda
      },
      // Dropdown para selecionar o modelo
      {
        icon: 'keyboard_arrow_down',
        type: 'dropdown',
        value: 'rect', // Valor (não parece relevante aqui)
        dropdownList: dropDownList, // A lista de modelos preenchida anteriormente
        title: 'Select Model',
        callback: setValue, // Função chamada quando um item é selecionado
      },
      // Dropdown para selecionar o método de escalonamento
      {
        icon: 'photo_filter',
        type: 'dropdown',
        dropdownList: filterList, // A lista de filtros definida acima
        title: 'Pixel Scaling',
        callback: setFilter, // Função chamada quando um item é selecionado
      },
      // Botão para voltar ao visualizador principal
      {
        icon: 'insert_photo',
        type: 'btn', // Tipo botão simples
        value: 'viewer',
        title: 'Viewer',
        callback: function() { // Função de callback para navegação
          // Mantém os parâmetros de query existentes (ex: slideId)
          if (window.location.search.length > 0) {
            window.location.href = '../viewer/viewer.html' + window.location.search;
          } else {
            window.location.href = '../viewer/viewer.html';
          }
        },
      },
      // Botão para abrir o modal de upload de modelo
      {
        icon: 'add',
        type: 'btn',
        value: 'Upload model',
        title: 'Add model',
        callback: uploadModel, // Chama a função que abre e gere o modal de upload
      },
      // Botão para abrir o modal de informações dos modelos
      {
        icon: 'info',
        type: 'btn',
        value: 'Model info',
        title: 'Model info',
        callback: showInfo, // Chama a função que preenche e abre o modal de info
      },
      // Botão para abrir o modal de ajuda
      {
        icon: 'help',
        type: 'btn',
        value: 'Help',
        title: 'Help',
        callback: openHelp, // Chama a função que define e abre o modal de ajuda
      },
      // Botão para iniciar o fluxo de extração de ROI
      {
        icon: 'archive',
        type: 'btn',
        value: 'ROI',
        title: 'ROI',
        callback: selectModel, // Chama a função que abre o modal de seleção de modelo para ROI
      },
      // Botão para reportar bugs (abre link externo)
      {
        icon: 'bug_report',
        title: 'Bug Report',
        value: 'bugs',
        type: 'btn',
        callback: () => { // Abre o link do GitHub Issues numa nova aba
          window.open('https://github.com/camicroscope/caMicroscope/issues', '_blank').focus();
        },
      },
      // Botão para mostrar/esconder o sumário do modelo TensorFlow (usando tfjs-vis)
      {
        icon: 'subject',
        title: 'Model Summary',
        value: 'summary',
        type: 'btn',
        callback: () => { // Alterna a visibilidade do visor do tfjs-vis
          tfvis.visor().toggle();
        }},
    ],
  });
  console.log("Componentes da UI inicializados.");
}

/**
 * Inicializa o núcleo da aplicação CaMic (visualizador OpenSeadragon e suas extensões).
 */
function initCore() {
  console.log("Inicializando o núcleo CaMic...");
  // Opções de configuração para a instância CaMic
  const opt = {
    hasZoomControl: true, // Inclui controlos de zoom padrão do OSD
    hasDrawLayer: true, // Inclui a camada de desenho do CaMic
    hasLayerManager: true, // Inclui o gestor de camadas
    hasScalebar: true, // Inclui a barra de escala
    hasMeasurementTool: true, // Inclui a ferramenta de medição
  };

  // Define estados iniciais se existirem nos parâmetros do URL
  if ($D.params.states) {
    opt.states = $D.params.states;
  }

  // Tenta criar a instância principal do CaMic
  try {
    // Prepara a query com informações da lâmina (obtidas dos parâmetros do URL)
    const slideQuery = {};
    slideQuery.id = $D.params.slideId;
    slideQuery.name = $D.params.slide;
    slideQuery.location = $D.params.location;
    // Cria a instância CaMic, associando-a ao div 'main_viewer'
    $CAMIC = new CaMic('main_viewer', slideQuery, opt);
    console.log("Instância CaMic criada.");
  } catch (error) {
    // Em caso de erro na inicialização do CaMic
    Loading.close(); // Fecha qualquer indicador de carregamento global
    $UI.message.addError('Core Initialization Failed'); // Mostra erro na fila de mensagens
    console.error("Erro ao inicializar o CaMic:", error);
    return; // Interrompe a execução de initCore
  }

  // Inicia o carregamento da imagem da lâmina
  $CAMIC.loadImg(function(e) {
    // Callback chamado após a tentativa de carregamento da imagem
    if (e.hasError) {
      // Se houver erro no carregamento da imagem
      $UI.message.addError(e.message); // Mostra mensagem de erro
    } else {
      // Se a imagem carregar com sucesso, guarda os metadados da imagem
      $D.params.data = e;
      console.log("Imagem carregada:", e);
    }
    // Adiciona um handler para o caso de falha na abertura da imagem pelo OSD
    $CAMIC.viewer.addHandler('open-failed', function(e) {
      console.error("Falha ao abrir a imagem no OpenSeadragon:", e.message, e);
      // Redireciona para a página da tabela após 5 segundos
      redirect($D.pages.table, e.message, 5);
    });
  });

  // Obtém informações adicionais da lâmina (filepath) a partir do store do CaMic
  // (Isto parece redundante se $D.params.location já estiver definido, mas pode ser um fallback)
  $CAMIC.store.getSlide($D.params.slideId).then((response) => {
    if (response[0]) { // Verifica se a lâmina foi encontrada
      if (response[0]['filepath']) {
        return response[0]['filepath']; // Retorna o filepath se existir
      }
      // Se não houver filepath, tenta extrair o nome do ficheiro do URL atual (lógica questionável)
      return location.substring(
          location.lastIndexOf('/') + 1,
          location.length,
      );
    } else {
      throw new Error('Slide not found in store'); // Lança erro se a lâmina não for encontrada
    }
  }).then((fName) => {
    // Guarda o nome do ficheiro obtido (uso atual incerto)
    fileName = fName;
    console.log("Nome do ficheiro da lâmina:", fileName);
  }).catch(error => {
    console.warn("Não foi possível obter o nome do ficheiro da lâmina:", error);
  });

  // Adiciona um handler que será executado apenas uma vez quando a imagem for aberta com sucesso no OSD
  $CAMIC.viewer.addOnceHandler('open', function(e) {
    console.log("OpenSeadragon viewer aberto.");
    const viewer = $CAMIC.viewer; // Referência ao visualizador OSD

    // Adiciona um handler para o evento 'stop-drawing' da instância de desenho do CaMic
    // Este evento é disparado quando o utilizador termina de desenhar (ex: um retângulo)
    viewer.canvasDrawInstance.addHandler('stop-drawing', camicStopDraw);

    // Cria a instância do painel de modelo (UI flutuante)
    $UI.modelPanel = new ModelPanel(viewer);

    // Adiciona listener ao botão 'save' dentro do ModelPanel (funcionalidade de guardar imagem ROI)
    $UI.modelPanel.__btn_save.addEventListener('click', function(e) {
      // Define o nome do ficheiro para a imagem ROI
      const fname = $D.params.slideId + '_roi.png';
      // Chama a função de download para o canvas que contém a imagem da ROI
      download($UI.modelPanel.__fullsrc, fname);
    });

    // Adiciona listener ao botão 'savecsv' dentro do ModelPanel (guardar probabilidades)
    $UI.modelPanel.__btn_savecsv.addEventListener('click', function(e) {
      // Define o nome do ficheiro CSV
      const fname = $D.params.slideId + '_roi.csv';
      // Chama a função de download para o conteúdo CSV
      downloadCSV(fname);
    });
  });
  console.log("Núcleo CaMic inicializado.");
}

/**
 * Callback para o dropdown de seleção de modelo. Guarda o modelo selecionado.
 * @param {object} args - Objeto contendo informações do item selecionado (ex: args.status contém o nome do modelo).
 */
function setValue(args) {
  console.log("Modelo selecionado:", args);
  $UI.args = args; // Guarda o objeto de argumentos (incluindo o nome do modelo)
}

/**
 * Callback para o dropdown de seleção de filtro/escalonamento. Guarda o filtro selecionado.
 * @param {object} filter - Objeto contendo informações do filtro selecionado (ex: filter.status contém o valor 'norm', 'center' ou 'std').
 */
function setFilter(filter) {
  console.log("Filtro selecionado:", filter);
  $UI.filter = filter; // Guarda o objeto do filtro
}

/**
 * Callback para o botão 'Predict' (aspect_ratio) da barra de ferramentas.
 * Ativa/desativa o modo de desenho de retângulo no visualizador.
 * @param {object} e - Objeto do evento do botão, contém o estado (e.checked) e outros dados.
 */
function drawRectangle(e) {
  console.log("drawRectangle chamado:", e);
  const canvas = $CAMIC.viewer.drawer.canvas; // A tela principal de desenho do OSD
  // Muda o cursor para 'crosshair' se estiver a desenhar, 'default' caso contrário
  canvas.style.cursor = e.checked ? 'crosshair' : 'default';

  var args; // Argumentos para configurar o desenho (tamanho do passo)
  const canvasDraw = $CAMIC.viewer.canvasDrawInstance; // Instância de desenho do CaMic

  // Verifica se estamos no modo de seleção de ROI (passado pelo extractRoiSelect)
  if (e.state == 'roi') {
    args = {status: ''};
    args.status = e.model; // Usa o nome do modelo passado para obter o tamanho do passo
    console.log("Modo ROI, args:", args);
  } else {
    // Modo de predição normal, usa o modelo selecionado no dropdown
    args = $UI.args;
  }

  // Define o modo de desenho para 'stepSquare' (desenha quadrados com tamanho de passo fixo)
  canvasDraw.drawMode = 'stepSquare';
  // Define o tamanho do passo (extraído do nome do modelo, ex: 'pred_256-40_...')
  if (args && args.status) {
      try {
          canvasDraw.size = parseInt(args.status.split('_')[1].split('-')[0]);
      } catch (parseError) {
          console.warn("Não foi possível extrair o tamanho do passo do nome do modelo:", args.status, parseError);
          canvasDraw.size = 1; // Fallback
      }
  } else {
      console.warn("Nenhum modelo selecionado para definir o tamanho do passo.");
      canvasDraw.size = 1; // Fallback
  }
  // Define a cor e estilo do desenho
  canvasDraw.style.color = '#FFFF00'; // Amarelo
  canvasDraw.style.isFill = false; // Apenas contorno

  // Ativa ou desativa o desenho
  if (e.checked ) { // Se o botão está ativo (marcado)
    // Avisa sobre o nível de zoom, se aplicável
    const currentZoom = Math.round($CAMIC.viewer.imagingHelper._zoomFactor * $CAMIC.viewer.imagingHelper.getSlideMetadata().mpp * 10000 / 10); // Aproximação do zoom (ex: 40x)
    let requiredZoom = currentZoom; // Assume zoom atual por defeito
    if ($UI.args && $UI.args.status) {
        try {
            requiredZoom = parseInt($UI.args.status.split('_')[1].split('-')[1]);
        } catch (parseError) {
            console.warn("Não foi possível extrair o zoom recomendado do nome do modelo:", $UI.args.status, parseError);
        }
    }

    // Mostra alerta se o zoom atual for diferente do recomendado E não estivermos no modo de seleção ROI (flag != 0)
    if (currentZoom != requiredZoom && flag != 0) {
      alert(`Está a usar um nível de zoom (${currentZoom}x) diferente do recomendado para este modelo (${requiredZoom}x). O desempenho pode ser afetado.`);
    }

    // Desativa os dropdowns enquanto desenha
    document.querySelectorAll('.drop_down').forEach(el => el.classList.add('disabled'));
    // Ativa o modo de desenho
    canvasDraw.drawOn();
    console.log("Modo de desenho ATIVADO");
  } else { // Se o botão está inativo (desmarcado)
    // Desativa o modo de desenho
    canvasDraw.drawOff();
    // Reativa os dropdowns
    document.querySelectorAll('.drop_down').forEach(el => el.classList.remove('disabled'));
    console.log("Modo de desenho DESATIVADO");
  }
}

/**
 * Callback chamado quando o utilizador termina de desenhar na tela (evento 'stop-drawing').
 * Processa o retângulo desenhado para predição ou extração de ROI.
 * @param {object} e - Objeto do evento (pode conter informações sobre o desenho).
 */
function camicStopDraw(e) {
  console.log("camicStopDraw chamado:", e);
  const viewer = $CAMIC.viewer;
  const canvasDraw = viewer.canvasDrawInstance;
  // Obtém a coleção de features (formas geométricas) desenhadas
  const imgColl = canvasDraw.getImageFeatureCollection();

  // Verifica se existe uma feature (o retângulo) e se tem pelo menos 5 pontos (garante que é um retângulo fechado)
  if (imgColl.features.length > 0 && imgColl.features[0].bound.coordinates[0].length >= 5) {
    // Verifica o tamanho da ROI desenhada e obtém coordenadas
    const box = checkSize(imgColl, viewer.imagingHelper);

    // Se checkSize retornar um objeto vazio, houve erro (ex: ROI muito grande)
    if (Object.keys(box).length === 0 && box.constructor === Object) {
      console.error('ROI inválida ou muito grande.');
      // Não faz nada, o alerta já foi mostrado em checkSize
    } else {
      // Obtém os argumentos do modelo selecionado
      const args = $UI.args;
      console.log("Flag atual:", flag);

      // Decide se executa a predição ou a extração de ROI com base na flag
      if (flag != -1 ) { // Se flag não for -1, estamos no modo de extração de ROI selecionada
        // Chama extractRoi passando as escolhas guardadas (choices1) e a flag
        extractRoi(choices1, flag);
      } else { // Modo de predição normal
        if (args && args.status) { // Verifica se um modelo foi selecionado
          // Chama a função de predição com o nome do modelo
          runPredict(args.status);
        } else {
          console.warn("Nenhum modelo selecionado para predição.");
          alert("Por favor, selecione um modelo no menu dropdown.");
        }
      }

      // Posiciona o painel de modelo ($UI.modelPanel) sobre a ROI desenhada
      $UI.modelPanel.setPosition(box.rect.x, box.rect.y, box.rect.width, box.rect.height);
      // Abre o painel se a largura da ROI for válida (evita abrir se checkSize falhou silenciosamente)
      if ($UI.modelPanel.__spImgWidth != 0) {
        $UI.modelPanel.open(); // Passar args aqui pode ser útil se open() os usasse
      }

      // Limpa o retângulo desenhado da tela
      canvasDraw.clear();
      // Reseta o conteúdo CSV
      csvContent = '';
    }
  } else {
    console.error('Não foi possível obter a feature collection ou o retângulo não está completo.');
    // Limpa qualquer desenho incompleto
    canvasDraw.clear();
  }
  // Garante que o modo de desenho é desativado e os dropdowns reativados
  drawRectangle({ checked: false });
}

/**
 * Verifica o tamanho da ROI desenhada e calcula as suas coordenadas em diferentes sistemas.
 * Guarda as coordenadas relevantes no objeto $UI.modelPanel.
 * @param {object} imgColl - A coleção de features obtida do canvasDraw.
 * @param {OpenSeadragon.ImagingHelper} imagingHelper - O helper de imagem do CaMic.
 * @returns {object} Um objeto contendo a posição/tamanho no viewport (`rect`) e coordenadas no ecrã,
 *                   ou um objeto vazio `{}` se a ROI for muito grande.
 */
function checkSize(imgColl, imagingHelper) {
  // Coordenadas do retângulo desenhado no sistema de coordenadas da imagem (nível 0)
  const bound = imgColl.features[0].bound; // Assume que a primeira feature é o retângulo

  // Extrai os cantos superior esquerdo e inferior direito em coordenadas da imagem
  const topLeft = bound.coordinates[0][0]; // [x, y]
  const bottomRight = bound.coordinates[0][2]; // [x, y]

  // Converte as coordenadas da imagem para coordenadas do viewport OSD
  const min = imagingHelper._viewer.viewport.imageToViewportCoordinates(topLeft[0], topLeft[1]);
  const max = imagingHelper._viewer.viewport.imageToViewportCoordinates(bottomRight[0], bottomRight[1]);
  // Cria um retângulo OSD representando a área no viewport
  const rect = new OpenSeadragon.Rect(min.x, min.y, max.x-min.x, max.y-min.y);

  // Guarda as coordenadas e dimensões da imagem (nível 0) no objeto modelPanel
  const self = $UI.modelPanel;
  self.__top_left = topLeft; // Guarda [x, y] da imagem
  self.__spImgX = topLeft[0]; // Coordenada X da imagem
  self.__spImgY = topLeft[1]; // Coordenada Y da imagem
  self.__spImgWidth = bottomRight[0]-topLeft[0]; // Largura na imagem
  self.__spImgHeight = bottomRight[1]-topLeft[1]; // Altura na imagem

  // Converte as coordenadas da imagem para coordenadas físicas do ecrã (pixels do ecrã)
  const screenCoords = convertCoordinates(imagingHelper, bound);

  // Ajusta para ecrãs de alta densidade (Retina) multiplicando pelo PDR
  const adjustedCoords = screenCoords.map(function(a) {
    const x = a.slice(); // Cria cópia
    x[0] *= PDR; // Ajusta X
    x[1] *= PDR; // Ajusta Y
    return x;
  });

  // Calcula as coordenadas e dimensões finais no ecrã (arredondadas)
  const xCoord = Math.round(adjustedCoords[0][0]);
  const yCoord = Math.round(adjustedCoords[0][1]);
  const width = Math.round(adjustedCoords[2][0] - xCoord);
  const height = Math.round(adjustedCoords[2][1] - yCoord);

  // Guarda as coordenadas e dimensões do ecrã no objeto modelPanel (uso incerto no resto do código)
  self.__x = xCoord;
  self.__y = yCoord;
  self.__width = width; // Nota: aqui guardou xCoord de novo, deveria ser width? Corrigido abaixo.
  self.__height = height; // Nota: aqui guardou yCoord de novo, deveria ser height? Corrigido abaixo.
  // Correção:
  self.__width = width;
  self.__height = height;


  // Verifica se a área da ROI (em pixels do ecrã ajustados) excede um limite (8 Megapixels)
  const maxPixels = 8000000;
  if (width * height > maxPixels) {
    alert(`ROI selecionada demasiado grande (${(width*height/1000000).toFixed(1)} MP). O limite atual é ${maxPixels/1000000} MP.`);
    // Limpa o retângulo desenhado
    $CAMIC.viewer.canvasDrawInstance.clear();
    // Retorna um objeto vazio para indicar falha na verificação
    return {};
  } else {
    // Retorna o objeto com as informações da ROI se o tamanho for válido
    return {'rect': rect, 'xCoord': xCoord, 'yCoord': yCoord, 'width': width, 'height': height};
  }
}

/**
 * Executa a predição do modelo TensorFlow.js na ROI selecionada.
 * @param {string} key - O nome/chave do modelo no IndexedDB (ex: 'pred_256-40_...')
 */
async function runPredict(key) {
  console.log("Executando predição com o modelo:", key);
  // Obtém as coordenadas e dimensões da ROI (em coordenadas da imagem nível 0) do modelPanel
  const self = $UI.modelPanel;
  const X = self.__spImgX; // Coordenada X inicial da ROI
  const Y = self.__spImgY; // Coordenada Y inicial da ROI
  const totalSize = self.__spImgWidth; // Largura/Altura da ROI (assume quadrado?)
  // Extrai o tamanho do passo (tamanho do patch de entrada do modelo) do nome do modelo
  const step = parseInt(key.split('_')[1].split('-')[0]);

  // Reseta a área de resultados no painel
  self.showResults(' --Result-- ');

  // Verifica se a ROI tem tamanho válido
  if (totalSize > 0 && step > 0) {
    // Determina o URL base para buscar os patches de imagem
    // Depende do modo do carregador de imagens (IIP ou slideloader padrão)
    const prefixUrl = ImgloaderMode == 'iip' ? `../../img/IIP/raw/?IIIF=${$D.params.data.location}` : $CAMIC.slideId; // TODO: Verificar se $CAMIC.slideId funciona como prefixo para slideloader
    // Mostra o indicador de progresso
    self.showProgress('Predicting...');

    // Canvas usado para desenhar e obter dados de cada patch
    const fullResCvs = self.__fullsrc;

    // Abre uma transação de leitura na 'models_store' do IndexedDB
    const tx = db.transaction('models_store', 'readonly');
    const store = tx.objectStore('models_store');
    // Obtém os metadados do modelo (incluindo classes e input_shape)
    store.get(key).onsuccess = async function(e) {
      try {
        // Ordena as classes alfabeticamente (TensorFlow.js/Keras faz isso internamente)
        const classes = e.target.result.classes.sort();
        // Obtém a forma de entrada esperada pelo modelo
        const inputShape = e.target.result.input_shape;
        // Assume 3 canais de cor (RGB) - TODO: Deveria usar inputShape[3]?
        const inputChannels = 3; // parseInt(inputShape[3]);
        // Tamanho da imagem de entrada (altura/largura)
        const imageSize = inputShape[1]; // Assume altura = largura

        // Carrega o modelo TensorFlow.js a partir do IndexedDB
        const model = await tf.loadLayersModel(IDB_URL + key);
        self.showProgress('Model loaded...');
        // Mostra o sumário do modelo no painel do tfjs-vis
        tfvis.show.modelSummary({name: 'Model Summary', tab: 'Model Inspection'}, model);

        // Pré-aquece o modelo fazendo uma predição com dados vazios (otimização)
        tf.tidy(()=>{ // tf.tidy ajuda a limpar tensores intermediários da memória
          model.predict(tf.zeros([1, imageSize, imageSize, inputChannels]));
          console.log('Modelo pré-aquecido e pronto.');
        });

        // Regista o uso de memória inicial (apenas informativo)
        const memory = tf.memory();
        console.log('Uso de Memória do Modelo (GPU):', memory.numBytesInGPU, 'bytes');
        console.log('Uso de Memória do Modelo (Total):', memory.numBytes, 'bytes');

        // Canvas dummy (uso incerto, talvez para pré-carregar contexto?)
        const temp = document.querySelector('#dummy');
        temp.height = step;
        temp.width = step;

        // Função auxiliar para carregar uma imagem de um URL e retornar uma Promise
        function addImageProcess(src) {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img); // Resolve com o objeto Image carregado
            img.onerror = reject; // Rejeita em caso de erro
            img.src = src; // Define o src para iniciar o carregamento
          });
        }

        // Array para guardar os resultados (probabilidades) de cada patch
        const results = [];
        // Inicializa o conteúdo CSV com o cabeçalho (nomes das classes + x, y)
        csvContent = 'data:text/csv;charset=utf-8,';
        classes.forEach((e) => {
          csvContent += sanitize(e) + ','; // Adiciona nome da classe (limpo)
        });
        csvContent += 'x,y\n\r'; // Adiciona cabeçalhos de coordenadas relativas
        self.showProgress('Predicting...'); // Atualiza indicador

        // Itera sobre a ROI em passos (step)
        for (let y = Y, dy = 0; y < (Y + totalSize); y += step) { // Loop pelas linhas (Y)
          let dx = 0; // Coordenada X relativa dentro da ROI
          for (let x = X; x < (X + totalSize); x += step) { // Loop pelas colunas (X)
            // Constrói o URL para buscar o patch atual
            // Formato: prefix/x,y,w,h/maxSize,/rot/quality.fmt
            const src = `${prefixUrl}/${x},${y},${step},${step}/${step},/0/default.jpg`;

            try {
              // Carrega a imagem do patch
              const lImg = await addImageProcess(src);
              // Ajusta o tamanho do canvas ao tamanho real do patch recebido
              fullResCvs.height = lImg.height;
              fullResCvs.width = lImg.width;
              // Desenha a imagem do patch no canvas
              const ctx = fullResCvs.getContext('2d');
              ctx.drawImage(lImg, 0, 0);

              // Obtém os dados de píxeis do canvas
              const imgData = ctx.getImageData(0, 0, fullResCvs.width, fullResCvs.height);

              // Processamento com TensorFlow.js dentro de tf.tidy para gestão de memória
              tf.tidy(()=>{
                // Converte os dados de píxeis num tensor [altura, largura, canais]
                const img = tf.browser.fromPixels(imgData).toFloat();
                let img2;
                // Redimensiona a imagem para o tamanho esperado pelo modelo
                if (inputChannels == 1) { // Se o modelo espera escala de cinza
                  img2 = tf.image.resizeBilinear(img, [imageSize, imageSize]).mean(2); // Redimensiona e calcula a média dos canais
                } else { // Se o modelo espera RGB
                  img2 = tf.image.resizeBilinear(img, [imageSize, imageSize]); // Apenas redimensiona
                }

                // Aplica o método de escalonamento de píxeis selecionado
                const scaleMethod = $UI.filter ? $UI.filter.status : 'norm'; // Padrão: 'norm'
                // console.log("Método de escalonamento:", scaleMethod);

                let normalized;
                if (scaleMethod == 'norm') {
                  // Normalização: escala os valores para o intervalo [0, 1]
                  const scale = tf.scalar(255);
                  normalized = img2.div(scale);
                } else if (scaleMethod == 'center') {
                  // Centralização: subtrai a média dos píxeis (média = 0)
                  const mean = img2.mean();
                  normalized = img2.sub(mean);
                } else { // 'std'
                  // Padronização: subtrai a média e divide pelo desvio padrão (média=0, variância=1)
                  const mean = img2.mean();
                  // Calcula a variância e depois a raiz quadrada (desvio padrão)
                  const variance = img2.squaredDifference(mean).mean(); // Média das diferenças quadradas
                  const std = tf.sqrt(variance);
                  // const std = (img2.squaredDifference(mean).sum()).div(img2.flatten().shape).sqrt(); // Cálculo alternativo
                  normalized = img2.sub(mean).div(std.add(tf.scalar(1e-7))); // Adiciona epsilon para evitar divisão por zero
                }

                // Adiciona uma dimensão de batch (lote) [1, altura, largura, canais]
                const batched = normalized.reshape([1, imageSize, imageSize, inputChannels]);
                // Executa a predição do modelo
                const values = model.predict(batched).dataSync(); // dataSync() obtém os valores como Array

                // Adiciona as probabilidades ao conteúdo CSV
                values.forEach((prob) => {
                  csvContent += prob.toString() + ',';
                });
                csvContent += '' + dx + ',' + dy + '\n\r'; // Adiciona coordenadas relativas

                // Guarda as probabilidades deste patch
                results.push(values);

                dx += step; // Incrementa coordenada X relativa
              }); // Fim do tf.tidy
            } catch (imgError) {
                console.error(`Erro ao processar patch em ${x},${y}:`, imgError);
                // Adiciona uma linha de erro ao CSV? Ou simplesmente ignora?
                // Ignorando por enquanto.
                dx += step;
            }
          } // Fim do loop X
          dy += step; // Incrementa coordenada Y relativa
        } // Fim do loop Y

        // Calcula o resultado final (média das probabilidades sobre todos os patches)
        if (results.length > 0) {
            const len = results.length; // Número de patches processados com sucesso
            const numClasses = results[0].length; // Número de classes
            const final = new Array(numClasses).fill(0); // Array para acumular as probabilidades
            // Soma as probabilidades de cada classe
            for (let i = 0; i < len; i++) {
                for (let j = 0; j < numClasses; j++) {
                final[j] += results[i][j];
                }
            }
            // Calcula a média
            for (let i = 0; i < numClasses; i++) {
                final[i] /= len;
            }

            // Encontra o índice da classe com a maior probabilidade média
            const iMax = Object.keys(final).reduce((a, b) => final[a] > final[b] ? a : b);
            // Mostra o resultado no painel (índice + 1, nome da classe, probabilidade formatada)
            // const classIndex = parseInt(iMax); // Índice baseado em 0
            // self.showResults(`${classIndex + 1}: ${sanitize(classes[classIndex])} - ${final[classIndex].toFixed(3)}`);
            // Correção: O código original adiciona 1 ao índice, o que pode ser confuso. Usando índice 0.
            const classIndex = parseInt(iMax);
             self.showResults(`${sanitize(classes[classIndex])} (${(final[classIndex]*100).toFixed(1)}%)`);

        } else {
            self.showResults("Nenhum patch processado.");
        }

        // Esconde o indicador de progresso
        self.hideProgress();
        // Liberta a memória do modelo carregado
        model.dispose();
        console.log("Predição concluída, modelo descarregado.");

      } catch (modelError) {
          console.error("Erro durante a predição:", modelError);
          self.showResults("Erro na predição.");
          self.hideProgress();
          // Tenta descarregar o modelo se ele foi carregado
          if (typeof model !== 'undefined' && model.dispose) {
              model.dispose();
          }
      }
    }; // Fim do onsuccess do store.get(key)
    store.transaction.onerror = (event) => {
        console.error("Erro na transação IndexedDB ao obter modelo:", event.target.error);
        self.showResults("Erro ao carregar modelo.");
        self.hideProgress();
    };

  } else {
    alert('ROI selecionada muito pequena ou tamanho de passo inválido.');
    console.error("Tamanho da ROI ou passo inválido:", totalSize, step);
  }
}

/**
 * Abre e gere o modal de upload de modelos TensorFlow.js.
 */
// TO-DO: Permitir upload de modelos GraphModel (atualmente focado em LayersModel).
function uploadModel() {
  console.log("Abrindo modal de upload...");
  // Obtém referências aos elementos do formulário dentro do modal de upload
  var _name = document.querySelector('#upload_panel #name');
  var _classes = document.querySelector('#upload_panel #classes');
  var mag = document.querySelector('#upload_panel #magnification');
  var _imageSize = document.querySelector('#upload_panel #imageSize');
  var topology = document.querySelector('#upload_panel #modelupload'); // Input para model.json
  var weights = document.querySelector('#upload_panel #weightsupload'); // Input para weights.bin
  var status = document.querySelector('#upload_panel #status'); // Span para mensagens de status
  var toggle = document.querySelector('#upload_panel #togBtn'); // Checkbox para alternar entre upload de ficheiro e URL
  var url = document.querySelector('#upload_panel #url'); // Input para URL do modelo
  var refresh = document.querySelector('#upload_panel #refresh'); // Botão de refresh (recarrega UI?)
  var submit = document.querySelector('#upload_panel #submit'); // Botão de submit do formulário

  // Limpa os valores de inputs anteriores e o status
  _name.value = _classes.value = topology.value = weights.value = status.innerText = _imageSize.value = url.value = '';
  // Garante que os estilos de erro são removidos
  _name.style.border = '';
  _imageSize.style.border = '';
  status.classList.remove('error', 'blink');
  // Garante que a opção correta (ficheiro ou URL) está visível inicialmente
  toggle.checked = false; // Começa com upload de ficheiro
  document.querySelector('#upload_panel .checktrue').style.display = 'none';
  document.querySelector('#upload_panel .checkfalse').style.display = 'block';


  // Abre o modal de upload
  $UI.uploadModal.open();

  // Listener para o toggle que alterna entre upload de ficheiros e URL
  toggle.addEventListener('change', function(e) {
    if (this.checked) { // Se URL está selecionado
      document.querySelector('#upload_panel .checktrue').style.display = 'block'; // Mostra campo URL
      document.querySelector('#upload_panel .checkfalse').style.display = 'none'; // Esconde campos de ficheiro
    } else { // Se upload de ficheiro está selecionado
      document.querySelector('#upload_panel .checktrue').style.display = 'none'; // Esconde campo URL
      document.querySelector('#upload_panel .checkfalse').style.display = 'block'; // Mostra campos de ficheiro
    }
  });

  // Listener para o botão refresh (recarrega os componentes da UI - útil se algo falhar?)
  refresh.addEventListener('click', () => {
    console.log("Recarregando componentes da UI...");
    initUIcomponents(); // Reinicializa toda a UI (pode ser excessivo)
  });

  // Listener para o botão de submit do formulário de upload
  submit.addEventListener('click', async function(e) {
    e.preventDefault(); // Previne o comportamento padrão de submit do formulário
    console.log("Tentativa de upload de modelo...");

    // Validação básica dos campos obrigatórios
    const isFileMode = !toggle.checked;
    const isUrlMode = toggle.checked;
    const filesOk = isFileMode && topology.files.length > 0 && topology.files[0].name.endsWith('.json') && weights.files.length > 0;
    const urlOk = isUrlMode && url.value.trim() !== '';

    if ( _name.value.trim() && _classes.value.trim() && _imageSize.value.trim() && (filesOk || urlOk) ) {
      // Se a validação básica passar
      status.innerText = 'Uploading...'; // Mostra status
      status.classList.remove('error');
      status.classList.add('blink'); // Adiciona classe para piscar
      _name.style.border = ''; // Remove estilo de erro
      _imageSize.style.border = '';

      // Obtém o número de canais selecionado (1 para Gray, 3 para RGB)
      const _channels = parseInt(document.querySelector('#upload_panel input[name="channels"]:checked').value);
      // Constrói o nome interno do modelo no IndexedDB
      // Formato: pred_<tamanho>-<mag>_<nome_utilizador><timestamp_curto>
      const timestamp = new Date().getTime().toString().slice(-4, -1); // Últimos 3 dígitos do timestamp para unicidade
      const name = `pred_${_imageSize.value}-${mag.value}_${_name.value.trim()}${timestamp}`;
      // Cria um array a partir da string de classes separada por vírgulas
      const classes = _classes.value.split(/\s*,\s*/).map(c => c.trim()).filter(c => c); // Limpa espaços e remove vazios

      // Define a fonte do modelo (ficheiros locais ou URL)
      let modelInput;
      if (isUrlMode) {
        modelInput = url.value.trim(); // Usa o URL fornecido
      } else {
        // Usa a API tf.io.browserFiles para lidar com os ficheiros selecionados
        modelInput = tf.io.browserFiles([topology.files[0], ...weights.files]);
      }

      // Verifica se já existe um modelo com o mesmo nome legível fornecido pelo utilizador
      try {
        // `modelName` é preenchido em initUIcomponents
        if (modelName.includes(_name.value.trim())) {
          throw new Error('Model name repeated'); // Lança erro se o nome já existir
        }
      } catch (e) {
        console.error("Erro: Nome do modelo repetido.", e);
        status.innerText = 'Já existe um modelo com este nome. Escolha outro nome.';
        status.classList.remove('blink');
        status.classList.add('error');
        _name.style.border = '2px solid red'; // Destaca o campo com erro
        return; // Interrompe o upload
      }

      // Tenta carregar e guardar o modelo
      try {
        // Tenta carregar o modelo a partir da fonte (ficheiros ou URL)
        // Isto também valida se o modelo é carregável pelo TensorFlow.js
        console.log("Carregando modelo de:", modelInput);
        const model = await tf.loadLayersModel(modelInput);
        console.log("Modelo carregado com sucesso.");

        // Validação adicional: Tenta fazer uma predição com dados fictícios
        // para verificar se as dimensões de entrada correspondem
        try {
          console.log("Validando dimensões de entrada...");
          const dummyInput = tf.ones([1, parseInt(_imageSize.value), parseInt(_imageSize.value), parseInt(_channels)]);
          const result = model.predict(dummyInput);
          result.dispose(); // Liberta memória do tensor de resultado
          dummyInput.dispose(); // Liberta memória do tensor de entrada
          console.log("Dimensões de entrada validadas.");
        } catch (e) {
          console.error("Erro na validação das dimensões:", e);
          status.innerText = 'Modelo falhou com o tamanho de patch fornecido. ' +
                             'Verifique os valores de tamanho e canais.';
          status.classList.remove('blink');
          status.classList.add('error');
          _imageSize.style.border = '2px solid red'; // Destaca campo com erro
          model.dispose(); // Liberta memória do modelo carregado
          return; // Interrompe o upload
        }

        // Guarda o modelo carregado no IndexedDB com o nome interno gerado
        console.log("Guardando modelo no IndexedDB como:", name);
        await model.save(IDB_URL + name);
        console.log("Modelo guardado no IndexedDB.");

        // Liberta a memória do modelo após guardar
        model.dispose();

        // Atualiza a entrada do modelo no IndexedDB para adicionar metadados (classes, input_shape)
        console.log("Atualizando metadados no IndexedDB...");
        const tx = db.transaction('models_store', 'readwrite'); // Transação de escrita
        const store = tx.objectStore('models_store');

        // Obtém a entrada que o TF.js acabou de criar
        const getReq = store.get(name);
        getReq.onsuccess = function(e) {
          const data = e.target.result; // Dados guardados pelo TF.js
          if (data) {
            // Adiciona/Atualiza os campos personalizados
            data['classes'] = classes; // Array de nomes das classes
            data['input_shape'] = [1, parseInt(_imageSize.value), parseInt(_imageSize.value), parseInt(_channels)]; // Forma de entrada

            // Coloca os dados atualizados de volta na store
            const putReq = store.put(data);
            putReq.onsuccess = function(e) {
              console.log('Metadados atualizados com sucesso no IndexedDB, ID:', e.target.result);
              // Adiciona o nome legível à lista em memória
              modelName.push(_name.value.trim());
              // Mostra notificação de sucesso
              let popups = document.getElementById('popup-container');
              if (popups.childElementCount < 2) { // Limita a 2 popups
                let popupBox = document.createElement('div');
                popupBox.classList.add('popup-msg', 'slide-in');
                popupBox.innerHTML = `<i class="small material-icons">info</i> Modelo '${sanitize(_name.value)}' carregado com sucesso!`;
                popups.insertBefore(popupBox, popups.childNodes[0]);
                setTimeout(function() { // Remove o popup após 3 segundos
                  if (popups.contains(popupBox)) {
                      popups.removeChild(popupBox);
                  }
                }, 3000);
              }
              $UI.uploadModal.close(); // Fecha o modal de upload
              initUIcomponents(); // Atualiza a UI (ex: dropdown de modelos)
            };
            putReq.onerror = function(e) {
              console.error("Erro ao atualizar metadados no IndexedDB:", e.target.error);
              status.innerText = 'Erro ao guardar metadados!';
              status.classList.remove('blink');
              status.classList.add('error');
            };
          } else {
              console.error("Não foi possível encontrar a entrada do modelo recém-guardado no IndexedDB:", name);
              status.innerText = 'Erro ao encontrar modelo após guardar!';
              status.classList.remove('blink');
              status.classList.add('error');
          }
        };
        getReq.onerror = function(e) {
            console.error("Erro ao obter modelo do IndexedDB para atualização:", e.target.error);
            status.innerText = 'Erro ao ler modelo após guardar!';
            status.classList.remove('blink');
            status.classList.add('error');
        };

      } catch (e) { // Captura erros do tf.loadLayersModel ou tf.io.browserFiles
        console.error("Erro durante o carregamento ou validação inicial do modelo:", e);
        status.classList.add('error');
        status.classList.remove('blink');
        if (isUrlMode) {
          status.innerText = 'Erro ao carregar modelo do URL. Verifique o URL e a conectividade.';
        } else {
          status.innerText = 'Erro ao carregar modelo dos ficheiros. ' +
                             'Verifique se selecionou o model.json e os ficheiros .bin corretos.';
        }
      }
    } else { // Falha na validação básica inicial
      console.warn("Validação do formulário de upload falhou.");
      status.innerText = 'Preencha todos os campos corretamente.';
      status.classList.add('error');
      status.classList.remove('blink');
      // Poderia adicionar destaque aos campos inválidos aqui
    }
  });
}

/**
 * Remove um modelo do IndexedDB.
 * @param {string} name - O nome/chave completo do modelo no IndexedDB (ex: 'pred_...').
 */
async function deleteModel(name) {
  // Extrai o nome legível para a mensagem de confirmação
  const deletedmodelName = sanitize(name.split('/').pop().split('_').splice(2).join('_').slice(0, -3));
  // Pede confirmação ao utilizador
  if (confirm(`Tem a certeza que quer remover o modelo '${deletedmodelName}'?`)) {
    console.log("Removendo modelo:", name);
    try {
      // Remove o modelo usando a API do TensorFlow.js
      const res = await tf.io.removeModel(IDB_URL + name);
      console.log("Resultado da remoção TF.js:", res); // Geralmente retorna undefined

      // Remove a entrada correspondente da 'models_store' (TF.js não remove metadados personalizados)
      // NOTA: A API tf.io.removeModel DEVERIA remover a entrada completa.
      //       Este passo pode ser redundante ou causar erros se a entrada já não existir.
      //       Vamos tentar remover e tratar o erro caso não exista.
      const tx = db.transaction('models_store', 'readwrite');
      const store = tx.objectStore('models_store');
      const req = store.delete(name);

      req.onsuccess = function() {
          console.log("Entrada removida com sucesso da models_store (ou já não existia).");
          // Mostra notificação de sucesso
          let popups = document.getElementById('popup-container');
          if (popups.childElementCount < 2) {
            let popupBox = document.createElement('div');
            popupBox.classList.add('popup-msg', 'slide-in');
            popupBox.innerHTML = `<i class="small material-icons">info</i> Modelo '${deletedmodelName}' removido com sucesso.`;
            popups.insertBefore(popupBox, popups.childNodes[0]);
            setTimeout(function() {
              if (popups.contains(popupBox)) {
                  popups.removeChild(popupBox);
              }
            }, 3000);
          }
          $UI.infoModal.close(); // Fecha o modal de informações
          initUIcomponents(); // Atualiza a UI (remove o modelo do dropdown)
      };
      req.onerror = function(e) {
          // Se o erro for 'NotFoundError', significa que tf.io.removeModel já removeu. Ignoramos.
          if (e.target.error.name !== 'NotFoundError') {
              console.error("Erro ao tentar remover entrada da models_store (pode já ter sido removida):", e.target.error);
              // Mesmo com este erro, consideramos a operação geral um sucesso, pois o modelo TF foi removido.
              // Poderia mostrar um aviso diferente se necessário.
              $UI.infoModal.close();
              initUIcomponents();
          } else {
              console.log("Entrada já tinha sido removida da models_store (provavelmente por tf.io.removeModel).");
              // Continua com a notificação de sucesso e atualização da UI
               let popups = document.getElementById('popup-container');
                if (popups.childElementCount < 2) {
                    let popupBox = document.createElement('div');
                    popupBox.classList.add('popup-msg', 'slide-in');
                    popupBox.innerHTML = `<i class="small material-icons">info</i> Modelo '${deletedmodelName}' removido com sucesso.`;
                    popups.insertBefore(popupBox, popups.childNodes[0]);
                    setTimeout(function() {
                        if (popups.contains(popupBox)) {
                            popups.removeChild(popupBox);
                        }
                    }, 3000);
                }
                $UI.infoModal.close();
                initUIcomponents();
          }
      };

    } catch (err) { // Captura erros do tf.io.removeModel
      console.error("Erro ao remover o modelo:", err);
      alert("Erro ao remover o modelo: " + err.message);
    }
  } else {
    console.log("Remoção do modelo cancelada.");
    return; // Utilizador cancelou
  }
}

/**
 * Mostra o modal com informações sobre os modelos guardados no IndexedDB.
 */
async function showInfo() {
  console.log("Mostrando informações dos modelos...");
  try {
    // Lista os modelos guardados pelo TF.js
    var data = await tf.io.listModels();
    var table = document.querySelector('#mdata'); // Corpo da tabela no modal de info
    // Abre transação de leitura para obter metadados personalizados
    var tx = db.transaction('models_store', 'readonly');
    var store = tx.objectStore('models_store');
    var modelCount = 0; // Contador para gerar IDs únicos para botões

    empty(table); // Limpa conteúdo anterior da tabela (função 'empty' não definida aqui, assume que existe globalmente ou é erro)
    // TODO: Substituir 'empty(table)' por 'table.innerHTML = '';' se 'empty' não existir.
    table.innerHTML = ''; // Limpa conteúdo anterior da tabela

    // Itera sobre os modelos listados pelo TF.js
    const modelKeys = Object.keys(data);
    if (modelKeys.length === 0) {
        table.innerHTML = '<tr><td colspan="7">Nenhum modelo encontrado.</td></tr>';
        $UI.infoModal.open();
        return;
    }

    let rowsHtml = ''; // Acumula o HTML das linhas

    // Usar Promise.all para esperar que todas as requisições ao IndexedDB terminem
    const promises = modelKeys.map(key => {
      return new Promise((resolve, reject) => {
        if (data.hasOwnProperty(key)) {
          const name = key.split('/').pop(); // Nome interno do modelo (ex: 'pred_...')

          // Filtra para mostrar apenas modelos 'pred'
          if (name.slice(0, 4) == 'pred') {
            // Obtém metadados personalizados (classes, input_shape)
            const req = store.get(name);
            req.onsuccess = function(e) {
              const modelData = e.target.result;
              if (modelData) {
                const date = data[key].dateSaved ? new Date(data[key].dateSaved).toLocaleDateString() : 'N/A'; // Formata data
                const size = (data[key].modelTopologyBytes + data[key].weightDataBytes + data[key].weightSpecsBytes) / (1024*1024); // Calcula tamanho em MB
                const classes = modelData.classes ? modelData.classes.map(sanitize).join(', ') : 'N/A'; // Obtém e limpa classes
                const inputShape = modelData.input_shape ? modelData.input_shape.slice(1, 3).join('x') : 'N/A'; // Obtém forma (AxL)
                const displayName = sanitize(name.split('/').pop().split('_').splice(2).join('_').slice(0, -3)); // Nome legível

                // Gera o HTML da linha da tabela
                const rowId = `model-row-${modelCount}`;
                rowsHtml += `<tr id="${rowId}">
                  <td>${displayName}</td>
                  <td>${classes}</td>
                  <td>${inputShape}</td>
                  <td>${+size.toFixed(2)}</td>
                  <td>${date}</td>
                  <td><button class="btn-del" data-model-key="${name}" data-row-id="${rowId}" type="button"><i class="material-icons" style="font-size:16px;">delete_forever</i>Remover</button></td>
                  <td><button class="btn-change" data-model-key="${name}" data-classes="${classes}" data-row-id="${rowId}" type="button"><i class="material-icons" style="font-size:16px;">edit</i>Editar Classes</button></td>
                </tr>`;
                modelCount++;
                resolve(); // Resolve a promise para esta linha
              } else {
                console.warn(`Metadados não encontrados para o modelo ${name} na models_store.`);
                resolve(); // Resolve mesmo se não encontrar metadados para não bloquear tudo
              }
            };
            req.onerror = function(e) {
              console.error(`Erro ao obter metadados para ${name}:`, e.target.error);
              reject(e.target.error); // Rejeita a promise em caso de erro
            };
          } else {
            resolve(); // Resolve se não for modelo 'pred'
          }
        } else {
          resolve(); // Resolve se a propriedade não pertencer ao objeto
        }
      });
    });

    // Espera todas as promises terminarem
    await Promise.all(promises);

    // Define o HTML da tabela
    table.innerHTML = rowsHtml;

    // Adiciona event listeners aos botões DEPOIS que a tabela está no DOM
    table.querySelectorAll('.btn-del').forEach(button => {
      button.addEventListener('click', (event) => {
        const modelKey = event.currentTarget.getAttribute('data-model-key');
        deleteModel(modelKey); // Chama a função de remoção
      });
    });

    table.querySelectorAll('.btn-change').forEach(button => {
      button.addEventListener('click', (event) => {
        const modelKey = event.currentTarget.getAttribute('data-model-key');
        const currentClasses = event.currentTarget.getAttribute('data-classes');
        showNewClassInput(modelKey, currentClasses); // Chama a função para mostrar input de edição
      });
    });

    // Abre o modal
    $UI.infoModal.open();

  } catch (error) {
    console.error("Erro ao listar modelos ou mostrar informações:", error);
    $UI.message.addError("Erro ao obter lista de modelos.");
    // Tenta limpar a tabela e mostrar mensagem de erro
    var table = document.querySelector('#mdata');
    if (table) {
        table.innerHTML = `<tr><td colspan="7">Erro ao carregar modelos: ${error.message}</td></tr>`;
    }
     $UI.infoModal.open(); // Abre mesmo com erro para mostrar a mensagem
  }
}

/**
 * Mostra o modal para o utilizador inserir uma nova lista de classes para um modelo.
 * @param {string} name - O nome/chave completo do modelo no IndexedDB.
 * @param {string} classes - A string atual das classes, separadas por vírgula.
 */
function showNewClassInput(name, classes) {
  console.log("Mostrando input para editar classes do modelo:", name);
  const self = $UI.chngClassLst; // O modal para mudança de classes
  // Define o conteúdo HTML do modal (input e botão)
  self.body.innerHTML = `
    <div class="form-style"> <!-- Usa o mesmo estilo dos outros formulários -->
      <ul>
        <li>
          <label for="new_classList">Nova Lista de Classes (separadas por vírgula):</label>
          <input id="new_classList" type="text" style="width: 100%;"/>
        </li>
        <li>
          <button class="btn btn-primary btn-xs my-xs-btn btn-final-change" id='chngbtn' type="button">Alterar Lista de Classes</button>
        </li>
      </ul>
    </div>
    `;
  // Preenche o input com as classes atuais
  document.getElementById('new_classList').value = classes; // Usa .value em vez de defaultValue para inputs

  // Abre o modal
  $UI.chngClassLst.open();

  // Adiciona listener ao botão de confirmação DENTRO do modal
  document.getElementById('chngbtn').addEventListener('click', () => {
    console.log("Botão 'Alterar Lista de Classes' clicado.");
    // Obtém a nova lista de classes do input
    var newList = document.querySelector('#new_classList').value;
    // Fecha os modais relevantes
    $UI.infoModal.close(); // Fecha o modal de info (se estiver aberto)
    $UI.chngClassLst.close(); // Fecha o modal de edição
    // Chama a função para efetivamente alterar a lista no IndexedDB
    changeClassList(newList, name);
  });
}

/**
 * Atualiza a lista de classes de um modelo no IndexedDB.
 * @param {string} newList - A nova string de classes, separadas por vírgula.
 * @param {string} name - O nome/chave completo do modelo no IndexedDB.
 */
async function changeClassList(newList, name) {
  console.log(`Alterando lista de classes para '${name}' para: '${newList}'`);
  try {
    // Abre transação de escrita na 'models_store'
    var tx = db.transaction('models_store', 'readwrite');
    var store = tx.objectStore('models_store');

    // Obtém os dados atuais do modelo
    const req = store.get(name);
    req.onsuccess = function(e) {
      const d = e.target.result; // Dados atuais
      if (d) {
        // Converte a nova string de classes num array, limpando espaços e removendo vazios
        const classList = newList.split(/\s*,\s*/).map(c => c.trim()).filter(c => c);
        // Atualiza o campo 'classes' nos dados
        d['classes'] = classList;
        // Coloca os dados atualizados de volta na store
        const putReq = store.put(d);
        putReq.onsuccess = function() {
          console.log(`Lista de classes para '${name}' atualizada com sucesso.`);
          // Mostra notificação de sucesso
          let popups = document.getElementById('popup-container');
          if (popups.childElementCount < 2) {
            let popupBox = document.createElement('div');
            popupBox.classList.add('popup-msg', 'slide-in');
            popupBox.innerHTML = `<i class="small material-icons">info</i> Lista de classes atualizada com sucesso.`;
            popups.insertBefore(popupBox, popups.childNodes[0]);
            setTimeout(function() {
              if (popups.contains(popupBox)) {
                  popups.removeChild(popupBox);
              }
            }, 3000);
          }
          // Atualizar a UI (reabrir infoModal ou atualizar dropdown) pode ser necessário
          // initUIcomponents(); // Poderia ser chamado, mas talvez seja excessivo
        };
        putReq.onerror = function(e) {
          console.error("Erro ao guardar classes atualizadas no IndexedDB:", e.target.error);
          alert("Erro ao guardar as alterações.");
        };
      } else {
        console.error(`Modelo '${name}' não encontrado no IndexedDB para atualização de classes.`);
        alert("Modelo não encontrado para atualização.");
      }
    };
    req.onerror = function(e) {
      console.error("Erro ao obter modelo do IndexedDB para atualização de classes:", e.target.error);
      alert("Erro ao obter dados do modelo.");
    };

  } catch (error) {
      console.error("Erro geral ao tentar alterar lista de classes:", error);
      alert("Ocorreu um erro inesperado ao alterar as classes.");
  }
}

/**
 * Abre o modal de ajuda e define o seu conteúdo HTML.
 */
function openHelp() {
  console.log("Abrindo modal de ajuda...");
  const self = $UI.helpModal; // O modal de ajuda
  // Define o conteúdo HTML do corpo do modal
  self.body.innerHTML = `
    <h4>Funcionalidades</h4>
    <p>Esta secção do caMicroscope permite executar modelos de deep learning (TensorFlow.js) em regiões selecionadas de lâminas virtuais.</p>
    <p>Modelos de exemplo podem ser encontrados <a target="_blank" rel="noopener noreferrer" href="https://github.com/camicroscope/tfjs-models">aqui</a>.</p>
    <h5>Barra de Ferramentas:</h5>
    <ul>
      <li><i class="material-icons" style="vertical-align: middle;">aspect_ratio</i> <strong>Predict/Draw:</strong> Ativa o desenho de um retângulo na imagem para selecionar uma Região de Interesse (ROI) para predição ou extração.</li>
      <li><i class="material-icons" style="vertical-align: middle;">keyboard_arrow_down</i> <strong>Select Model:</strong> Escolha o modelo a ser usado para a predição.</li>
      <li><i class="material-icons" style="vertical-align: middle;">photo_filter</i> <strong>Pixel Scaling:</strong> Selecione o método de pré-processamento dos píxeis antes da predição (Normalização, Centralização, Padronização).</li>
      <li><i class="material-icons" style="vertical-align: middle;">insert_photo</i> <strong>Viewer:</strong> Volta para a página principal do visualizador de lâminas.</li>
      <li><i class="material-icons" style="vertical-align: middle;">add</i> <strong>Add model:</strong> Abre uma janela para fazer upload de um novo modelo (formato TensorFlow.js Layers).</li>
      <li><i class="material-icons" style="vertical-align: middle;">info</i> <strong>Model info:</strong> Mostra detalhes dos modelos que foram carregados e guardados localmente. Permite remover modelos ou editar a sua lista de classes.</li>
      <li><i class="material-icons" style="vertical-align: middle;">help</i> <strong>Help:</strong> Mostra esta janela de ajuda.</li>
      <li><i class="material-icons" style="vertical-align: middle;">archive</i> <strong>ROI Extraction:</strong> Inicia o processo para extrair e descarregar patches de imagem da lâmina inteira ou de uma ROI, com base nas predições de um modelo selecionado.</li>
      <li><i class="material-icons" style="vertical-align: middle;">bug_report</i> <strong>Bug Report:</strong> Abre a página de issues do caMicroscope no GitHub para reportar problemas.</li>
      <li><i class="material-icons" style="vertical-align: middle;">subject</i> <strong>Model Summary:</strong> Mostra/esconde um painel com o resumo da arquitetura do modelo TensorFlow.js atualmente selecionado (requer tfjs-vis).</li>
    </ul>
     <h5>Notas:</h5>
     <ul>
      <li>Imagens de lâmina inteira (WSI) são de alta resolução. Faça zoom antes de selecionar uma ROI para predição para evitar processar áreas muito grandes, o que pode ser lento.</li>
      <li>O nível de zoom pode afetar os resultados da predição. Tente usar o zoom recomendado indicado no nome do modelo (ex: 40 para 40x).</li>
     </ul>
  `;
  // Abre o modal
  $UI.helpModal.open();
}

/**
 * Converte uma string dataURI (ex: 'data:image/png;base64,...') num objeto Blob.
 * @param {string} dataURI - A string dataURI.
 * @returns {Blob} O objeto Blob resultante.
 */
function dataURItoBlob(dataURI) {
  try {
    // Separa o cabeçalho (mime type) dos dados base64/encoded
    const byteString_str = dataURI.split(',');
    if (byteString_str.length !== 2) throw new Error("Formato dataURI inválido.");

    const mimeString = byteString_str[0].split(':')[1].split(';')[0]; // Extrai o MIME type
    let byteString;

    // Decodifica os dados
    if (byteString_str[0].indexOf('base64') >= 0) {
      byteString = atob(byteString_str[1]); // Decodifica Base64
    } else {
      byteString = decodeURIComponent(byteString_str[1]); // Decodifica URI Component
    }

    // Escreve os bytes num Uint8Array
    const ia = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }

    // Cria e retorna o Blob
    return new Blob([ia], {type: mimeString});
  } catch (error) {
      console.error("Erro ao converter dataURI para Blob:", error, dataURI.substring(0, 100)); // Log truncado
      return null; // Retorna null em caso de erro
  }
}

/**
 * Converte coordenadas de limites (bound) do sistema de imagem (nível 0)
 * para coordenadas físicas do ecrã (pixels).
 * @param {OpenSeadragon.ImagingHelper} imagingHelper - O helper de imagem do CaMic.
 * @param {object} bound - O objeto de limites da feature (contém bound.coordinates).
 * @returns {Array<Array<number>>} Um array de coordenadas [x, y] no sistema do ecrã.
 */
function convertCoordinates(imagingHelper, bound) {
  // Cria uma cópia profunda das coordenadas para não modificar o original
  const newArray = bound.coordinates[0].map(function(arr) {
    return arr.slice(); // Copia o array interno [x, y]
  });

  // Itera sobre cada ponto [x, y] nas coordenadas da imagem
  for (let i = 0; i < newArray.length; i++) {
    const boundElement = newArray[i]; // Ponto atual [x_img, y_img]
    // Converte x da imagem para x do ecrã
    newArray[i][0] = imagingHelper.dataToPhysicalX(boundElement[0]);
    // Converte y da imagem para y do ecrã
    newArray[i][1] = imagingHelper.dataToPhysicalY(boundElement[1]);
  }

  return newArray; // Retorna o array com coordenadas do ecrã
}

/**
 * Inicia o download de um ficheiro a partir de um elemento canvas.
 * @param {HTMLCanvasElement} canvas - O canvas cujo conteúdo será descarregado.
 * @param {string} filename - O nome sugerido para o ficheiro descarregado.
 */
function download(canvas, filename) {
  console.log(`Iniciando download de canvas como: ${filename}`);
  try {
    // Cria um link âncora temporário (<a>) fora do ecrã
    var lnk = document.createElement('a');

    // Define o atributo 'download' com o nome do ficheiro desejado
    lnk.download = filename;

    // Converte o conteúdo do canvas para uma dataURI (imagem PNG por padrão)
    // e define como o 'href' do link. O atributo 'download' força o download.
    lnk.href = canvas.toDataURL(); // Pode especificar formato: canvas.toDataURL('image/jpeg');

    // Simula um clique no link para iniciar o download
    // Método moderno
    if (document.createEvent) {
      var e = document.createEvent('MouseEvents');
      // initMouseEvent é depreciado, mas ainda funciona amplamente. Alternativa: new MouseEvent('click', ...)
      e.initMouseEvent('click', true, true, window,
          0, 0, 0, 0, 0, false, false, false,
          false, 0, null);
      lnk.dispatchEvent(e);
    } else if (lnk.fireEvent) { // Método legado para IE
      lnk.fireEvent('onclick');
    }
    // Não é necessário remover o link, ele não foi adicionado ao DOM.
  } catch (error) {
      console.error("Erro durante o download do canvas:", error);
      alert("Ocorreu um erro ao tentar descarregar a imagem.");
  }
}


/**
 * Inicia o download de conteúdo CSV.
 * @param {string} filename - O nome sugerido para o ficheiro CSV.
 */
function downloadCSV(filename) {
  const self = $UI.modelPanel; // Referência ao modelPanel (para mostrar erro)
  // Verifica se existe conteúdo CSV para descarregar (variável global csvContent)
  if (csvContent && csvContent.startsWith('data:text/csv;charset=utf-8,')) {
    console.log(`Iniciando download de CSV como: ${filename}`);
    filename = filename || 'export.csv'; // Nome padrão se não for fornecido
    // Codifica o conteúdo CSV para ser usado num URL (embora já seja dataURI)
    // const data = encodeURI(csvContent); // encodeURI pode não ser necessário aqui, pois já é dataURI
    const data = csvContent; // Usa a dataURI diretamente

    // Cria um link âncora temporário
    var lnk = document.createElement('a');
    var e;
    lnk.href = data; // Define a dataURI como href
    lnk.download = filename; // Define o nome do ficheiro para download

    // Simula um clique no link para iniciar o download
    if (document.createEvent) {
      e = document.createEvent('MouseEvents');
      e.initMouseEvent('click', true, true, window,
          0, 0, 0, 0, 0, false, false, false,
          false, 0, null);
      lnk.dispatchEvent(e);
    } else if (lnk.fireEvent) {
      lnk.fireEvent('onclick');
    }
  } else {
    // Se não houver conteúdo CSV, mostra mensagem no painel
    console.warn("Tentativa de download de CSV sem conteúdo.");
    self.showResults('Nenhum dado CSV para descarregar. Execute uma predição primeiro.');
    alert('Nenhum dado CSV para descarregar. Execute uma predição primeiro.');
  }
}

/**
 * Inicia o fluxo de extração de ROI: abre o modal para seleção do modelo.
 */
async function selectModel() {
  console.log("Iniciando fluxo de extração de ROI: seleção de modelo.");
  try {
    // Lista os modelos guardados
    var data = await tf.io.listModels();
    var table = document.querySelector('#roidata'); // Corpo da tabela no modal roiModal
    var tx = db.transaction('models_store', 'readonly');
    var store = tx.objectStore('models_store');
    var modelCount = 0; // Contador para IDs

    // empty(table); // Limpa tabela anterior
    table.innerHTML = ''; // Limpa tabela anterior

    const modelKeys = Object.keys(data);
     if (modelKeys.length === 0) {
        table.innerHTML = '<tr><td colspan="6">Nenhum modelo encontrado para extração.</td></tr>';
        $UI.roiModal.open();
        return;
    }

    let rowsHtml = ''; // Acumula HTML das linhas

    // Usa Promise.all para preencher a tabela após obter todos os metadados
    const promises = modelKeys.map(key => {
      return new Promise((resolve, reject) => {
        if (data.hasOwnProperty(key)) {
          const name = key.split('/').pop();
          // Considera apenas modelos 'pred'
          if (name.slice(0, 4) == 'pred') {
            const req = store.get(name);
            req.onsuccess = function(e) {
              const modelData = e.target.result;
              if (modelData) {
                const date = data[key].dateSaved ? new Date(data[key].dateSaved).toLocaleDateString() : 'N/A';
                const size = (data[key].modelTopologyBytes + data[key].weightDataBytes + data[key].weightSpecsBytes) / (1024*1024);
                const classes = modelData.classes ? modelData.classes.map(sanitize).join(', ') : 'N/A';
                const inputShape = modelData.input_shape ? modelData.input_shape.slice(1, 3).join('x') : 'N/A';
                const displayName = sanitize(name.split('/').pop().split('_').splice(2).join('_').slice(0, -3));

                // Gera HTML da linha com botão de seleção
                const rowId = `roi-model-row-${modelCount}`;
                 rowsHtml += `<tr id="${rowId}">
                    <td>${displayName}</td>
                    <td>${classes}</td>
                    <td>${inputShape}</td>
                    <td>${+size.toFixed(2)}</td>
                    <td>${date}</td>
                    <td><button class="btn-sel" data-model-key="${name}" data-classes="${modelData.classes ? modelData.classes.join(',') : ''}" type="button" title="Selecionar este modelo"><i class="material-icons">done</i></button></td>
                  </tr>`;
                modelCount++;
                resolve();
              } else {
                 console.warn(`Metadados não encontrados para ${name} na models_store (ROI).`);
                 resolve();
              }
            };
            req.onerror = function(e) {
              console.error(`Erro ao obter metadados para ${name} (ROI):`, e.target.error);
              reject(e.target.error);
            };
          } else {
            resolve();
          }
        } else {
          resolve();
        }
      });
    });

    // Espera todas as promises
    await Promise.all(promises);

    // Define o HTML da tabela
    table.innerHTML = rowsHtml;

    // Adiciona listeners aos botões de seleção DEPOIS da tabela estar no DOM
    table.querySelectorAll('.btn-sel').forEach(button => {
      button.addEventListener('click', (event) => {
        const modelKey = event.currentTarget.getAttribute('data-model-key');
        const modelClasses = event.currentTarget.getAttribute('data-classes'); // Obtém classes originais (não sanitizadas)
        selectChoices(modelKey, modelClasses); // Passa para a próxima etapa (seleção de parâmetros)
      });
    });

    // Abre o modal de seleção de modelo
    $UI.roiModal.open();

  } catch (error) {
      console.error("Erro ao preparar seleção de modelo para ROI:", error);
      $UI.message.addError("Erro ao listar modelos para extração.");
      // Tenta limpar a tabela e mostrar erro
      var table = document.querySelector('#roidata');
      if(table) table.innerHTML = `<tr><td colspan="6">Erro ao carregar modelos: ${error.message}</td></tr>`;
      $UI.roiModal.open(); // Abre para mostrar o erro
  }
}

/**
 * Mostra o modal para o utilizador selecionar os parâmetros de extração de ROI
 * (classes, precisão, método de escalonamento, backend/frontend).
 * @param {string} name - O nome/chave completo do modelo selecionado no IndexedDB.
 * @param {string} classes - String das classes do modelo, separadas por vírgula.
 */
async function selectChoices(name, classes) {
  console.log(`Selecionando parâmetros de extração para o modelo: ${name}`);
  $UI.roiModal.close(); // Fecha o modal anterior

  try {
    // Extrai e limpa o nome legível do modelo
    const selectedmodelName = sanitize(name.split('/').pop().split('_').splice(2).join('_').slice(0, -3));
    // Converte a string de classes num array e limpa cada nome
    const classNames = classes.split(',').map(c => sanitize(c.trim())).filter(c => c);

    // Referência ao corpo da tabela no modal de escolhas
    const choiceDataBody = document.querySelector('#choicedata');
    if (!choiceDataBody) {
        console.error("Elemento #choicedata não encontrado.");
        return;
    }
    choiceDataBody.innerHTML = ''; // Limpa conteúdo anterior

    // --- Adiciona opções de seleção ao modal ---
    let contentHtml = '<tr><td><h4>Classes:</h4></td></tr>'; // Título para classes
    // Adiciona checkboxes para cada classe
    classNames.forEach(className => {
      contentHtml += `<tr><td><label class="check">${className}
        <input type="checkbox" value="${className}" id="${className}" name="choice" />
        <span class="checkmark"></span></label></td></tr>`;
    });

    // Adiciona slider de nível de precisão
    contentHtml += `<tr><td><h4>Nível de Precisão (%):</h4></td></tr>
                    <tr><td><input type="range" min="1" max="100" value="80" id="accrange" oninput="updateTextInput(this.value)" />
                        <input type="text" id="textInput" value="80" readonly style="width: 40px; text-align: right; margin-left: 10px;"/> %
                    </td></tr>`; // Usar oninput para atualização mais suave

    // Adiciona dropdown para método de escalonamento
    contentHtml += `<tr><td><h4>Método de Escalonamento:</h4></td></tr>
                    <tr><td><select id="scale_method" name="scale">
                      <option value="norm" selected>Normalização</option>
                      <option value="center">Centralização</option>
                      <option value="std">Padronização</option>
                    </select></td></tr>`;

    // Adiciona toggle para usar backend
    contentHtml += `<tr><td><br><h4>Usar Backend para Extração:</h4></td></tr>
                    <tr><td><label class="switch1"><input type="checkbox" id="backendOpt"><div class="slider1"></div></label> (Mais rápido para muitas patches)</td></tr>`;

    // Adiciona botões de extração
    contentHtml += `<tr><td><br><div id="ext1" style="text-align: center;"><button id="submit1" class="extract">Extrair da Lâmina Inteira</button></div></td></tr>`;
    contentHtml += `<tr><td><br><div id="ext2" style="text-align: center;"><button id="submit2" class="extract">Extrair de Região Selecionada</button></div><br></td></tr>`;

    // Define o HTML do corpo da tabela
    choiceDataBody.innerHTML = contentHtml;

    // --- Adiciona event listeners aos botões ---
    // Botão para extrair da lâmina inteira
    document.getElementById('submit1').addEventListener('click', async function() {
      var boxes = document.querySelectorAll('input[name=choice]:checked');
      if (boxes.length == 0) {
        alert('Selecione pelo menos uma classe.');
      } else {
        // Recolhe as escolhas do utilizador
        var choices = { model: name, accuracy: '80', classes: [], scale: 'norm', backend: false };
        boxes.forEach(box => choices.classes.push(box.id)); // Usa o ID que é o nome da classe
        choices.scale = document.getElementById('scale_method').value;
        choices.accuracy = document.getElementById('accrange').value;
        choices.backend = document.getElementById('backendOpt').checked;
        console.log("Iniciando extração (lâmina inteira) com escolhas:", choices);
        await extractRoi(choices); // Chama a função de extração (passa flag implícita != 0)
      }
    });

    // Botão para extrair de região selecionada
    document.getElementById('submit2').addEventListener('click', async function() {
      var boxes = document.querySelectorAll('input[name=choice]:checked');
      if (boxes.length == 0) {
        alert('Selecione pelo menos uma classe.');
      } else {
        // Recolhe as escolhas do utilizador
        var choices = { model: name, accuracy: '80', classes: [], scale: 'norm', backend: false };
        boxes.forEach(box => choices.classes.push(box.id));
        choices.scale = document.getElementById('scale_method').value;
        choices.accuracy = document.getElementById('accrange').value;
        choices.backend = document.getElementById('backendOpt').checked;
        console.log("Iniciando extração (região selecionada) com escolhas:", choices);
        await extractRoiSelect(choices); // Chama a função que ativa o desenho
      }
    });

    // Abre o modal de escolhas
    $UI.choiceModal.open();

  } catch (error) {
      console.error("Erro ao mostrar opções de extração:", error);
      $UI.message.addError("Erro ao preparar opções de extração.");
  }
}

/**
 * Extrai e descarrega patches de Região de Interesse (ROI) com base nas predições do modelo.
 * Pode operar na lâmina inteira ou numa ROI pré-selecionada.
 * @param {object} choices - Objeto com os parâmetros de extração (modelo, classes, precisão, etc.).
 * @param {number} [flag1] - Indicador: se 0, usa a ROI definida em $UI.modelPanel; caso contrário (ou undefined), usa a lâmina inteira.
 */
async function extractRoi(choices, flag1) {
  console.log("Iniciando extractRoi. Flag1:", flag1, "Choices:", choices);
  $UI.choiceModal.close(); // Fecha o modal de escolhas
  // Mostra snackbar de carregamento do modelo
  const snackbar = document.getElementById('snackbar');
  snackbar.innerHTML = '<h3>A carregar modelo...</h3>';
  snackbar.className = 'show';

  const self = $UI.modelPanel; // Referência ao painel (para coordenadas da ROI selecionada)
  let X, Y, roiWidth, roiHeight; // Variáveis para limites da área a processar

  // Define a área a ser processada
  if (flag1 === 0) { // Se flag1 é 0, usa a ROI desenhada pelo utilizador
    X = self.__spImgX;
    Y = self.__spImgY;
    roiWidth = self.__spImgWidth;
    roiHeight = self.__spImgHeight;
    console.log(`Processando ROI selecionada: X=${X}, Y=${Y}, W=${roiWidth}, H=${roiHeight}`);
  } else { // Caso contrário (flag1 != 0 ou undefined), usa a lâmina inteira
    X = 0;
    Y = 0;
    // Obtém dimensões da lâmina inteira a partir dos metadados carregados
    if (!$D.params.data || !$D.params.data.width || !$D.params.data.height) {
        console.error("Dimensões da lâmina inteira não disponíveis em $D.params.data.");
        snackbar.innerHTML = '<h3>Erro: Dimensões da lâmina não encontradas.</h3>';
        setTimeout(() => { snackbar.className = ''; }, 3000);
        return;
    }
    roiWidth = $D.params.data.width;
    roiHeight = $D.params.data.height;
    console.log(`Processando lâmina inteira: W=${roiWidth}, H=${roiHeight}`);
  }

  // Reseta resultados e mostra progresso no painel (mesmo que não esteja visível)
  self.showResults('');
  self.showProgress('A processar ROI...'); // Pode não ser visível se flag1 != 0

  const key = choices.model; // Nome/chave do modelo
  // Extrai tamanho do passo e URL prefix
  let step;
  try {
      step = parseInt(key.split('_')[1].split('-')[0]);
      if (isNaN(step) || step <= 0) throw new Error("Tamanho de passo inválido.");
  } catch (e) {
      console.error("Erro ao extrair tamanho do passo do nome do modelo:", key, e);
      snackbar.innerHTML = '<h3>Erro: Nome de modelo inválido.</h3>';
      setTimeout(() => { snackbar.className = ''; }, 3000);
      self.hideProgress();
      return;
  }
  const prefixUrl = ImgloaderMode == 'iip' ? `../../img/IIP/raw/?IIIF=${$D.params.data.location}` : $CAMIC.slideId;

  // Canvas para processamento de patches
  const fullResCvs = self.__fullsrc;

  // Abre transação para ler metadados do modelo
  const tx = db.transaction('models_store', 'readonly');
  const store = tx.objectStore('models_store');
  const modelReq = store.get(key);

  modelReq.onerror = (event) => {
      console.error("Erro ao obter modelo do IndexedDB para extração:", event.target.error);
      snackbar.innerHTML = '<h3>Erro ao carregar modelo.</h3>';
      setTimeout(() => { snackbar.className = ''; }, 3000);
      self.hideProgress();
  };

  modelReq.onsuccess = async function(e) {
    try {
      const modelData = e.target.result;
      if (!modelData) {
          throw new Error(`Modelo ${key} não encontrado no IndexedDB.`);
      }
      // Keras/TF.js ordena as classes alfabeticamente
      const classes = modelData.classes.sort();
      const inputShape = modelData.input_shape;
      const inputChannels = 3; // Assume RGB // parseInt(inputShape[3]);
      const imageSize = inputShape[1]; // Assume AxL
      const scaleMethod = choices.scale; // Método de escalonamento escolhido

      // Carrega o modelo
      const model = await tf.loadLayersModel(IDB_URL + key);
      console.log('Modelo carregado para extração.');
      snackbar.innerHTML = '<h3>Modelo carregado. A iniciar predição...</h3><span id="etap"></span>'; // Atualiza snackbar

      // Pré-aquece o modelo
      tf.tidy(()=>{
        // Usa tamanho real do passo para pré-aquecimento? Ou imageSize? Usando imageSize.
        model.predict(tf.zeros([1, imageSize, imageSize, inputChannels]));
        console.log('Modelo pré-aquecido para extração.');
      });

      // Canvas dummy (ainda incerto sobre o propósito)
      const temp = document.querySelector('#dummy');
      temp.height = step;
      temp.width = step;

      // Função auxiliar para carregar imagem
      function addImageProcess(src) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = (err) => {
              console.warn(`Falha ao carregar imagem: ${src}`, err);
              reject(err); // Rejeita para que o erro possa ser tratado no loop
          };
          img.src = src;
        });
      }

      // Arrays para guardar informações dos patches a serem extraídos
      const regions = []; // Guarda metadados { acc, cls, X, Y }
      const regionData = []; // Guarda dados da imagem (base64) se extração frontend

      // Calcula o número total de patches (aproximado) para a barra de progresso
      const totalPatches = Math.floor(roiWidth / step) * Math.floor(roiHeight / step);
      let processedPatches = 0; // Contador de patches processados
      const progressSpan = document.getElementById('etap'); // Span para mostrar progresso

      console.log(`Total de patches estimados: ${totalPatches}`);
      snackbar.innerHTML = '<h3>A prever patches...</h3><span id="etap">0 %</span>'; // Inicia progresso

      // Itera sobre a área definida (ROI ou lâmina inteira)
      for (let y = Y; y <= (Y + roiHeight - step); y += step) {
        for (let x = X; x <= (X + roiWidth - step); x += step) {
          const src = `${prefixUrl}/${x},${y},${step},${step}/${step},/0/default.jpg`;
          try {
            const lImg = await addImageProcess(src);
            fullResCvs.height = lImg.height;
            fullResCvs.width = lImg.width;
            const ctx = fullResCvs.getContext('2d');
            ctx.drawImage(lImg, 0, 0);
            const imgData = ctx.getImageData(0, 0, fullResCvs.width, fullResCvs.height);

            // Predição dentro do tf.tidy
            tf.tidy(()=>{
              const img = tf.browser.fromPixels(imgData).toFloat();
              let img2 = tf.image.resizeBilinear(img, [imageSize, imageSize]);
              if (inputChannels === 1) img2 = img2.mean(2); // Converte para cinza se necessário

              // Escalonamento
              let normalized;
              if (scaleMethod == 'norm') {
                normalized = img2.div(tf.scalar(255));
              } else if (scaleMethod == 'center') {
                normalized = img2.sub(img2.mean());
              } else { // std
                const mean = img2.mean();
                const variance = img2.squaredDifference(mean).mean();
                normalized = img2.sub(mean).div(tf.sqrt(variance).add(tf.scalar(1e-7)));
              }

              const batched = normalized.reshape([1, imageSize, imageSize, inputChannels]);
              const values = model.predict(batched).dataSync(); // Obtém probabilidades

              // Verifica se alguma classe de interesse atinge o limiar de precisão
              let maxProb = -1.0;
              let bestInd = -1;
              for (let i = 0; i < classes.length; i++) {
                // Verifica se a classe atual está nas escolhidas E se a probabilidade excede o limiar
                if (choices.classes.includes(classes[i]) && (values[i] * 100) >= choices.accuracy) {
                  // Guarda o índice da classe com maior probabilidade que satisfaz os critérios
                  if (values[i] > maxProb) {
                    maxProb = values[i];
                    bestInd = i;
                  }
                }
              }
              // Se um patch satisfatório foi encontrado, guarda as suas informações
              if (bestInd !== -1) {
                regions.push({ acc: values[bestInd], cls: classes[bestInd], X: x, Y: y });
                // Se for extração frontend, guarda também os dados da imagem
                if (!choices.backend) {
                    regionData.push(fullResCvs.toDataURL().replace(/^data:image\/(png|jpg);base64,/, ''));
                }
              }
            }); // Fim do tf.tidy
          } catch (patchError) {
              // Erro ao carregar ou processar um patch específico, continua para o próximo
              console.warn(`Erro no patch ${x},${y}:`, patchError);
          } finally {
              processedPatches++; // Incrementa mesmo se houver erro para atualizar progresso
              // Atualiza a percentagem de progresso no snackbar
              if (progressSpan && totalPatches > 0) {
                  const percent = ((processedPatches / totalPatches) * 100).toFixed(0);
                  progressSpan.textContent = `${percent} %`;
              }
          }
        } // Fim loop X
      } // Fim loop Y

      console.log(`Predição concluída. ${regions.length} patches satisfazem os critérios.`);
      snackbar.innerHTML = `<h3>Predição concluída. ${regions.length} patches encontrados.</h3>`;

      // Liberta memória do modelo
      model.dispose();

      // Se foram encontrados patches, procede para o download/extração
      if (regions.length > 0) {
        if (choices.backend == true) {
          // --- Extração via Backend ---
          console.log("Iniciando extração via backend...");
          snackbar.innerHTML = '<h3>A enviar pedido para o backend...</h3>';
          var roiData = { predictions: regions, slideid: $D.params.slideId, filename: fileName, patchsize: step };
          jsondata = JSON.stringify(roiData);

          // Envia pedido POST para o endpoint de extração do backend
          $.ajax({
            type: 'POST',
            url: '../../loader/roiExtract', // Endpoint para iniciar extração
            data: jsondata,
            dataType: 'json',
            contentType: 'application/json',
            success: function(response) { // Sucesso ao iniciar a extração no backend
              console.log("Backend iniciou a extração:", response);
              snackbar.innerHTML = '<h3>Backend a processar... A iniciar download.</h3><span id="etad"></span>';
              // Tenta descarregar o ficheiro ZIP gerado pelo backend
              // NOTA: Pode haver um delay entre o success e a disponibilidade do ficheiro.
              //       Seria ideal ter um mecanismo de polling ou websocket para saber quando está pronto.
              //       Por agora, tenta o download imediatamente.
              const downloadUrl = `../../loader/roiextract/roi_Download${fileName}.zip`; // Endpoint de download
              fetch(downloadUrl, {
                method: 'GET',
                cache: 'no-store',
              }).then((response)=>{
                if (!response.ok) { // Verifica se o status é 2xx
                  throw new Error(`Erro ${response.status} ao descarregar ficheiro do backend.`);
                }
                return response.blob(); // Obtém o conteúdo como Blob
              }).then((blob)=>{
                console.log("Ficheiro ZIP recebido do backend.");
                // Usa FileSaver.js (saveAs) para iniciar o download do Blob
                saveAs(blob, `roi_download_${fileName}.zip`);
                snackbar.innerHTML = '<h3>Download concluído!</h3>';
                setTimeout(() => { snackbar.className = ''; }, 3000);
              }).catch((error)=>{
                console.error("Erro no download do backend:", error);
                snackbar.innerHTML = `<h3>Erro no download: ${error.message}</h3>`;
                // Não esconde o snackbar para o erro ser visível
              });
            },
            error: function(jqXHR, textStatus, errorThrown) { // Erro ao contactar o endpoint de extração
              console.error("Erro ao contactar backend para extração:", textStatus, errorThrown, jqXHR.responseText);
              snackbar.innerHTML = '<h3>Erro ao comunicar com o backend.</h3>';
              // Não esconde o snackbar
            },
          }); // Fim $.ajax

        } else {
          // --- Extração via Frontend ---
          console.log("Iniciando extração via frontend (JSZip)...");
          snackbar.innerHTML = '<h3>A gerar ficheiro ZIP...</h3><span id="etad">0 %</span>';
          const zip = new JSZip(); // Cria instância do JSZip
          const downloadProgressSpan = document.getElementById('etad');

          // Adiciona cada patch (já guardado em regionData) ao ZIP
          for (let i = 0; i < regionData.length; i++) {
            const regionInfo = regions[i]; // Metadados { acc, cls, X, Y }
            const imgData = regionData[i]; // Dados da imagem em base64
            const folder = zip.folder(sanitize(regionInfo.cls)); // Cria/acede pasta da classe (sanitizada)
            // Nome do ficheiro: classe_X_Y_acc.png (ou similar)
            const imgFilename = `${sanitize(regionInfo.cls)}_${regionInfo.X}_${regionInfo.Y}_${(regionInfo.acc * 100).toFixed(1)}.png`;
            // Adiciona o ficheiro ao ZIP (dados base64)
            folder.file(imgFilename, imgData, { base64: true });

            // Atualiza progresso do ZIP
            if (downloadProgressSpan) {
                const percent = (((i + 1) / regionData.length) * 100).toFixed(0);
                downloadProgressSpan.textContent = `${percent} %`;
            }
          }

          // Gera o ficheiro ZIP como Blob
          console.log("Gerando Blob do ZIP...");
          await zip.generateAsync({ type: 'blob' }).then(function(content) {
            console.log("Blob ZIP gerado.");
            // Usa FileSaver.js para iniciar o download
            saveAs(content, `roi_download_${$D.params.slideId || 'patches'}.zip`);
            snackbar.innerHTML = '<h3>Download concluído!</h3>';
            setTimeout(() => { snackbar.className = ''; }, 3000);
          }).catch(zipError => {
              console.error("Erro ao gerar ZIP:", zipError);
              snackbar.innerHTML = '<h3>Erro ao gerar ficheiro ZIP.</h3>';
          });
        } // Fim else (frontend)
      } else {
          console.log("Nenhum patch encontrado para extrair.");
          snackbar.innerHTML = '<h3>Nenhum patch encontrado com os critérios definidos.</h3>';
          setTimeout(() => { snackbar.className = ''; }, 3000);
      } // Fim if (regions.length > 0)

      // --- Mostra detalhes da extração ---
      console.log("Mostrando detalhes da extração...");
      const detailsBody = document.getElementById('detailsdata');
      if (detailsBody) {
          detailsBody.innerHTML = ''; // Limpa detalhes anteriores
          let detailsHtml = `<li><h3>Total de patches extraídos: ${regions.length}</h3></li>`;
          // Conta patches por classe
          const counts = {};
          regions.forEach(r => {
              counts[r.cls] = (counts[r.cls] || 0) + 1;
          });
          // Adiciona contagem por classe de interesse ao HTML
          choices.classes.forEach(cls => {
              const count = counts[cls] || 0;
              detailsHtml += `<li>Número de patches da classe <b>${sanitize(cls)}</b>: ${count}</li>`;
          });
          detailsBody.innerHTML = detailsHtml; // Define o HTML no modal de detalhes
          $UI.detailsModal.open(); // Abre o modal de detalhes
      }

      // Se a extração foi iniciada a partir de uma ROI selecionada (flag1 === 0),
      // desativa o modo de desenho e reseta a flag.
      if (flag1 === 0) {
        drawRectangle({ checked: false }); // Desativa o desenho
        flag = -1; // Reseta a flag para modo de predição normal
      }
      self.hideProgress(); // Esconde indicador no painel (se estava visível)
      $UI.modelPanel.close(); // Fecha o painel de modelo (se estava aberto)

    } catch (error) {
        console.error("Erro geral durante o processo extractRoi:", error);
        snackbar.innerHTML = `<h3>Erro: ${error.message}</h3>`;
        self.hideProgress();
        // Tenta descarregar o modelo se ele foi carregado
        if (typeof model !== 'undefined' && model.dispose) {
            model.dispose();
        }
    }
  }; // Fim modelReq.onsuccess
}

/**
 * Prepara a extração de ROI para uma região a ser selecionada pelo utilizador.
 * Guarda as escolhas e ativa o modo de desenho.
 * @param {object} choices - Objeto com os parâmetros de extração selecionados.
 */
async function extractRoiSelect(choices) {
  console.log("Preparando para extrair de região selecionada. Choices:", choices);
  choices1 = choices; // Guarda as escolhas globalmente para usar em camicStopDraw
  flag = 0; // Define a flag para indicar modo de extração de ROI selecionada
  $UI.choiceModal.close(); // Fecha o modal de escolhas
  // Ativa o modo de desenho, passando o nome do modelo para definir o tamanho do passo
  drawRectangle({ checked: true, state: 'roi', model: choices.model });
  alert("Desenhe o retângulo na área desejada para extrair os patches."); // Instrui o utilizador
}

/**
 * Atualiza o valor do input de texto associado ao slider de precisão.
 * Chamado pelo atributo 'oninput' do slider.
 * @param {string|number} val - O valor atual do slider.
 */
function updateTextInput(val) {
  const textInput = document.getElementById('textInput');
  if (textInput) {
      textInput.value = val; // Atualiza o valor do input de texto
  }
}

/**
 * Listener global para a tecla 'Escape'.
 * Fecha os modais abertos se 'Escape' for pressionado.
 */
window.addEventListener('keydown', function(event) {
  if (event.code === 'Escape') { // Verifica se a tecla pressionada é Escape
    console.log("Tecla Escape pressionada, fechando modais...");
    // Fecha os modais relevantes (usando jQuery aqui, poderia ser JS puro)
    // $('#roi_panel').hide(); // Equivalente a $UI.roiModal.close() se implementado corretamente
    // $('#choice_panel').hide(); // Equivalente a $UI.choiceModal.close()
    // $('#model_info').hide(); // Equivalente a $UI.infoModal.close()
    // $('#details_panel').hide(); // Equivalente a $UI.detailsModal.close()
    // $('#upload_panel').hide(); // Equivalente a $UI.uploadModal.close()
    // $('#help').hide(); // Equivalente a $UI.helpModal.close()
    // $('#chngClass').hide(); // Equivalente a $UI.chngClassLst.close()

    // Usando as instâncias $UI (forma mais robusta):
    if ($UI.roiModal) $UI.roiModal.close();
    if ($UI.choiceModal) $UI.choiceModal.close();
    if ($UI.infoModal) $UI.infoModal.close();
    if ($UI.detailsModal) $UI.detailsModal.close();
    if ($UI.uploadModal) $UI.uploadModal.close();
    if ($UI.helpModal) $UI.helpModal.close();
    if ($UI.chngClassLst) $UI.chngClassLst.close();

  }
}, true); // Usa captura (true) para intercetar o evento antes de outros listeners
