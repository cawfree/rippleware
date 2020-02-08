import { typeCheck } from "type-check";
import jsonpath from "jsonpath";
import deepEqual from "deep-equal";

const isArrayOfHandlers = e =>
  Array.isArray(e) &&
  e.reduce(
    (r, f) => !!r && typeCheck("{matches:String|Function,handler:Function}", f),
    e.length > 0,
  );

// TODO: This is naive.
const regExpToPath = e => e.toString().replace(/^\/|\/$/g, "");

const recurseUse = e => {
  const handlers = [];
  const handle = (matches, handler) => handlers.push({ matches, handler });
  if (Array.isArray(e)) {
    return e.reduce((arr, f) => [...arr, recurseUse(f)], []);
  } else if (typeCheck("Function", e)) {
    e(handle);
  } else if (typeCheck("RegExp{source:String}", e)) {
    handle("*", input => jsonpath.query(input, regExpToPath(e)));
  }
  if (handlers.length === 0) {
    throw new Error(
      "A call to use() must define a minimum of a single handler."
    );
  }
  return handlers;
};

const simplify = args => {
  if (typeCheck("(String, Function))|((Function, Function)", args)) {
    const [e, fn] = args;
    return [handle => handle(e, fn)];
  }
  return args.map(arg => {
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
};

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

const executeHandler = (handler, data, hooks) =>
  Promise.resolve().then(() => handler.handler(data, hooks));

const recurseApply = (data, stage, hooks) =>
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
        return executeHandler(handler, data, hooks);
      }
      return Promise.reject(`Could not find a valid matcher for ${data}.`);
    } else if (data.length >= stage.length) {
      return Promise.all(
        stage.map((s, i) => {
          if (isArrayOfHandlers(s)) {
            const datum = data[i];
            const handler = findHandlerByMatches(datum, s);
            if (handler) {
              return executeHandler(handler, datum, hooks);
            }
            return Promise.reject(
              `Could not find a valid matcher for ${datum}.`
            );
          }
          return recurseApply(data[i], s, hooks);
        })
      ).then(results =>
        stage.length > 1 && results.length > 1 ? results : results[0]
      );
    }
    return Promise.reject(`A handler for ${data} could not be found.`);
  });

const executeMiddleware = (mwr, hooks, input) =>
  mwr.reduce(
    (p, stage, i) =>
      p.then(dataFromLastStage =>
        recurseApply(dataFromLastStage, stage, hooks)
      ),
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

const defaultOptions = Object.freeze({ sync: true });

const init = (...args) => {
  if (args.length === 0) {
    return [undefined, defaultOptions];
  } else if (typeCheck('[{sync:Boolean}]', args) && args.length === 1) {
    const [options] = args;
    return [undefined, options];
  } else if (typeCheck('[Function]', args) && args.length === 1) {
    const [func] = args;
    return [func(), defaultOptions];
  } else if (typeCheck('(Function, {sync:Boolean})', args)) {
    const [func, ...extras] = args;
    return [func(), ...extras];
  }
  throw new Error('Invalid options.');
};

export const compose = (...args) => {
  const [globalState, options] = init(...args);

  const mwr = [];
  const { sync } = options;

  let currentHook = 0;

  // https://www.netlify.com/blog/2019/03/11/deep-dive-how-do-react-hooks-really-work/
  const { ...hooks } = (function() {
    const hooks = [];
    return {
      useGlobal: () => globalState,
      useEffect(callback, depArray) {
        const hasNoDeps = !depArray;
        const deps = hooks[currentHook];
        if (hasNoDeps || !deepEqual(deps, depArray)) {
          hooks[currentHook] = depArray;
          callback();
        }
        currentHook++;
      },
      useState(initialValue) {
        hooks[currentHook] =
          hooks[currentHook] ||
          (typeCheck("Function", initialValue) ? initialValue() : initialValue);

        const setStateHookIndex = currentHook;
        const setState = newState => (hooks[setStateHookIndex] = newState);

        return [hooks[currentHook++], setState];
      }
    };
  })();

  function r(...input) {
    currentHook = 0;

    r.use = () => {
      throw new Error(
        "It is not possible to make a call to use() after function execution."
      );
    };

    const p = executeMiddleware(
      mwr,
      hooks,
      input.length === 1 ? input[0] : input
    );
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

export const justOnce = (...args) => burden =>
  burden("*", (input, { useState }) => {
    const [app] = useState(() => compose().use(...args));
    const [once, setOnce] = useState(false);
    if (once === false) {
      setOnce(true);
      return app(input);
    }
    return input;
  });

export default compose;
