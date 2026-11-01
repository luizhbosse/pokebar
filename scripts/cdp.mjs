// Ferramenta de desenvolvimento: lê console/erros do renderer, avalia uma expressão e tira print
// da janela do jogo via Chrome DevTools Protocol (porta 9223, só em `npm run dev`).
// Uso (Node do Windows): node scripts/cdp.mjs <saida.png> [segundos] [expressão JS]
import { writeFileSync } from 'node:fs'
const [out = 'cdp.png', secs = '3', exprArg] = process.argv.slice(2)
// Expressão direta ou @arquivo.js (evita problemas de aspas no cmd).
const expr = exprArg?.startsWith('@') ? (await import('node:fs')).readFileSync(exprArg.slice(1), 'utf8') : exprArg
const port = process.env.CDP_PORT ?? '9223'
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page')
if (!page) throw new Error('página não encontrada')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.id && pending.has(d.id)) return pending.get(d.id)(d.result ?? d.error)
  if (d.method === 'Runtime.consoleAPICalled') console.log('[console.' + d.params.type + ']', d.params.args.map((a) => a.value ?? a.description).join(' '))
  if (d.method === 'Runtime.exceptionThrown') console.log('[EXCEPTION]', d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text)
  if (d.method === 'Log.entryAdded') console.log('[log.' + d.params.entry.level + ']', d.params.entry.text, d.params.entry.url ?? '')
}
await new Promise((r) => (ws.onopen = r))
await send('Runtime.enable')
await send('Log.enable')
await new Promise((r) => setTimeout(r, Number(secs) * 1000))
if (expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  console.log('[eval]', JSON.stringify(r.result?.value ?? r.exceptionDetails?.exception?.description ?? r))
}
const shot = await send('Page.captureScreenshot', { format: 'png' })
if (shot?.data) writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('print salvo em', out)
ws.close()
