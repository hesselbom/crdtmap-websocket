const { createWebsocketServer } = require('../dist/server.cjs')

const demoPersistence = {
  bindState: (docId, doc) => {
    console.log('bindState', docId, doc)
  },
  writeState: (docId, doc) => {
    console.log('writeState', docId, doc)
  }
}

createWebsocketServer({
  persistence: demoPersistence
})
