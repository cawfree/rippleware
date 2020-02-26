import jsonpath from "jsonpath";
import deepEqual from "deep-equal";
import klona from "klona";
import nanoid from "nanoid";
import { typeCheck } from "type-check";

import createHooks from "./createHooks";

export const isRippleware = e => typeCheck('Function', e) && typeCheck('Function', e.use) && typeCheck('Function', e.sep);

const secret = nanoid();

const isSingleRippleware = ([r, ...extras]) => (extras.length === 0) && isRippleware(r);

const transforms = Object.freeze({
  identity: () => e => e,
  first: () => ([e]) => e,
  sep: () => ([...e]) => [].concat(...e),
});

const isNestedArray = e => e.reduce(
  (r, e) => r || Array.isArray(e),
  false,
);

const isMatcherDeclaration = e => typeCheck(
  '[(Function|String,Function)]',
  e,
);

const match = (params, arg) => [
  (e, ...extras) => {
    for (let i = 0; i < params.length; i += 1) {
      const [shouldMatch, exec] = params[i];
      if (typeCheck('Function', shouldMatch) && shouldMatch(arg)) {
        return exec(arg, ...extras);
      } else if (typeCheck('String', shouldMatch) && typeCheck(shouldMatch, arg)) {
        return exec(arg, ...extras);
      }
    }
    throw new Error(`Unable to find a valid matcher for ${arg}.`);
  },
  arg,
];

const shouldIndex = (param, arg) => {
  if (Array.isArray(param)) {
    if (isNestedArray(param)) {
      if (isMatcherDeclaration(param)) {
        return match(param, arg);
      }
      throw new Error("Arrays of middleware must only be of a single-dimension.");
    }
    const { length } = param;
    if (length === 1) {
      console.warn('⚠️', 'Encountered a single array of middleware. This is unoptimized; you can just drop the array notation altogether.', '(', param, ')');
      const [p] = param;
      return shouldIndex(p, arg);
    }
    return [
      param,
      param.map(() => arg),
    ];
  }
  return [param, arg];
};

const ensureIndexed = ([...params], [...args]) => {
  const nextParams = [];
  const nextArgs = [];
  const nextTransforms = [];
  for (let i = 0; i < params.length; i += 1) {
    const param = params[i];
    const arg = args[i];
    const [nextParam, nextArg] = shouldIndex(param, arg);
    nextParams.push(nextParam);
    nextArgs.push(isRippleware(param) ? [nextArg] : nextArg);
  }
  return [nextParams, nextArgs, transforms.identity()];
};

const propagate = ([...params], [...args]) => {
  if (isSingleRippleware(params)) {
    const [r] = params;
    return [[r], [args], transforms.first()];
  } else if (params.length === args.length) {
    return ensureIndexed(params, args);
  } else if (params.length > args.length) {
    return ensureIndexed(params, [...args, ...[...Array(params.length - args.length)]]);
  }
  throw new Error(`There is no viable way to propagate between ${params} and ${args}.`);
};

const execute = (param, arg, { ...hooks }) => {
  return Promise
    .resolve()
    .then(
      () => {
        if (isRippleware(param)) {
          const { useGlobal } = hooks;
          const opts = Object.freeze({
            useGlobal,
          });
          return param(secret, opts, ...arg)
            // TODO: How to handle the meta?
            .then(([data, someMetaOut]) => {
              return data;
            });
        } else if (Array.isArray(param)) {
          return Promise.all(param.map((p, i) => execute(p, arg[i], { ...hooks })));
        } else if (typeCheck('RegExp{source:String}', param)) {
          return jsonpath.query(arg, param.toString().replace(/^\/|\/$/g, ""));
        } else if (typeCheck('Function', param)) {
          return param(arg, { ...hooks });
        }
        throw new Error(`Encountered unknown execution format, ${param}.`);
      },
    );
};

const executeStage = (rootId, stageId, nextTransform, [...params], [...args], { ...hooks }) => Promise
  .resolve()
  .then(
    () => Promise
      .all(
        params.map(
          (param, i) => execute(param, args[i], { ...hooks }),
        ),
      )
      .then(nextTransform),
  );

const executeParams = (id, { ...hooks }, [...params], [...args]) => params
  .reduce(
    (p, [stageId, [...params], globalTransform]) => p
      .then(
        ([...dataFromLastStage]) => {
          const [nextParams, nextArgs, nextTransform] = propagate(params, dataFromLastStage);
          return executeStage(
            id,
            stageId,
            nextTransform,
            [...nextParams],
            [...nextArgs],
            { ...hooks },
          )
            .then(globalTransform);
        },
      ),
    Promise.resolve([...args]),
  )
  .then(data => [data, 'some meta information']);

const throwOnInvokeThunk = name => () => {
  throw new Error(
    `It is not possible to call ${name}() after invoking.`,
  );
};

const parseConstructor = (...args) => {
  if (typeCheck('(Function)', args)) {
    return args;
  } else if (args.length === 0) {
    return [() => undefined];
  }
  throw new Error("Unsuitable arguments.");
};

const isInternalConstructor = (maybeSecret, ...args) => typeCheck("String", maybeSecret) && maybeSecret === secret;

const compose = (...args) => {

  const params = [];
  const id = nanoid();

  const [globalState] = parseConstructor(...args);
  const [hooks, resetHooks] = createHooks();

  const exec = ({ global }, ...args) => {
    resetHooks();

    const extraHooks = {
      ...hooks,
      useGlobal: () => global,
    };

    return executeParams(
      id,
      extraHooks,
      params,
      args,
    );
  };

  const global = globalState();

  const r = function(...args) {

    r.use = throwOnInvokeThunk("use");
    r.sep = throwOnInvokeThunk("sep");

    if (isInternalConstructor(...args)) {
      const [secret, opts, ...extras] = args;
      if (typeCheck("{useGlobal:Function,...}", opts)) {
        const { useGlobal } = opts;
        return exec({ global: global || useGlobal() }, ...extras);
      }
      throw new Error(`Encountered an internal constructor which specified an incorrect options argument.`);
    }
    
    return exec({ global }, ...args)
      // XXX: Drop meta information for top-level callers.
      .then(transforms.first());
  };

  r.use = (...args) => {
    params.push([nanoid(), args, transforms.identity()]);
    return r;
  };
  r.sep = (...args) => {
    params.push([nanoid(), args, transforms.sep()]);
    return r;
  };

  return r;
};

export default compose;
