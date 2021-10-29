const { createWebsocketServer } = require('../dist/server.cjs')

const demoPersistence = {
  bindState: (docId, doc) => {
    console.log('bindState', docId)
  },
  writeState: (docId, doc) => {
    console.log('writeState', docId)
  }
}

createWebsocketServer({
  persistence: demoPersistence
})
