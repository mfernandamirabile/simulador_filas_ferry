/*
╔════════════════════════════════════════════════════════════════════════════╗
║                    FERRY BOT - BACKEND DE SIMULAÇÃO                        ║
║              Sistema de Gerenciamento de Filas dos Ferries                ║
║                          São Luís - Maranhão                               ║
╚════════════════════════════════════════════════════════════════════════════╝

DESCRIÇÃO DO SISTEMA:
Este backend simula o funcionamento do sistema de ferries de São Luís,
aplicando a Teoria de Filas para modelar e analisar o comportamento
das embarcações, veículos em espera e tempo de atendimento.

TEORIA DE FILAS APLICADA:
O sistema utiliza o modelo M/M/c (Modelo de Fila de Kendall):
- M (Markoviano): Chegadas seguem distribuição de Poisson
- M (Markoviano): Tempo de serviço segue distribuição exponencial
- c: Múltiplos servidores (embarcações) operando em paralelo

COMPONENTES PRINCIPAIS:
1. Servidor Express (API REST)
2. Simulador de Filas (lógica de teoria de filas)
3. Gerenciamento de Embarcações
4. Sistema de Reservas
5. Sistema de Relato de Problemas
*/

const express = require('express');
const cors = require('cors');

// ============================================================================
// INICIALIZAÇÃO DO SERVIDOR EXPRESS
// ============================================================================
// Express é um framework web que facilita a criação de APIs REST
// CORS permite que o frontend (em outro domínio/porta) acesse esta API
const app = express();
app.use(cors()); // Habilita CORS para todas as requisições
app.use(express.json()); // Permite receber dados em formato JSON

// ============================================================================
// CONFIGURAÇÕES DO SISTEMA (Baseado nos dados do slide)
// ============================================================================
/*
Estas configurações representam os parâmetros reais do sistema de ferries
de São Luís, conforme apresentado no problema.

TEORIA DE FILAS - NOTAÇÃO:
- λ (lambda): Taxa de chegada de veículos
- μ (mi): Taxa de atendimento (embarque/travessia)
- c: Número de servidores (embarcações)
- ρ (rho): Intensidade de tráfego (λ/μ)
*/
const CONFIG = {
  // === CAPACIDADE DO SISTEMA (Servidores) ===
  numEmbarcacoes: 4,              // c = 4 servidores (embarcações)
  capacidadeVeiculos: 50,         // Capacidade de cada servidor
  frequenciaSaidaMinutos: 60,     // Tempo entre saídas (parte do μ)
  
  // === HORÁRIO DE OPERAÇÃO ===
  horarioInicio: 6,               // 6h da manhã
  horarioFim: 22,                 // 22h (10 da noite)
  horasOperacao: 16,              // Total: 16 horas/dia
  
  // === TAXA DE CHEGADA (λ - Lambda) ===
  veiculosDiarios: 1200,          // Total de chegadas por dia
  percentualPico: 0.40,           // 40% chegam nos horários de pico
  percentualCarros: 0.80,         // 80% são carros
  percentualCaminhoes: 0.20,      // 20% são caminhões
  
  // === TEMPOS DE SERVIÇO (μ - Mi) ===
  tempoEmbarqueMinutos: 15,       // Tempo para embarcar
  tempoTravessiaMinutos: 80,      // 1h20min de travessia
  tempoDesembarqueSegundos: 15,   // Tempo para desembarcar
  
  // === MÉTRICAS DE ESPERA (Wq - Tempo em fila) ===
  tempoEsperaNormalMinutos: 20,   // Wq fora do pico
  tempoEsperaPicoMinutos: 90,     // Wq durante pico (1h30)
  
  // === MANUTENÇÃO E DISPONIBILIDADE ===
  manutencaoDias: 30,             // Manutenção a cada 30 dias
  manutencaoHoras: 4,             // Duração de 4 horas
  taxaFalhas: 0.05,               // 5% de taxa de falhas não programadas
  
  // === PERÍODOS DE PICO (Alta demanda) ===
  // Nesses horários, λ aumenta significativamente
  picos: [
    { inicio: 7, fim: 9 },        // Pico manhã: 7h-9h
    { inicio: 17, fim: 19 }       // Pico tarde: 17h-19h
  ]
};

// ============================================================================
// CLASSE VEÍCULO
// ============================================================================
/*
Representa cada entidade (cliente) que entra no sistema de filas.
Na teoria de filas, cada veículo é um "cliente" que:
- Chega ao sistema (horarioChegada)
- Espera na fila (tempoEspera = Wq)
- É atendido pelo servidor (horarioEmbarque)
- Deixa o sistema (horarioDesembarque)
*/
class Veiculo {
  constructor(tipo, horarioChegada) {
    this.id = Math.random().toString(36).substr(2, 9); // ID único
    this.tipo = tipo;                    // 'carro' ou 'caminhao'
    this.horarioChegada = horarioChegada; // Momento que chegou (tempo t)
    this.horarioEmbarque = null;          // Momento que foi atendido
    this.horarioDesembarque = null;       // Momento que saiu do sistema
    this.tempoEspera = 0;                 // Wq = tempo em fila
  }
}

// ============================================================================
// CLASSE EMBARCAÇÃO (SERVIDOR)
// ============================================================================
/*
Na teoria de filas, cada embarcação é um "servidor" que:
- Tem capacidade limitada (50 veículos)
- Pode estar disponível ou ocupado
- Processa clientes (veículos) em lotes
- Requer manutenção periódica (downtime)

ESTADOS DO SERVIDOR:
- Disponível: Pronto para embarcar veículos
- Ocupado: Em travessia (atendendo clientes)
- Em Manutenção: Temporariamente fora de operação
- Falha: Indisponível por problema não programado
*/
class Embarcacao {
  constructor(id) {
    this.id = id;
    this.capacidade = CONFIG.capacidadeVeiculos;  // Capacidade do servidor
    this.veiculosAbordo = [];                      // Clientes sendo atendidos
    this.disponivel = true;                        // Estado do servidor
    this.emManutencao = false;                     // Downtime programado
    this.ultimaManutencao = 0;
    this.proximaManutencao = CONFIG.manutencaoDias * 24 * 60;
    this.viagensRealizadas = 0;                    // Número de serviços completados
    this.tempoTotalOcupado = 0;                    // Utilização do servidor (ρ)
  }
  
  /*
  MÉTODO: EMBARCAR
  Representa o início do atendimento na teoria de filas.
  Remove clientes da fila e inicia o processamento.
  
  PARÂMETROS DE TEORIA DE FILAS:
  - Fila reduz em 'embarcados' clientes
  - Tempo de serviço inicia
  - Wq (tempo de espera) é calculado
  */
  embarcar(veiculos, horarioAtual) {
    const espacoDisponivel = this.capacidade - this.veiculosAbordo.length;
    const veiculosEmbarcar = veiculos.slice(0, espacoDisponivel);
    
    veiculosEmbarcar.forEach(veiculo => {
      veiculo.horarioEmbarque = horarioAtual;
      // Wq = Tempo de espera na fila
      veiculo.tempoEspera = Math.max(0, horarioAtual - veiculo.horarioChegada);
      this.veiculosAbordo.push(veiculo);
    });
    
    return veiculosEmbarcar.length;
  }
  
  /*
  MÉTODO: DESEMBARCAR
  Representa a conclusão do atendimento.
  Libera o servidor para novos clientes.
  */
  desembarcar(horarioAtual) {
    this.veiculosAbordo.forEach(veiculo => {
      veiculo.horarioDesembarque = horarioAtual;
    });
    
    const veiculosDesembarcados = [...this.veiculosAbordo];
    this.veiculosAbordo = [];
    this.viagensRealizadas++; // Incrementa serviços completados
    
    return veiculosDesembarcados;
  }
  
  // Verifica se é hora de manutenção programada
  necessitaManutencao(horarioAtual) {
    return horarioAtual >= this.proximaManutencao && !this.emManutencao;
  }
  
  // Inicia período de manutenção (servidor indisponível)
  iniciarManutencao(horarioAtual) {
    this.emManutencao = true;
    this.disponivel = false;
    this.ultimaManutencao = horarioAtual;
  }
  
  // Finaliza manutenção (servidor volta a operar)
  finalizarManutencao(horarioAtual) {
    this.emManutencao = false;
    this.disponivel = true;
    this.proximaManutencao = horarioAtual + (CONFIG.manutencaoDias * 24 * 60);
  }
}

// ============================================================================
// CLASSE SIMULADOR DE FILAS
// ============================================================================
/*
Implementa a simulação de eventos discretos aplicando teoria de filas.

MODELO M/M/c EXPLICADO:
1. Chegadas (M - Markoviano/Poisson):
   - Veículos chegam aleatoriamente
   - Taxa λ varia entre horários normais e de pico
   
2. Atendimento (M - Markoviano/Exponencial):
   - Tempo de embarque + travessia + desembarque
   - Taxa μ = 1 / tempo_total_servico
   
3. Servidores (c):
   - c = 4 embarcações operando simultaneamente
   - Cada uma com capacidade de 50 veículos

MÉTRICAS CALCULADAS:
- L: Número médio de veículos no sistema
- Lq: Número médio de veículos na fila
- W: Tempo médio no sistema
- Wq: Tempo médio de espera na fila
- ρ: Taxa de utilização dos servidores
*/
class SimuladorFerries {
  constructor(config = {}) {
    // Mescla configurações customizadas com as padrões
    this.config = { ...CONFIG, ...config };
    
    // Inicializa estruturas do sistema de filas
    this.embarcacoes = [];           // Servidores (c)
    this.veiculosProcessados = [];   // Histórico de atendimentos
    this.eventos = [];               // Log de eventos da simulação
    this.horarioAtual = this.config.horarioInicio * 60; // Tempo em minutos
    
    // Fila única
    this.filaGeral = [];     
    
    // Cria os c servidores (embarcações)
    for (let i = 0; i < this.config.numEmbarcacoes; i++) {
      this.embarcacoes.push(new Embarcacao(i + 1));
    }
  }

  // --- Verifica se é horário de pico ---
  ehHorarioPico(horario) {
    const hora = Math.floor(horario / 60);
    return this.config.picos.some(pico => hora >= pico.inicio && hora < pico.fim);
  }

  // --- Gera chegadas de veículos ---
  gerarChegadaVeiculos() {
    const veiculosHoraBase = this.config.veiculosDiarios / this.config.horasOperacao;
    const multiplicadorPico = this.ehHorarioPico(this.horarioAtual) ? 2.5 : 1;

    // Gera chegadas com flutuação aleatória (±20%)
    const fatorAleatorio = 0.8 + Math.random() * 0.4;
    const veiculosEstaHora = Math.round(veiculosHoraBase * multiplicadorPico * fatorAleatorio);

    const veiculos = [];
    for (let i = 0; i < veiculosEstaHora; i++) {
      const minutoChegada = this.horarioAtual + Math.random() * 60;
      const tipo = Math.random() < this.config.percentualCarros ? 'carro' : 'caminhao';
      veiculos.push(new Veiculo(tipo, minutoChegada));
    }

    return veiculos.sort((a, b) => a.horarioChegada - b.horarioChegada);
  }


  // --- Processa simulação com filas de prioridade ---
  processar() {
  const resultados = {
    tempoSimulacao: 0,
    veiculosProcessados: 0,
    veiculosNaoAtendidos: 0,
    tempoMedioEspera: 0,
    tempoMedioEsperaReservas: 0,
    tempoMedioEsperaNormais: 0,
    utilizacaoEmbarcacoes: [],
    viagensRealizadas: 0
  };

  const horarioFinal = this.config.horarioFim * 60;

  // === Loop principal da simulação ===
  while (this.horarioAtual < horarioFinal) {
    // === 1️⃣ Geração de chegadas (aleatória e realista) ===
    const veiculosHoraBase = this.config.veiculosDiarios / this.config.horasOperacao;
    const multiplicadorPico = this.ehHorarioPico(this.horarioAtual) ? 2.5 : 1;

    // Variação natural (±20%) para simular dias mais/menos movimentados
    const fatorAleatorio = 0.8 + Math.random() * 0.4;
    const veiculosEstaHora = Math.round(veiculosHoraBase * multiplicadorPico * fatorAleatorio);

    // Cria os veículos dessa hora
    const novosVeiculos = [];
    for (let i = 0; i < veiculosEstaHora; i++) {
      const minutoChegada = this.horarioAtual + Math.random() * 60;
      const tipo = Math.random() < this.config.percentualCarros ? 'carro' : 'caminhao';
      const veiculo = new Veiculo(tipo, minutoChegada);

      // Define se o veículo tem reserva (30% por padrão)
      veiculo.reserva = Math.random() < (this.config.percentualReservas || 0.3);

      // 🔹 Penaliza veículos sem reserva em horários de pico
      if (!veiculo.reserva && this.ehHorarioPico(this.horarioAtual)) {
        veiculo.tempoEspera += 15 + Math.random() * 20; // espera adicional de 15–35 min
      }

      novosVeiculos.push(veiculo);

    }
    // Adiciona todos na mesma fila
    this.filaGeral.push(...novosVeiculos);

    // === 2️⃣ Embarque por embarcação ===
    for (const embarcacao of this.embarcacoes) {
      if (embarcacao.disponivel && embarcacao.veiculosAbordo.length === 0) {
        // --- Embarque considerando prioridade de reserva ---
        const prontos = this.filaGeral
          .filter(v => v.horarioChegada <= this.horarioAtual)
          .sort((a, b) => (b.reserva === true) - (a.reserva === true)); // com reserva primeiro

        const embarcados = embarcacao.embarcar(prontos, this.horarioAtual);
        this.filaGeral.splice(0, embarcados);

        
        // --- Travessia e desembarque ---
        const horarioDesembarque = this.horarioAtual + this.config.tempoTravessiaMinutos;
        const desembarcados = embarcacao.desembarcar(horarioDesembarque);
        this.veiculosProcessados.push(...desembarcados);
        embarcacao.viagensRealizadas++;
        embarcacao.tempoTotalOcupado += this.config.tempoTravessiaMinutos;
      }
    }

    // Avança o tempo (1 saída por hora)
    this.horarioAtual += this.config.frequenciaSaidaMinutos;
  }

  // === 3️⃣ Cálculo de resultados ===
  const todos = this.veiculosProcessados;
  const reservas = todos.filter(v => v.reserva);
  const normais = todos.filter(v => !v.reserva);
  const media = arr => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  // Fila restante ao final do dia (veículos não atendidos)
  resultados.veiculosNaoAtendidos = this.filaGeral.length;

  resultados.tempoSimulacao = (horarioFinal - (this.config.horarioInicio * 60)) / 60;
  resultados.veiculosProcessados = todos.length;
  resultados.tempoMedioEspera = media(todos.map(v => v.tempoEspera));
  resultados.tempoMedioEsperaReservas = media(reservas.map(v => v.tempoEspera));
  resultados.tempoMedioEsperaNormais = media(normais.map(v => v.tempoEspera));

  resultados.utilizacaoEmbarcacoes = this.embarcacoes.map(e => ({
    id: e.id,
    percentualUtilizacao: Math.min(100, (e.tempoTotalOcupado / (horarioFinal - this.config.horarioInicio * 60)) * 100),
    viagensRealizadas: e.viagensRealizadas
  }));

  resultados.viagensRealizadas = this.embarcacoes.reduce((s, e) => s + e.viagensRealizadas, 0);

  return resultados;
}


  // --- Simular com sistema de reservas (comparativo de desempenho) ---
  simularComReservas(percentualReservas = 0.3) {
    this.config.percentualReservas = percentualReservas;
    const resultado = this.processar();

    return {
      sucesso: true,
      resumo: {
        tempoMedioEsperaGeral: resultado.tempoMedioEspera.toFixed(2) + " min",
        tempoMedioReservas: resultado.tempoMedioEsperaReservas.toFixed(2) + " min",
        tempoMedioNormais: resultado.tempoMedioEsperaNormais.toFixed(2) + " min",
        diferenca: (resultado.tempoMedioEsperaNormais - resultado.tempoMedioEsperaReservas).toFixed(2) + " min",
        veiculosProcessados: resultado.veiculosProcessados
      },
      detalhes: resultado
    };
  }
}


// ============================================================================
// ENDPOINTS DA API REST
// ============================================================================
/*
API REST permite que o frontend se comunique com o backend.
Segue padrões HTTP:
- GET: Buscar dados
- POST: Enviar/criar dados
- PUT: Atualizar dados
- DELETE: Remover dados
*/

// ========== ENDPOINT 1: INFORMAÇÕES DA API ==========
/*
Retorna informações básicas e lista de endpoints disponíveis.
Útil para documentação e descoberta da API.
*/
app.get('/', (req, res) => {
  res.json({
    mensagem: 'API de Simulação dos Ferries de São Luís',
    descricao: 'Sistema baseado em Teoria de Filas (M/M/c) para análise e otimização do transporte aquaviário',
    versao: '1.0.0',
    endpoints: {
      'GET /': 'Informações da API',
      'GET /config': 'Configurações do sistema',
      'POST /simular': 'Executar simulação',
      'POST /simular/com-reservas': 'Simular com sistema de reservas',
      'GET /embarcacoes/status': 'Status atual das embarcações',
      'POST /reserva': 'Criar reserva de veículo',
      'GET /reservas': 'Listar todas as reservas',
      'POST /relatar-problema': 'Relatar problema ou ocorrência',
      'GET /problemas': 'Listar problemas relatados'
    }
  });
});

// ========== ENDPOINT 2: CONFIGURAÇÕES ==========
/*
Retorna todas as configurações do sistema.
Permite ao frontend conhecer os parâmetros da simulação.
*/
app.get('/config', (req, res) => {
  res.json({
    sucesso: true,
    configuracoes: CONFIG,
    teoriaFilas: {
      modelo: 'M/M/c',
      descricao: 'Chegadas Poisson, Serviço Exponencial, Múltiplos Servidores',
      parametros: {
        c: CONFIG.numEmbarcacoes,
        lambda: CONFIG.veiculosDiarios / CONFIG.horasOperacao,
        capacidade: CONFIG.capacidadeVeiculos
      }
    }
  });
});

// ========== ENDPOINT 3: EXECUTAR SIMULAÇÃO ==========
/*
Executa a simulação completa do sistema de filas.
Aceita parâmetros customizados via body.
Retorna todas as métricas calculadas.
*/
app.post('/simular', (req, res) => {
  try {
    const configCustom = req.body;
    const simulador = new SimuladorFerries(configCustom);
    const resultados = simulador.processar();
    
    res.json({
      sucesso: true,
      resultados,
      configuracaoUsada: simulador.config,
      metricas: {
        Wq: resultados.tempoMedioEspera + ' minutos',
        Lq: resultados.veiculosEmFila + ' veículos',
        throughput: resultados.veiculosProcessados + ' veículos/dia',
        utilizacaoMedia: (resultados.utilizacaoEmbarcacoes.reduce((acc, e) => 
          acc + e.percentualUtilizacao, 0) / resultados.utilizacaoEmbarcacoes.length).toFixed(2) + '%'
      }
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// ========== ENDPOINT 4: SIMULAR COM RESERVAS ==========
/*
Simula o impacto do sistema de reservas antecipadas.
Compara cenários com e sem reservas.
Mostra melhorias obtidas.
*/
app.post('/simular/com-reservas', (req, res) => {
  try {
    const { percentualReservas = 0.3, ...configCustom } = req.body;
    const simulador = new SimuladorFerries(configCustom);
    const resultados = simulador.simularComReservas(percentualReservas);
    
    res.json({
      sucesso: true,
      percentualReservasSimulado: percentualReservas,
      resumo: resultados.resumo,
      detalhes: resultados.detalhes,
      configuracaoUsada: simulador.config,
      analise: {
        mensagem: "Comparativo entre usuários com e sem reserva",
        diferencaTempo: resultados.resumo.diferenca,
        tempoMedioComReserva: resultados.resumo.tempoMedioReservas,
        tempoMedioSemReserva: resultados.resumo.tempoMedioNormais
      }
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});


// ========== ENDPOINT 5: STATUS DAS EMBARCAÇÕES ==========
/*
Retorna o estado atual de cada embarcação.
Útil para dashboard em tempo real.
*/
app.get('/embarcacoes/status', (req, res) => {
  const simulador = new SimuladorFerries();
  
  const status = simulador.embarcacoes.map(emb => ({
    id: emb.id,
    disponivel: emb.disponivel,
    emManutencao: emb.emManutencao,
    capacidade: emb.capacidade,
    veiculosAbordo: emb.veiculosAbordo.length,
    viagensRealizadas: emb.viagensRealizadas,
    estado: emb.emManutencao ? 'Em Manutenção' : 
            !emb.disponivel ? 'Indisponível' : 
            emb.veiculosAbordo.length > 0 ? 'Em Operação' : 'Disponível'
  }));
  
  res.json({
    sucesso: true,
    horarioAtual: new Date().toLocaleTimeString('pt-BR'),
    embarcacoes: status,
    totalEmbarcacoes: status.length,
    embarcacoesDisponiveis: status.filter(e => e.disponivel && !e.emManutencao).length,
    capacidadeTotal: status.length * CONFIG.capacidadeVeiculos,
    capacidadeDisponivel: status.filter(e => e.disponivel && !e.emManutencao).length * CONFIG.capacidadeVeiculos
  });
});

// ========== ENDPOINT 6 e 7: SISTEMA DE RESERVAS ==========
/*
Permite que usuários reservem horários antecipadamente.
Isso ajuda a distribuir a demanda e reduzir filas.
*/
const reservas = [];

app.post('/reserva', (req, res) => {
  try {
    const { nomeUsuario, tipoVeiculo, horarioPreferencia, telefone, placa } = req.body;
    
    // Validação dos dados obrigatórios
    if (!nomeUsuario || !tipoVeiculo || !horarioPreferencia) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Dados incompletos. Necessário: nomeUsuario, tipoVeiculo, horarioPreferencia'
      });
    }
    
    // Cria a reserva
    const reserva = {
      id: Math.random().toString(36).substr(2, 9),
      nomeUsuario,
      tipoVeiculo,
      horarioPreferencia,
      telefone: telefone || 'Não informado',
      placa: placa || 'Não informada',
      status: 'confirmada',
      dataCriacao: new Date().toISOString(),
      dataUso: new Date(new Date().setHours(...horarioPreferencia.split(':'), 0, 0)).toISOString()
    };
    
    reservas.push(reserva);
    
    res.json({
      sucesso: true,
      mensagem: 'Reserva criada com sucesso! Chegue 15 minutos antes do horário.',
      reserva,
      instrucoes: [
        'Apresente este código ao chegar: ' + reserva.id,
        'Chegue 15 minutos antes do horário reservado',
        'Mantenha seus documentos em mãos',
        'Em caso de atraso, a reserva pode ser cancelada'
      ]
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/reservas', (req, res) => {
  // Permite filtrar por data
  const { data } = req.query;
  
  let reservasFiltradas = reservas;
  if (data) {
    reservasFiltradas = reservas.filter(r => 
      r.dataUso.startsWith(data)
    );
  }
  
  res.json({
    sucesso: true,
    total: reservasFiltradas.length,
    reservas: reservasFiltradas.sort((a, b) => 
      new Date(a.dataUso) - new Date(b.dataUso)
    )
  });
});

// ========== ENDPOINT 8 e 9: RELATAR PROBLEMAS ==========
/*
NOVO RECURSO: Sistema de Relato de Problemas
Permite que usuários reportem problemas diretamente pelo app.
Conforme mostrado na imagem do formulário enviada.
*/
const problemas = [];

app.post('/relatar-problema', (req, res) => {
  try {
    const { 
      categoria, 
      descricao, 
      nomeUsuario, 
      telefone, 
      email,
      localizacao 
    } = req.body;
    
    // Validação dos campos obrigatórios
    if (!categoria || !descricao) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Categoria e descrição são obrigatórias'
      });
    }
    
    // Categorias válidas do sistema
    const categoriasValidas = [
      'Embarcação com defeito',
      'Fila desorganizada',
      'Atraso excessivo',
      'Funcionário',
      'Segurança',
      'Infraestrutura',
      'Outro'
    ];
    
    if (!categoriasValidas.includes(categoria)) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Categoria inválida',
        categoriasValidas
      });
    }
    
    // Define prioridade baseada na categoria
    let prioridade = 'normal';
    if (['Segurança', 'Embarcação com defeito'].includes(categoria)) {
      prioridade = 'alta';
    } else if (['Atraso excessivo', 'Fila desorganizada'].includes(categoria)) {
      prioridade = 'média';
    }
    
    // Cria o relato de problema
    const problema = {
      id: Math.random().toString(36).substr(2, 9),
      protocolo: 'FB-' + Date.now().toString(36).toUpperCase(),
      categoria,
      descricao,
      nomeUsuario: nomeUsuario || 'Anônimo',
      telefone: telefone || 'Não informado',
      email: email || 'Não informado',
      localizacao: localizacao || 'Não informada',
      prioridade,
      status: 'aberto',
      dataAbertura: new Date().toISOString(),
      dataPrevisaoResposta: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      resolucao: null,
      dataResolucao: null
    };
    
    problemas.push(problema);
    
    // Simula notificação para equipe de operações
    console.log(`⚠️  NOVO PROBLEMA RELATADO - Protocolo: ${problema.protocolo}`);
    console.log(`   Categoria: ${categoria} | Prioridade: ${prioridade}`);
    console.log(`   Descrição: ${descricao.substring(0, 50)}...`);
    
    res.json({
      sucesso: true,
      mensagem: 'Problema relatado com sucesso!',
      problema: {
        id: problema.id,
        protocolo: problema.protocolo,
        prioridade: problema.prioridade,
        status: problema.status,
        dataAbertura: problema.dataAbertura,
        previsaoResposta: problema.dataPrevisaoResposta
      },
      informacoes: [
        'Seu relato será analisado pela equipe de operações',
        'Resposta em até 24 horas úteis',
        'Para emergências, entre em contato direto: (98) 3214-5678',
        'Guarde o número do protocolo: ' + problema.protocolo
      ]
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/problemas', (req, res) => {
  const { status, prioridade, categoria } = req.query;
  
  let problemasFiltrados = problemas;
  
  // Aplica filtros se fornecidos
  if (status) {
    problemasFiltrados = problemasFiltrados.filter(p => p.status === status);
  }
  if (prioridade) {
    problemasFiltrados = problemasFiltrados.filter(p => p.prioridade === prioridade);
  }
  if (categoria) {
    problemasFiltrados = problemasFiltrados.filter(p => p.categoria === categoria);
  }
  
  // Estatísticas dos problemas
  const stats = {
    total: problemas.length,
    abertos: problemas.filter(p => p.status === 'aberto').length,
    emAndamento: problemas.filter(p => p.status === 'em_andamento').length,
    resolvidos: problemas.filter(p => p.status === 'resolvido').length,
    porPrioridade: {
      alta: problemas.filter(p => p.prioridade === 'alta').length,
      media: problemas.filter(p => p.prioridade === 'média').length,
      normal: problemas.filter(p => p.prioridade === 'normal').length
    },
    porCategoria: {}
  };
  
  // Conta problemas por categoria
  problemas.forEach(p => {
    stats.porCategoria[p.categoria] = (stats.porCategoria[p.categoria] || 0) + 1;
  });
  
  res.json({
    sucesso: true,
    estatisticas: stats,
    total: problemasFiltrados.length,
    problemas: problemasFiltrados.sort((a, b) => 
      new Date(b.dataAbertura) - new Date(a.dataAbertura)
    )
  });
});

// ========== ENDPOINT BÔNUS: ANÁLISE DE TEORIA DE FILAS ==========
/*
Endpoint educacional que explica as métricas de teoria de filas.
Útil para apresentação e entendimento do sistema.
*/
app.get('/teoria-filas', (req, res) => {
  res.json({
    modelo: 'M/M/c - Modelo de Kendall',
    descricao: 'Sistema de fila com múltiplos servidores',
    componentes: {
      'M (Chegadas)': {
        tipo: 'Processo de Poisson',
        descricao: 'Veículos chegam aleatoriamente',
        parametro: 'λ (lambda) = taxa de chegada',
        valor: CONFIG.veiculosDiarios / CONFIG.horasOperacao + ' veículos/hora',
        variacao: 'Durante pico: λ × 2.5'
      },
      'M (Atendimento)': {
        tipo: 'Distribuição Exponencial',
        descricao: 'Tempo de serviço (embarque + travessia + desembarque)',
        parametro: 'μ (mi) = taxa de atendimento',
        tempoServico: CONFIG.tempoEmbarqueMinutos + CONFIG.tempoTravessiaMinutos + ' minutos'
      },
      'c (Servidores)': {
        quantidade: CONFIG.numEmbarcacoes,
        descricao: 'Embarcações operando em paralelo',
        capacidade: CONFIG.capacidadeVeiculos + ' veículos cada'
      }
    },
    metricas: {
      'L': 'Número médio de veículos no sistema',
      'Lq': 'Número médio de veículos na fila',
      'W': 'Tempo médio no sistema',
      'Wq': 'Tempo médio de espera na fila',
      'ρ': 'Taxa de utilização dos servidores (λ / c×μ)'
    },
    interpretacao: {
      'ρ < 1': 'Sistema estável - capacidade suficiente',
      'ρ ≈ 1': 'Sistema no limite - filas podem crescer',
      'ρ > 1': 'Sistema saturado - filas crescem indefinidamente'
    },
    objetivos: [
      'Minimizar Wq (tempo de espera)',
      'Minimizar Lq (tamanho da fila)',
      'Maximizar ρ (eficiência) mantendo ρ < 1',
      'Equilibrar custo operacional com qualidade do serviço'
    ]
  });
});

// ============================================================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================================
const PORT = process.env.PORT || 3000;

// === Integração do módulo de relatórios ===
const { GeradorRelatorios, setSimuladorClasse } = require("./relatorios");
setSimuladorClasse(SimuladorFerries);

app.get("/relatorios", (req, res) => {
  const resultado = GeradorRelatorios.gerarRelatorio();
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(resultado, null, 2));

});



app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════════════════════════════════════╗
  ║              🚢 FERRY BOT - SISTEMA DE SIMULAÇÃO DE FILAS 🚢              ║
  ║                  Baseado em Teoria de Filas (M/M/c)                       ║
  ╚════════════════════════════════════════════════════════════════════════════╝
  
  ✅ Servidor rodando na porta ${PORT}
  🌐 URL: http://localhost:${PORT}
  
  📊 TEORIA DE FILAS - MODELO M/M/c:
     • λ (lambda): ${(CONFIG.veiculosDiarios / CONFIG.horasOperacao).toFixed(1)} veículos/hora
     • c (servidores): ${CONFIG.numEmbarcacoes} embarcações
     • Capacidade total: ${CONFIG.numEmbarcacoes * CONFIG.capacidadeVeiculos} veículos
  
  📋 ENDPOINTS DISPONÍVEIS:
     GET  /                          - Informações da API
     GET  /config                    - Configurações do sistema
     GET  /teoria-filas              - Explicação da teoria aplicada
     POST /simular                   - Executar simulação
     POST /simular/com-reservas      - Simular com reservas
     GET  /embarcacoes/status        - Status das embarcações
     POST /reserva                   - Criar reserva
     GET  /reservas                  - Listar reservas
     GET  /relatorios                - Traz relatórios de análises
     POST /relatar-problema          - Relatar problema ⭐ NOVO
     GET  /problemas                 - Listar problemas ⭐ NOVO
  
  💡 EXEMPLO DE USO:
     curl -X POST http://localhost:${PORT}/simular
     curl -X POST http://localhost:${PORT}/relatar-problema \\
       -H "Content-Type: application/json" \\
       -d '{"categoria": "Atraso excessivo", "descricao": "Fila de 2 horas"}'
  
  📚 ACESSE /teoria-filas para entender o modelo matemático!
  `);
});

// Exporta classes e configurações para testes
module.exports = { SimuladorFerries, Veiculo, Embarcacao, CONFIG };
