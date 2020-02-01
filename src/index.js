import { typeCheck } from "type-check";
import jsonpath from "jsonpath";

const isArrayOfHandlers = e =>
  Array.isArray(e) &&
  e.length > 0 &&
  e.reduce(
    (r, f) =>
      !!r && typeCheck("{matches:String|Function,handler:Function,state:*}", f),
    true
  );

// TODO: This is naive.
const regExpToPath = e => e.toString().replace(/^\/|\/$/g, "");

const recurseUse = (e, parent = []) => {
  const handlers = [];
  const handle = (matches, handler) =>
    handlers.push({ matches, handler, state: undefined });
  if (Array.isArray(e)) {
    return e.reduce((arr, f) => [...arr, recurseUse(f)], []);
  } else if (typeCheck("Function", e)) {
    e(handle);
  } else if (typeCheck("RegExp{source:String}", e)) {
    // TODO: Should enforce object.
    handle("*", input => jsonpath.query(input, regExpToPath(e)));
  }
  if (handlers.length === 0) {
    throw new Error(
      "A call to use() must define a minimum of a single handler."
    );
  }
  return handlers;
};

const simplify = args =>
  args.map(arg => {
    if (typeCheck("RegExp{source:String}", arg)) {
      return handle =>
        handle("*", input => jsonpath.query(input, regExpToPath(arg)));
    } else if (typeCheck("[RegExp{source:String}]", arg)) {
      return handle =>
        handle("*", input =>
          arg.map(e => jsonpath.query(input, regExpToPath(e)))
        );
    } else if (typeCheck("[[RegExp{source:String}]]", arg)) {
      return handle =>
        handle("*", input =>
          arg.map(e => e.map(f => jsonpath.query(input, regExpToPath(f))))
        );
    }
    return arg;
  });

const findHandlerByMatches = (data, [...handlers]) =>
  handlers.reduce((handler, current) => {
    if (!handler) {
      if (typeCheck("String", current.matches)) {
        if (typeCheck(current.matches, data)) {
          return current;
        }
      } else if (typeCheck("Function", current.matches)) {
        const result = current.matches(data);
        if (result === true || result === false) {
          if (result) {
            return current;
          }
          return handler;
        }
        throw new Error("A matcher function may only return a boolean result.");
      }
    }
    return handler;
  }, null);

const freeze = state =>
  !!state && typeof state === "object" ? Object.freeze(state) : state;

const recurseApply = (data, stage) =>
  Promise.resolve().then(() => {
    if (typeCheck("Function", stage)) {
      return Promise.resolve().then(() => stage(data));
    } else if (!Array.isArray(stage) || stage.length === 0) {
      return Promise.reject(
        new Error("A call to use() must define at least a single handler.")
      );
    } else if (stage.length === 1 && isArrayOfHandlers(stage[0])) {
      // XXX: Special case: consume the entire argument without destructuring
      //      if we're using a single array handler.
      const [...handlers] = stage[0];
      const handler = findHandlerByMatches(data, handlers);
      if (handler) {
        return Promise.resolve()
          .then(() => handler.handler(data, handler.state))
          .then(result => (handler.state = freeze(result)));
      }
      return Promise.reject(`Could not find a valid matcher for ${data}.`);
    } else if (data.length >= stage.length) {
      return Promise.all(
        stage.map((s, i) => {
          if (isArrayOfHandlers(s)) {
            const datum = data[i];
            const handler = findHandlerByMatches(datum, s);
            if (handler) {
              return Promise.resolve()
                .then(() => handler.handler(datum, handler.state))
                .then(result => (handler.state = freeze(result)));
            }
            return Promise.reject(
              `Could not find a valid matcher for ${datum}.`
            );
          }
          return recurseApply(data[i], s);
        })
      ).then(results =>
        stage.length > 1 && results.length > 1 ? results : results[0]
      );
    }
    return Promise.reject(`A handler for ${data} could not be found.`);
  });

const executeMiddleware = (mwr, input) =>
  mwr.reduce(
    (p, stage, i) =>
      p.then(dataFromLastStage => recurseApply(dataFromLastStage, stage)),
    Promise.resolve(input)
  );

export const forceSync = promise => {
  const { loopWhile } = require("deasync");
  const result = { error: undefined, data: undefined, done: false };

  promise
    .then(data => Object.assign(result, { data, done: true }))
    .catch(error => Object.assign(result, { error, done: true }));

  loopWhile(() => !result.done);

  const { error, data } = result;

  if (error) {
    throw new Error(error);
  }

  return data;
};

export default (options = { sync: true }) => {
  if (!typeCheck("{sync:Boolean}|Undefined", options)) {
    throw new Error("Invalid options.");
  }
  const mwr = [];
  const { sync } = options;
  function r(...input) {
    r.use = () => {
      throw new Error(
        "It is not possible to make a call to use() after function execution."
      );
    };
    const p = executeMiddleware(mwr, input.length === 1 ? input[0] : input);
    if (sync) {
      return forceSync(p);
    }
    return p;
  }
  r.use = (...args) => {
    if (args.length === 0) {
      throw new Error(
        "A call to use() must specify at least a single handler."
      );
    } else {
      mwr.push(recurseUse(simplify(args)));
    }
    return r;
  };
  return r;
};
