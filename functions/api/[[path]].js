import worker from '../../src/index.js';

export async function onRequest(context){
  const executionContext={waitUntil:promise=>context.waitUntil(promise)};
  return worker.fetch(context.request,context.env,executionContext);
}
