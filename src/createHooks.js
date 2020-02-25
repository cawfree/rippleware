import { typeCheck } from "type-check";
import deepEqual from "deep-equal";

// https://www.netlify.com/blog/2019/03/11/deep-dive-how-do-react-hooks-really-work/

export default () => {

  let currentHook = 0;

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
