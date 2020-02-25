import jsonpath from "jsonpath";
import deepEqual from "deep-equal";
import klona from "klona";
import nanoid from "nanoid";
import { typeCheck } from "type-check";

export const isRippleware = e => typeCheck('Function', e) && typeCheck('Function', e.use);

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

const match = (param, arg) => [
  (e) => {
    console.log('would match here');
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

const execute = (param, arg) => Promise
  .resolve()
  .then(
    () => {
      if (isRippleware(param)) {
        return param(...arg);
      } else if (Array.isArray(param)) {
        return Promise.all(param.map((p, i) => execute(p, arg[i])));
      } else if (typeCheck('RegExp{source:String}', param)) {
        return jsonpath.query(arg, param.toString().replace(/^\/|\/$/g, ""));
      } else if (typeCheck('Function', param)) {
        return param(arg);
      } else if (typeCheck('{...}', param)) {
        throw new Error('found an obj');
      }
      throw new Error(`Encountered unknown execution format, ${param}.`);
    },
  );

const executeStage = (rootId, stageId, [...params], [...args], nextTransform) => Promise
  .resolve()
  .then(
    () => Promise
      .all(
        params.map(
          (param, i) => execute(param, args[i]),
        ),
      )
      .then(nextTransform),
  );

const executeParams = (id, [...params], [...args]) => params
  .reduce(
    (p, [stageId, [...params], globalTransform]) => p
      .then(
        ([...dataFromLastStage]) => {
          const [nextParams, nextArgs, nextTransform] = propagate(params, dataFromLastStage);
          return executeStage(
            id,
            stageId,
            [...nextParams],
            [...nextArgs],
            nextTransform,
          )
            .then(globalTransform);
        },
      ),
    Promise.resolve([...args]),
  );

const compose = (...args) => {

  const params = [];
  const id = nanoid();

  const r = function(...args) {
    r.use = null;
    Object.freeze(params);
    return executeParams(id, [...params], [...args]);
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
