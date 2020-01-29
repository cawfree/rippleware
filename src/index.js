import { typeCheck } from 'type-check';

// XXX: Defines that we've encountered a handler; this is a layer which contains only handlers.
// TODO: Need to enforce that we disallow empty handlers.
const isArrayOfHandlers = e => Array.isArray(e) && e.length > 0 && (
  e.reduce(
    // TODO: Need to enforce function for typeCheck.
    (r, f) => (!!r && typeCheck('{matches:String|Function,handler:Function,state:*}', f)),
    true,
  )
);

// So, it's the **contents of the child array** that defines the rules of propagation.
const recurseUse = (e, parent=[]) => { 
  if (Array.isArray(e)) {
    return e
      .reduce(
        (arr, f) => [...arr, recurseUse(f)],
        [],
      );
  }

  const handlers = [];
  const handle = (matches, handler) => handlers.push({ matches, handler, state: undefined });
  e(handle);
  if (handlers.length === 0) {
    throw new Error('A call to use() must define a minimum of a single handler.');
  }
  return handlers;
};

const findHandlerByMatches = (data, [...handlers]) => handlers
  .reduce(
    (handler, current) => {
      if (!handler) {
        // TODO: Currently we only permit String based handlers.
        if (typeCheck('String', current.matches)) {
          if (typeCheck(current.matches, data)) {
            return current;
          }
          throw new Error(`Could not find a valid matcher for ${data}.`);
        }
        // TODO: Later elevate to regexp.
        throw new Error(`A matcher must be either a string or a function, encountered ${current.matches}.`);
      }
      return handler;
    },
    null,
  );

const freeze = state => (!!state && typeof state === 'object') ? Object.freeze(state) : state;

const recurseApply = (data, stage) => Promise
  .resolve()
  .then(
    () => {
      // XXX: Special case: consume the entire argument without destructuring
      //      if we're using a single array handler.
      if (stage.length === 1 && isArrayOfHandlers(stage[0])) {
        const [...handlers] = stage[0];
        const handler = findHandlerByMatches(data, handlers);
        if (handler) {
          return Promise
            .resolve()
            // TODO: Should freeze result somehow
            .then(() => handler.handler(data, handler.state))
            .then(result => (handler.state = freeze(result)))
            .then(
              (e) => {
                console.log('got result', e);
              },
            );
        }
      }
      return Promise.reject(`A handler for ${data} could not be found.`);
    },
  );

//// TODO: should write to stage
//const recurseApply = (data, stage) => Promise
//  .resolve()
//  .then(
//    () => {
//      if (Array.isArray(stage)) {
//        if (!isArrayOfHandlers(stage)) {
//          //console.log(stage,'is not a handler', stage.length);
//          stage.map(
//            e => recurseApply(data, e),
//          );
//          return;
//        } else {
//          console.log('got one!', stage);
//          return;
//        }
//      }
//      throw new Error('Do not know how to handle!');
//    },
//  );

export default () => {
  const mwr = [];
  function r(...input) {
    console.log(JSON.stringify(mwr));
    // XXX: Execute the input in stages.
    return mwr
      .reduce(
        (p, stage, i) => p
          .then(
            (dataFromLastStage) => recurseApply(dataFromLastStage, stage),
              //if (Array.isArray(stage)) {
              //  //// The data must match the given dimensions.
              //  //if (dataFromLastStage.length >= stage.length) {

              //  //}
              //  //return Promise.reject(new Error(''));
              //  //console.log(stage);
              //  //throw 'do not know';
              //}
              //const { matches, handler, state } = stage;
              //if (typeCheck('String', matches)) {
              //  if (typeCheck(matches, dataFromLastStage)) {
              //    return Promise
              //      .resolve()
              //      .then(() => handler(dataFromLastStage, state))
              //      .then(data => (stage.state = data))
              //  }
              //  return Promise.reject(new Error('No matches found for input data.'));
              //}
              //return Promise.reject(`Encountered unsupported handler. ${matches}`);
            //},
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
    }
    //} else if (args.length === 1) {
    //  const [arg] = args;
    //  mwr.push(recurseUse(arg));
    //} else {
      mwr.push(recurseUse(args));
    //}
    return r;
  };
  return r;
};
