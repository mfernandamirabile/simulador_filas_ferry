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
      veiculo.tempoEspera = horarioAtual - veiculo.horarioChegada;
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
    this.fila = [];                  // Fila de espera (Lq)
    this.veiculosProcessados = [];   // Histórico de atendimentos
    this.eventos = [];               // Log de eventos da simulação
    this.horarioAtual = this.config.horarioInicio * 60; // Tempo em minutos
    this.reservas = [];              // Sistema de reservas antecipadas
    
    // Cria os c servidores (embarcações)
    for (let i = 0; i < this.config.numEmbarcacoes; i++) {
      this.embarcacoes.push(new Embarcacao(i + 1));
    }
  }
  
  /*
  MÉTODO: VERIFICAR HORÁRIO DE PICO
  
  TEORIA DE FILAS - VARIAÇÃO DA TAXA λ:
  Durante horários de pico, a taxa de chegada λ aumenta significativamente.
  Isso causa:
  - Aumento de Lq (tamanho da fila)
  - Aumento de Wq (tempo de espera)
  - Possível saturação do sistema (ρ > 1)
  */
  ehHorarioPico(horario) {
    const hora = Math.floor(horario / 60);
    return this.config.picos.some(pico => hora >= pico.inicio && hora < pico.fim);
  }
  
  /*
  MÉTODO: GERAR CHEGADAS DE VEÍCULOS
  
  PROCESSO DE POISSON:
  Simula chegadas aleatórias seguindo distribuição de Poisson.
  - λ_normal: veiculosHora base
  - λ_pico: veiculosHora * 2.5 (multiplicador de pico)
  
  EXEMPLO:
  - 1200 veículos/dia ÷ 16 horas = 75 veículos/hora
  - No pico: 75 × 2.5 = 187.5 veículos/hora
  */
  gerarChegadaVeiculos() {
    const veiculosHora = this.config.veiculosDiarios / this.config.horasOperacao;
    const multiplicadorPico = this.ehHorarioPico(this.horarioAtual) ? 2.5 : 1;
    const veiculosEstaHora = Math.round(veiculosHora * multiplicadorPico);
    
    const veiculos = [];
    for (let i = 0; i < veiculosEstaHora; i++) {
      // Chegada aleatória dentro da hora
      const minutoChegada = this.horarioAtual + Math.random() * 60;
      
      // Define tipo baseado na proporção 80/20
      const tipo = Math.random() < this.config.percentualCarros ? 'carro' : 'caminhao';
      veiculos.push(new Veiculo(tipo, minutoChegada));
    }
    
    // Ordena por horário de chegada (FIFO - First In First Out)
    return veiculos.sort((a, b) => a.horarioChegada - b.horarioChegada);
  }
  
  /*
  MÉTODO PRINCIPAL: PROCESSAR SIMULAÇÃO
  
  SIMULAÇÃO DE EVENTOS DISCRETOS:
  Avança o tempo em intervalos e processa eventos:
  1. Chegadas de veículos (entrada no sistema)
  2. Embarques (início do atendimento)
  3. Travessias (processamento)
  4. Desembarques (saída do sistema)
  5. Manutenções e falhas
  
  MÉTRICAS DE TEORIA DE FILAS CALCULADAS:
  - Lq: Tamanho médio da fila
  - Wq: Tempo médio de espera
  - ρ: Utilização dos servidores
  - Taxa de throughput
  */
  processar() {
    const resultados = {
      tempoSimulacao: 0,
      veiculosProcessados: 0,
      veiculosEmFila: 0,
      tempoMedioEspera: 0,         // Wq médio
      tempoMaximoEspera: 0,         // Wq máximo
      utilizacaoEmbarcacoes: [],    // ρ por servidor
      viagensRealizadas: 0,
      eventos: []
    };
    
    const horarioFinal = this.config.horarioFim * 60;
    
    // LOOP PRINCIPAL DA SIMULAÇÃO
    while (this.horarioAtual < horarioFinal) {
      
      // ========== EVENTO 1: CHEGADAS DE VEÍCULOS ==========
      // Implementa o processo de Poisson (chegadas aleatórias)
      const novosVeiculos = this.gerarChegadaVeiculos();
      this.fila.push(...novosVeiculos); // Adiciona à fila
      
      if (novosVeiculos.length > 0) {
        this.eventos.push({
          tipo: 'chegada',
          horario: this.horarioAtual,
          quantidade: novosVeiculos.length,
          filaTotal: this.fila.length    // Lq atual
        });
      }
      
      // ========== EVENTO 2 e 3: PROCESSAR EMBARCAÇÕES ==========
      this.embarcacoes.forEach(embarcacao => {
        
        // Verifica necessidade de manutenção programada
        if (embarcacao.necessitaManutencao(this.horarioAtual)) {
          embarcacao.iniciarManutencao(this.horarioAtual);
          this.eventos.push({
            tipo: 'manutencao_inicio',
            embarcacao: embarcacao.id,
            horario: this.horarioAtual
          });
        }
        
        // Servidor em manutenção (downtime)
        if (embarcacao.emManutencao) {
          if (this.horarioAtual >= embarcacao.ultimaManutencao + this.config.manutencaoHoras * 60) {
            embarcacao.finalizarManutencao(this.horarioAtual);
            this.eventos.push({
              tipo: 'manutencao_fim',
              embarcacao: embarcacao.id,
              horario: this.horarioAtual
            });
          }
          return; // Pula para próxima embarcação
        }
        
        // Simula falha não programada (5% de chance)
        if (Math.random() < this.config.taxaFalhas / 1000) {
          embarcacao.disponivel = false;
          this.eventos.push({
            tipo: 'falha',
            embarcacao: embarcacao.id,
            horario: this.horarioAtual
          });
          // Reparo leva 30 minutos
          setTimeout(() => embarcacao.disponivel = true, 30);
          return;
        }
        
        // ========== INÍCIO DO ATENDIMENTO ==========
        // Condições: servidor disponível E fila não vazia E servidor vazio
        if (embarcacao.disponivel && this.fila.length > 0 && embarcacao.veiculosAbordo.length === 0) {
          
          // Embarque de veículos (início do serviço)
          const embarcados = embarcacao.embarcar(this.fila, this.horarioAtual);
          this.fila.splice(0, embarcados); // Remove da fila (Lq diminui)
          
          this.eventos.push({
            tipo: 'embarque',
            embarcacao: embarcacao.id,
            horario: this.horarioAtual,
            veiculos: embarcados,
            filaRestante: this.fila.length
          });
          
          // Simula travessia (tempo de serviço)
          const horarioDesembarque = this.horarioAtual + this.config.tempoTravessiaMinutos;
          const veiculosDesembarcados = embarcacao.desembarcar(horarioDesembarque);
          this.veiculosProcessados.push(...veiculosDesembarcados);
          
          // Atualiza utilização do servidor (ρ)
          embarcacao.tempoTotalOcupado += this.config.tempoTravessiaMinutos;
          
          this.eventos.push({
            tipo: 'desembarque',
            embarcacao: embarcacao.id,
            horario: horarioDesembarque,
            veiculos: veiculosDesembarcados.length
          });
        }
      });
      
      // Avança o tempo da simulação
      this.horarioAtual += this.config.frequenciaSaidaMinutos;
    }
    
    // ========== CÁLCULO DAS MÉTRICAS FINAIS ==========
    
    resultados.tempoSimulacao = (horarioFinal - (this.config.horarioInicio * 60)) / 60;
    resultados.veiculosProcessados = this.veiculosProcessados.length;
    resultados.veiculosEmFila = this.fila.length; // Lq final
    
    // Wq - Tempo médio de espera na fila
    const temposEspera = this.veiculosProcessados.map(v => v.tempoEspera);
    resultados.tempoMedioEspera = temposEspera.length > 0 
      ? temposEspera.reduce((a, b) => a + b, 0) / temposEspera.length 
      : 0;
    
    resultados.tempoMaximoEspera = temposEspera.length > 0 
      ? Math.max(...temposEspera) 
      : 0;
    
    // ρ - Taxa de utilização dos servidores
    const tempoTotalSimulacao = horarioFinal - (this.config.horarioInicio * 60);
    resultados.utilizacaoEmbarcacoes = this.embarcacoes.map(emb => ({
      id: emb.id,
      // ρ = tempo_ocupado / tempo_total
      percentualUtilizacao: (emb.tempoTotalOcupado / tempoTotalSimulacao) * 100,
      viagensRealizadas: emb.viagensRealizadas
    }));
    
    resultados.viagensRealizadas = this.embarcacoes.reduce((total, emb) => 
      total + emb.viagensRealizadas, 0);
    
    resultados.eventos = this.eventos;
    
    return resultados;
  }
  
  /*
  MÉTODO: SIMULAR COM SISTEMA DE RESERVAS
  
  IMPACTO NA TEORIA DE FILAS:
  O sistema de reservas altera o padrão de chegadas:
  - Reduz picos (λ_pico diminui)
  - Distribui chegadas mais uniformemente
  - Diminui Lq e Wq
  - Melhora utilização ρ dos servidores
  
  RESULTADO ESPERADO:
  - Menor tempo de espera (Wq)
  - Fila menor (Lq)
  - Melhor eficiência operacional
  */
  simularComReservas(percentualReservas = 0.3) {
    // Simula sem reservas primeiro (baseline)
    const resultadoSemReservas = this.processar();
    
    // Reset para segunda simulação
    this.horarioAtual = this.config.horarioInicio * 60;
    this.fila = [];
    this.veiculosProcessados = [];
    this.eventos = [];
    this.embarcacoes.forEach((emb, i) => {
      this.embarcacoes[i] = new Embarcacao(i + 1);
    });
    
    // Com reservas: reduz intensidade dos picos
    const configComReservas = {
      ...this.config,
      percentualPico: this.config.percentualPico * (1 - percentualReservas)
    };
    
    const simuladorComReservas = new SimuladorFerries(configComReservas);
    const resultadoComReservas = simuladorComReservas.processar();
    
    // Calcula melhorias obtidas
    return {
      semReservas: resultadoSemReservas,
      comReservas: resultadoComReservas,
      melhorias: {
        reducaoTempoEspera: ((resultadoSemReservas.tempoMedioEspera - resultadoComReservas.tempoMedioEspera) / resultadoSemReservas.tempoMedioEspera * 100).toFixed(2) + '%',
        reducaoFila: resultadoSemReservas.veiculosEmFila - resultadoComReservas.veiculosEmFila,
        melhoriaUtilizacao: (resultadoComReservas.utilizacaoEmbarcacoes.reduce((acc, emb) => 
          acc + emb.percentualUtilizacao, 0) / resultadoComReservas.utilizacaoEmbarcacoes.length).toFixed(2) + '%'
      }
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
      resultados,
      configuracaoUsada: simulador.config,
      percentualReservasSimulado: percentualReservas,
      analise: {
        reducaoEspera: resultados.melhorias.reducaoTempoEspera,
        reducaoFila: resultados.melhorias.reducaoFila + ' veículos',
        eficiencia: resultados.melhorias.melhoriaUtilizacao
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
  res.json(resultado);
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
