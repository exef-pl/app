const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('exef', {
  localServiceBaseUrl: 'http://127.0.0.1:3030',
});
