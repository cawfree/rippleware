import jsonpath from "jsonpath";
import deepEqual from "deep-equal";
import klona from "klona";
import nanoid from "nanoid";
import { typeCheck } from "type-check";

export const isRippleware = e => typeCheck('Function', e) && typeCheck('Function', e.use);

const parseConstructor = (...args) => {
  if (typeCheck('(Function)', args)) {
    const [createState] = args;
    return createState;
  } else if (args.length === 0) {
    return () => null;
  }
  throw new Error(`Expected empty constructor, or state initialization function. Encountered: ${args}.`);
};

const executeArray = ([...exec], input) => [].concat(
  ...exec.map(
    (subExec, i) => executeArgument(
      subExec,
      input[i],
    ),
  ),
);

const executeArgument = (exec, input) => {
  if (Array.isArray(exec)) {
    return executeArray(exec, input);
  } else if (typeCheck("RegExp{source:String}", exec)) {
    return jsonpath.query(input, exec.toString().replace(/^\/|\/$/g, ""));
  } else if (isRippleware(exec)) {
    return exec([input])
      .then(([[data]]) => data);
  }
  throw new Error(`Unknown argument structure, ${exec}.`);
};

const channelFromInvocation = (channelId, [...args], [...input]) => {
  const [...inputWithPadding] = [...input, ...[...Array(input.length - args.length)]];
  return Promise
    .all(
      args.map((exec, i) => executeArgument(exec, input[i])),
    );
};

const channelFromChannel = (channelId, [...args], [...input]) => channelFromInvocation(
  channelId,
  [...args],
  [].concat(...input),
);

const isSingularRippleware = ([...args]) => {
  const { length } = args;
  const [first] = args;
  return (length === 1) && isRippleware(first);
};

const channel = (id, [...params], [...input]) => params
  .reduce(
    (p, [channelId, args], i) => p.then(
      (dataFromLastStage) => {
        if (isSingularRippleware(args)) {
          const [sub] = args;
          return sub(...dataFromLastStage)
            .then(data => [].concat(...data));
        }
        const executeChannel = (i === 0) ? channelFromInvocation : channelFromChannel;
        return executeChannel(
          channelId,
          args,
          dataFromLastStage,
        );
      },
    ),
    Promise.resolve(input),
  );

const compose = (...args) => {
  const createState = parseConstructor(...args);

  const params = [];
  const id = nanoid();

  function r(...input) {
    r.use = null;
    return channel(
      id,
      [...params],
      [...input],
    );
  };

  r.use = (...args) => {
    if (args.length === 0) {
      throw new Error('A call to use() must specify at least a single handler.');
    }
    params.push([nanoid(), args]);
    return r;
  };

  return r;
};

export default compose;
