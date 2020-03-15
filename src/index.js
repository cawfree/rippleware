import jsonpath from "jsonpath";
import nanoid from "nanoid";
import { typeCheck } from "type-check";
import deepEquals from "deep-equal";

import createHooks from "./createHooks";

export const isRippleware = e =>
  typeCheck("Function", e) &&
  typeCheck("Function", e.use) &&
  //typeCheck("Function", e.sep) &&
  typeCheck("Function", e.pre) &&
  typeCheck("Function", e.mix) &&
  typeCheck("Function", e.all);

const expression = (param, arg) =>
  jsonpath.query(arg, param.toString().replace(/^\/|\/$/g, ""));

const secrets = Object.freeze({
  internal: nanoid(),
  pre: nanoid(),
  all: nanoid(),
  //sep: nanoid(),
  export: nanoid(),
  ctx: nanoid(),
  moi: nanoid(),
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

const aggregate = (params, arg, meta, secret) => [
  dataIn => params.map(p => p.map(q => expression(q, dataIn))),
  arg,
  meta
  //secret === secrets.sep ? params.map(() => meta) : meta
];

const shouldIndex = (param, arg, meta, secret) => {
  if (Array.isArray(param)) {
    if (isNestedArray(param)) {
      if (isMatcherDeclaration(param)) {
        return [param, arg, meta];
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
  return [nextParams, nextArgs, nextMetas, secret, transforms.identity()];
};

const propagate = ([...params], [...args], [...metas], secret) => {
  if (isSingleRippleware(params)) {
    const [r] = params;
    const [m] = metas;
    return [[r], [args], [m], secret, transforms.first()];
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

const executeNestedRippleware = (app, hooks, meta, ...args) => {
  const { useGlobal, useReceiver, useContext, useKey } = hooks;
  const opts = Object.freeze({
    useGlobal,
    useReceiver,
    useContext,
    useKey,
    meta: [meta]
  });
  return app(secrets.internal, opts, ...args);
};

const execute = (param, arg, meta, secret, { ...hooks }) => {
  return Promise.resolve().then(() => {
    if (isRippleware(param)) {
      const { useState } = hooks;
      const [moized, setMoized] = useState(undefined);
      if (moized !== undefined) {
        return Promise.resolve(moized);
      }
      // TODO: Enforce the prevention of calls to useState / useEffect.
      return executeNestedRippleware(param, hooks, meta, ...arg)
        .then(
          (e) => {
            (secret === secrets.moi) && setMoized(e);
            return e;
          },
        );
    } else if (isMatcherDeclaration(param)) {
      const { useState } = hooks;
      const params = param;
      const [[...conditionalHooks]] = useState(() =>
        params.map(() => createHooks())
      );
      for (let i = 0; i < params.length; i += 1) {
        const [paramSpecificHooks, resetParamSpecificHooks] = conditionalHooks[
          i
        ];
        resetParamSpecificHooks();
        const { ...extraHooks } = {
          ...hooks,
          ...paramSpecificHooks
        };
        const [shouldMatch, exec] = params[i];
        if (
          typeCheck("Function", shouldMatch) &&
          // XXX: Provide a read-only version of useMeta.
          shouldMatch(arg, { ...extraHooks, useMeta: () => meta})
        ) {
          if (isRippleware(exec)) {
            return execute(exec, [arg], meta, secret, extraHooks);
          }
          return execute(exec, arg, meta, secret, extraHooks);
        } else if (
          typeCheck("String", shouldMatch) &&
          typeCheck(shouldMatch, arg)
        ) {
          if (isRippleware(exec)) {
            return execute(exec, [arg], meta, secret, extraHooks);
          }
          return execute(exec, arg, meta, secret, extraHooks);
        }
      }
      throw new Error(`Unable to find a valid matcher for ${arg}.`);
    } else if (Array.isArray(param)) {
      return Promise.all(
        param.map((p, i) => execute(p, arg[i], meta[i], secret, { ...hooks }))
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
  stageId,
  nextTransform,
  [...params],
  [...args],
  [...metas],
  secret,
  { ...hooks }
) =>
  Promise.resolve()
    .then(() =>
      Promise.all(
        params.map((param, i) => {
          return execute(param, args[i], metas[i], secret, { ...hooks }).then(
            ([result, meta]) => {
              if (!isSingleRippleware(params) && isRippleware(param)) {
                return [transforms.first()(result), transforms.first()(meta)];
              }
              return [result, meta];
            }
          );
        })
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
    // XXX: Decides whether to propagate channel information or not.
    const transform = data => {
      if (data.length === 1) {
        return transforms.first()(data);
      }
      return data;
    };
    return [
      params,
      params.map(() => transform(dataFromLastStage)),
      params.map(() => transform(metasFromLastStage)),
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

const executeParams = ({ ...hooks }, [...params], [...args], [...metas]) =>
  params.reduce(
    (p, [stageId, [...params], globalTransform, secret], i, orig) =>
      p.then(([[...dataFromLastStage], [...metasFromLastStage]]) => {
        const { length } = orig;
        const [nextParams, nextArgs, nextMetas, nextSecret, nextTransform] = propagate(
          ...prepareChannel(
            params,
            dataFromLastStage,
            metasFromLastStage,
            secret
          )
        );
        const topology = Object.freeze([i, length]);
        return executeStage(
          stageId,
          nextTransform,
          [...nextParams],
          [...nextArgs],
          [...nextMetas],
          nextSecret,
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
  Promise.resolve().then(() =>
    params
      .map(([args, transform, secret]) => {
        if (typeCheck("String", secret) && secret === secrets.pre) {
          // XXX:  Because this secret has been satisfied, we can now suppress it.
          // TODO: We might wish to specify what kind of return format we want
          //       to use. In this case, for now we assume use() only.
          return [
            args.map(fn => fn({ ...hooks })),
            transform,
            undefined && secret
          ];
        }
        return [args, transform, secret];
      })
      .map(([args, transform, secret]) => [
        evaluateArgs(args, { ...hooks }),
        transform,
        secret
      ])
  );

const isInternalConstructor = (maybeSecret, ...args) =>
  typeCheck("String", maybeSecret) && maybeSecret === secrets.internal;

const parseConstructor = (...args) => {
  if (typeCheck("(Function, Function, Function)", args)) {
    return args;
  } else if (typeCheck("(Function, Function)", args)) {
    return [...args, null];
  } else if (typeCheck("(Function)", args)) {
    return [...args, null, null];
  } else if (args.length === 0) {
    return [() => undefined, null, null];
  }
  throw new Error("Unsuitable arguments.");
};

const delegateToReceiver = (shouldReceive, { ...hooks }, nextParams) =>
  Promise.resolve()
    .then(() => shouldReceive({ ...hooks }, nextParams))
    .then(computedParams => {
      if (!deepEquals(nextParams, computedParams)) {
        return evaluateParams(computedParams, {
          ...hooks
        }).then(evaluatedParams =>
          delegateToReceiver(shouldReceive, { ...hooks }, evaluatedParams)
        );
      }
      return computedParams;
    });

const stripLocalContext = (params, { ...hooks }) => {
  const [maybeContext] = params;
  if (
    Array.isArray(maybeContext) &&
    maybeContext.length === 2 &&
    maybeContext[1] === secrets.ctx
  ) {
    const [context] = maybeContext;
    return [
      typeCheck("Function", context) ? context({ ...hooks }) : context,
      params.filter((_, i) => i > 0)
    ];
  }
  return [undefined, params];
};

const compose = (...args) => {
  const params = [];

  const [globalState, chainReceiver, generateKey] = parseConstructor(...args);
  const [hooks, resetHooks] = createHooks();

  const exec = ({ global, receiver, context, keygen, meta }, ...args) => {
    const shouldEvaluate =
      typeCheck("(String)", args) && args[0] === secrets.export;
    return Promise.resolve()
      .then(() => {
        resetHooks();
        const h = {
          ...hooks,
          useGlobal: () => global,
          useReceiver: () => receiver,
          useKey: () => keygen,
          useContext: () => context
        };
        const [localContext, localParams] = stripLocalContext(params, h);
        return [
          localParams,
          {
            ...h,
            useContext: () =>
              localContext !== undefined ? localContext : context
          }
        ];
      })
      .then(async ([localParams, { ...extraHooks }]) => {
        const { useState, useKey, useReceiver } = extraHooks;
        const [evaluatedParams, setEvaluatedParams] = useState(null);

        if (!evaluatedParams) {
          // XXX: During evaluation, static consumers receive an elevated
          //      call to useKey, which actually implements the definition,
          //      as opposed to simply returning the configurable base.
          const applyKey = (...args) => {
            if (typeCheck("Function", useKey())) {
              return useKey()({ ...extraHooks }, ...args);
            }
            return nanoid();
          };
          return evaluateParams(localParams, extraHooks)
            .then(nextParams => {
              if (typeCheck("Function", useReceiver())) {
                return delegateToReceiver(
                  useReceiver(),
                  {
                    ...extraHooks,
                    useKey: applyKey
                  },
                  nextParams
                );
              }
              return nextParams;
            })
            .then(paramsWithoutIds =>
              paramsWithoutIds.map(([args, transform, secret]) => [
                applyKey(...args),
                args,
                transform,
                secret
              ])
            )
            .then(nextParams => {
              setEvaluatedParams(nextParams);
              return [nextParams, extraHooks];
            });
        }
        return [evaluatedParams, extraHooks];
      })
      .then(([evaluatedParams, extraHooks]) => {
        if (!shouldEvaluate) {
          return executeParams(extraHooks, evaluatedParams, args, meta);
        }
        // XXX: Due to super's meta skip.
        return Promise.resolve([evaluatedParams]);
      });
  };

  const global = globalState();
  const receiver = chainReceiver;
  const keygen = generateKey;

  const r = function(...args) {
    r.use = throwOnInvokeThunk("use");
    //r.sep = throwOnInvokeThunk("sep");
    r.pre = throwOnInvokeThunk("pre");
    r.mix = throwOnInvokeThunk("mix");
    r.all = throwOnInvokeThunk("all");

    if (isInternalConstructor(...args)) {
      const [secret, opts, ...extras] = args;
      if (
        typeCheck(
          "{useGlobal:Function,useReceiver:Function,useKey:Function,useContext:Function,...}",
          opts
        )
      ) {
        const { useGlobal, useReceiver, useKey, useContext, meta } = opts;
        return exec(
          {
            global: global || useGlobal(),
            receiver: receiver || useReceiver(),
            keygen: keygen || useKey(),
            // XXX: Propagate context, which may be overwritten.
            context: useContext(),
            meta
          },
          ...extras
        );
      }
      throw new Error(
        `Encountered an internal constructor which specified an incorrect options argument.`
      );
    }
    // XXX: Initial context is not defined.
    return (
      exec({ global, receiver, keygen, context: undefined, meta: [] }, ...args)
        // XXX: Drop meta information for top-level callers.
        .then(transforms.first())
    );
  };

  r.use = (...args) => {
    params.push([args, transforms.identity(), null]);
    return r;
  };
  //r.sep = (...args) => {
  //  params.push([
  //    args.length === 0 ? [e => e] : args,
  //    transforms.sep(),
  //    secrets.sep
  //  ]);
  //  return r;
  //};
  r.pre = (...args) => {
    if (typeCheck("[Function]", args)) {
      params.push([args, transforms.identity(), secrets.pre]);
      return r;
    }
    throw new Error("Pre-execution stages must specify a single function.");
  };
  r.mix = (...args) => {
    params.push([args, transforms.mix(), null]);
    return r;
  };
  r.all = (...args) => {
    params.push([
      args,
      args.length === 1 ? transforms.sep() : transforms.identity(),
      secrets.all
    ]);
    return r;
  };
  // TODO: It should not be possible for the nested call to use unsafe hooks.
  //       (Since it is effectively a conditional block.)
  r.moi = (...args) => {
    if (isSingleRippleware(args)) {
      params.push([
        args,
        transforms.identity(),
        secrets.moi,
      ]);
      return r;
    }
    throw new Error("It is only possible to moize a single rippleware.");
  };
  r.ctx = (...args) => {
    if (args.length !== 1) {
      throw new Error(`A call to ctx() must specify a single argument.`);
    } else if (params.length > 0) {
      throw new Error(
        "A call to ctx() must be the first in the middleware chain."
      );
    }
    const [arg] = args;
    params.push([arg, secrets.ctx]);
    return r;
  };
  return r;
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
