const { createWebsocketClient } = require('../src/client.js')
const VDoc = require('vjs')
// const WebSocket = require('ws')
const hrrs = require('human-readable-random-string')

// Return true to attempt disconnect
// Usable to e.g. check close code
const shouldReconnectOnDisconnect = (ev) => {
  console.log('Should reconnect on disconnect?')
  return true
}

const doc = VDoc()
const wsClient = createWebsocketClient('ws://localhost:1235/docId123', doc, { shouldReconnectOnDisconnect })

wsClient.on('status', event => console.log('Status:', event.status)) // logs "connected" or "disconnected"
wsClient.on('synced', () => console.log('Synced!'))

doc.on('snapshot', () => console.log('snapshot', doc.toJSON()))
doc.on('update', () => console.log('update', doc.toJSON()))

window.setRandomValue = () => {
  doc.set('client-key', hrrs(10))
}
