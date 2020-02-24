import jsonpath from "jsonpath";
import deepEqual from "deep-equal";
import klona from "klona";
import nanoid from "nanoid";
import { typeCheck } from "type-check";

const parseConstructor = (...args) => {
  if (typeCheck('(Function)', args)) {
    const [createState] = args;
    return createState;
  } else if (args.length === 0) {
    return () => null;
  }
  throw new Error(`Expected empty constructor, or state initialization function. Encountered: ${args}.`);
};

const executeArgument = (exec, input) => {
  if (Array.isArray(exec)) {
    return [].concat(
      ...exec.map(
        (subExec, i) => executeArgument(
          subExec,
          input[i],
        ),
      ),
    );
  } else if (typeCheck("RegExp{source:String}", exec)) {
    return jsonpath.query(input, exec.toString().replace(/^\/|\/$/g, ""));
  }
  throw new Error(`Unknown argument structure, ${exec}.`);
};

const channelFromInvocation = (channelId, [...args], [...input]) => {
  if (input.length > args.length) {
    throw new Error('Encountered too many arguments.');
  }
  const [...inputWithPadding] = [...input, ...[...Array(input.length - args.length)]];
  return args.map((exec, i) => executeArgument(exec, input[i]));
};

const channel = (id, [...params], [...input]) => params
  .reduce(
    (p, [channelId, args], i) => p.then(
      (dataFromLastStage) => {
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
