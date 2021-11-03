const { createWebsocketServer } = require('../dist/server.cjs')

// const demoPersistence = {
//   bindState: async (docId, doc) => {
//     console.log('bindState', docId)
//   },
//   writeState: async (docId, doc) => {
//     console.log('writeState', docId)
//   }
// }

createWebsocketServer({
  // persistence: demoPersistence,
  port: 1235
})
