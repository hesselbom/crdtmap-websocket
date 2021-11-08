export default [
  {
    input: 'src/client.js',
    external: id => /^(lib0|crdtmap)/.test(id),
    output: {
      name: 'CrdtMapWebsocket',
      file: 'dist/client.cjs',
      format: 'cjs',
      sourcemap: true
    }
  },
  {
    input: 'src/server.js',
    external: id => /^(ws|http|lib0|crdtmap)/.test(id),
    output: {
      name: 'CrdtMapWebsocket',
      file: 'dist/server.cjs',
      format: 'cjs',
      sourcemap: true
    }
  }
]
