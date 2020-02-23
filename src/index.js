import jsonpath from "jsonpath";
import deepEqual from "deep-equal";
import klona from "klona";
import { typeCheck } from "type-check";

const PATTERN_HANDLER_ARRAY = "[(String|Function,Function)]";

const regExpToPath = e => e.toString().replace(/^\/|\/$/g, "");

const maybeScalar = input =>
  input.length === 0 ? undefined : input.length === 1 ? input[0] : input;

const executeNested = async (sub, input, { useMeta, useGlobal }) => {
  sub.globalState =
    sub.globalState === undefined ? useGlobal() : sub.globalState;
  sub.inputMeta = useMeta();
  const result = await sub(...(
    Array.isArray(input) ? input : [input]
  ));
  useMeta(sub.outputMeta);
  return result;
};

const recurseUse = (e, globalState) => {
  const handlers = [];
  const handle = (...args) => {
    if (
      typeCheck("(String, Function)", args) ||
      typeCheck("(Function, Function)", args)
    ) {
      const [matches, handler] = args;
      return handlers.push([matches, handler]) && undefined;
    } else if (typeCheck("(Function)", args)) {
      const [handler] = args;
      return handlers.push(["*", handler]) && undefined;
    }
    throw new Error(`Invalid call to handle().`);
  };
  if (typeCheck("Array", e)) {
    return e.reduce((arr, f) => [...arr, recurseUse(f, globalState)], []);
  } else if (isRippleware(e)) {
    const sub = klona(e);
    handle((input, hooks) => executeNested(sub, input, hooks));
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

const findHandlerByMatches = (data, [...handlers]) => {
  for (let i = 0; i < handlers.length; i += 1) {
    const current = handlers[i];
    const [matches] = current;
    const isStringMatch =
      typeCheck("String", matches) && typeCheck(matches, data);
    const isFunctionMatch = typeCheck("Function", matches) && matches(data);
    if (isStringMatch || isFunctionMatch) {
      return current;
    }
  }
  return null;
};

const executeHandler = ([matches, handler], data, hooks, metaIn) => {
  let meta = undefined;
  const useMeta = (...args) => {
    if (args.length === 0) {
      return metaIn;
    }
    const [arg] = args;
    meta = !!arg && typeof arg == "object" ? Object.freeze(arg) : arg;
    return undefined;
  };
  return Promise.resolve(handler(data, { ...hooks, useMeta })).then(result => [
    result,
    meta
  ]);
};

const collectResults = (stage, e) => [
  maybeScalar(e.map(([result]) => result)),
  maybeScalar(e.map(([_, meta]) => meta))
];

const executeEvaluated = (stage, data, hooks, meta) =>
  Promise.all(
    stage.map((s, i) => {
      if (typeCheck(PATTERN_HANDLER_ARRAY, s)) {
        const datum = data[i];
        const handler = findHandlerByMatches(datum, s);
        if (handler) {
          return executeHandler(handler, datum, hooks, meta);
        }
        return Promise.reject(
          new Error(`Could not find a valid matcher for ${datum}.`)
        );
      }
      return recurseApply(data[i], meta, s, hooks);
    })
  ).then(e => collectResults(stage, e));

const recurseApply = (data, meta, stage, hooks) => {
  if (stage.length === 1 && typeCheck(PATTERN_HANDLER_ARRAY, stage[0])) {
    return executeEvaluated([stage[0]], [data], hooks, meta);
  } else if (data.length <= stage.length) {
    return executeEvaluated(stage, data, hooks, meta);
  } else if (Array.isArray(data) && (maybeScalar(data) === data)) {
    return executeEvaluated(stage, [data], hooks, meta);
  }
  return Promise.reject(new Error('The provided data is too long for the receiving middleware.'));
};

const executeMiddleware = (mwr, hooks, input, inputMeta) =>
  mwr.reduce(
    (p, stage, i, orig) =>
      p.then(dataFromLastStage => {
        const { length } = orig;
        return recurseApply(...dataFromLastStage, stage, {
          ...hooks,
          useTopology: () => [i, length]
        });
      }),
    Promise.resolve([input, inputMeta])
  );

const init = (...args) => {
  if (args.length === 0) {
    return [undefined];
  } else if (typeCheck("[Function]", args) && args.length === 1) {
    const [func] = args;
    return [func()];
  }
  throw new Error("Invalid options.");
};

const createHooks = () => {
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
  const resetHooks = () => (currentHook = 0) && undefined;
  return [hooks, resetHooks];
};

const extend = (toNextLayer, input) => {
  const s = maybeScalar(input);
  if (!typeCheck('(Undefined)', input) && Array.isArray(s) && s.length <= toNextLayer.length) {
    return [
      ...input,
      ...(
        [...Array(toNextLayer.length  - input.length)]
      ),
    ];
  }
  return s;
};

export const compose = (...args) => {
  const mwr = [];

  const [globalState] = init(...args);
  const [hooks, resetHooks] = createHooks();

  function r(...input) {
    resetHooks();

    r.use = () => {
      throw new Error(
        "It is not possible to make a call to use() after function execution."
      );
    };

    const wares = mwr.map(e => recurseUse(simplify(e), r.globalState));
    const [first] = wares;

    return executeMiddleware(
      wares,
      { ...hooks, useGlobal: () => r.globalState },
      extend(first, input),
      r.inputMeta
    ).then(
      ([result, outputMeta]) =>
        ((r.outputMeta = outputMeta) && undefined) || result
    );
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

export const isRippleware = fn =>
  typeCheck("Function", fn) &&
  typeCheck("Function", fn.use) &&
  fn.hasOwnProperty("globalState") &&
  fn.hasOwnProperty("inputMeta") &&
  fn.hasOwnProperty("outputMeta");

export const justOnce = (...args) => h =>
  h((input, hooks) => {
    const { useState, useGlobal, useMeta } = hooks;
    const [app] = useState(() => compose(useGlobal).use(...args));
    const [executed, setExecuted] = useState(false);
    if (!executed) {
      setExecuted(true);
      return executeNested(app, input, hooks); 
    }
    useMeta(useMeta());
    return Promise.resolve(input);
  });

export const print = () => h =>
  h((input, { useMeta, useTopology }) => {
    const meta = useMeta();
    console.log({ input, meta, topology: useTopology() });
    return useMeta(meta) || input;
  });

export const noop = () => h =>
  h((input, { useMeta }) => useMeta(useMeta()) || input);

export default compose;
