export default [
  {
    input: 'src/client.js',
    external: id => /^(lib0|vjs)/.test(id),
    output: {
      name: 'VWebsocket',
      file: 'dist/client.cjs',
      format: 'cjs',
      sourcemap: true
    }
  },
  {
    input: 'src/server.js',
    external: id => /^(ws|http|lib0|vjs)/.test(id),
    output: {
      name: 'VWebsocket',
      file: 'dist/server.cjs',
      format: 'cjs',
      sourcemap: true
    }
  }
]
