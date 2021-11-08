/* global WebSocket */
import * as encoding from 'lib0/dist/encoding.cjs'
import * as decoding from 'lib0/dist/decoding.cjs'
import * as set from 'lib0/dist/set.cjs'
import * as bc from 'lib0/broadcastchannel'
import { setIfUndefined } from 'lib0/dist/map.cjs'
import { writeSyncStep1, writeSyncStep2, writeUpdate, readSyncMessage, V_MESSAGE_SYNC_2 } from 'crdtmap-sync'

export const V_WEBSOCKET_MESSAGE_TYPE_SYNC = 0

const RECONNECT_TIMEOUT_BASE = 1200
const MAX_RECONNECT_TIMEOUT = 2500

function broadcastMessage (state, message) {
  if (state.ws && state.wsConnected) {
    state.ws.send(message)
  }
  if (state.onBroadcastMessage) {
    state.onBroadcastMessage(state, message)
  }
}

export function createWebsocketClient (url, doc, options = {}) {
  const observers = new Map()
  const bcChannelName = url.split('?')[0]

  const wsHandler = createWebsocketClientHandler(null, doc, {
    onSynced: () => client.emit('synced', []),
    onAttemptReconnect: (ev) => {
      if (options.shouldReconnectOnDisconnect && !options.shouldReconnectOnDisconnect(ev)) {
        // Send status immediately if no attempt to reconnect
        client.emit('status', [{ status: 'disconnected' }])
        return
      }

      if (wsHandler.state.wsConnected) {
        // If websocket was connected, emit status just here, i.e. first time
        // To avoid multiple disconnected events when attempting to reconnect
        client.emit('status', [{ status: 'disconnected' }])
      } else {
        wsHandler.state.wsUnsuccessfulReconnects += 1
      }

      // Start with no reconnect timeout and increase timeout by
      // log10(wsUnsuccessfulReconnects).
      // The idea is to increase reconnect timeout slowly and have no reconnect
      // timeout at the beginning (log(1) = 0)
      setTimeout(
        createNewWebSocket,
        Math.min(Math.log10(wsHandler.state.wsUnsuccessfulReconnects + 1) * RECONNECT_TIMEOUT_BASE, MAX_RECONNECT_TIMEOUT)
      )
    },
    onBroadcastMessage: (state, message) => {
      bc.publish(bcChannelName, message)
    },
    ...options
  })

  const bcSubscriber = (data) => {
    const message = new Uint8Array(data)
    const encoder = wsHandler.readMessage(message, false)

    if (encoding.length(encoder) > 1) {
      bc.publish(bcChannelName, encoding.toUint8Array(encoder))
    }
  }

  const createNewWebSocket = () => {
    const ws = new WebSocket(url)

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      client.emit('status', [{ status: 'connected' }])
      wsHandler.handleOpen()
    }
    ws.onclose = (ev) => {
      wsHandler.handleClose(ev)
    }
    ws.onmessage = (event) => wsHandler.handleMessage(new Uint8Array(event.data))

    wsHandler.state.ws = ws
  }
  createNewWebSocket()

  bc.subscribe(bcChannelName, bcSubscriber)
  wsHandler.state.bcConnected = true

  // send sync step1 to bc, copied from https://github.com/yjs/y-websocket/blob/master/src/y-websocket.js
  // write sync step 1
  const encoderSync = encoding.createEncoder()
  encoding.writeVarUint(encoderSync, V_WEBSOCKET_MESSAGE_TYPE_SYNC)
  writeSyncStep1(encoderSync, doc)
  bc.publish(bcChannelName, encoding.toUint8Array(encoderSync))
  // broadcast local state
  const encoderState = encoding.createEncoder()
  encoding.writeVarUint(encoderState, V_WEBSOCKET_MESSAGE_TYPE_SYNC)
  writeSyncStep2(encoderState, doc)
  bc.publish(bcChannelName, encoding.toUint8Array(encoderState))

  const client = {
    on: function (name, callback) {
      setIfUndefined(observers, name, set.create).add(callback)
    },
    off: function (name, callback) {
      const nameObservers = observers.get(name)
      if (nameObservers != null) {
        nameObservers.delete(callback)
        if (nameObservers.size === 0) {
          observers.delete(name)
        }
      }
    },
    emit: function (name, args) {
      // copy all listeners to an array first to make sure that no event is emitted to listeners that are subscribed while the event handler is called.
      return Array.from((observers.get(name) || new Map()).values()).forEach(f => f(...args))
    },
    destroy: function () {
      this.disconnect()
      wsHandler.destroy()
    },
    disconnect: function () {
      if (wsHandler.state.ws) wsHandler.state.ws.close()
      if (wsHandler.state.bcConnected) {
        bc.unsubscribe(bcChannelName, this._bcSubscriber)
        wsHandler.state.bcConnected = false
      }
    }
  }

  return client
}

export function createWebsocketClientHandler (ws, doc, options = {}) {
  if (ws) ws.binaryType = 'arraybuffer'

  const state = {
    ws,
    wsConnected: false,
    wsUnsuccessfulReconnects: 0,
    synced: false,
    onBroadcastMessage: options.onBroadcastMessage,
    messageHandlers: options.messageHandlers || {}
  }

  const onUpdate = (snapshot) => {
    const encoder = encoding.createEncoder()
    encoding.writeUint8(encoder, V_WEBSOCKET_MESSAGE_TYPE_SYNC)
    writeUpdate(encoder, snapshot)
    broadcastMessage(state, encoding.toUint8Array(encoder))
  }
  doc.on('update', onUpdate)

  const handler = {
    state,
    destroy: function () {
      clearInterval(resyncInterval)
      doc.off('update', onUpdate)
      doc.off('destroy', this.destroy)
    },
    resync: function () {
      // Resend sync step 1
      if (state.wsConnected && state.ws) {
        const encoder = encoding.createEncoder()
        if (options.prefixByte != null) {
          encoding.writeVarUint(encoder, options.prefixByte)
        }
        encoding.writeUint8(encoder, V_WEBSOCKET_MESSAGE_TYPE_SYNC)
        writeSyncStep1(encoder, doc)
        state.ws.send(encoding.toUint8Array(encoder))
      }
    },
    handleClose: function (ev) {
      if (options.onAttemptReconnect) {
        options.onAttemptReconnect(ev)
      }

      state.ws = null
      state.synced = false
      state.wsConnected = false
    },
    handleOpen: function () {
      state.wsConnected = true
      state.wsUnsuccessfulReconnects = 0

      // Resync is same as first sync (i.e. sync step 1)
      this.resync()
    },
    readMessage: function (message, emitSynced) {
      const encoder = encoding.createEncoder()
      const decoder = decoding.createDecoder(message)

      try {
        if (options.prefixByte != null) {
          encoding.writeVarUint(encoder, options.prefixByte)
        }

        const messageType = decoding.readUint8(decoder)

        switch (messageType) {
          case V_WEBSOCKET_MESSAGE_TYPE_SYNC: {
            encoding.writeUint8(encoder, V_WEBSOCKET_MESSAGE_TYPE_SYNC)

            const syncMessageType = readSyncMessage(decoder, encoder, doc)

            if (syncMessageType === V_MESSAGE_SYNC_2 && !state.synced && emitSynced) {
              state.synced = true

              if (options.onSynced) {
                options.onSynced()
              }
            }
            break
          }
          default: {
            const messageHandler = state.messageHandlers[messageType]

            if (messageHandler) {
              messageHandler(encoder, decoder)
            } else {
              console.error('Unable to compute message')
            }
          }
        }
      } catch (err) {
        console.error(err)
        doc.emit('error', [err])
      }

      return encoder
    },
    handleMessage: function (message) {
      const encoder = this.readMessage(message, true)

      if (encoding.length(encoder) > 1) {
        if (state.ws) state.ws.send(encoding.toUint8Array(encoder))
      }
    }
  }

  let resyncInterval
  if (options.resyncInterval) {
    resyncInterval = setInterval(handler.resync, options.resyncInterval)
  }

  doc.on('destroy', handler.destroy)

  return handler
}
