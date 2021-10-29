import * as encoding from 'lib0/dist/encoding.cjs'
import * as decoding from 'lib0/dist/decoding.cjs'
import { writeSyncStep1, writeUpdate, readSyncMessage } from 'v-sync'

function broadcastMessage (state, message) {
  if (state.wsConnected) {
    state.ws.send(message)
  }
  if (state.onBroadcastMessage) {
    state.onBroadcastMessage(state, message)
  }
}

export function createWebsocketClient () {
  // TODO: Create websocket
}

export function createWebsocketClientHandler (ws, doc, options) {
  ws.binaryType = 'arraybuffer'

  const state = {
    ws,
    wsConnected: false,
    onBroadcastMessage: options && options.onBroadcastMessage
  }

  const onUpdate = (snapshot) => {
    const encoder = encoding.createEncoder()
    writeUpdate(encoder, snapshot)
    broadcastMessage(state, encoding.toUint8Array(encoder))
  }
  doc.on('update', onUpdate)

  // doc.on('snapshot', () => console.log(doc.toJSON()))

  return {
    destroy: function () {
      doc.destroy()
    },
    handleClose: function () {
      state.wsConnected = false
    },
    handleOpen: function () {
      state.wsConnected = true

      const encoder = encoding.createEncoder()
      if (options && options.prefixByte) {
        encoding.writeVarUint(encoder, options.prefixByte)
      }
      writeSyncStep1(encoder, doc)
      ws.send(encoding.toUint8Array(encoder))
    },
    handleMessage: function (message) {
      try {
        const encoder = encoding.createEncoder()
        const decoder = decoding.createDecoder(message)

        if (options && options.prefixByte) {
          encoding.writeVarUint(encoder, options.prefixByte)
        }

        readSyncMessage(decoder, encoder, doc)

        if (encoding.length(encoder) > 0) {
          ws.send(encoding.toUint8Array(encoder))
        }
      } catch (err) {
        console.error(err)
        doc.emit('error', [err])
      }
    }
  }
}
