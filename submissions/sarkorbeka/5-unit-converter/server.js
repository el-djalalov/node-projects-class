#!/usr/bin/env node
const http = require('http')
const { URLSearchParams } = require('url')

const lengthFactors = {
	mm: 0.001, cm: 0.01, m: 1, km: 1000,
	in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344,
}

const weightFactors = {
	mg: 0.001, g: 1, kg: 1000, oz: 28.3495, lb: 453.592,
}

function convertLength(value, from, to) {
	const meters = value * lengthFactors[from]
	return meters / lengthFactors[to]
}

function convertWeight(value, from, to) {
	const grams = value * weightFactors[from]
	return grams / weightFactors[to]
}

function convertTemperature(value, from, to) {
	// convert from -> C -> to
	let c
	if (from === 'C') c = value
	else if (from === 'F') c = (value - 32) * 5/9
	else if (from === 'K') c = value - 273.15
	else return NaN
	if (to === 'C') return c
	if (to === 'F') return c * 9/5 + 32
	if (to === 'K') return c + 273.15
	return NaN
}

function renderForm(type, fields = {}) {
	if (type === 'length') {
		return `<!doctype html><html><body>
		<h1>Length Converter</h1>
		<form method="POST" action="/length">
			<input name="value" placeholder="value" value="${fields.value||''}" />
			<select name="from">${Object.keys(lengthFactors).map(u=>`<option value="${u}"${fields.from===u?' selected':''}>${u}</option>`).join('')}</select>
			<select name="to">${Object.keys(lengthFactors).map(u=>`<option value="${u}"${fields.to===u?' selected':''}>${u}</option>`).join('')}</select>
			<button type="submit">Convert</button>
		</form></body></html>`
	}
	if (type === 'weight') {
		return `<!doctype html><html><body>
		<h1>Weight Converter</h1>
		<form method="POST" action="/weight">
			<input name="value" placeholder="value" value="${fields.value||''}" />
			<select name="from">${Object.keys(weightFactors).map(u=>`<option value="${u}"${fields.from===u?' selected':''}>${u}</option>`).join('')}</select>
			<select name="to">${Object.keys(weightFactors).map(u=>`<option value="${u}"${fields.to===u?' selected':''}>${u}</option>`).join('')}</select>
			<button type="submit">Convert</button>
		</form></body></html>`
	}
	if (type === 'temperature') {
		return `<!doctype html><html><body>
		<h1>Temperature Converter</h1>
		<form method="POST" action="/temperature">
			<input name="value" placeholder="value" value="${fields.value||''}" />
			<select name="from">
				<option value="C"${fields.from==='C'?' selected':''}>C</option>
				<option value="F"${fields.from==='F'?' selected':''}>F</option>
				<option value="K"${fields.from==='K'?' selected':''}>K</option>
			</select>
			<select name="to">
				<option value="C"${fields.to==='C'?' selected':''}>C</option>
				<option value="F"${fields.to==='F'?' selected':''}>F</option>
				<option value="K"${fields.to==='K'?' selected':''}>K</option>
			</select>
			<button type="submit">Convert</button>
		</form></body></html>`
	}
	return '<h1>Unknown</h1>'
}

function renderResult(type, value, from, result, to) {
	return `<!doctype html><html><body>
		<p>${value} ${from} = ${result} ${to}</p>
		<p><a href="/${type}">Reset</a></p>
	</body></html>`
}

const server = http.createServer((req, res) => {
	if (req.method === 'GET' && req.url === '/length') return res.end(renderForm('length'))
	if (req.method === 'GET' && req.url === '/weight') return res.end(renderForm('weight'))
	if (req.method === 'GET' && req.url === '/temperature') return res.end(renderForm('temperature'))

	if (req.method === 'POST' && req.url === '/length') {
		let body = ''
		req.on('data', c => body += c)
		req.on('end', () => {
			const params = new URLSearchParams(body)
			const value = Number(params.get('value'))
			const from = params.get('from')
			const to = params.get('to')
			if (Number.isNaN(value)) return res.end('Please enter a valid number.')
			const result = convertLength(value, from, to)
			res.end(renderResult('length', value, from, result, to))
		})
		return
	}

	if (req.method === 'POST' && req.url === '/weight') {
		let body = ''
		req.on('data', c => body += c)
		req.on('end', () => {
			const params = new URLSearchParams(body)
			const value = Number(params.get('value'))
			const from = params.get('from')
			const to = params.get('to')
			if (Number.isNaN(value)) return res.end('Please enter a valid number.')
			const result = convertWeight(value, from, to)
			res.end(renderResult('weight', value, from, result, to))
		})
		return
	}

	if (req.method === 'POST' && req.url === '/temperature') {
		let body = ''
		req.on('data', c => body += c)
		req.on('end', () => {
			const params = new URLSearchParams(body)
			const value = Number(params.get('value'))
			const from = params.get('from')
			const to = params.get('to')
			if (Number.isNaN(value)) return res.end('Please enter a valid number.')
			const result = convertTemperature(value, from, to)
			res.end(renderResult('temperature', value, from, result, to))
		})
		return
	}

	// root: links
	if (req.method === 'GET' && req.url === '/') {
		res.end(`<!doctype html><html><body>
			<h1>Unit Converter</h1>
			<a href="/length">Length</a> | <a href="/weight">Weight</a> | <a href="/temperature">Temperature</a>
		</body></html>`)
		return
	}

	res.statusCode = 404
	res.end('Not found')
})

const port = process.env.PORT || 3000
server.listen(port, () => console.log(`Unit Converter server running on http://localhost:${port}`))
