import jsonpath from "jsonpath";
import nanoid from "nanoid";
import { typeCheck } from "type-check";

import createHooks from "./createHooks";

export const isRippleware = e =>
  typeCheck("Function", e) &&
  typeCheck("Function", e.use) &&
  typeCheck("Function", e.sep) &&
  typeCheck("Function", e.pre) &&
  typeCheck("Function", e.mix) &&
  typeCheck("Function", e.all);

const expression = (param, arg) =>
  jsonpath.query(arg, param.toString().replace(/^\/|\/$/g, ""));

const secrets = Object.freeze({
  internal: nanoid(),
  pre: nanoid(),
  all: nanoid(),
  sep: nanoid()
});

const isSingleRippleware = ([r, ...extras]) =>
  extras.length === 0 && isRippleware(r);

const transforms = Object.freeze({
  identity: () => e => e,
  first: () => ([e]) => e,
  sep: () => ([...e]) => [].concat(...e),
  mix: () => ([...e]) =>
    e.reduce(
      (arr, e) => {
        arr[0].push(e);
        return arr;
      },
      [[]]
    )
});

const isNestedArray = e => e.reduce((r, e) => r || Array.isArray(e), false);

const isMatcherDeclaration = e => typeCheck("[(Function|String,Function)]", e);

const isAggregateIndexDeclaration = e =>
  typeCheck("[[RegExp{source:String}]]", e);

const match = (params, arg, meta) => [
  (e, ...extras) => {
    for (let i = 0; i < params.length; i += 1) {
      const [shouldMatch, exec] = params[i];
      if (typeCheck("Function", shouldMatch) && shouldMatch(arg)) {
        return exec(e, ...extras);
      } else if (
        typeCheck("String", shouldMatch) &&
        typeCheck(shouldMatch, arg)
      ) {
        return exec(e, ...extras);
      }
    }
    throw new Error(`Unable to find a valid matcher for ${arg}.`);
  },
  arg,
  meta
];

const aggregate = (params, arg, meta, secret) => {
  return [
    dataIn => params.map(p => p.map(q => expression(q, dataIn))),
    arg,
    secret === secrets.sep ? params.map(() => meta) : meta
  ];
};

const shouldIndex = (param, arg, meta, secret) => {
  if (Array.isArray(param)) {
    if (isNestedArray(param)) {
      if (isMatcherDeclaration(param)) {
        return match(param, arg, meta);
      } else if (isAggregateIndexDeclaration(param)) {
        return aggregate(param, arg, meta, secret);
      }
      throw new Error(
        "Arrays of middleware must only be of a single-dimension."
      );
    }
    const { length } = param;
    if (length === 1) {
      console.warn(
        "⚠️",
        "Encountered a single array of middleware. This is unoptimized; you can just drop the array notation altogether.",
        "(",
        param,
        ")"
      );
      const [p] = param;
      return shouldIndex(p, arg, meta, secret);
    }
    return [param, param.map(() => arg), param.map(() => meta)];
  }
  return [param, arg, meta];
};

const ensureIndexed = ([...params], [...args], [...metas], secret) => {
  const nextParams = [];
  const nextArgs = [];
  const nextMetas = [];
  const nextTransforms = [];
  for (let i = 0; i < params.length; i += 1) {
    const param = params[i];
    const arg = args[i];
    const meta = metas[i];

    const [nextParam, nextArg, nextMeta] = shouldIndex(
      param,
      arg,
      meta,
      secret
    );

    nextParams.push(nextParam);
    nextArgs.push(isRippleware(param) ? [nextArg] : nextArg);
    nextMetas.push(isRippleware(param) ? [nextMeta] : nextMeta);
  }
  return [nextParams, nextArgs, nextMetas, transforms.identity()];
};

const propagate = ([...params], [...args], [...metas], secret) => {
  if (isSingleRippleware(params)) {
    const [r] = params;
    const [m] = metas;
    return [[r], [args], [m], transforms.first()];
  } else if (params.length === args.length) {
    return ensureIndexed(params, args, metas, secret);
  } else if (params.length > args.length) {
    const p = [...Array(params.length - args.length)];
    const m = p.map(() => (args.length === 1 ? metas[0] : undefined));
    return ensureIndexed(params, [...args, ...p], [...metas, ...m], secret);
  } else if (secret === secrets.all) {
    return ensureIndexed(params, args, metas, secret);
  }
  throw new Error(
    `There is no viable way to propagate between ${params} and ${args}.`
  );
};

const execute = (param, arg, meta, { ...hooks }) => {
  return Promise.resolve().then(() => {
    if (isRippleware(param)) {
      const { useGlobal, useReceiver } = hooks;
      const opts = Object.freeze({
        useGlobal,
        useReceiver,
        meta: [meta]
      });
      return param(secrets.internal, opts, ...arg);
    } else if (Array.isArray(param)) {
      return Promise.all(
        param.map((p, i) => execute(p, arg[i], meta[i], { ...hooks }))
      ).then(results => [
        results.map(([data]) => data),
        results.map(([_, meta]) => meta)
      ]);
    } else if (typeCheck("RegExp{source:String}", param)) {
      return Promise.resolve([expression(param, arg), meta]);
    } else if (typeCheck("Function", param)) {
      let metaOut = meta;
      const extraHooks = {
        ...hooks,
        useMeta: (...args) => {
          if (args.length === 0) {
            return meta;
          } else if (args.length === 1) {
            const [nextMeta] = args;
            metaOut = nextMeta;
          } else {
            metaOut = args;
          }
        }
      };
      return Promise.resolve(param(arg, { ...extraHooks })).then(data => [
        data,
        metaOut
      ]);
    }
    throw new Error(`Encountered unknown execution format, ${param}.`);
  });
};

const executeStage = (
  rootId,
  stageId,
  nextTransform,
  [...params],
  [...args],
  [...metas],
  { ...hooks }
) =>
  Promise.resolve()
    .then(() =>
      Promise.all(
        params.map((param, i) =>
          execute(param, args[i], metas[i], { ...hooks })
        )
      )
    )
    .then(([...results]) => [
      nextTransform(results.map(([data]) => data)),
      nextTransform(results.map(([_, meta]) => meta))
    ]);

const prepareChannel = (
  [...params],
  [...dataFromLastStage],
  [...metasFromLastStage],
  secret
) => {
  if (secret === secrets.all) {
    return [
      params,
      dataFromLastStage.map(() => dataFromLastStage),
      metasFromLastStage.map(() => metasFromLastStage),
      secret
    ];
  }
  const shouldExtendMeta = params.length > 1 && metasFromLastStage.length === 1;
  const [meta] = metasFromLastStage;
  return [
    params,
    dataFromLastStage,
    shouldExtendMeta
      ? [
          ...metasFromLastStage,
          ...[...Array(params.length - metasFromLastStage.length)].map(
            () => meta
          )
        ]
      : metasFromLastStage,
    secret
  ];
};

const executeParams = (id, { ...hooks }, [...params], [...args], [...metas]) =>
  params.reduce(
    (p, [stageId, [...params], globalTransform, secret], i, orig) =>
      p.then(([[...dataFromLastStage], [...metasFromLastStage]]) => {
        const { length } = orig;
        const [nextParams, nextArgs, nextMetas, nextTransform] = propagate(
          ...prepareChannel(
            params,
            dataFromLastStage,
            metasFromLastStage,
            secret
          )
        );
        const topology = Object.freeze([i, length]);
        return executeStage(
          id,
          stageId,
          nextTransform,
          [...nextParams],
          [...nextArgs],
          [...nextMetas],
          {
            ...hooks,
            useTopology: () => topology
          }
        ).then(([data, metaOut]) => [
          globalTransform(data),
          globalTransform(metaOut)
        ]);
      }),
    Promise.resolve([[...args], [...metas]])
  );

const throwOnInvokeThunk = name => () => {
  throw new Error(`It is not possible to call ${name}() after invoking.`);
};

const evaluateArgs = (args, { ...hooks }) =>
  args.map(arg => {
    if (typeCheck("(String, Function)", arg)) {
      const [secret, fn] = arg;
      if (secret === secrets.pre) {
        return fn({ ...hooks });
      }
    }
    return arg;
  });

const evaluateParams = (params, { ...hooks }) =>
  params
    .map(([id, args, transform, secret]) => {
      if (typeCheck("String", secret) && secret === secrets.pre) {
        return [id, args.map(fn => fn({ ...hooks })), transform, secret];
      }
      return [id, args, transform, secret];
    })
    .map(([id, args, transform, secret]) => [
      id,
      evaluateArgs(args, { ...hooks }),
      transform,
      secret
    ]);

const isInternalConstructor = (maybeSecret, ...args) =>
  typeCheck("String", maybeSecret) && maybeSecret === secrets.internal;

const parseConstructor = (...args) => {
  if (typeCheck('(Function, Function)', args)) {
    return args;
  } else if (typeCheck('(Function)', args)) {
    return [...args, null];
  } else if (args.length === 0) {
    return [() => undefined, null];
  }
  throw new Error("Unsuitable arguments.");
};

const compose = (...args) => {
  const params = [];
  const id = nanoid();

  const [globalState, chainReceiver] = parseConstructor(...args);
  const [hooks, resetHooks] = createHooks();

  const exec = ({ global, receiver, meta }, ...args) => {
    resetHooks();

    const extraHooks = {
      ...hooks,
      useGlobal: () => global,
      useReceiver: () => receiver,
    };

    const { useState } = extraHooks;

    const [evaluatedParams] = useState(() =>
      evaluateParams(params, extraHooks)
    );

    return executeParams(id, extraHooks, evaluatedParams, args, meta);
  };

  const global = globalState();
  const receiver = chainReceiver;

  const r = function(...args) {
    r.use = throwOnInvokeThunk("use");
    r.sep = throwOnInvokeThunk("sep");
    r.pre = throwOnInvokeThunk("pre");
    r.mix = throwOnInvokeThunk("mix");
    r.all = throwOnInvokeThunk("all");

    if (isInternalConstructor(...args)) {
      const [secret, opts, ...extras] = args;
      if (typeCheck("{useGlobal:Function,useReceiver:Function,...}", opts)) {
        const { useGlobal, useReceiver, meta } = opts;
        return exec({ global: global || useGlobal(), receiver: receiver || useReceiver(), meta }, ...extras);
      }
      throw new Error(
        `Encountered an internal constructor which specified an incorrect options argument.`
      );
    }

    return exec({ global, receiver, meta: [] }, ...args)
      // XXX: Drop meta information for top-level callers.
      .then(transforms.first())
  };

  r.use = (...args) => {
    params.push([nanoid(), args, transforms.identity(), null]);
    return r;
  };
  r.sep = (...args) => {
    params.push([nanoid(), args, transforms.sep(), secrets.sep]);
    return r;
  };
  r.pre = (...args) => {
    if (typeCheck("[Function]", args)) {
      params.push([nanoid(), args, transforms.identity(), secrets.pre]);
      return r;
    }
    throw new Error("Pre-execution stages must specify a single function.");
  };
  r.mix = (...args) => {
    params.push([nanoid(), args, transforms.mix(), null]);
    return r;
  };
  r.all = (...args) => {
    params.push([
      nanoid(),
      args,
      args.length === 1 ? transforms.sep() : transforms.identity(),
      secrets.all
    ]);
    return r;
  };
  return r;
};

export const justOnce = (...args) => (input, { useState, useGlobal }) => {
  const [app] = useState(() => compose().use(...args));
  const [didExecute, setDidExecute] = useState(false);
  if (!didExecute) {
    setDidExecute(true);
    return app(input).then(transforms.first());
  }
  return Promise.resolve(input);
};

export const noop = () => input => input;

export const pre = (...args) => {
  if (typeCheck("(Function)", args)) {
    const [fn] = args;
    return [secrets.pre, fn];
  }
  throw new Error("Only a single function may be passed to the pre() helper.");
};

export default compose;
