const fs = require('fs');
const Module = require('module');
const ts = require('typescript');
Module._extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  return module._compile(outputText, filename);
};

require.extensions['.tsx'] = Module._extensions['.ts'];
require.extensions['.mts'] = Module._extensions['.ts'];

module.exports = {};
