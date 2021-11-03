import WebSocket from 'ws'
import http from 'http'
import VDoc from 'vjs'
import * as encoding from 'lib0/dist/encoding.cjs'
import * as decoding from 'lib0/dist/decoding.cjs'
import * as map from 'lib0/dist/map.cjs'
import { writeSyncStep1, writeUpdate, readSyncMessage } from 'v-sync'

const WS_READY_STATE_CONNECTING = 0
const WS_READY_STATE_OPEN = 1
const WS_READY_STATE_CLOSING = 2 // eslint-disable-line
const WS_READY_STATE_CLOSED = 3 // eslint-disable-line
const PING_TIMEOUT = 30000

export const V_WEBSOCKET_MESSAGE_TYPE_SYNC = 0

// Dummy server
export function createWebsocketServer ({
  host = 'localhost',
  port = 1234,
  persistence
}) {
  const wss = new WebSocket.Server({ noServer: true })
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' })
    response.end('okay')
  })

  const wsHandler = createWebsocketServerHandler({ persistence })

  wss.on('connection', (ws, req) => {
    // Extract docId from url
    const docId = req.url.slice(1).split('?')[0]

    setupWSConnection(ws, req, docId, wsHandler)
  })

  server.on('upgrade', (request, socket, head) => {
    const handleAuth = ws => wss.emit('connection', ws, request)
    wss.handleUpgrade(request, socket, head, handleAuth)
  })

  server.listen({ host, port })

  console.log(`Running at '${host}' on port ${port}`)
}

export function setupWSConnection (ws, req, docId, wsHandler) {
  const client = wsHandler.setupClient(ws, docId)

  let pongReceived = true
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      // If no pong received, close connection
      if (client.sharedDoc.connections.has(ws)) {
        closeConn(client.sharedDoc, ws)
      }
      clearInterval(pingInterval)
    } else if (client.sharedDoc.connections.has(ws)) {
      // If pong was received, send new ping and wait for pong
      pongReceived = false

      try {
        ws.ping()
      } catch (e) {
        closeConn(client.sharedDoc, ws)
        clearInterval(pingInterval)
      }
    }
  }, PING_TIMEOUT)
  ws.on('pong', () => { pongReceived = true })

  client.handleOpen()
  ws.on('message', (message) => client.handleMessage(new Uint8Array(message)))
  ws.on('close', () => {
    closeConn(client.sharedDoc, ws)
    clearInterval(pingInterval)
  })
}

export function createWebsocketServerHandler ({ persistence } = {}) {
  const docs = new Map()
  const getDoc = (docId) => map.setIfUndefined(docs, docId, () => createSharedDoc(docId, persistence))

  return {
    docs,
    setupClient: function (ws, docId) {
      ws.binaryType = 'arraybuffer'

      const sharedDoc = getDoc(docId)
      sharedDoc.handler = this

      const doc = sharedDoc.doc
      const client = {
        doc,
        sharedDoc,
        handleOpen: function () {
          const encoder = encoding.createEncoder()
          encoding.writeUint8(encoder, V_WEBSOCKET_MESSAGE_TYPE_SYNC)
          writeSyncStep1(encoder, doc)
          send(sharedDoc, ws, encoding.toUint8Array(encoder))
        },
        handleMessage: function (message) {
          try {
            const encoder = encoding.createEncoder()
            const decoder = decoding.createDecoder(message)
            const messageType = decoding.readUint8(decoder)

            switch (messageType) {
              case V_WEBSOCKET_MESSAGE_TYPE_SYNC: {
                encoding.writeUint8(encoder, V_WEBSOCKET_MESSAGE_TYPE_SYNC)

                readSyncMessage(decoder, encoder, doc)

                if (encoding.length(encoder) > 1) {
                  send(sharedDoc, ws, encoding.toUint8Array(encoder))
                }
                break
              }
            }
          } catch (err) {
            console.error(err)
            doc.emit('error', [err])
          }
        }
      }

      sharedDoc.connections.set(ws, client)

      return client
    }
  }
}

function createSharedDoc (docId, persistence) {
  const doc = VDoc()
  const connections = new Map()
  const sharedDoc = { docId, doc, connections, persistence }

  if (persistence != null) {
    persistence.bindState(docId, doc)
  }

  const onUpdate = (snapshot) => {
    const encoder = encoding.createEncoder()

    encoding.writeUint8(encoder, V_WEBSOCKET_MESSAGE_TYPE_SYNC)

    writeUpdate(encoder, snapshot)

    // Send to all connections
    const message = encoding.toUint8Array(encoder)
    connections.forEach((_, ws) => send(sharedDoc, ws, message))

    // console.log(doc.toJSON())
  }

  doc.on('update', onUpdate)
  doc.on('snapshot', onUpdate)

  return sharedDoc
}

function closeConn (sharedDoc, ws) {
  if (sharedDoc.connections.has(ws)) {
    sharedDoc.connections.delete(ws)

    if (sharedDoc.connections.size === 0 && sharedDoc.persistence != null) {
      // if persisted, we store state and remove doc
      sharedDoc.persistence.writeState(sharedDoc.docId, sharedDoc.doc)
        .then(() => sharedDoc.doc.destroy())
      sharedDoc.handler.docs.delete(sharedDoc.docId)
    }
  }
  ws.close()
}

function send (sharedDoc, ws, message) {
  if (ws.readyState !== WS_READY_STATE_CONNECTING && ws.readyState !== WS_READY_STATE_OPEN) {
    closeConn(sharedDoc, ws)
  }
  try {
    ws.send(message, err => { err != null && closeConn(sharedDoc, ws) })
  } catch (e) {
    closeConn(sharedDoc, ws)
  }
}
