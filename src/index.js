import { typeCheck } from 'type-check';

const recurseUse = (e) => { 
  if (Array.isArray(e)) {
    return e.reduce((arr, e) => [...arr, recurseUse(e)], []);
  }
  const handlers = [];
  const handle = (matches, handler) => handlers.push({ matches, handler, state: undefined });
  e(handle);
  if (handlers.length === 0) {
    throw new Error('A call to use() must define a minimum of a single handler.');
  } else if (handlers.length === 1) {
    const [handler] = handlers;
    return handler;
  }
  return handlers;
};

export default () => {
  const mwr = [];
  function r(...input) {
    console.log(JSON.stringify(mwr));
    // XXX: Execute the input in stages.
    return mwr
      .reduce(
        (p, stage, i) => p
          .then(
            (dataFromLastStage) => {
              if (Array.isArray(stage)) {
                //// The data must match the given dimensions.
                //if (dataFromLastStage.length >= stage.length) {

                //}
                //return Promise.reject(new Error(''));
                //console.log(stage);
                //throw 'do not know';
              }
              const { matches, handler, state } = stage;
              if (typeCheck('String', matches)) {
                if (typeCheck(matches, dataFromLastStage)) {
                  return Promise
                    .resolve()
                    .then(() => handler(dataFromLastStage, state))
                    .then(data => (stage.state = data))
                }
                return Promise.reject(new Error('No matches found for input data.'));
              }
              return Promise.reject(`Encountered unsupported handler. ${matches}`);
            },
          ),
        Promise
          .resolve(input),
      );
    // TODO: Enforce this (check@test).
    r.use = () => {
      throw new Error('It is not possible to make a call to use() after function execution.');
    };
  };
  // okay, let's define some inputs
  r.use = (...args) => {
    if (args.length === 0) {
      throw new Error('A call to use() must specify at least a single handler.');
    } else if (args.length === 1) {
      const [arg] = args;
      mwr.push(recurseUse(arg));
    } else {
      mwr.push(recurseUse(args));
    }
    return r;
  };
  return r;
};
