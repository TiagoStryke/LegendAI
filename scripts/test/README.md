# Scripts de Teste - LegendAI

## 📋 Visão Geral

Esta pasta contém scripts de teste que replicam **EXATAMENTE** a lógica do site LegendAI para debug e análise de problemas.

## 🎯 Objetivo

O script `test-translation.js` foi criado para:

- ✅ Replicar 100% da lógica de tradução do site
- ✅ Debuggar problemas de quota, timeout, ou erros de API
- ✅ Testar diferentes tamanhos de legendas
- ✅ Identificar onde exatamente ocorrem os erros
- ✅ Validar se o problema é no frontend ou backend

## 📁 Arquivos

- **test-translation.js**: Script principal que replica a lógica do site
- **test-input.srt**: Arquivo SRT de teste pequeno (10 legendas)
- **README.md**: Este arquivo

## 🚀 Como Usar

### 1. Instalar dependências (se necessário)

```bash
cd /Users/user/Documents/legendai
npm install
```

### 2. Executar o teste com o arquivo de exemplo

```bash
node scripts/test/test-translation.js scripts/test/test-input.srt
```

### 3. Ou usar seu próprio arquivo SRT

```bash
node scripts/test/test-translation.js /caminho/para/seu-arquivo.srt
```

## 📊 O que o Script Faz

1. **Lê o arquivo SRT** e parseia os segmentos
2. **Extrai contexto** do nome do arquivo (série, filme, ano, qualidade)
3. **Agrupa segmentos** em chunks de até 400 tokens (mesma lógica do site)
4. **Traduz cada chunk** usando a API do Gemini (gemini-1.5-flash)
5. **Aplica retry logic** com backoff exponencial
6. **Detecta quota errors** e aguarda 65s para reset
7. **Divide chunks grandes** automaticamente se necessário
8. **Formata diálogos** preservando quebras de linha
9. **Salva resultado** em arquivo `-translated.srt`

## 🔍 Interpretando os Resultados

### ✅ Sucesso Total

```
✅ TESTE CONCLUÍDO COM SUCESSO!
```

Significa que a API está funcionando perfeitamente!

### 🚫 Quota Error

```
🚫 QUOTA ERROR detectado! Aguardando 65s...
```

Significa que você atingiu o limite de requisições por minuto (15 RPM no free tier).

### ❌ Erro de Autenticação

```
❌ Erro de autenticação: Chave API inválida
```

Significa que a API key tem algum problema (inválida, expirada, ou sem permissões).

### ⚠️ Resposta Truncada

```
⚠️ Resposta truncada! Faltam X segmentos
```

Significa que a API do Gemini retornou menos traduções que o esperado (problema conhecido).

## 🔧 Configurações

Você pode modificar as constantes no início do script:

```javascript
const MAX_TOKENS_IN_SEGMENT = 400; // Tamanho máximo do chunk
const MAX_RETRIES = 3; // Número de tentativas
const LANGUAGE = 'Portuguese (Brazil)'; // Idioma alvo
```

## 📝 API Key

O script usa a API key **hardcoded** no código:

```javascript

```

⚠️ **IMPORTANTE**: Esta é a mesma key configurada no site. Se o script funcionar mas o site não, o problema é no frontend!

## 🎬 Testando Diferentes Cenários

### Teste 1: Arquivo pequeno (10 legendas)

```bash
node scripts/test/test-translation.js scripts/test/test-input.srt
```

**Esperado**: Deve funcionar perfeitamente

### Teste 2: Arquivo médio (100-500 legendas)

```bash
node scripts/test/test-translation.js seu-arquivo-medio.srt
```

**Esperado**: Pode ter 1-2 quota errors, mas deve completar

### Teste 3: Arquivo grande (1000+ legendas)

```bash
node scripts/test/test-translation.js seu-arquivo-grande.srt
```

**Esperado**: Vários quota errors, mas deve completar após esperas

## 🐛 Debug

O script tem logs detalhados para cada etapa:

1. **Leitura**: Mostra quantos segmentos foram encontrados
2. **Contexto**: Mostra o contexto extraído do nome do arquivo
3. **Chunks**: Mostra quantos chunks foram criados e seus tamanhos
4. **Tradução**: Mostra progresso de cada chunk com barra visual
5. **Erros**: Mostra detalhes completos de qualquer erro

## 🔬 Comparando com o Site

Depois de rodar o script:

1. ✅ **Script funciona + Site funciona**: Tudo OK!
2. ✅ **Script funciona + Site NÃO funciona**: Problema no frontend
3. ❌ **Script NÃO funciona + Site NÃO funciona**: Problema na API/key
4. ❌ **Script NÃO funciona + Site funciona**: Problema no script (improvável)

## 💡 Próximos Passos

Se o script **funcionar**:

- O problema está no frontend (React, SSE, ou configuração Vercel)
- Verificar logs do Vercel
- Verificar se SSE está funcionando corretamente

Se o script **NÃO funcionar**:

- O problema está na API key ou na Google Gemini API
- Verificar se a key tem permissões corretas
- Verificar se não está em região bloqueada
- Verificar limites de quota no Google AI Studio

## 📞 Suporte

Se encontrar problemas, compartilhe:

1. A saída completa do script
2. O arquivo SRT usado (se possível)
3. Qual erro exato ocorreu
4. Em que chunk/segmento falhou
