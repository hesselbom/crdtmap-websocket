const { createWebsocketClientHandler } = require('../dist/client.cjs')
const VDoc = require('vjs')
const WebSocket = require('ws')
const hrrs = require('human-readable-random-string')

const ws = new WebSocket('ws://localhost:1234/docId123')
const doc = VDoc()
const wsHandler = createWebsocketClientHandler(ws, doc)

doc.set('client-key', 'def')

ws.on('open', () => wsHandler.handleOpen())
ws.on('close', () => wsHandler.handleClose())
ws.on('message', (message) => wsHandler.handleMessage(new Uint8Array(message)))

setTimeout(() => {
  const value = hrrs(10)
  console.log('Set client-second-key:', value)
  doc.set('client-second-key', value)
}, 1000)
