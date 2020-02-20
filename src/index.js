import { typeCheck } from "type-check";
import jsonpath from "jsonpath";
import deepEqual from "deep-equal";
import klona from "klona";

const isArrayOfHandlers = e =>
  Array.isArray(e) &&
  e.reduce(
    (r, f) => !!r && typeCheck("{matches:String|Function,handler:Function}", f),
    e.length > 0
  );

// TODO: This is naive.
const regExpToPath = e => e.toString().replace(/^\/|\/$/g, "");

const recurseUse = (e, globalState) => {
  const handlers = [];
  const handle = (...args) => {
    if (
      typeCheck("(String, Function)", args) ||
      typeCheck("(Function, Function)", args)
    ) {
      const [matches, handler] = args;
      return handlers.push({ matches, handler }) && undefined;
    } else if (typeCheck("(Function)", args)) {
      const [handler] = args;
      return handlers.push({ matches: "*", handler }) && undefined;
    }
    throw new Error(`Invalid call to handle().`);
  };
  //const handle = (matches, handler) => handlers.push({ matches, handler });
  if (Array.isArray(e)) {
    return e.reduce((arr, f) => [...arr, recurseUse(f, globalState)], []);
  } else if (typeCheck("Function", e) && typeCheck("Function", e.use)) {
    // TODO: check there is no overlap between copies of meta
    const sub = klona(e);
    handle("*", async (input, { useMeta, useGlobal }) => {
      sub.globalState =
        sub.globalState === undefined ? useGlobal() : sub.globalState;
      sub.inputMeta = useMeta();
      const result = await sub(input);
      useMeta(sub.outputMeta);
      return result;
    });
  } else if (typeCheck("Function", e)) {
    e(handle, globalState);
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

const executeHandler = ({ handler }, data, hooks, metaIn) => {
  let meta = undefined;
  return Promise.resolve()
    .then(() =>
      handler(data, {
        ...hooks,
        useMeta: (...args) => {
          if (args.length === 1) {
            const [arg] = args;
            meta = !!arg && typeof arg == "object" ? Object.freeze(arg) : arg;
            return undefined;
          } else if (args.length === 0) {
            return metaIn;
          }
          throw new Error(
            "A call to useMeta() must contain only one or zero arguments."
          );
        }
      })
    )
    .then(result => [result, meta]);
};

const collectResults = (stage, e) => {
  const { results, metas } = e.reduce(
    (obj, e) => {
      const [result, meta] = e;
      obj.results.push(result);
      obj.metas.push(meta);
      return obj;
    },
    {
      results: [],
      metas: []
    }
  );
  if (stage.length > 1 && results.length > 1) {
    return [results, metas];
  }
  return [results[0], metas[0]];
};

const recurseApply = (data, stage, hooks, meta) =>
  Promise.resolve().then(() => {
    if (typeCheck("Function", stage)) {
      return Promise.resolve()
        .then(() => stage(data))
        .then(result => [result, undefined]);
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
        return executeHandler(handler, data, hooks, meta);
      }
      return Promise.reject(`Could not find a valid matcher for ${data}.`);
    } else if (data.length >= stage.length) {
      return Promise.all(
        stage.map((s, i) => {
          if (isArrayOfHandlers(s)) {
            const datum = data[i];
            const handler = findHandlerByMatches(datum, s);
            if (handler) {
              return executeHandler(handler, datum, hooks, meta);
            }
            return Promise.reject(
              new Error(`Could not find a valid matcher for ${datum}.`)
            );
          }
          // TODO: how to delegate meta?
          return recurseApply(data[i], s, hooks, meta);
        })
      ).then(e => collectResults(stage, e));
    }
    return Promise.reject(
      new Error(`A handler for ${data} could not be found.`)
    );
  });

const executeMiddleware = (mwr, hooks, input, inputMeta) =>
  mwr.reduce(
    (p, stage, i, orig) =>
      p.then(dataFromLastStage => {
        const { length } = orig;
        const [result, meta] = dataFromLastStage;
        return recurseApply(
          result,
          stage,
          {
            ...hooks,
            useTopology: () => [i, length]
          },
          meta
        );
      }),
    Promise.resolve([input, inputMeta])
  );

const defaultOptions = Object.freeze({ sync: true });

const init = (...args) => {
  if (args.length === 0) {
    return [undefined];
  } else if (typeCheck("[Function]", args) && args.length === 1) {
    const [func] = args;
    return [func()];
  }
  throw new Error("Invalid options.");
};

export const compose = (...args) => {
  const mwr = [];
  let currentHook = 0;

  // https://www.netlify.com/blog/2019/03/11/deep-dive-how-do-react-hooks-really-work/
  const { ...hooks } = (function() {
    const hooks = [];
    return {
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

  const [globalState] = init(...args);

  function r(...input) {
    currentHook = 0;

    r.use = () => {
      throw new Error(
        "It is not possible to make a call to use() after function execution."
      );
    };

    const wares = mwr.map(e => recurseUse(simplify(e), r.globalState));

    const p = executeMiddleware(
      wares,
      {
        ...hooks,
        useGlobal: () => r.globalState
      },
      input.length === 0 ? undefined : input.length === 1 ? input[0] : input,
      r.inputMeta
    );
    return p.then(([result, outputMeta]) => {
      r.outputMeta = outputMeta;
      return result;
    });
  }
  r.use = (...args) => {
    if (args.length === 0) {
      throw new Error(
        "A call to use() must specify at least a single handler."
      );
    }
    mwr.push(args);
    return r;
  };

  // TODO: Is there any way to prevent access to unprivileged writers?
  r.globalState = globalState;
  r.inputMeta = undefined;
  r.outputMeta = undefined;

  return r;
};

export const justOnce = (...args) => burden =>
  burden("*", (input, { useState, useGlobal }) => {
    const [app] = useState(() => compose(useGlobal).use(...args));
    const [once, setOnce] = useState(false);
    if (once === false) {
      setOnce(true);
      return Promise.resolve(app(input));
    }
    return Promise.resolve(input);
  });

export const print = () => burden =>
  burden("*", (input, { useMeta, useTopology }) => {
    console.log({ input, meta: useMeta(), topology: useTopology() });
    return input;
  });

export const noop = () => burden => burden("*", input => input);

export default compose;
