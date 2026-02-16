/**
 * Lista modelos disponíveis na API key
 */
const https = require('https');

const API_KEY = 'AIzaSyAWAF5LUAuUYji5fZJiQ_Jvv1ZtLmSIfW8';

// Testar API v1
console.log('🔍 Listando modelos disponíveis na API v1...\n');

const options = {
	hostname: 'generativelanguage.googleapis.com',
	path: `/v1/models?key=${API_KEY}`,
	method: 'GET',
	headers: {
		'Content-Type': 'application/json',
	},
};

const req = https.request(options, (res) => {
	let data = '';

	res.on('data', (chunk) => {
		data += chunk;
	});

	res.on('end', () => {
		try {
			const response = JSON.parse(data);

			if (response.error) {
				console.error('❌ Erro:', response.error.message);
				console.error('Status:', response.error.status);
				console.error('Detalhes:', JSON.stringify(response.error, null, 2));
			} else if (response.models) {
				console.log(`✅ Encontrados ${response.models.length} modelos:\n`);
				response.models.forEach((model) => {
					console.log(`📦 ${model.name}`);
					console.log(`   Display: ${model.displayName}`);
					console.log(`   Descrição: ${model.description}`);
					if (model.supportedGenerationMethods) {
						console.log(
							`   Métodos: ${model.supportedGenerationMethods.join(', ')}`,
						);
					}
					console.log('');
				});
			} else {
				console.log('Resposta:', JSON.stringify(response, null, 2));
			}
		} catch (error) {
			console.error('❌ Erro ao parsear resposta:', error.message);
			console.log('Resposta raw:', data);
		}
	});
});

req.on('error', (error) => {
	console.error('❌ Erro na requisição:', error.message);
});

req.end();
